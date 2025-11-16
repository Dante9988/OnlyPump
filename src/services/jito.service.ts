import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { Injectable, Logger } from '@nestjs/common';
import { JitoJsonRpcClient } from 'jito-js-rpc';
import { ConfigService } from '@nestjs/config';
import bs58 from 'bs58';

@Injectable()
export class JitoService {
  private readonly logger = new Logger(JitoService.name);
  private jitoClient: JitoJsonRpcClient;
  private connection: Connection;

  constructor(private configService: ConfigService) {
    // Initialize Jito client
    const jitoEndpoint = this.configService.get<string>('JITO_ENDPOINT', 'https://mainnet.block-engine.jito.wtf/api/v1');
    const jitoUuid = this.configService.get<string>('JITO_UUID', ''); // Optional UUID for authenticated requests
    
    this.jitoClient = new JitoJsonRpcClient(jitoEndpoint, jitoUuid);
    
    // Initialize Solana connection
    const rpcEndpoint = this.configService.get<string>('SOLANA_RPC_URL') || 
                       this.configService.get<string>('RPC_ENDPOINT') ||
                       'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcEndpoint, 'confirmed');
    
    this.logger.log(`JitoService initialized with endpoint: ${jitoEndpoint}`);
  }

  /**
   * Get a random Jito tip account
   * @returns PublicKey of a random tip account
   */
  async getRandomTipAccount(): Promise<PublicKey> {
    try {
      const tipAccount = await this.jitoClient.getRandomTipAccount();
      return new PublicKey(tipAccount);
    } catch (error) {
      this.logger.warn('Failed to get random tip account, using fallback', error);
      // Fallback to a known tip account
      return new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5');
    }
  }

  /**
   * Execute a bundle of transactions with Jito acceleration using jito-js-rpc library
   * @param transactions The transactions to execute (max 5 per bundle)
   * @param payer The payer keypair for the tip transaction
   * @param commitment The commitment level
   * @returns The transaction signature if successful, null otherwise
   */
  async sendBundle(
    transactions: VersionedTransaction[],
    payer: Keypair,
    commitment: Commitment = 'confirmed',
  ): Promise<string | null> {
    try {
      // Get Jito tip amount (default: 0.01 SOL = 10,000,000 lamports)
      const jitoTipLamports = this.configService.get<number>('JITO_TIP_LAMPORTS', 10000000);
      
      // Get a random tip account from Jito
      const jitoTipAccount = await this.getRandomTipAccount();
      this.logger.log(`Using Jito tip account: ${jitoTipAccount.toString()}, tip amount: ${jitoTipLamports} lamports`);

      // Get the latest blockhash
      const latestBlockhash = await this.connection.getLatestBlockhash();

      // Create a transaction to tip the Jito validator
      const jitoTipTxMessage = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: jitoTipAccount,
            lamports: jitoTipLamports,
          }),
        ],
      }).compileToV0Message();

      const jitoTipTx = new VersionedTransaction(jitoTipTxMessage);
      jitoTipTx.sign([payer]);

      // Serialize all transactions (tip first, then user transactions)
      const serializedTransactions: string[] = [];
      
      // Add tip transaction (base64 encoded)
      const tipTxSerialized = Buffer.from(jitoTipTx.serialize()).toString('base64');
      serializedTransactions.push(tipTxSerialized);
      
      // Add user transactions (base64 encoded)
      for (const tx of transactions) {
        const txSerialized = Buffer.from(tx.serialize()).toString('base64');
        serializedTransactions.push(txSerialized);
      }

      this.logger.log(`Sending bundle with ${serializedTransactions.length} transaction(s) (1 tip + ${transactions.length} user txns)`);

      // Send the bundle using jito-js-rpc library
      const bundleResult = await this.jitoClient.sendBundle([serializedTransactions, { encoding: 'base64' }]);
      
      if (!bundleResult || !bundleResult.result) {
        this.logger.error('Failed to send bundle, no result returned');
        return null;
      }

      const bundleId = bundleResult.result;
      this.logger.log(`Bundle sent successfully, bundle ID: ${bundleId}`);

      // Wait for bundle confirmation (120 second timeout)
      const inflightStatus = await this.jitoClient.confirmInflightBundle(bundleId, 120000);
      
      // Check if bundle was confirmed (handle different response types)
      if ('confirmation_status' in inflightStatus && inflightStatus.confirmation_status === 'confirmed') {
        const slot = 'slot' in inflightStatus ? inflightStatus.slot : 'unknown';
        this.logger.log(`Bundle confirmed on-chain at slot ${slot}`);
        
        // Get the first user transaction signature
        // The signature is already a Uint8Array, convert to base58
        const signatureBase58 = bs58.encode(transactions[0].signatures[0]);
        
        // Optionally get final bundle status
        try {
          const finalStatus = await this.jitoClient.getBundleStatuses([[bundleId]]);
          if (finalStatus.result?.value?.[0]) {
            const status = finalStatus.result.value[0];
            if ('confirmation_status' in status) {
              this.logger.log(`Bundle final status: ${status.confirmation_status}`);
            }
            if ('transactions' in status && status.transactions && status.transactions.length > 0) {
              this.logger.log(`Bundle contains ${status.transactions.length} transaction(s)`);
            }
          }
        } catch (statusError) {
          this.logger.warn('Failed to get final bundle status:', statusError);
        }
        
        return signatureBase58;
      } else if ('err' in inflightStatus && inflightStatus.err) {
        this.logger.error(`Bundle processing failed: ${JSON.stringify(inflightStatus.err)}`);
        return null;
      } else if ('status' in inflightStatus) {
        // Handle status-based response
        if (inflightStatus.status === 'Landed' && 'landed_slot' in inflightStatus) {
          this.logger.log(`Bundle landed at slot ${inflightStatus.landed_slot}`);
          const signatureBase58 = bs58.encode(transactions[0].signatures[0]);
          return signatureBase58;
        } else {
          this.logger.warn(`Bundle status: ${inflightStatus.status}`);
          return null;
        }
      } else {
        this.logger.warn(`Unexpected bundle status: ${JSON.stringify(inflightStatus)}`);
        return null;
      }
    } catch (error: any) {
      this.logger.error('Error during Jito sendBundle execution:', error.message || error);
      if (error.response?.data) {
        this.logger.error('Jito server response:', error.response.data);
      }
      return null;
    }
  }

  /**
   * Execute a transaction with Jito acceleration (backwards compatibility)
   * Uses sendBundle for all transactions
   * @param transactions The transactions to execute
   * @param payer The payer keypair
   * @param commitment The commitment level
   * @returns The transaction signature if successful, null otherwise
   */
  async executeJitoTx(
    transactions: VersionedTransaction[],
    payer: Keypair,
    commitment: Commitment = 'confirmed',
  ): Promise<string | null> {
    // Validate bundle size (max 5 transactions per bundle)
    if (transactions.length > 4) {
      this.logger.error(`Too many transactions: ${transactions.length}. Maximum 4 user transactions allowed (1 tip + 4 user = 5 total)`);
      return null;
    }
    
    // Use sendBundle for all transactions
    return this.sendBundle(transactions, payer, commitment);
  }
}
