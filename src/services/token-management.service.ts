import { Injectable, Logger } from '@nestjs/common';
import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import { PumpSdk, OnlinePumpSdk, getBuyTokenAmountFromSolAmount, getSellSolAmountFromTokenAmount } from '@pump-fun/pump-sdk';
import { OnlinePumpAmmSdk, PUMP_AMM_SDK, canonicalPumpPoolPda } from '@pump-fun/pump-swap-sdk';
import { ConfigService } from '@nestjs/config';
import { VanityAddressManagerService } from './vanity-address-manager.service';
import { JitoService } from './jito.service';
import { createComputeBudgetInstruction } from '../utils/transaction.utils';
import { TransactionSpeed } from '../interfaces/pump-fun.interface';
import BN from 'bn.js';
import { TOKEN_PROGRAM_ID } from '../common/constants';

export interface CreateTokenRequest {
  name: string;
  symbol: string;
  uri: string;
  description?: string;
  socials?: { [key: string]: string };
  useVanityAddress?: boolean;
}

export interface CreateAndBuyTokenRequest extends CreateTokenRequest {
  solAmount: number;
}

export interface BuyTokenRequest {
  tokenMint: string;
  solAmount: number;
}

export interface SellTokenRequest {
  tokenMint: string;
  percentage: number;
  slippageBps?: number; // Slippage in basis points (default: 500 = 5%)
  speed?: any; // TransactionSpeed enum
  useJito?: boolean;
  jitoTipLamports?: number;
}

export interface TokenOperationResult {
  success: boolean;
  txId?: string;
  tokenMint?: string;
  vanityAddress?: string;
  error?: string;
}

@Injectable()
export class TokenManagementService {
  private readonly logger = new Logger(TokenManagementService.name);
  private connection: Connection;
  private pumpSdk: PumpSdk;
  private onlinePumpSdk: OnlinePumpSdk;
  private onlinePumpAmmSdk: OnlinePumpAmmSdk;

  constructor(
    private configService: ConfigService,
    private vanityAddressManager: VanityAddressManagerService,
    private jitoService: JitoService
  ) {
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL') || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.pumpSdk = new PumpSdk();
    this.onlinePumpSdk = new OnlinePumpSdk(this.connection);
    this.onlinePumpAmmSdk = new OnlinePumpAmmSdk(this.connection);
  }

  /**
   * Create a new token on Pump.fun
   */
  async createToken(
    walletPublicKey: string,
    request: CreateTokenRequest
  ): Promise<TokenOperationResult> {
    try {
      this.logger.log(`Creating token: ${request.name} (${request.symbol})`);

      // Get vanity address from JSON file
      const vanityData = this.vanityAddressManager.getAvailableVanityAddress();
      let mintKeypair: Keypair;
      let vanityAddress: string | undefined;

      if (vanityData) {
        mintKeypair = vanityData.keypair;
        vanityAddress = vanityData.publicKey;
        this.logger.log(`Using vanity address: ${vanityAddress}`);
      } else {
        // Fallback to random keypair if no vanity addresses available
        this.logger.warn('No vanity addresses available, using random keypair');
        mintKeypair = Keypair.generate();
      }

      const walletPubkey = new PublicKey(walletPublicKey);

      // Create a new transaction
      const transaction = new Transaction();

      // Create token instruction
      const instruction = await this.pumpSdk.createInstruction({
        mint: mintKeypair.publicKey,
        name: request.name,
        symbol: request.symbol,
        uri: request.uri,
        creator: walletPubkey,
        user: walletPubkey,
      });

      // Add instruction to transaction
      transaction.add(instruction);

      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = walletPubkey;

      // Partially sign with the mint keypair
      transaction.partialSign(mintKeypair);

      // Serialize the transaction for the frontend to sign
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      });

      return {
        success: true,
        tokenMint: mintKeypair.publicKey.toString(),
        vanityAddress,
        // Return the serialized transaction for frontend signing
        txId: Buffer.from(serializedTransaction).toString('base64')
      };
    } catch (error: any) {
      this.logger.error('Error creating token:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating token'
      };
    }
  }

  /**
   * Create and buy a token in one transaction
   */
  async createAndBuyToken(
    walletPublicKey: string,
    request: CreateAndBuyTokenRequest
  ): Promise<TokenOperationResult> {
    try {
      this.logger.log(`Creating and buying token: ${request.name} (${request.symbol})`);

      // Get vanity address from JSON file
      const vanityData = this.vanityAddressManager.getAvailableVanityAddress();
      let mintKeypair: Keypair;
      let vanityAddress: string | undefined;

      if (vanityData) {
        mintKeypair = vanityData.keypair;
        vanityAddress = vanityData.publicKey;
        this.logger.log(`Using vanity address: ${vanityAddress}`);
      } else {
        // Fallback to random keypair if no vanity addresses available
        this.logger.warn('No vanity addresses available, using random keypair');
        mintKeypair = Keypair.generate();
      }

      const walletPubkey = new PublicKey(walletPublicKey);

      // Create a new transaction
      const transaction = new Transaction();

      // Fetch global state
      const global = await this.onlinePumpSdk.fetchGlobal();
      if (!global) {
        throw new Error('Failed to fetch Pump.fun global state');
      }

      // Convert SOL amount to lamports
      const solAmountBN = new BN(Math.floor(request.solAmount * 1e9));

      // Create and buy instructions
      const instructions = await this.pumpSdk.createAndBuyInstructions({
        global,
        mint: mintKeypair.publicKey,
        name: request.name,
        symbol: request.symbol,
        uri: request.uri,
        creator: walletPubkey,
        user: walletPubkey,
        solAmount: solAmountBN,
        amount: getBuyTokenAmountFromSolAmount({
          global,
          bondingCurve: null,
          amount: solAmountBN,
          feeConfig: null,
          mintSupply: null
        }),
      });

      // Add all instructions to the transaction
      for (const ix of instructions) {
        transaction.add(ix);
      }

      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = walletPubkey;

      // Partially sign with the mint keypair
      transaction.partialSign(mintKeypair);

      // Serialize the transaction for the frontend to sign
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      });

      return {
        success: true,
        tokenMint: mintKeypair.publicKey.toString(),
        vanityAddress,
        // Return the serialized transaction for frontend signing
        txId: Buffer.from(serializedTransaction).toString('base64')
      };
    } catch (error: any) {
      this.logger.error('Error creating and buying token:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating and buying token'
      };
    }
  }

  /**
   * Buy tokens from an existing Pump.fun token (handles both migrated and non-migrated tokens)
   */
  async buyToken(
    walletPublicKey: string,
    request: BuyTokenRequest
  ): Promise<TokenOperationResult> {
    try {
      this.logger.log(`Buying token: ${request.tokenMint}`);

      const walletPubkey = new PublicKey(walletPublicKey);
      const tokenMint = new PublicKey(request.tokenMint);

      // Convert SOL amount to lamports
      const solAmountBN = new BN(Math.floor(request.solAmount * 1e9));

      // Check if token has migrated by fetching bonding curve
      let bondingCurve;
      let isMigrated = false;
      try {
        const { bondingCurve: bc } = await this.onlinePumpSdk.fetchBuyState(tokenMint, walletPubkey);
        bondingCurve = bc;
        isMigrated = bc?.complete === true;
      } catch (error) {
        // If bonding curve doesn't exist, token might be migrated or invalid
        this.logger.warn(`Could not fetch bonding curve for ${request.tokenMint}, trying PumpSwap`);
        isMigrated = true; // Assume migrated if bonding curve doesn't exist
      }

      let instructions: any[];

      // Check if token has migrated (bonding curve complete or doesn't exist)
      if (isMigrated) {
        this.logger.log(`Token ${request.tokenMint} has migrated to PumpSwap, using AMM`);
        
        // Use PumpSwap SDK for migrated tokens
        const poolPda = canonicalPumpPoolPda(tokenMint);
        
        // Fetch swap state for PumpSwap
        const swapState = await this.onlinePumpAmmSdk.swapSolanaState(
          poolPda,
          walletPubkey
        );

        // Build buy instructions using PumpSwap
        // Use 5% slippage to account for price movement between transaction creation and submission
        instructions = await PUMP_AMM_SDK.buyQuoteInput(
          swapState,
          solAmountBN,
          5 // 5% slippage
        );
      } else {
        // Use Pump.fun SDK for non-migrated tokens
        this.logger.log(`Token ${request.tokenMint} is on bonding curve, using Pump.fun`);
        
        const global = await this.onlinePumpSdk.fetchGlobal();
        if (!global) {
          throw new Error('Failed to fetch Pump.fun global state');
        }

        const { bondingCurveAccountInfo, bondingCurve: bc, associatedUserAccountInfo } = 
          await this.onlinePumpSdk.fetchBuyState(tokenMint, walletPubkey);

        instructions = await this.pumpSdk.buyInstructions({
          global,
          bondingCurveAccountInfo,
          bondingCurve: bc,
          associatedUserAccountInfo,
          mint: tokenMint,
          user: walletPubkey,
          solAmount: solAmountBN,
          amount: getBuyTokenAmountFromSolAmount({
            global,
            bondingCurve: bc,
            amount: solAmountBN,
            feeConfig: null,
            mintSupply: null,
          }),
          slippage: 5, // 5% slippage to account for price movement
        });
      }

      // Create a new transaction
      const transaction = new Transaction();
      for (const instruction of instructions) {
        transaction.add(instruction);
      }

      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = walletPubkey;

      // Serialize the transaction for the frontend to sign
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      });

      return {
        success: true,
        tokenMint: request.tokenMint,
        // Return the serialized transaction for frontend signing
        txId: Buffer.from(serializedTransaction).toString('base64')
      };
    } catch (error: any) {
      this.logger.error('Error buying token:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error buying token'
      };
    }
  }

  /**
   * Sell tokens (handles both migrated and non-migrated tokens)
   */
  async sellToken(
    walletPublicKey: string,
    request: SellTokenRequest
  ): Promise<TokenOperationResult> {
    try {
      this.logger.log(`Selling token: ${request.tokenMint}`);

      const walletPubkey = new PublicKey(walletPublicKey);
      const tokenMint = new PublicKey(request.tokenMint);

      // Get user's token balance
      const tokenBalance = await this.getTokenBalance(walletPubkey, tokenMint);
      this.logger.log(`Token balance for ${walletPubkey.toString()}: ${tokenBalance} tokens`);
      
      if (tokenBalance <= 0) {
        throw new Error(`No tokens found in wallet ${walletPubkey.toString()} for token ${request.tokenMint}`);
      }

      // Calculate amount to sell based on requested percentage (1–100)
      const requestedPercentage = request.percentage;
      const sellAmount = Math.floor(tokenBalance * (requestedPercentage / 100));
      if (sellAmount <= 0) {
        throw new Error(
          `Invalid sell amount: ${sellAmount} (balance: ${tokenBalance}, requestedPercentage: ${requestedPercentage}%)`
        );
      }

      const sellAmountBN = new BN(sellAmount);
      this.logger.log(`Selling ${sellAmount} tokens (${requestedPercentage}% of ${tokenBalance} total)`);

      // Check if token has migrated by fetching bonding curve
      let bondingCurve;
      let isMigrated = false;
      try {
        const { bondingCurve: bc } = await this.onlinePumpSdk.fetchSellState(tokenMint, walletPubkey);
        bondingCurve = bc;
        isMigrated = bc?.complete === true;
      } catch (error) {
        // If bonding curve doesn't exist, token might be migrated or invalid
        this.logger.warn(`Could not fetch bonding curve for ${request.tokenMint}, trying PumpSwap`);
        isMigrated = true; // Assume migrated if bonding curve doesn't exist
      }

      let instructions: any[];

      // Determine slippage tolerance (default: 10% = 1000 bps for sells, but allow up to 100% if explicitly requested)
      // Sells are more sensitive to price movements, so we use a higher default
      const slippageBps = request.slippageBps ?? 1000; // Default 10% slippage for sells
      // Respect user-provided slippage up to 100% (10000 bps). Higher than this is clamped for safety.
      const maxSlippageBps = Math.min(slippageBps, 10000); // Cap at 100% for extremely volatile markets
      this.logger.log(`Using slippage tolerance: ${maxSlippageBps} basis points (${maxSlippageBps / 100}%)`);

      // Check if token has migrated (bonding curve complete or doesn't exist)
      if (isMigrated) {
        this.logger.log(`Token ${request.tokenMint} has migrated to PumpSwap, using AMM`);
        
        // Use PumpSwap SDK for migrated tokens
        const poolPda = canonicalPumpPoolPda(tokenMint);
        
        // Fetch swap state for PumpSwap
        const swapState = await this.onlinePumpAmmSdk.swapSolanaState(
          poolPda,
          walletPubkey
        );

        // Build sell instructions using PumpSwap with configurable slippage
        instructions = await PUMP_AMM_SDK.sellBaseInput(
          swapState,
          sellAmountBN,
          maxSlippageBps
        );
      } else {
        // Use Pump.fun SDK for non-migrated tokens
        this.logger.log(`Token ${request.tokenMint} is on bonding curve, using Pump.fun`);
        
        const global = await this.onlinePumpSdk.fetchGlobal();
        if (!global) {
          throw new Error('Failed to fetch Pump.fun global state');
        }

        const { bondingCurveAccountInfo, bondingCurve: bc } = 
          await this.onlinePumpSdk.fetchSellState(tokenMint, walletPubkey);

        // Calculate expected SOL out using Pump SDK's pricing helper
        const expectedSolAmount = getSellSolAmountFromTokenAmount({
          global,
          feeConfig: null,
          mintSupply: null,
          bondingCurve: bc,
          amount: sellAmountBN,
        });

        // Convert our basis-points slippage into Pump SDK's slippage units:
        // SDK interprets slippage as a percentage, where:
        //   effectiveDelta = slippage * 10 / 1000  => slippage / 100
        // so slippage = 5 means 5% tolerance.
        const sdkSlippage = maxSlippageBps / 100; // e.g. 500 bps -> 5 (%)

        this.logger.log(
          `Selling ${sellAmountBN.toString()} tokens via Pump.fun SDK with expected SOL ${expectedSolAmount.toString()} lamports and slippage ${sdkSlippage}%`,
        );

        instructions = await this.pumpSdk.sellInstructions({
          global,
          bondingCurveAccountInfo,
          bondingCurve: bc,
          mint: tokenMint,
          user: walletPubkey,
          amount: sellAmountBN,
          solAmount: expectedSolAmount,
          slippage: sdkSlippage,
        });
      }

      // Create a new transaction
      const transaction = new Transaction();
      
      // Add compute budget instruction for priority fees if speed is specified
      const speed = request.speed ?? TransactionSpeed.NORMAL;
      if (speed && speed !== TransactionSpeed.NORMAL) {
        const computeBudgetInstruction = createComputeBudgetInstruction(speed);
        transaction.add(computeBudgetInstruction);
        this.logger.log(`Added compute budget instruction for speed: ${speed}`);
      }

      // Add compute units limit for better execution
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 400000, // Increased compute units for complex swaps
        })
      );

      // Add all swap instructions
      for (const instruction of instructions) {
        transaction.add(instruction);
      }

      // Set recent blockhash and fee payer
      const latestBlockhash = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = walletPubkey;

      // Serialize the transaction for the frontend to sign
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      });

      return {
        success: true,
        tokenMint: request.tokenMint,
        // Return the serialized transaction for frontend signing
        txId: Buffer.from(serializedTransaction).toString('base64')
      };
    } catch (error: any) {
      this.logger.error('Error selling token:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error selling token'
      };
    }
  }

  /**
   * Get token balance for a user
   */
  private async getTokenBalance(userPublicKey: PublicKey, tokenMint: PublicKey): Promise<number> {
    try {
      const { getAssociatedTokenAddress } = await import('@solana/spl-token');
      const { getAccount } = await import('@solana/spl-token');
      
      const associatedTokenAddress = await getAssociatedTokenAddress(tokenMint, userPublicKey);
      const account = await getAccount(this.connection, associatedTokenAddress);
      
      return Number(account.amount);
    } catch (error) {
      this.logger.error('Error getting token balance:', error);
      return 0;
    }
  }

  /**
   * Submit a signed transaction to the blockchain
   * This is called after the user signs the transaction with their Phantom wallet
   * @param signedTransactionBase64 - Base64 encoded signed transaction
   * @param walletPublicKey - The wallet address that signed the transaction (for verification)
   * @param useJito - Whether to use Jito for faster transaction execution
   * @returns Transaction signature (txId)
   */
  async submitSignedTransaction(
    signedTransactionBase64: string,
    walletPublicKey: string,
    useJito: boolean = false
  ): Promise<TokenOperationResult> {
    try {
      this.logger.log(`Submitting signed transaction for wallet: ${walletPublicKey}`);

      // Deserialize the signed transaction
      const signedTransactionBuffer = Buffer.from(signedTransactionBase64, 'base64');
      const signedTransaction = Transaction.from(signedTransactionBuffer);

      // Verify the transaction fee payer matches the wallet
      if (!signedTransaction.feePayer) {
        throw new Error('Transaction missing fee payer');
      }

      const walletPubkey = new PublicKey(walletPublicKey);
      if (!signedTransaction.feePayer.equals(walletPubkey)) {
        throw new Error('Transaction fee payer does not match wallet address');
      }

      // Verify the transaction is signed
      if (!signedTransaction.signatures || signedTransaction.signatures.length === 0) {
        throw new Error('Transaction is not signed');
      }

      // Check if the wallet signature is present
      const walletSignature = signedTransaction.signatures.find(
        sig => sig.publicKey.equals(walletPubkey)
      );
      if (!walletSignature || walletSignature.signature === null) {
        throw new Error('Transaction is not signed by the wallet');
      }

      // Check if blockhash is still valid (within last 60 seconds)
      const latestBlockhash = await this.connection.getLatestBlockhash();
      if (signedTransaction.recentBlockhash !== latestBlockhash.blockhash) {
        this.logger.warn(`Transaction blockhash may be stale. Expected: ${latestBlockhash.blockhash}, Got: ${signedTransaction.recentBlockhash}`);
        // Try to refresh blockhash if it's stale (but this will invalidate signatures, so we can't do it)
        // Instead, we'll try to send anyway and let the network reject it with a better error
      }

      // Log all signatures for debugging
      this.logger.log(`Transaction has ${signedTransaction.signatures.length} signature(s)`);
      const signedCount = signedTransaction.signatures.filter(sig => sig.signature !== null).length;
      this.logger.log(`  ${signedCount} signature(s) are signed`);
      
      signedTransaction.signatures.forEach((sig, idx) => {
        const status = sig.signature ? '✅ signed' : '❌ not signed';
        this.logger.log(`  Signature ${idx}: ${sig.publicKey.toString()} - ${status}`);
      });

      // Check that we have at least the user's signature
      if (signedCount === 0) {
        throw new Error('Transaction has no signatures');
      }

      // Send the transaction to the blockchain
      // The transaction should have all required signatures:
      // 1. Mint keypair signature (added by backend when creating transaction)
      // 2. User wallet signature (added by frontend/Phantom)
      // We use requireAllSignatures: false because the transaction might have been
      // partially signed, and we want to include all signatures that are present
      const rawTransaction = signedTransaction.serialize({
        requireAllSignatures: false, // Include all signatures that are present
        verifySignatures: false // Don't verify during serialization (network will verify)
      });

      let txId: string;
      try {
        // Try Jito if requested
        if (useJito) {
          this.logger.log('Attempting to submit transaction via Jito...');
          
          try {
            // Convert Transaction to VersionedTransaction for Jito
            // IMPORTANT: We must preserve the original blockhash to keep signatures valid
            // Extract all instructions and account keys
            const instructions = signedTransaction.instructions;
            const accountKeys = signedTransaction.compileMessage().accountKeys;
            
            // Get the ORIGINAL blockhash from the signed transaction
            // This is critical - changing the blockhash invalidates all signatures
            const originalBlockhash = signedTransaction.recentBlockhash;
            if (!originalBlockhash) {
              throw new Error('Signed transaction missing recentBlockhash');
            }
            
            // Create a TransactionMessage in v0 format using the ORIGINAL blockhash
            const messageV0 = new TransactionMessage({
              payerKey: signedTransaction.feePayer!,
              recentBlockhash: originalBlockhash,
              instructions: instructions,
            }).compileToV0Message();
            
            // Create VersionedTransaction from the v0 message
            const versionedTx = new VersionedTransaction(messageV0);
            
            // Apply signatures from the original transaction
            // The signatures array in Transaction contains { publicKey, signature }
            // We need to map them to the account keys in the versioned transaction
            const versionedAccountKeys = versionedTx.message.staticAccountKeys;
            const versionedSignatures: Uint8Array[] = new Array(versionedAccountKeys.length);
            
            // Initialize all signatures as empty (zeros)
            for (let i = 0; i < versionedAccountKeys.length; i++) {
              versionedSignatures[i] = new Uint8Array(64);
            }
            
            // Map signatures from the original transaction
            signedTransaction.signatures.forEach((sig) => {
              if (sig.signature) {
                // Find the index of this public key in the versioned transaction
                const keyIndex = versionedAccountKeys.findIndex(
                  key => key.equals(sig.publicKey)
                );
                if (keyIndex >= 0 && keyIndex < versionedSignatures.length) {
                  // Copy the signature bytes
                  versionedSignatures[keyIndex] = new Uint8Array(sig.signature);
                }
              }
            });
            
            versionedTx.signatures = versionedSignatures;
            
            // Use JitoService to submit the transaction
            // We need a backend-funded keypair for the Jito tip transaction
            // Get the backend keypair from config (for paying Jito tips)
            const backendPrivateKey = this.configService.get<string>('JITO_PAYER_PRIVATE_KEY') || 
                                     this.configService.get<string>('WALLET_PRIVATE_KEY');
            
            if (!backendPrivateKey) {
              throw new Error('Jito requires JITO_PAYER_PRIVATE_KEY or WALLET_PRIVATE_KEY in config for tip transactions');
            }
            
            // Parse the backend keypair
            // Support both base58 (common for Solana) and base64 formats
            let backendKeypair: Keypair;
            try {
              const bs58 = require('bs58');
              
              // Try base58 first (most common for Solana)
              try {
                const decoded = bs58.decode(backendPrivateKey.trim());
                const secretKey = decoded.length === 64 ? decoded.slice(0, 32) : decoded;
                backendKeypair = Keypair.fromSecretKey(secretKey);
              } catch (base58Error) {
                // Try base64
                try {
                  const privateKeyBytes = Buffer.from(backendPrivateKey.trim(), 'base64');
                  const secretKey = privateKeyBytes.length === 64 ? privateKeyBytes.slice(0, 32) : privateKeyBytes;
                  backendKeypair = Keypair.fromSecretKey(secretKey);
                } catch (base64Error) {
                  // Try as array or hex
                  if (backendPrivateKey.startsWith('[') || backendPrivateKey.includes(',')) {
                    // Array format
                    const keyArray = JSON.parse(backendPrivateKey);
                    backendKeypair = Keypair.fromSecretKey(new Uint8Array(keyArray.length === 64 ? keyArray.slice(0, 32) : keyArray));
                  } else {
                    throw new Error('Unable to parse private key in any format');
                  }
                }
              }
            } catch (error: any) {
              this.logger.error('Failed to parse backend keypair for Jito:', error.message);
              throw new Error(`Invalid backend keypair configuration for Jito: ${error.message}`);
            }
            
            this.logger.log(`Using backend keypair ${backendKeypair.publicKey.toString()} for Jito tip`);
            
            // Submit via JitoService
            const jitoResult = await this.jitoService.executeJitoTx(
              [versionedTx],
              backendKeypair,
              'confirmed'
            );
            
            if (jitoResult) {
              txId = jitoResult;
              this.logger.log(`Transaction submitted successfully via Jito: ${txId}`);
            } else {
              throw new Error('Jito submission returned null');
            }
          } catch (jitoError: any) {
            this.logger.warn('Jito submission failed, falling back to regular submission:', jitoError.message);
            // Fall through to regular submission
          }
        }
        
        // Submit via regular RPC (if Jito wasn't used or failed)
        if (!txId) {
          txId = await this.connection.sendRawTransaction(rawTransaction, {
            skipPreflight: false,
            maxRetries: 3,
            preflightCommitment: 'confirmed'
          });
          this.logger.log(`Transaction submitted successfully: ${txId}`);
        }
      } catch (sendError: any) {
        const rawMessage: string = sendError?.message || '';
        const alreadyProcessed =
          rawMessage.includes('already been processed') ||
          rawMessage.includes('This transaction has already been processed');

        if (alreadyProcessed) {
          try {
            // Derive the transaction signature from the first signed signature
            const bs58Module = require('bs58');
            const bs58 = bs58Module.default || bs58Module;

            const primarySig = signedTransaction.signatures[0]?.signature;
            if (!primarySig) {
              throw new Error('Missing primary signature on already-processed transaction');
            }

            txId = bs58.encode(primarySig);
            this.logger.warn(
              `Transaction already processed on-chain, treating as success with signature ${txId}`,
            );
          } catch (deriveError: any) {
            this.logger.error(
              'Failed to derive signature for already-processed transaction:',
              deriveError?.message || deriveError,
            );
            throw new Error(rawMessage);
          }
        } else {
          // Extract detailed error information
          let errorMessage = rawMessage || 'Unknown error';
          let errorDetails = '';
          
          // Check for simulation errors (slippage, etc.)
          if (sendError.logs && Array.isArray(sendError.logs)) {
            const logs = sendError.logs.join('\n');
            errorDetails = `\nTransaction Logs:\n${logs}`;
            
            // Check for specific error patterns
            if (logs.includes('TooMuchSolRequired') || logs.includes('TooLittleSolReceived')) {
              errorMessage = 'Slippage tolerance exceeded. Price moved too much between transaction creation and submission.';
            } else if (logs.includes('InsufficientFunds')) {
              errorMessage = 'Insufficient funds to complete the transaction.';
            } else if (logs.includes('custom program error')) {
              const errorMatch = logs.match(/Error Code: (\w+).*Error Message: ([^\n]+)/);
              if (errorMatch) {
                errorMessage = `${errorMatch[1]}: ${errorMatch[2]}`;
              }
            }
          }
          
          // Try to get more details from the error object
          if (sendError.err) {
            errorDetails += `\nError Object: ${JSON.stringify(sendError.err, null, 2)}`;
          }
          
          this.logger.error(`Error sending raw transaction: ${errorMessage}${errorDetails}`);
          throw new Error(`${errorMessage}${errorDetails}`);
        }
      }

      // Wait for confirmation (non-blocking, but we'll wait a bit)
      this.connection.confirmTransaction(txId, 'confirmed').catch((error) => {
        this.logger.warn(`Transaction confirmation check failed for ${txId}:`, error);
      });

      return {
        success: true,
        txId: txId
      };
    } catch (error: any) {
      this.logger.error('Error submitting signed transaction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error submitting transaction'
      };
    }
  }

}
