import { Injectable } from '@nestjs/common';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  TransactionInstruction, 
  SystemProgram
} from '@solana/web3.js';
import { 
  PumpFunSettings, 
  BuySettings, 
  SellSettings, 
  PumpFunResult,
  TokenInfo,
  TransactionSpeed
} from '../../interfaces/pump-fun.interface';
import { WalletProvider, KeypairWalletProvider } from '../../interfaces/wallet.interface';
import { 
  PUMPSWAP_PROGRAM_ID, 
  PUMP_FUN_PROGRAM_ID,
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  DEFAULT_JITO_TIP,
  WSOL_MINT
} from '../../common/constants';
import { 
  createComputeBudgetInstruction, 
  createJitoTipInstruction, 
  signAndSendTransaction,
  confirmTransaction,
  isPumpSwapPoolCreation,
  isBondingCurveComplete
} from '../../utils/transaction.utils';
import { 
  fetchBondingCurveAccount, 
  isPumpFunToken,
  getTokenMintFromLogs
} from '../../utils/account.utils';
import { 
  getTokenBalance, 
  getSolBalance, 
  getTokenInfo,
  getTokenMarketData
} from '../../utils/token.utils';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import * as bs58 from 'bs58';

/**
 * Service for interacting with PumpSwap AMM
 */
@Injectable()
export class PumpSwapService {
  private connection: Connection;
  
  /**
   * Creates a new PumpSwapService instance
   * @param rpcUrl Solana RPC URL (defaults to environment variable)
   */
  constructor(rpcUrl?: string) {
    this.connection = new Connection(rpcUrl || process.env.HELIUS_HTTPS_URI || process.env.SOLANA_RPC_URL || '');
  }
  
  /**
   * Sets the RPC connection
   * @param connection Solana connection
   */
  setConnection(connection: Connection): void {
    this.connection = connection;
  }
  
  /**
   * Checks if a token has a PumpSwap pool
   * @param tokenMint Token mint address
   * @returns True if the token has a PumpSwap pool
   */
  async hasPool(tokenMint: string | PublicKey): Promise<boolean> {
    try {
      const mint = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
      
      // This is a simplified implementation
      // In a real implementation, you would query the PumpSwap program to find pools
      
      // For now, we'll check if the token has migrated from Pump.fun
      const bondingCurve = await fetchBondingCurveAccount(this.connection, mint);
      if (!bondingCurve) {
        return false;
      }
      
      return bondingCurve.complete;
    } catch (error) {
      console.error('Error checking for PumpSwap pool:', error);
      return false;
    }
  }
  
  /**
   * Verifies if a transaction log contains a PumpFun to PumpSwap migration
   * @param logs Transaction logs
   * @returns True if the logs indicate a migration
   */
  verifyMigration(logs: string[]): boolean {
    // Check for both pool creation and bonding curve completion
    return isPumpSwapPoolCreation(logs) && isBondingCurveComplete(logs);
  }
  
  /**
   * Extracts token mint from migration logs
   * @param logs Transaction logs
   * @returns Token mint public key or null if not found
   */
  getMintFromMigrationLogs(logs: string[]): PublicKey | null {
    return getTokenMintFromLogs(logs);
  }
  
  /**
   * Buys tokens from PumpSwap AMM
   * @param wallet Wallet provider or keypair
   * @param tokenMint Token mint address
   * @param solAmount Amount of SOL to spend
   * @param settings Buy settings
   * @returns Result of the buy operation
   */
  async buyToken(
    wallet: WalletProvider | Keypair,
    tokenMint: string | PublicKey,
    solAmount: number,
    settings?: Partial<BuySettings>
  ): Promise<PumpFunResult> {
    // Convert Keypair to WalletProvider if needed
    const walletProvider = wallet instanceof Keypair 
      ? new KeypairWalletProvider(wallet)
      : wallet;
    try {
      const mint = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
      
      // Default settings
      const defaultSettings: BuySettings = {
        speed: TransactionSpeed.FAST,
        slippageBps: 100,
        useJito: true,
        jitoTipLamports: DEFAULT_JITO_TIP
      };
      
      // Merge with custom settings
      const mergedSettings = { ...defaultSettings, ...settings };
      
      // Get wallet public key
      const walletPublicKey = await walletProvider.getPublicKey();
      
      // Check if wallet has enough SOL
      const solBalance = await getSolBalance(this.connection, walletPublicKey);
      const totalSolNeeded = solAmount + (mergedSettings.useJito ? mergedSettings.jitoTipLamports / 1e9 : 0);
      
      if (solBalance < totalSolNeeded) {
        return {
          success: false,
          error: `Insufficient SOL balance. You have ${solBalance.toFixed(4)} SOL but need ${totalSolNeeded.toFixed(4)} SOL.`
        };
      }
      
      // Check if token has a PumpSwap pool
      const hasPool = await this.hasPool(mint);
      if (!hasPool) {
        return {
          success: false,
          error: 'Token does not have a PumpSwap pool'
        };
      }
      
      // Create a new transaction
      const transaction = new Transaction();
      
      // Add compute budget instruction
      transaction.add(createComputeBudgetInstruction(mergedSettings.speed));
      
      // Add Jito tip instruction if enabled
      if (mergedSettings.useJito && mergedSettings.jitoTipLamports > 0) {
        transaction.add(createJitoTipInstruction(walletPublicKey, mergedSettings.jitoTipLamports));
      }
      
      // Get associated token account for the user
      const userTokenAccount = await getAssociatedTokenAddress(
        mint,
        walletPublicKey,
        true
      );
      
      // Convert SOL amount to lamports
      const lamports = Math.floor(solAmount * 1e9);
      
      // Calculate minimum token output with slippage
      // This is a simplified calculation - in a real implementation you would query the pool for exact rates
      const minTokenOutput = Math.floor(lamports * (1 - mergedSettings.slippageBps / 10000));
      
      // In a real implementation, you would build the actual PumpSwap swap instruction
      // This is a placeholder that would need to be replaced with the actual implementation
      // based on reverse engineering the PumpSwap program
      
      // For now, we'll create a mock instruction that would fail
      const buyInstruction = new TransactionInstruction({
        keys: [
          { pubkey: walletPublicKey, isSigner: true, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PUMPSWAP_PROGRAM_ID,
        data: Buffer.from([]) // This would need to be the actual instruction data
      });
      
      transaction.add(buyInstruction);
      
      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = walletPublicKey;
      
      // Sign transaction with wallet provider
      const signedTransaction = await walletProvider.signTransaction(transaction);
      
      // Send transaction
      const txid = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        { skipPreflight: false }
      );
      
      // Wait for confirmation
      await confirmTransaction(this.connection, txid);
      
      // Get token balance after purchase
      const tokenBalance = await getTokenBalance(this.connection, walletPublicKey, mint);
      
      return {
        success: true,
        txId: txid,
        tokenAmount: tokenBalance,
        solAmount
      };
    } catch (error) {
      console.error('Error buying token from PumpSwap:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error buying token'
      };
    }
  }
  
  /**
   * Sells tokens to PumpSwap AMM
   * @param wallet Wallet provider or keypair
   * @param tokenMint Token mint address
   * @param percentage Percentage of tokens to sell (0-100)
   * @param settings Sell settings
   * @returns Result of the sell operation
   */
  async sellToken(
    wallet: WalletProvider | Keypair,
    tokenMint: string | PublicKey,
    percentage: number,
    settings?: Partial<SellSettings>
  ): Promise<PumpFunResult> {
    // Convert Keypair to WalletProvider if needed
    const walletProvider = wallet instanceof Keypair 
      ? new KeypairWalletProvider(wallet)
      : wallet;
    try {
      const mint = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
      
      // Default settings
      const defaultSettings: SellSettings = {
        speed: TransactionSpeed.FAST,
        slippageBps: 100,
        useJito: true,
        jitoTipLamports: DEFAULT_JITO_TIP
      };
      
      // Merge with custom settings
      const mergedSettings = { ...defaultSettings, ...settings };
      
      // Validate percentage
      if (percentage <= 0 || percentage > 100) {
        return {
          success: false,
          error: 'Percentage must be between 1 and 100'
        };
      }
      
      // Get wallet public key
      const walletPublicKey = await walletProvider.getPublicKey();
      
      // Get token balance
      const tokenBalance = await getTokenBalance(this.connection, walletPublicKey, mint);
      if (tokenBalance <= 0) {
        return {
          success: false,
          error: 'No tokens found in wallet'
        };
      }
      
      // Calculate amount to sell
      const sellAmount = Math.floor(tokenBalance * (percentage / 100));
      if (sellAmount <= 0) {
        return {
          success: false,
          error: 'Invalid sell amount'
        };
      }
      
      // Check if token has a PumpSwap pool
      const hasPool = await this.hasPool(mint);
      if (!hasPool) {
        return {
          success: false,
          error: 'Token does not have a PumpSwap pool'
        };
      }
      
      // Create a new transaction
      const transaction = new Transaction();
      
      // Add compute budget instruction
      transaction.add(createComputeBudgetInstruction(mergedSettings.speed));
      
      // Add Jito tip instruction if enabled
      if (mergedSettings.useJito && mergedSettings.jitoTipLamports > 0) {
        transaction.add(createJitoTipInstruction(walletPublicKey, mergedSettings.jitoTipLamports));
      }
      
      // Get associated token account for the user
      const userTokenAccount = await getAssociatedTokenAddress(
        mint,
        walletPublicKey,
        true
      );
      
      // Calculate minimum SOL output with slippage
      // This is a simplified calculation - in a real implementation you would query the pool for exact rates
      const expectedSolOutput = sellAmount * 0.0001; // Placeholder calculation
      const minSolOutput = Math.floor(expectedSolOutput * (1 - mergedSettings.slippageBps / 10000));
      
      // In a real implementation, you would build the actual PumpSwap swap instruction
      // This is a placeholder that would need to be replaced with the actual implementation
      // based on reverse engineering the PumpSwap program
      
      // For now, we'll create a mock instruction that would fail
      const sellInstruction = new TransactionInstruction({
        keys: [
          { pubkey: walletPublicKey, isSigner: true, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PUMPSWAP_PROGRAM_ID,
        data: Buffer.from([]) // This would need to be the actual instruction data
      });
      
      transaction.add(sellInstruction);
      
      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = walletPublicKey;
      
      // Sign transaction with wallet provider
      const signedTransaction = await walletProvider.signTransaction(transaction);
      
      // Send transaction
      const txid = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        { skipPreflight: false }
      );
      
      // Wait for confirmation
      await confirmTransaction(this.connection, txid);
      
      // Calculate SOL amount received (this is an estimate)
      const solAmount = expectedSolOutput / 1e9; // Convert lamports to SOL
      
      return {
        success: true,
        txId: txid,
        tokenAmount: sellAmount,
        solAmount
      };
    } catch (error) {
      console.error('Error selling token to PumpSwap:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error selling token'
      };
    }
  }
  
  /**
   * Monitors for new token launches on PumpSwap
   * @param callback Callback function to be called when a new token is detected
   * @returns Subscription ID
   */
  monitorNewTokens(callback: (tokenMint: string) => void): number {
    // This is a placeholder implementation
    // In a real implementation, you would subscribe to the PumpSwap program account changes
    // or use a websocket to listen for new pool creation events
    
    console.log('Monitoring for new token launches...');
    
    // Return a fake subscription ID
    return 0;
  }
  
  /**
   * Stops monitoring for new token launches
   * @param subscriptionId Subscription ID returned by monitorNewTokens
   */
  stopMonitoring(subscriptionId: number): void {
    // This is a placeholder implementation
    // In a real implementation, you would unsubscribe from the account changes
    
    console.log(`Stopped monitoring subscription ${subscriptionId}`);
  }
  
  /**
   * Monitors for token migrations from Pump.fun to PumpSwap
   * @param callback Callback function to be called when a migration is detected
   * @returns Subscription ID
   */
  monitorMigrations(callback: (tokenMint: string) => void): number {
    // This is a placeholder implementation
    // In a real implementation, you would subscribe to the Pump.fun program account changes
    // or use a websocket to listen for bonding curve completion events
    
    console.log('Monitoring for token migrations...');
    
    // Return a fake subscription ID
    return 0;
  }
  
  /**
   * Stops monitoring for token migrations
   * @param subscriptionId Subscription ID returned by monitorMigrations
   */
  stopMigrationMonitoring(subscriptionId: number): void {
    // This is a placeholder implementation
    // In a real implementation, you would unsubscribe from the account changes
    
    console.log(`Stopped migration monitoring subscription ${subscriptionId}`);
  }
}
