import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { OnlinePumpSdk, PumpSdk, getBuyTokenAmountFromSolAmount, getSellSolAmountFromTokenAmount } from '@pump-fun/pump-sdk';
import { OnlinePumpAmmSdk } from '@pump-fun/pump-swap-sdk';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import BN from 'bn.js';
import { WalletProvider } from './wallet.interface';
import { PumpFunResult, TransactionSpeed } from '../types';

// Constants
const DEFAULT_JITO_TIP = 10000000; // 0.01 SOL
const JITO_TIP_ACCOUNT = new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhArj8T');

/**
 * Service for buying and selling tokens on Pump.fun using the official SDK
 */
export class PumpTokenOperations {
  private connection: Connection;
  private pumpSdk: PumpSdk;
  private onlinePumpSdk: OnlinePumpSdk;
  private pumpAmmSdk: OnlinePumpAmmSdk;
  
  // Cache for pool checks to avoid repeated RPC calls
  private poolCache: Map<string, { hasPool: boolean, timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute cache TTL

  constructor(rpcUrl?: string) {
    this.connection = new Connection(
      rpcUrl || process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    this.pumpSdk = new PumpSdk();
    this.onlinePumpSdk = new OnlinePumpSdk(this.connection);
    this.pumpAmmSdk = new OnlinePumpAmmSdk(this.connection);
  }

  /**
   * Buys tokens from a Pump.fun bonding curve
   */
  async buyToken(
    wallet: WalletProvider,
    tokenMint: string | PublicKey,
    solAmount: number,
    settings?: any
  ): Promise<PumpFunResult> {
    try {
      // Get wallet public key
      const walletPublicKey = await wallet.getPublicKey();
      
      // Convert tokenMint to PublicKey if it's a string
      const mintPubkey = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
      
      // Default settings
      const defaultSettings = {
        speed: TransactionSpeed.FAST,
        slippageBps: 100,
        useJito: true,
        jitoTipLamports: DEFAULT_JITO_TIP
      };
      
      // Merge with custom settings
      const mergedSettings = { ...defaultSettings, ...settings };
      
      // Create a new transaction
      const transaction = new Transaction();
      
      // Fetch global state
      const global = await this.onlinePumpSdk.fetchGlobal();
      
      if (!global) {
        throw new Error('Failed to fetch Pump.fun global state');
      }
      
      // Fetch buy state
      const { bondingCurveAccountInfo, bondingCurve, associatedUserAccountInfo } =
        await this.onlinePumpSdk.fetchBuyState(mintPubkey, walletPublicKey);
      
      // Convert SOL amount to lamports
      const solAmountBN = new BN(Math.floor(solAmount * 1e9));
      
      // Create buy instructions
      const instructions = await this.pumpSdk.buyInstructions({
        global,
        bondingCurveAccountInfo,
        bondingCurve,
        associatedUserAccountInfo,
        mint: mintPubkey,
        user: walletPublicKey,
        solAmount: solAmountBN,
        amount: getBuyTokenAmountFromSolAmount({
          global,
          bondingCurve,
          amount: solAmountBN,
          feeConfig: null,
          mintSupply: null
        }),
        slippage: mergedSettings.slippageBps / 100, // Convert basis points to percentage
      });
      
      // Add all instructions to the transaction
      for (const ix of instructions) {
        transaction.add(ix);
      }
      
      // Add Jito tip if enabled
      if (mergedSettings.useJito && mergedSettings.jitoTipLamports > 0) {
        transaction.instructions.unshift(
          this.createJitoTipInstruction(
            walletPublicKey,
            mergedSettings.jitoTipLamports
          )
        );
      }
      
      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = walletPublicKey;
      
      // Sign transaction with wallet provider
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send transaction
      const txid = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        { skipPreflight: false }
      );
      
      return {
        success: true,
        txId: txid,
        tokenMint: mintPubkey.toString(),
        solAmount
      };
    } catch (error: any) {
      console.error('Error buying Pump.fun token:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error buying token'
      };
    }
  }

  /**
   * Sells tokens to a Pump.fun bonding curve
   */
  async sellToken(
    wallet: WalletProvider,
    tokenMint: string | PublicKey,
    percentage: number,
    settings?: any
  ): Promise<PumpFunResult> {
    try {
      console.log(`🔵 Selling ${percentage}% of token ${tokenMint} using PumpFun SDK...`);
      
      // Get wallet public key
      const walletPublicKey = await wallet.getPublicKey();
      
      // Convert tokenMint to PublicKey if it's a string
      const mintPubkey = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
      
      // Default settings
      const defaultSettings = {
        speed: TransactionSpeed.FAST,
        slippageBps: 100,
        useJito: true,
        jitoTipLamports: DEFAULT_JITO_TIP
      };
      
      // Merge with custom settings
      const mergedSettings = { ...defaultSettings, ...settings };
      console.log(`Using settings:`, mergedSettings);
      
      // Create a new transaction
      const transaction = new Transaction();
      
      // Fetch global state
      console.log(`Fetching global state...`);
      const global = await this.onlinePumpSdk.fetchGlobal();
      
      if (!global) {
        throw new Error('Failed to fetch Pump.fun global state');
      }
      
      // Fetch sell state
      console.log(`Fetching sell state for token ${mintPubkey.toString()}...`);
      const { bondingCurveAccountInfo, bondingCurve } = 
        await this.onlinePumpSdk.fetchSellState(mintPubkey, walletPublicKey);
      
      if (!bondingCurve) {
        throw new Error('Bonding curve not found for this token');
      }
      
      console.log(`Bonding curve found:`, {
        address: bondingCurveAccountInfo.publicKey.toString(),
        complete: bondingCurve.complete,
        creator: bondingCurve.creator.toString(),
      });
      
      // Get token balance
      const associatedTokenAddress = getAssociatedTokenAddressSync(mintPubkey, walletPublicKey, true);
      console.log(`Fetching token balance from ${associatedTokenAddress.toString()}...`);
      const tokenBalance = await this.connection.getTokenAccountBalance(associatedTokenAddress);
      
      console.log(`Token balance:`, tokenBalance.value);
      
      if (!tokenBalance.value.amount || Number(tokenBalance.value.amount) === 0) {
        throw new Error('No tokens to sell - your balance is zero');
      }
      
      // Calculate amount to sell based on percentage
      const sellAmount = new BN(
        Math.floor((Number(tokenBalance.value.amount) * percentage) / 100)
      );
      
      console.log(`Selling ${sellAmount.toString()} tokens (${percentage}% of ${tokenBalance.value.amount})...`);
      
      if (sellAmount.isZero()) {
        throw new Error('Sell amount is zero - try increasing the percentage');
      }
      
      // Calculate SOL amount from token amount
      const solAmountBN = getSellSolAmountFromTokenAmount({
        global,
        bondingCurve,
        amount: sellAmount,
        feeConfig: null,
        mintSupply: bondingCurve.tokenTotalSupply || new BN(0) // Use actual token supply if available
      });
      
      console.log(`Expected SOL return: ${solAmountBN.toString()} lamports (${solAmountBN.toNumber() / 1e9} SOL)`);
      
      // Create sell instructions
      console.log(`Creating sell instructions...`);
      const instructions = await this.pumpSdk.sellInstructions({
        global,
        bondingCurveAccountInfo,
        bondingCurve,
        mint: mintPubkey,
        user: walletPublicKey,
        amount: sellAmount,
        solAmount: solAmountBN,
        slippage: mergedSettings.slippageBps / 10000, // Convert basis points to decimal (e.g., 100 bps = 0.01)
      });
      
      console.log(`Generated ${instructions.length} instructions`);
      
      // Add all instructions to the transaction
      for (const ix of instructions) {
        transaction.add(ix);
      }
      
      // Add Jito tip if enabled
      if (mergedSettings.useJito && mergedSettings.jitoTipLamports > 0) {
        console.log(`Adding Jito tip: ${mergedSettings.jitoTipLamports} lamports`);
        transaction.instructions.unshift(
          this.createJitoTipInstruction(
            walletPublicKey,
            mergedSettings.jitoTipLamports
          )
        );
      }
      
      // Set recent blockhash and fee payer
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = walletPublicKey;
      
      console.log(`Transaction prepared with blockhash ${blockhash}`);
      
      // Sign transaction with wallet provider
      console.log(`Requesting wallet signature...`);
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send transaction with preflight disabled to avoid simulation errors
      console.log(`Sending transaction...`);
      const txid = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        { skipPreflight: true } // Skip preflight to avoid simulation errors
      );
      
      console.log(`Transaction sent: ${txid}`);
      
      // Calculate SOL amount in SOL (not lamports)
      const solAmount = solAmountBN.toNumber() / 1e9;
      
      return {
        success: true,
        txId: txid,
        tokenMint: mintPubkey.toString(),
        tokenAmount: Number(sellAmount.toString()), // Convert BN to number
        solAmount // Return the SOL amount as a number
      };
    } catch (error: any) {
      console.error('❌ Error selling Pump.fun token:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error selling token'
      };
    }
  }

  /**
   * Collects creator fees
   */
  async collectCreatorFees(
    wallet: WalletProvider
  ): Promise<PumpFunResult> {
    try {
      // Get wallet public key
      const walletPublicKey = await wallet.getPublicKey();
      
      // Create a new transaction
      const transaction = new Transaction();
      
      // Create collect fees instructions
      const instructions = await this.onlinePumpSdk.collectCoinCreatorFeeInstructions(walletPublicKey);
      
      // Add all instructions to the transaction
      for (const ix of instructions) {
        transaction.add(ix);
      }
      
      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = walletPublicKey;
      
      // Sign transaction with wallet provider
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send transaction
      const txid = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        { skipPreflight: false }
      );
      
      return {
        success: true,
        txId: txid
      };
    } catch (error: any) {
      console.error('Error collecting creator fees:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error collecting fees'
      };
    }
  }

  /**
   * Creates a Jito tip instruction
   */
  private createJitoTipInstruction(
    from: PublicKey,
    lamports: number
  ) {
    return {
      programId: new PublicKey('11111111111111111111111111111111'),
      keys: [
        { pubkey: from, isSigner: true, isWritable: true },
        { pubkey: JITO_TIP_ACCOUNT, isSigner: false, isWritable: true }
      ],
      data: Buffer.from([2, ...new BN(lamports).toArray('le', 8)])
    };
  }

  /**
   * Checks if a token has a PumpSwap pool
   */
  async hasPool(tokenMint: string | PublicKey): Promise<boolean> {
    try {
      const mintString = typeof tokenMint === 'string' ? tokenMint : tokenMint.toBase58();
      
      // Check cache first
      const cached = this.poolCache.get(mintString);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        return cached.hasPool;
      }
      
      // If not in cache or expired, fetch from blockchain
      const mintPubkey = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
      
      // Add retry logic with exponential backoff
      let retries = 0;
      const maxRetries = 3;
      let delay = 500; // Start with 500ms delay
      
      while (retries < maxRetries) {
        try {
          const pool = await this.pumpAmmSdk.fetchPool(mintPubkey);
          const hasPool = pool !== null;
          
          // Cache the result
          this.poolCache.set(mintString, { hasPool, timestamp: Date.now() });
          
          return hasPool;
        } catch (error) {
          retries++;
          if (retries >= maxRetries) {
            console.error(`Failed to check pool after ${maxRetries} attempts:`, error);
            // Cache the negative result to avoid hammering the RPC
            this.poolCache.set(mintString, { hasPool: false, timestamp: Date.now() });
            return false;
          }
          
          // Wait before retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Double the delay for next retry
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking if token has PumpSwap pool:', error);
      // Cache the negative result to avoid hammering the RPC
      const mintString = typeof tokenMint === 'string' ? tokenMint : tokenMint.toBase58();
      this.poolCache.set(mintString, { hasPool: false, timestamp: Date.now() });
      return false;
    }
  }

  /**
   * Gets creator fees for a user
   */
  async getCreatorFees(creator: string | PublicKey): Promise<string> {
    try {
      const creatorPubkey = typeof creator === 'string' ? new PublicKey(creator) : creator;
      const balance = await this.onlinePumpSdk.getCreatorVaultBalanceBothPrograms(creatorPubkey);
      return balance.toString();
    } catch (error) {
      console.error('Error getting creator fees:', error);
      return '0';
    }
  }
}