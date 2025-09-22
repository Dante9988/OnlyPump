import { Injectable } from '@nestjs/common';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  TransactionInstruction, 
  SystemProgram,
  SYSVAR_RENT_PUBKEY
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
  PUMP_FUN_PROGRAM_ID, 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
  EVENT_AUTHORITY,
  SYSTEM_PROGRAM_ID,
  RENT_SYSVAR_ID,
  DEFAULT_JITO_TIP
} from '../../common/constants';
import { 
  createComputeBudgetInstruction, 
  createJitoTipInstruction, 
  signAndSendTransaction,
  confirmTransaction
} from '../../utils/transaction.utils';
import { 
  fetchBondingCurveAccount, 
  fetchGlobalAccount, 
  deriveBondingCurvePDA, 
  deriveGlobalPDA,
  isPumpFunToken
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
 * Service for interacting with Pump.fun tokens and AMM
 */
@Injectable()
export class PumpFunService {
  private connection: Connection;
  
  /**
   * Creates a new PumpFunService instance
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
   * Checks if a token is a Pump.fun token
   * @param tokenMint Token mint address
   * @returns True if the token is a Pump.fun token
   */
  async isTokenPumpFun(tokenMint: string | PublicKey): Promise<boolean> {
    const mint = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
    return isPumpFunToken(this.connection, mint);
  }
  
  /**
   * Gets information about a Pump.fun token
   * @param tokenMint Token mint address
   * @returns Token information
   */
  async getTokenInfo(tokenMint: string | PublicKey): Promise<TokenInfo | null> {
    const mint = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
    return getTokenInfo(this.connection, mint);
  }
  
  /**
   * Checks if a token's bonding curve is complete (migrated to Raydium)
   * @param tokenMint Token mint address
   * @returns True if the bonding curve is complete
   */
  async isBondingCurveComplete(tokenMint: string | PublicKey): Promise<boolean> {
    const mint = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
    const bondingCurve = await fetchBondingCurveAccount(this.connection, mint);
    return bondingCurve?.complete || false;
  }
  
  /**
   * Creates a new token on Pump.fun
   * @param wallet Wallet provider or keypair
   * @param name Token name
   * @param symbol Token symbol
   * @param uri Token metadata URI
   * @param description Token description (optional)
   * @param socials Token social links (optional)
   * @param settings Transaction settings
   * @returns Result of the create operation
   */
  async createToken(
    wallet: WalletProvider | Keypair,
    name: string,
    symbol: string,
    uri: string,
    description?: string,
    socials?: { [key: string]: string },
    settings?: Partial<PumpFunSettings>
  ): Promise<PumpFunResult> {
    // Convert Keypair to WalletProvider if needed
    const walletProvider = wallet instanceof Keypair 
      ? new KeypairWalletProvider(wallet)
      : wallet;
    try {
      // Get wallet public key
      const walletPublicKey = await walletProvider.getPublicKey();
      
      // Default settings
      const defaultSettings: PumpFunSettings = {
        speed: TransactionSpeed.FAST,
        slippageBps: 100,
        useJito: true,
        jitoTipLamports: DEFAULT_JITO_TIP
      };
      
      // Merge with custom settings
      const mergedSettings = { ...defaultSettings, ...settings };
      
      // Create a new mint keypair
      const mintKeypair = Keypair.generate();
      
      // Create a new transaction
      const transaction = new Transaction();
      
      // Add compute budget instruction
      transaction.add(createComputeBudgetInstruction(mergedSettings.speed));
      
      // Add Jito tip instruction if enabled
      if (mergedSettings.useJito && mergedSettings.jitoTipLamports > 0) {
        transaction.add(createJitoTipInstruction(walletPublicKey, mergedSettings.jitoTipLamports));
      }
      
      // Derive necessary PDAs
      const [mintAuthorityPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('mint-authority')],
        PUMP_FUN_PROGRAM_ID
      );
      
      const [bondingCurvePDA] = deriveBondingCurvePDA(mintKeypair.publicKey);
      const [globalPDA] = deriveGlobalPDA();
      
      // Get associated token account for the bonding curve
      const associatedBondingCurve = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        bondingCurvePDA,
        true
      );
      
      // Derive metadata account
      const [metadataAccount] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintKeypair.publicKey.toBuffer()
        ],
        TOKEN_METADATA_PROGRAM_ID
      );
      
      // Create instruction data
      const createInstructionLayout = Buffer.alloc(8 + 4 + name.length + 4 + symbol.length + 4 + uri.length);
      
      // Write discriminator [24, 30, 200, 40, 5, 28, 7, 119]
      createInstructionLayout.writeUInt8(24, 0);
      createInstructionLayout.writeUInt8(30, 1);
      createInstructionLayout.writeUInt8(200, 2);
      createInstructionLayout.writeUInt8(40, 3);
      createInstructionLayout.writeUInt8(5, 4);
      createInstructionLayout.writeUInt8(28, 5);
      createInstructionLayout.writeUInt8(7, 6);
      createInstructionLayout.writeUInt8(119, 7);
      
      // Write name length and bytes
      createInstructionLayout.writeUInt32LE(name.length, 8);
      Buffer.from(name).copy(createInstructionLayout, 12);
      
      // Write symbol length and bytes
      createInstructionLayout.writeUInt32LE(symbol.length, 12 + name.length);
      Buffer.from(symbol).copy(createInstructionLayout, 16 + name.length);
      
      // Write uri length and bytes
      createInstructionLayout.writeUInt32LE(uri.length, 16 + name.length + symbol.length);
      Buffer.from(uri).copy(createInstructionLayout, 20 + name.length + symbol.length);
      
      // Create instruction
      const createInstruction = new TransactionInstruction({
        keys: [
          { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: mintAuthorityPDA, isSigner: false, isWritable: false },
          { pubkey: bondingCurvePDA, isSigner: false, isWritable: true },
          { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
          { pubkey: globalPDA, isSigner: false, isWritable: false },
          { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: metadataAccount, isSigner: false, isWritable: true },
          { pubkey: walletPublicKey, isSigner: true, isWritable: true },
          { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: RENT_SYSVAR_ID, isSigner: false, isWritable: false },
          { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
          { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PUMP_FUN_PROGRAM_ID,
        data: createInstructionLayout
      });
      
      transaction.add(createInstruction);
      
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
      
      return {
        success: true,
        txId: txid
      };
    } catch (error) {
      console.error('Error creating Pump.fun token:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating token'
      };
    }
  }
  
  /**
   * Buys tokens from a Pump.fun bonding curve
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
      
      // Check if bonding curve is complete
      const bondingCurve = await fetchBondingCurveAccount(this.connection, mint);
      if (!bondingCurve) {
        return {
          success: false,
          error: 'Token not found or not a Pump.fun token'
        };
      }
      
      if (bondingCurve.complete) {
        return {
          success: false,
          error: 'Bonding curve is complete. Token has migrated to Raydium.'
        };
      }
      
      // Get global account
      const globalAccount = await fetchGlobalAccount(this.connection);
      if (!globalAccount) {
        return {
          success: false,
          error: 'Failed to fetch global account'
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
      
      // Derive necessary PDAs
      const [bondingCurvePDA] = deriveBondingCurvePDA(mint);
      const [globalPDA] = deriveGlobalPDA();
      
      // Get associated token accounts
      const associatedBondingCurve = await getAssociatedTokenAddress(
        mint,
        bondingCurvePDA,
        true
      );
      
      const associatedUser = await getAssociatedTokenAddress(
        mint,
        walletPublicKey,
        true
      );
      
      // Convert SOL amount to lamports
      const lamports = Math.floor(solAmount * 1e9);
      
      // Calculate max SOL cost with slippage
      const maxSolCost = Math.floor(lamports * (1 + mergedSettings.slippageBps / 10000));
      
      // Create instruction data
      const buyInstructionLayout = Buffer.alloc(24);
      
      // Write discriminator [102, 6, 61, 18, 1, 218, 235, 234]
      buyInstructionLayout.writeUInt8(102, 0);
      buyInstructionLayout.writeUInt8(6, 1);
      buyInstructionLayout.writeUInt8(61, 2);
      buyInstructionLayout.writeUInt8(18, 3);
      buyInstructionLayout.writeUInt8(1, 4);
      buyInstructionLayout.writeUInt8(218, 5);
      buyInstructionLayout.writeUInt8(235, 6);
      buyInstructionLayout.writeUInt8(234, 7);
      
      // Write amount (lamports)
      buyInstructionLayout.writeBigUInt64LE(BigInt(lamports), 8);
      
      // Write max SOL cost with slippage
      buyInstructionLayout.writeBigUInt64LE(BigInt(maxSolCost), 16);
      
      // Create buy instruction
      const buyInstruction = new TransactionInstruction({
        keys: [
          { pubkey: globalPDA, isSigner: false, isWritable: false },
          { pubkey: globalAccount.feeRecipient, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: bondingCurvePDA, isSigner: false, isWritable: true },
          { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
          { pubkey: associatedUser, isSigner: false, isWritable: true },
          { pubkey: walletPublicKey, isSigner: true, isWritable: true },
          { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: RENT_SYSVAR_ID, isSigner: false, isWritable: false },
          { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
          { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PUMP_FUN_PROGRAM_ID,
        data: buyInstructionLayout
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
      console.error('Error buying Pump.fun token:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error buying token'
      };
    }
  }
  
  /**
   * Sells tokens to a Pump.fun bonding curve
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
      
      // Check if bonding curve is complete
      const bondingCurve = await fetchBondingCurveAccount(this.connection, mint);
      if (!bondingCurve) {
        return {
          success: false,
          error: 'Token not found or not a Pump.fun token'
        };
      }
      
      if (bondingCurve.complete) {
        return {
          success: false,
          error: 'Bonding curve is complete. Token has migrated to Raydium.'
        };
      }
      
      // Get global account
      const globalAccount = await fetchGlobalAccount(this.connection);
      if (!globalAccount) {
        return {
          success: false,
          error: 'Failed to fetch global account'
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
      
      // Derive necessary PDAs
      const [bondingCurvePDA] = deriveBondingCurvePDA(mint);
      const [globalPDA] = deriveGlobalPDA();
      
      // Get associated token accounts
      const associatedBondingCurve = await getAssociatedTokenAddress(
        mint,
        bondingCurvePDA,
        true
      );
      
      const associatedUser = await getAssociatedTokenAddress(
        mint,
        walletPublicKey,
        true
      );
      
      // Calculate minimum SOL output with slippage
      // This is a simplified calculation - in a real implementation you would use the bonding curve formula
      const expectedSolOutput = sellAmount * Number(bondingCurve.virtualSolReserves) / Number(bondingCurve.virtualTokenReserves);
      const minSolOutput = Math.floor(expectedSolOutput * (1 - mergedSettings.slippageBps / 10000));
      
      // Create instruction data
      const sellInstructionLayout = Buffer.alloc(24);
      
      // Write discriminator [51, 230, 133, 164, 1, 127, 131, 173]
      sellInstructionLayout.writeUInt8(51, 0);
      sellInstructionLayout.writeUInt8(230, 1);
      sellInstructionLayout.writeUInt8(133, 2);
      sellInstructionLayout.writeUInt8(164, 3);
      sellInstructionLayout.writeUInt8(1, 4);
      sellInstructionLayout.writeUInt8(127, 5);
      sellInstructionLayout.writeUInt8(131, 6);
      sellInstructionLayout.writeUInt8(173, 7);
      
      // Write amount (tokens)
      sellInstructionLayout.writeBigUInt64LE(BigInt(sellAmount), 8);
      
      // Write min SOL output with slippage
      sellInstructionLayout.writeBigUInt64LE(BigInt(minSolOutput), 16);
      
      // Create sell instruction
      const sellInstruction = new TransactionInstruction({
        keys: [
          { pubkey: globalPDA, isSigner: false, isWritable: false },
          { pubkey: globalAccount.feeRecipient, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: bondingCurvePDA, isSigner: false, isWritable: true },
          { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
          { pubkey: associatedUser, isSigner: false, isWritable: true },
          { pubkey: walletPublicKey, isSigner: true, isWritable: true },
          { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
          { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PUMP_FUN_PROGRAM_ID,
        data: sellInstructionLayout
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
      console.error('Error selling Pump.fun token:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error selling token'
      };
    }
  }
}
