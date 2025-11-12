import { Injectable, Logger } from '@nestjs/common';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { PumpSdk, OnlinePumpSdk, getBuyTokenAmountFromSolAmount, getSellSolAmountFromTokenAmount } from '@pump-fun/pump-sdk';
import { OnlinePumpAmmSdk, PUMP_AMM_SDK, canonicalPumpPoolPda } from '@pump-fun/pump-swap-sdk';
import { ConfigService } from '@nestjs/config';
import { VanityAddressManagerService } from './vanity-address-manager.service';
import BN from 'bn.js';

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
    private vanityAddressManager: VanityAddressManagerService
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
        instructions = await PUMP_AMM_SDK.buyQuoteInput(
          swapState,
          solAmountBN,
          1 // 1% slippage
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
            mintSupply: null
          }),
          slippage: 1,
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
      if (tokenBalance <= 0) {
        throw new Error('No tokens found in wallet');
      }

      // Calculate amount to sell
      const sellAmount = Math.floor(tokenBalance * (request.percentage / 100));
      if (sellAmount <= 0) {
        throw new Error('Invalid sell amount');
      }

      const sellAmountBN = new BN(sellAmount);

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

        // Build sell instructions using PumpSwap
        instructions = await PUMP_AMM_SDK.sellBaseInput(
          swapState,
          sellAmountBN,
          1 // 1% slippage
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

        instructions = await this.pumpSdk.sellInstructions({
          global,
          bondingCurveAccountInfo,
          bondingCurve: bc,
          mint: tokenMint,
          user: walletPubkey,
          amount: sellAmountBN,
          solAmount: getSellSolAmountFromTokenAmount({
            global,
            feeConfig: null,
            mintSupply: null,
            bondingCurve: bc,
            amount: sellAmountBN
          }),
          slippage: 1,
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

}
