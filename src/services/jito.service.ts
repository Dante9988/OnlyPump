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
import bs58 from 'bs58';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JitoService {
  private readonly logger = new Logger(JitoService.name);
  private readonly jitoTipAccounts: string[] = [
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  ];
  private readonly jitoEndpoints: string[] = [
    'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
    // Uncomment these for production use
    // 'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
    // 'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
    // 'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
    // 'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
  ];

  constructor(private configService: ConfigService) {}

  /**
   * Execute a transaction with Jito acceleration
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
    const jitoFee = this.configService.get<number>('JITO_FEE', 0.0001);
    if (!jitoFee) {
      this.logger.warn('Jito fee has not been set!');
      return null;
    }

    const rpcEndpoint = this.configService.get<string>('RPC_ENDPOINT');
    if (!rpcEndpoint) {
      this.logger.error('RPC endpoint has not been set!');
      return null;
    }

    const solanaConnection = new Connection(rpcEndpoint);
    const jitoFeeWallet = new PublicKey(
      this.jitoTipAccounts[Math.floor(this.jitoTipAccounts.length * Math.random())],
    );

    try {
      // Get the latest blockhash
      const latestBlockhash = await solanaConnection.getLatestBlockhash();

      // Create a transaction to tip the Jito validator
      const jitTipTxFeeMessage = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: jitoFeeWallet,
            lamports: Math.floor(jitoFee * 10 ** 9),
          }),
        ],
      }).compileToV0Message();

      const jitoFeeTx = new VersionedTransaction(jitTipTxFeeMessage);
      jitoFeeTx.sign([payer]);

      // Get the transaction signature
      const jitoTxsignature = bs58.encode(transactions[0].signatures[0]);

      // Serialize the transactions
      const serializedjitoFeeTx = bs58.encode(jitoFeeTx.serialize());
      const serializedTransactions = [serializedjitoFeeTx];
      for (const tx of transactions) {
        const serializedTransaction = bs58.encode(tx.serialize());
        serializedTransactions.push(serializedTransaction);
      }

      // Send the bundle to Jito endpoints
      const requests = this.jitoEndpoints.map((url) =>
        axios.post(url, {
          jsonrpc: '2.0',
          id: 1,
          method: 'sendBundle',
          params: [serializedTransactions],
        }),
      );

      // Wait for all requests to complete
      const results = await Promise.all(requests.map((p) => p.catch((e) => e)));
      const successfulResults = results.filter(
        (result) => !(result instanceof Error),
      );

      if (successfulResults.length > 0) {
        // Confirm the transaction
        const confirmation = await solanaConnection.confirmTransaction(
          {
            signature: jitoTxsignature,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            blockhash: latestBlockhash.blockhash,
          },
          commitment,
        );

        if (confirmation.value.err) {
          this.logger.error('Confirmation error', confirmation.value.err);
          return null;
        }

        return jitoTxsignature;
      } else {
        this.logger.warn('No successful responses received for Jito');
        return null;
      }
    } catch (error) {
      this.logger.error('Error during Jito transaction execution', error);
      return null;
    }
  }
}
