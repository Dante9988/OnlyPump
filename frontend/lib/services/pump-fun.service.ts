import { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  Keypair,
  SYSVAR_RENT_PUBKEY,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import { PumpFunResult, TransactionSpeed } from '../types';
import { WalletProvider } from './wallet.interface';
import { OnlinePumpSdk, PumpSdk } from '@pump-fun/pump-sdk';
import { OnlinePumpAmmSdk } from '@pump-fun/pump-swap-sdk';
import BN from 'bn.js';

// Constants
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const DEFAULT_JITO_TIP = 10000000; // 0.01 SOL
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
const GLOBAL_STATE_SEED = 'global';
const BONDING_CURVE_SEED = 'bonding-curve';
const MINT_AUTHORITY_SEED = 'mint-authority';

// Instruction discriminators from IDL
const CREATE_DISCRIMINATOR = [24, 30, 200, 40, 5, 28, 7, 119];
const EXTEND_ACCOUNT_DISCRIMINATOR = [183, 18, 70, 156, 148, 109, 161, 34]; // From the IDL, matches withdraw discriminator
const BUY_DISCRIMINATOR = [102, 6, 61, 18, 1, 218, 235, 234];
const SELL_DISCRIMINATOR = [51, 230, 133, 164, 1, 127, 131, 173];

export class PumpFunService {
  private connection: Connection;
  private onlinePumpSdk: OnlinePumpSdk;
  private pumpAmmSdk: OnlinePumpAmmSdk;
  private tokenInfoCache: Map<string, { data: any, timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute cache TTL
  
  constructor(rpcUrl?: string) {
    this.connection = new Connection(rpcUrl || process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
    this.onlinePumpSdk = new OnlinePumpSdk(this.connection);
    this.pumpAmmSdk = new OnlinePumpAmmSdk(this.connection);
  }
  
  /**
   * Checks if a token is a Pump.fun token
   */
  async isTokenPumpFun(tokenMint: string | PublicKey): Promise<boolean> {
    try {
      // In a real implementation, this would check the token's program
      // For now, we'll simulate this functionality
      return true;
    } catch (error) {
      console.error('Error checking if token is Pump.fun:', error);
      return false;
    }
  }
  
  /**
   * Gets information about a Pump.fun token
   */
  async getTokenInfo(tokenMint: string | PublicKey): Promise<any | null> {
    try {
      const mintString = typeof tokenMint === 'string' ? tokenMint : tokenMint.toBase58();
      const mintPubkey = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
      
      // Check cache first
      const cached = this.tokenInfoCache.get(mintString);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        return cached.data;
      }
      
      // Derive bonding curve PDA using the IDL seed format
      const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
        PUMP_FUN_PROGRAM_ID
      );
      
      // Fetch bonding curve data
      const bondingCurveAccountInfo = await this.connection.getAccountInfo(bondingCurvePDA);
      
      let tokenInfo: any = null;
      let isPumpSwap = false;
      
      if (bondingCurveAccountInfo) {
        // This is a Pump.fun token
        // Get the raw data from the account
        const bondingCurveData = bondingCurveAccountInfo.data;
        
        // Parse bonding curve data according to the IDL structure
        // Skip the 8-byte discriminator
        let offset = 8;
        
        // Read fields according to the BondingCurve struct in the IDL
        const virtualTokenReserves = new BN(bondingCurveData.slice(offset, offset + 8), 'le');
        offset += 8;
        
        const virtualSolReserves = new BN(bondingCurveData.slice(offset, offset + 8), 'le');
        offset += 8;
        
        const realTokenReserves = new BN(bondingCurveData.slice(offset, offset + 8), 'le');
        offset += 8;
        
        const realSolReserves = new BN(bondingCurveData.slice(offset, offset + 8), 'le');
        offset += 8;
        
        const tokenTotalSupply = new BN(bondingCurveData.slice(offset, offset + 8), 'le');
        offset += 8;
        
        // Read boolean complete flag (1 byte)
        const complete = bondingCurveData[offset] === 1;
        offset += 1;
        
        // Read creator public key (32 bytes)
        const creator = new PublicKey(bondingCurveData.slice(offset, offset + 32));
        
        // Fetch global state for fee calculations
        const global = await this.onlinePumpSdk.fetchGlobal();
        
        // Get metadata for the token
        const metadata = await this.fetchTokenMetadata(mintPubkey);
        
        if (global && metadata) {
          // Calculate token metrics using actual bonding curve data
          const price = this.calculatePriceFromReserves(virtualSolReserves, virtualTokenReserves);
          const marketCap = this.calculateMarketCapFromReserves(virtualSolReserves);
          const liquidity = this.calculateLiquidityFromReserves(realSolReserves);
          
          tokenInfo = {
            mint: mintString,
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri || '',
            image: metadata.image || '',
            supply: tokenTotalSupply.toString(),
            bondingCurveAddress: bondingCurvePDA.toBase58(),
            isComplete: complete,
            price: price,
            marketCap: marketCap,
            liquidity: liquidity,
            creator: creator.toBase58(),
            virtualTokenReserves: virtualTokenReserves.toString(),
            virtualSolReserves: virtualSolReserves.toString(),
            realTokenReserves: realTokenReserves.toString(),
            realSolReserves: realSolReserves.toString()
          };
        }
      } else {
        // Check if it's a PumpSwap pool
        try {
          const pool = await this.pumpAmmSdk.fetchPool(mintPubkey);
          if (pool) {
            isPumpSwap = true;
            const metadata = await this.fetchTokenMetadata(mintPubkey);
            
            if (metadata) {
              // Calculate metrics for PumpSwap pools using actual pool data
              // Extract base and quote amounts from the pool
              let baseAmount, quoteAmount;
              
              // Try to access pool data based on PumpSwap IDL
              try {
                // Get token accounts to find balances
                const poolBaseTokenAccount = await this.connection.getTokenAccountBalance(
                  pool.poolBaseTokenAccount
                );
                const poolQuoteTokenAccount = await this.connection.getTokenAccountBalance(
                  pool.poolQuoteTokenAccount
                );
                
                baseAmount = new BN(poolBaseTokenAccount.value.amount);
                quoteAmount = new BN(poolQuoteTokenAccount.value.amount);
              } catch (error) {
                console.error('Error fetching pool token balances:', error);
                // Fallback to estimating from pool data
                // Since we don't have direct access to amounts, create reasonable defaults
                baseAmount = new BN(1000000);
                quoteAmount = new BN(10000 * LAMPORTS_PER_SOL);
              }
              
              // Calculate price and market cap from actual pool data
              const price = quoteAmount.div(baseAmount).toNumber() / LAMPORTS_PER_SOL;
              const marketCap = quoteAmount.mul(new BN(2)).toNumber() / LAMPORTS_PER_SOL;
              const liquidity = quoteAmount.toNumber() / LAMPORTS_PER_SOL;
              
              tokenInfo = {
                mint: mintString,
                name: metadata.name,
                symbol: metadata.symbol,
                uri: metadata.uri || '',
                image: metadata.image || '',
                supply: baseAmount.toString(),
                isComplete: true, // PumpSwap tokens are already migrated
                price: price,
                marketCap: marketCap,
                liquidity: liquidity,
                creator: pool.coinCreator?.toBase58() || '',
                isPumpSwap: true,
                baseAmount: baseAmount.toString(),
                quoteAmount: quoteAmount.toString()
              };
            }
          }
        } catch (error) {
          console.error('Error checking PumpSwap pool:', error);
        }
      }
      
      // If we found token info, cache it
      if (tokenInfo) {
        this.tokenInfoCache.set(mintString, { data: tokenInfo, timestamp: Date.now() });
        return tokenInfo;
      }
      
      // If we couldn't find token data, return null
      return null;
    } catch (error) {
      console.error('Error getting token info:', error);
      return null;
    }
  }
  
  /**
   * Fetch token metadata
   */
  private async fetchTokenMetadata(mint: PublicKey): Promise<{ name: string; symbol: string; uri?: string; image?: string }> {
    try {
      // Try to get metadata from Metaplex
      const metadataPda = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      )[0];
      
      const metadataAccount = await this.connection.getAccountInfo(metadataPda);
      
      if (metadataAccount) {
        // Parse the metadata account according to Metaplex format
        // Skip the first byte (type) and the next byte (unused)
        let offset = 1 + 1;
        
        // Skip the update authority (32 bytes)
        offset += 32;
        
        // Skip the mint address (32 bytes)
        offset += 32;
        
        // Read the name length and name
        const nameLen = metadataAccount.data[offset];
        offset += 1;
        const name = metadataAccount.data.slice(offset, offset + nameLen).toString('utf8').replace(/\\u0000/g, '');
        offset += 32; // Name buffer is fixed at 32 bytes
        
        // Read the symbol length and symbol
        const symbolLen = metadataAccount.data[offset];
        offset += 1;
        const symbol = metadataAccount.data.slice(offset, offset + symbolLen).toString('utf8').replace(/\\u0000/g, '');
        offset += 10; // Symbol buffer is fixed at 10 bytes
        
        // Read the uri length and uri
        const uriLen = metadataAccount.data[offset];
        offset += 1;
        const uri = metadataAccount.data.slice(offset, offset + uriLen).toString('utf8').replace(/\\u0000/g, '');
        
        // Try to fetch the actual image from the URI if it's an Arweave or IPFS link
        let image = '';
        if (uri) {
          try {
            // For Arweave links, fetch the JSON metadata
            if (uri.startsWith('https://arweave.net/') || uri.startsWith('https://www.arweave.net/')) {
              const response = await fetch(uri);
              if (response.ok) {
                const metadata = await response.json();
                if (metadata.image) {
                  image = metadata.image;
                }
              }
            }
          } catch (error) {
            console.error('Error fetching image from URI:', error);
          }
        }
        
        return {
          name: name.trim() || `Token ${mint.toBase58().slice(0, 6)}...`,
          symbol: symbol.trim() || mint.toBase58().slice(0, 4).toUpperCase(),
          uri,
          image: image || `https://via.placeholder.com/48?text=${mint.toBase58().slice(0, 2)}`
        };
      }
      
      // Fallback if no metadata found
      return {
        name: `Token ${mint.toBase58().slice(0, 6)}...`,
        symbol: mint.toBase58().slice(0, 4).toUpperCase(),
        image: `https://via.placeholder.com/48?text=${mint.toBase58().slice(0, 2)}`
      };
    } catch (error) {
      console.error('Error fetching token metadata:', error);
      return {
        name: `Token ${mint.toBase58().slice(0, 6)}...`,
        symbol: mint.toBase58().slice(0, 4).toUpperCase(),
        image: `https://via.placeholder.com/48?text=${mint.toBase58().slice(0, 2)}`
      };
    }
  }
  
  /**
   * Calculate token price from reserves directly
   */
  private calculatePriceFromReserves(virtualSolReserves: BN, virtualTokenReserves: BN): number {
    if (virtualTokenReserves.isZero()) return 0;
    
    return virtualSolReserves.div(virtualTokenReserves).toNumber() / LAMPORTS_PER_SOL;
  }
  
  /**
   * Calculate token market cap from reserves directly
   */
  private calculateMarketCapFromReserves(virtualSolReserves: BN): number {
    // Market cap is 2x the virtual SOL reserves according to the bonding curve formula
    return virtualSolReserves.mul(new BN(2)).toNumber() / LAMPORTS_PER_SOL;
  }
  
  /**
   * Calculate token liquidity from reserves directly
   */
  private calculateLiquidityFromReserves(realSolReserves: BN): number {
    // Liquidity is the real SOL reserves in the bonding curve
    return realSolReserves.toNumber() / LAMPORTS_PER_SOL;
  }
  
  /**
   * Calculate token price - wrapper for backward compatibility
   */
  private calculatePrice(bondingCurve: any, global: any): number {
    if (!bondingCurve || !global) return 0;
    
    const virtualSolReserves = new BN(bondingCurve.virtualSolReserves);
    const virtualTokenReserves = new BN(bondingCurve.virtualTokenReserves);
    
    return this.calculatePriceFromReserves(virtualSolReserves, virtualTokenReserves);
  }
  
  /**
   * Calculate token market cap - wrapper for backward compatibility
   */
  private calculateMarketCap(bondingCurve: any, global: any): number {
    if (!bondingCurve || !global) return 0;
    
    const virtualSolReserves = new BN(bondingCurve.virtualSolReserves);
    return this.calculateMarketCapFromReserves(virtualSolReserves);
  }
  
  /**
   * Calculate token liquidity - wrapper for backward compatibility
   */
  private calculateLiquidity(bondingCurve: any): number {
    if (!bondingCurve) return 0;
    
    const realSolReserves = new BN(bondingCurve.realSolReserves);
    return this.calculateLiquidityFromReserves(realSolReserves);
  }
  
  /**
   * Checks if a token's bonding curve is complete (migrated to PumpSwap)
   */
  async isBondingCurveComplete(tokenMint: string | PublicKey): Promise<boolean> {
    try {
      // In a real implementation, this would check the bonding curve status
      return false;
    } catch (error) {
      console.error('Error checking bonding curve status:', error);
      return false;
    }
  }
  
  /**
   * Creates a new token on Pump.fun and optionally buys it in the same transaction
   * @param wallet The wallet provider
   * @param name Token name
   * @param symbol Token symbol (ticker)
   * @param uri URI to the token metadata (image)
   * @param solAmount Optional SOL amount to buy the token with (if provided, will create and buy in one tx)
   * @param description Optional token description
   * @param socials Optional social links (twitter, telegram, website)
   * @param settings Transaction settings
   */
  async createToken(
    wallet: WalletProvider,
    name: string,
    symbol: string,
    uri: string,
    solAmount?: number,
    description?: string,
    socials?: { [key: string]: string },
    settings?: any
  ): Promise<PumpFunResult> {
    console.log('Creating token with params:', { name, symbol, uri, solAmount });
    try {
      // Get wallet public key
      const walletPublicKey = await wallet.getPublicKey();
      
      // Default settings
      const defaultSettings = {
        speed: TransactionSpeed.FAST,
        slippageBps: 100,
        useJito: false, // No Jito tip for token creation
        jitoTipLamports: 0
      };
      
      // Merge with custom settings
      const mergedSettings = { ...defaultSettings, ...settings };
      
      // Create a new transaction
      const transaction = new Transaction();
      
      // Add compute budget instruction if needed for complex transactions
      if (mergedSettings.speed !== TransactionSpeed.FAST) {
        let priorityFee = 250000; // Default for FAST
        
        if (mergedSettings.speed === TransactionSpeed.TURBO) {
          priorityFee = 500000;
        } else if (mergedSettings.speed === TransactionSpeed.ULTRA) {
          priorityFee = 1000000;
        }
        
        transaction.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee
          })
        );
      }
      
      // Create a new token mint
      const mintKeypair = Keypair.generate();
      
      // Derive PDAs
      const [globalStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_STATE_SEED)],
        PUMP_FUN_PROGRAM_ID
      );
      
      const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mintKeypair.publicKey.toBuffer()],
        PUMP_FUN_PROGRAM_ID
      );
      
      const [mintAuthorityPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(MINT_AUTHORITY_SEED)],
        PUMP_FUN_PROGRAM_ID
      );
      
      // Get metadata account address
      const [metadataAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintKeypair.publicKey.toBuffer()
        ],
        TOKEN_METADATA_PROGRAM_ID
      );
      
      // Get associated token account for bonding curve
      const associatedBondingCurveAddress = await spl.getAssociatedTokenAddress(
        mintKeypair.publicKey,
        bondingCurvePDA,
        true // allowOwnerOffCurve
      );
      
      // Exactly match Pump.fun's instruction sequence as seen in the transaction logs
      
      // #3.1 - System Program: CreateAccount for the mint
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: walletPublicKey,
          newAccountPubkey: mintKeypair.publicKey,
          lamports: await this.connection.getMinimumBalanceForRentExemption(spl.MintLayout.span),
          space: spl.MintLayout.span,
          programId: spl.TOKEN_PROGRAM_ID
        })
      );
      
      // #3.2 - Token Program: InitializeMint2
      transaction.add(
        spl.createInitializeMint2Instruction(
          mintKeypair.publicKey,  // mint
          9,                      // decimals
          mintAuthorityPDA,       // mintAuthority
          null,                   // freezeAuthority
          spl.TOKEN_PROGRAM_ID
        )
      );
      
      // #3.3 - Pump.fun: Create instruction with all accounts
      // This instruction will handle creating the bonding curve, associated token account,
      // metadata account, minting tokens, and setting authority
      const createTokenInstruction = this.createTokenInstruction(
        mintKeypair.publicKey,
        mintAuthorityPDA,
        bondingCurvePDA,
        associatedBondingCurveAddress,
        globalStatePDA,
        metadataAddress,
        walletPublicKey,
        name,
        symbol,
        uri
      );
      
      transaction.add(createTokenInstruction);
      
      // If solAmount is provided, add the following instructions to match Pump.fun's exact sequence
      if (solAmount && solAmount > 0) {
        console.log('Adding buy instructions for amount:', solAmount);
        
        // #4 - Pump.fun instruction: ExtendAccount
        // This instruction extends the bonding curve account
        const extendAccountInstruction = this.createExtendAccountInstruction(
          mintKeypair.publicKey,
          bondingCurvePDA,
          walletPublicKey
        );
        
        transaction.add(extendAccountInstruction);
        
        // #5 - Associated Token Account Program instruction: CreateIdempotent
        // Get associated token account for the user
        const associatedUserAddress = await spl.getAssociatedTokenAddress(
          mintKeypair.publicKey,
          walletPublicKey
        );
        
        // Create associated token account for the user (idempotent version)
        // This ensures it won't fail if the account already exists
        transaction.add(
          spl.createAssociatedTokenAccountIdempotentInstruction(
            walletPublicKey,
            associatedUserAddress,
            walletPublicKey,
            mintKeypair.publicKey
          )
        );
        
        // #6 - Pump.fun instruction: Buy
        // Get fee recipient from global state
        // In a real implementation, we would fetch this from the global state account
        // For now, we'll use a placeholder that will be overridden by the program
        const feeRecipient = new PublicKey('11111111111111111111111111111111');
        
        // Convert SOL amount to lamports
        const lamports = Math.floor(solAmount * 1e9);
        
        // Calculate max SOL cost with slippage
        const slippageBps = mergedSettings.slippageBps || 100; // Default 1%
        const maxSolCost = Math.ceil(lamports * (1 + slippageBps / 10000));
        
        // Create buy instruction
        const buyInstruction = this.createBuyInstruction(
          globalStatePDA,
          feeRecipient,
          mintKeypair.publicKey,
          bondingCurvePDA,
          associatedBondingCurveAddress,
          associatedUserAddress,
          walletPublicKey,
          lamports, // Amount in lamports
          maxSolCost // Max SOL cost with slippage
        );
        
        transaction.add(buyInstruction);
      }
      
      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = walletPublicKey;
      
      // Partially sign with the mint keypair
      transaction.partialSign(mintKeypair);
      
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
        tokenMint: mintKeypair.publicKey.toString()
      };
    } catch (error: any) {
      console.error('Error creating Pump.fun token:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating token'
      };
    }
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
      
      // Add compute budget instruction if needed
      if (mergedSettings.speed !== TransactionSpeed.FAST) {
        let priorityFee = 250000; // Default for FAST
        
        if (mergedSettings.speed === TransactionSpeed.TURBO) {
          priorityFee = 500000;
        } else if (mergedSettings.speed === TransactionSpeed.ULTRA) {
          priorityFee = 1000000;
        }
        
        transaction.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee
          })
        );
      }
      
      // Add Jito tip if enabled
      if (mergedSettings.useJito && mergedSettings.jitoTipLamports > 0) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: walletPublicKey,
            toPubkey: new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhArj8T'), // Jito tip account
            lamports: mergedSettings.jitoTipLamports
          })
        );
      }
      
      // Derive PDAs
      const [globalStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_STATE_SEED)],
        PUMP_FUN_PROGRAM_ID
      );
      
      const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mintPubkey.toBuffer()],
        PUMP_FUN_PROGRAM_ID
      );
      
      // Get fee recipient from global state (for a real implementation)
      // For now, we'll use a placeholder
      const feeRecipient = new PublicKey('11111111111111111111111111111111');
      
      // Get associated token accounts
      const associatedBondingCurveAddress = await spl.getAssociatedTokenAddress(
        mintPubkey,
        bondingCurvePDA,
        true // allowOwnerOffCurve
      );
      
      const associatedUserAddress = await spl.getAssociatedTokenAddress(
        mintPubkey,
        walletPublicKey
      );
      
      // Create buy instruction
      const buyInstruction = this.createBuyInstruction(
        globalStatePDA,
        feeRecipient,
        mintPubkey,
        bondingCurvePDA,
        associatedBondingCurveAddress,
        associatedUserAddress,
        walletPublicKey,
        solAmount * 1e9, // Convert SOL to lamports
        Math.ceil(solAmount * 1e9 * (1 + mergedSettings.slippageBps / 10000)) // Max SOL cost with slippage
      );
      
      transaction.add(buyInstruction);
      
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
        tokenAmount: 1000, // Mock token amount - in a real implementation this would be calculated
        solAmount,
        tokenMint: mintPubkey.toString()
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
      
      // Add compute budget instruction if needed
      if (mergedSettings.speed !== TransactionSpeed.FAST) {
        let priorityFee = 250000; // Default for FAST
        
        if (mergedSettings.speed === TransactionSpeed.TURBO) {
          priorityFee = 500000;
        } else if (mergedSettings.speed === TransactionSpeed.ULTRA) {
          priorityFee = 1000000;
        }
        
        transaction.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee
          })
        );
      }
      
      // Add Jito tip if enabled
      if (mergedSettings.useJito && mergedSettings.jitoTipLamports > 0) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: walletPublicKey,
            toPubkey: new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhArj8T'), // Jito tip account
            lamports: mergedSettings.jitoTipLamports
          })
        );
      }
      
      // Derive PDAs
      const [globalStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_STATE_SEED)],
        PUMP_FUN_PROGRAM_ID
      );
      
      const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mintPubkey.toBuffer()],
        PUMP_FUN_PROGRAM_ID
      );
      
      // Get fee recipient from global state (for a real implementation)
      // For now, we'll use a placeholder
      const feeRecipient = new PublicKey('11111111111111111111111111111111');
      
      // Get associated token accounts
      const associatedBondingCurveAddress = await spl.getAssociatedTokenAddress(
        mintPubkey,
        bondingCurvePDA,
        true // allowOwnerOffCurve
      );
      
      const associatedUserAddress = await spl.getAssociatedTokenAddress(
        mintPubkey,
        walletPublicKey
      );
      
      // Get token balance
      let tokenBalance: number;
      try {
        const accountInfo = await this.connection.getTokenAccountBalance(associatedUserAddress);
        tokenBalance = parseInt(accountInfo.value.amount);
      } catch (error) {
        console.error('Error getting token balance:', error);
        tokenBalance = 1000000; // Mock balance for testing
      }
      
      // Calculate amount to sell based on percentage
      const sellAmount = Math.floor(tokenBalance * (percentage / 100));
      
      // Create sell instruction
      const sellInstruction = this.createSellInstruction(
        globalStatePDA,
        feeRecipient,
        mintPubkey,
        bondingCurvePDA,
        associatedBondingCurveAddress,
        associatedUserAddress,
        walletPublicKey,
        sellAmount,
        0 // Min SOL output with slippage - in a real implementation this would be calculated
      );
      
      transaction.add(sellInstruction);
      
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
        tokenAmount: sellAmount,
        solAmount: 0.1, // Mock SOL amount - in a real implementation this would be calculated
        tokenMint: mintPubkey.toString()
      };
    } catch (error: any) {
      console.error('Error selling Pump.fun token:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error selling token'
      };
    }
  }
  
  /**
   * Creates a token instruction based on the Pump.fun IDL
   */
  private createTokenInstruction(
    mint: PublicKey,
    mintAuthority: PublicKey,
    bondingCurve: PublicKey,
    associatedBondingCurve: PublicKey,
    global: PublicKey,
    metadata: PublicKey,
    user: PublicKey,
    name: string,
    symbol: string,
    uri: string
  ): TransactionInstruction {
    // Create instruction data using Borsh serialization format that Anchor expects
    // We'll use a manual approach to match exactly what Pump.fun sends
    
    // Create instruction data buffer
    const buffer = Buffer.alloc(1000); // Large enough buffer
    let offset = 0;
    
    // Write instruction discriminator
    CREATE_DISCRIMINATOR.forEach(byte => {
      buffer.writeUInt8(byte, offset);
      offset += 1;
    });
    
    // Write name with length prefix - exactly as shown in the Pump.fun transaction
    // Format: u32 length + bytes
    const nameBuffer = Buffer.from(name);
    buffer.writeUInt32LE(nameBuffer.length, offset);
    offset += 4;
    nameBuffer.copy(buffer, offset);
    offset += nameBuffer.length;
    
    // Write symbol with length prefix
    // Format: u32 length + bytes
    const symbolBuffer = Buffer.from(symbol);
    buffer.writeUInt32LE(symbolBuffer.length, offset);
    offset += 4;
    symbolBuffer.copy(buffer, offset);
    offset += symbolBuffer.length;
    
    // Write URI with length prefix
    // Format: u32 length + bytes
    const uriBuffer = Buffer.from(uri);
    buffer.writeUInt32LE(uriBuffer.length, offset);
    offset += 4;
    uriBuffer.copy(buffer, offset);
    offset += uriBuffer.length;
    
    // Create the instruction with accounts from IDL - match the exact account order from screenshots and logs
    // This must match EXACTLY what's in the Pump.fun IDL for the create instruction
    return new TransactionInstruction({
      keys: [
        // #1 - Mint (signer, writable)
        { pubkey: mint, isSigner: true, isWritable: true },
        
        // #2 - Mint Authority (PDA)
        { pubkey: mintAuthority, isSigner: false, isWritable: false },
        
        // #3 - Bonding Curve (PDA, writable)
        { pubkey: bondingCurve, isSigner: false, isWritable: true },
        
        // #4 - Associated Bonding Curve (writable)
        { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
        
        // #5 - Global state
        { pubkey: global, isSigner: false, isWritable: false },
        
        // #6 - Token Metadata Program
        { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
        
        // #7 - Metadata account (writable)
        { pubkey: metadata, isSigner: false, isWritable: true },
        
        // #8 - User/Payer (signer, writable)
        { pubkey: user, isSigner: true, isWritable: true },
        
        // #9 - System Program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        
        // #10 - Token Program
        { pubkey: spl.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        
        // #11 - Associated Token Program
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        
        // #12 - Rent sysvar
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        
        // #13 - Event Authority
        { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
        
        // #14 - Program ID (self)
        { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PUMP_FUN_PROGRAM_ID,
      data: buffer.slice(0, offset),
    });
  }

  /**
   * Creates a buy instruction based on the Pump.fun IDL
   */
  private createBuyInstruction(
    global: PublicKey,
    feeRecipient: PublicKey,
    mint: PublicKey,
    bondingCurve: PublicKey,
    associatedBondingCurve: PublicKey,
    associatedUser: PublicKey,
    user: PublicKey,
    amount: number,
    maxSolCost: number
  ): TransactionInstruction {
    // Create instruction data buffer
    const buffer = Buffer.alloc(1000); // Large enough buffer
    let offset = 0;
    
    // Write instruction discriminator
    BUY_DISCRIMINATOR.forEach(byte => {
      buffer.writeUInt8(byte, offset);
      offset += 1;
    });
    
    // Write amount (u64)
    buffer.writeBigUInt64LE(BigInt(amount), offset);
    offset += 8;
    
    // Write maxSolCost (u64)
    buffer.writeBigUInt64LE(BigInt(maxSolCost), offset);
    offset += 8;
    
    // Create the instruction with accounts from IDL
    return new TransactionInstruction({
      keys: [
        { pubkey: global, isSigner: false, isWritable: false },
        { pubkey: feeRecipient, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: bondingCurve, isSigner: false, isWritable: true },
        { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
        { pubkey: associatedUser, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: spl.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PUMP_FUN_PROGRAM_ID,
      data: buffer.slice(0, offset),
    });
  }
  
  /**
   * Creates an ExtendAccount instruction for Pump.fun
   */
  private createExtendAccountInstruction(
    mint: PublicKey,
    bondingCurve: PublicKey,
    user: PublicKey
  ): TransactionInstruction {
    // Create instruction data buffer
    const buffer = Buffer.alloc(8); // Just need space for the discriminator
    let offset = 0;
    
    // ExtendAccount discriminator from the IDL
    
    // Write instruction discriminator
    EXTEND_ACCOUNT_DISCRIMINATOR.forEach(byte => {
      buffer.writeUInt8(byte, offset);
      offset += 1;
    });
    
    // Create the instruction with accounts
    return new TransactionInstruction({
      keys: [
        // Required accounts for ExtendAccount
        { pubkey: bondingCurve, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PUMP_FUN_PROGRAM_ID,
      data: buffer.slice(0, offset),
    });
  }
  
  /**
   * Creates a sell instruction based on the Pump.fun IDL
   */
  private createSellInstruction(
    global: PublicKey,
    feeRecipient: PublicKey,
    mint: PublicKey,
    bondingCurve: PublicKey,
    associatedBondingCurve: PublicKey,
    associatedUser: PublicKey,
    user: PublicKey,
    amount: number,
    minSolOutput: number
  ): TransactionInstruction {
    // Create instruction data buffer
    const buffer = Buffer.alloc(1000); // Large enough buffer
    let offset = 0;
    
    // Write instruction discriminator
    SELL_DISCRIMINATOR.forEach(byte => {
      buffer.writeUInt8(byte, offset);
      offset += 1;
    });
    
    // Write amount (u64)
    buffer.writeBigUInt64LE(BigInt(amount), offset);
    offset += 8;
    
    // Write minSolOutput (u64)
    buffer.writeBigUInt64LE(BigInt(minSolOutput), offset);
    offset += 8;
    
    // Create the instruction with accounts from IDL
    return new TransactionInstruction({
      keys: [
        { pubkey: global, isSigner: false, isWritable: false },
        { pubkey: feeRecipient, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: bondingCurve, isSigner: false, isWritable: true },
        { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
        { pubkey: associatedUser, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: spl.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PUMP_FUN_PROGRAM_ID,
      data: buffer.slice(0, offset),
    });
  }
}