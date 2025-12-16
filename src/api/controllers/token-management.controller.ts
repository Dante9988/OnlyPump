import { Controller, Post, Body, Get, Req, Query, Param, HttpException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { TokenManagementService, CreateTokenRequest, CreateAndBuyTokenRequest, BuyTokenRequest, SellTokenRequest } from '../../services/token-management.service';
import { TransactionHistoryService, TransactionType } from '../../services/transaction-history.service';
import { PriceService } from '../../services/price.service';
import { SupabaseService } from '../../services/supabase.service';
import { TransactionResponseDto, SubmitSignedTransactionDto, SubmitTransactionResponseDto } from '../dto/transaction.dto';
import { CreateTokenDto, BuyTokenDto, SellTokenDto } from '../dto/token.dto';
import { XRequestSignatureGuard } from '../guards/x-request-signature.guard';

@ApiTags('Token Management')
@Controller('api/tokens')
@ApiHeader({
  name: 'x-request-signature',
  description:
    'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash (same format as /api/presale/*)',
  required: true,
})
@ApiHeader({
  name: 'x-solana-cluster',
  description: 'Target Solana cluster for building transactions: devnet | mainnet-beta (default: devnet)',
  required: false,
})
@UseGuards(XRequestSignatureGuard)
export class TokenManagementController {
  constructor(
    private readonly tokenManagementService: TokenManagementService,
    private readonly transactionHistoryService: TransactionHistoryService,
    private readonly priceService: PriceService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Post('buy')
  @ApiOperation({ 
    summary: 'Buy tokens from an existing Pump.fun token',
    description: 'Returns a serialized transaction that must be signed by the user\'s wallet and sent to the blockchain. The transaction is automatically tracked in history.',
  })
  @ApiBody({ type: BuyTokenDto })
  @ApiResponse({ status: 200, description: 'Token buy transaction prepared', type: TransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid trade size or slippage parameters' })
  async buyToken(
    @Req() req: Request,
    @Body() dto: BuyTokenDto,
  ): Promise<TransactionResponseDto> {
    const walletAddress = (req as any)?.user?.walletPubkey || (req as any).walletAddress;
    
    // Validate input
    if (!dto.tokenMint || dto.tokenMint.trim() === '') {
      throw new HttpException(
        {
          message: 'Token mint address is required',
          error: 'Validation Failed',
          statusCode: 400,
        },
        400,
      );
    }

    if (!dto.solAmount || dto.solAmount <= 0) {
      throw new HttpException(
        {
          message: 'SOL amount must be greater than 0',
          error: 'Validation Failed',
          statusCode: 400,
        },
        400,
      );
    }

    if (dto.solAmount > 1000) {
      throw new HttpException(
        {
          message: 'SOL amount too large. Maximum 1000 SOL per transaction.',
          error: 'Validation Failed',
          statusCode: 400,
        },
        400,
      );
    }
    
    const request: BuyTokenRequest = {
      tokenMint: dto.tokenMint,
      solAmount: dto.solAmount,
      slippageBps: dto.slippageBps,
    };

    const result = await this.tokenManagementService.buyToken(walletAddress, request);
    
    if (!result.success || !result.txId) {
      const errorMsg = result.error || 'Failed to prepare buy transaction';
      
      // Check if it's a user input error (return 400)
      const isUserError = 
        errorMsg.includes('Slippage tolerance too low') ||
        errorMsg.includes('Invalid public key') ||
        errorMsg.includes('Token not found') ||
        errorMsg.includes('bonding curve') ||
        errorMsg.toLowerCase().includes('invalid');

      const statusCode = isUserError ? 400 : 500;
      
      // Don't record failed transactions in DB
      throw new HttpException(
        {
          message: errorMsg,
          error: isUserError ? 'Validation Failed' : 'Buy Transaction Failed',
          statusCode,
        },
        statusCode,
      );
    }

    // Only record transaction if it was successfully prepared
    const pendingRecord = await this.transactionHistoryService.recordTransaction(
      walletAddress,
      '', // Will be updated after user signs and sends
      TransactionType.BUY,
      dto.tokenMint,
      dto.solAmount,
    );

    // Update token price in background (don't wait for it)
    this.updateTokenPriceInBackground(dto.tokenMint).catch((error) => {
      // Log but don't fail the request
      console.error(`Failed to update token price for ${dto.tokenMint}:`, error);
    });

    return {
      transaction: result.txId,
      pendingTransactionId: pendingRecord.id,
      tokenMint: result.tokenMint,
      type: TransactionType.BUY,
      solAmount: dto.solAmount,
    };
  }

  /**
   * Update token price in database (called in background)
   */
  private async updateTokenPriceInBackground(tokenMint: string): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    try {
      // Check if token exists in database first
      const existingToken = await this.supabaseService.getToken(tokenMint);
      if (!existingToken) {
        // Token not in our database (created elsewhere), skip price update
        return;
      }

      const priceData = await this.priceService.getTokenPriceData(tokenMint);
      
      if (!priceData) {
        return;
      }

      // Cap values to prevent database overflow
      // DECIMAL(30, 9) can store up to ~10^21, but we'll cap at reasonable values
      const MAX_MARKET_CAP = 1e12; // 1 trillion
      const MAX_PRICE = 1e6; // 1 million SOL per token (very high)
      const MAX_VOLUME = 1e10; // 10 billion
      
      await this.supabaseService.updateTokenPrice(tokenMint, {
        price_sol: Math.min(priceData.priceSol, MAX_PRICE),
        price_usd: Math.min(priceData.priceUsd, MAX_PRICE * 200), // Assuming max SOL price ~$200
        market_cap_sol: Math.min(priceData.marketCapSol, MAX_MARKET_CAP),
        market_cap_usd: Math.min(priceData.marketCapUsd, MAX_MARKET_CAP * 200),
        volume_24h_sol: Math.min(priceData.volume24hSol, MAX_VOLUME),
        volume_24h_usd: Math.min(priceData.volume24hUsd, MAX_VOLUME * 200),
        holders_count: priceData.holders,
      });
    } catch (error) {
      console.error(`Error updating token price for ${tokenMint}:`, error);
    }
  }

  @Post('sell')
  @ApiOperation({ 
    summary: 'Sell tokens to Pump.fun bonding curve',
    description: 'Returns a serialized transaction that must be signed by the user\'s wallet and sent to the blockchain. The transaction is automatically tracked in history.',
  })
  @ApiBody({ type: SellTokenDto })
  @ApiResponse({ status: 200, description: 'Token sell transaction prepared', type: TransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid trade size, slippage, or insufficient balance' })
  async sellToken(
    @Req() req: Request,
    @Body() dto: SellTokenDto,
  ): Promise<TransactionResponseDto> {
    const walletAddress = (req as any)?.user?.walletPubkey || (req as any).walletAddress;
    
    // Validate input
    if (!dto.tokenMint || dto.tokenMint.trim() === '') {
      throw new HttpException(
        {
          message: 'Token mint address is required',
          error: 'Validation Failed',
          statusCode: 400,
        },
        400,
      );
    }

    if (!dto.percentage || dto.percentage <= 0 || dto.percentage > 100) {
      throw new HttpException(
        {
          message: 'Percentage must be between 1 and 100',
          error: 'Validation Failed',
          statusCode: 400,
        },
        400,
      );
    }
    
    const request: SellTokenRequest = {
      tokenMint: dto.tokenMint,
      percentage: dto.percentage,
      slippageBps: dto.slippageBps,
      speed: dto.speed,
      useJito: dto.useJito,
      jitoTipLamports: dto.jitoTipLamports,
    };

    const result = await this.tokenManagementService.sellToken(walletAddress, request);
    
    if (!result.success || !result.txId) {
      const errorMsg = result.error || 'Failed to prepare sell transaction';
      
      // Check if it's a user input error (return 400)
      const isUserError =
        errorMsg.includes('No tokens found') ||
        errorMsg.includes('Invalid sell amount') ||
        errorMsg.includes('Slippage tolerance too low') ||
        errorMsg.includes('Invalid public key') ||
        errorMsg.includes('Token not found') ||
        errorMsg.includes('bonding curve') ||
        errorMsg.toLowerCase().includes('invalid');

      const statusCode = isUserError ? 400 : 500;

      // Don't record failed transactions in DB
      throw new HttpException(
        {
          message: errorMsg,
          error: isUserError ? 'Validation Failed' : 'Sell Transaction Failed',
          statusCode,
        },
        statusCode,
      );
    }

    // Only record transaction if it was successfully prepared
    const pendingRecord = await this.transactionHistoryService.recordTransaction(
      walletAddress,
      '', // Will be updated after user signs and sends
      TransactionType.SELL,
      dto.tokenMint,
      undefined, // solAmount (filled on confirmation)
      result.tokenAmount, // Number of tokens being sold
    );

    // Update token price in background (don't wait for it)
    this.updateTokenPriceInBackground(dto.tokenMint).catch((error) => {
      console.error(`Failed to update token price for ${dto.tokenMint}:`, error);
    });

    return {
      transaction: result.txId,
      pendingTransactionId: pendingRecord.id,
      tokenMint: result.tokenMint,
      type: TransactionType.SELL,
      tokenAmount: result.tokenAmount, // Include in response
    };
  }

  @Post('create')
  @ApiOperation({ summary: 'Create a new token on Pump.fun' })
  @ApiBody({ type: CreateTokenDto })
  @ApiResponse({ status: 200, description: 'Token creation transaction prepared', type: TransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid token parameters' })
  async createToken(
    @Req() req: Request,
    @Body() dto: CreateTokenDto,
  ): Promise<TransactionResponseDto> {
    const walletAddress = (req as any)?.user?.walletPubkey || (req as any).walletAddress;
    
    // Validate input
    if (!dto.name || dto.name.trim() === '') {
      throw new HttpException({ message: 'Token name is required', error: 'Validation Failed', statusCode: 400 }, 400);
    }

    if (!dto.symbol || dto.symbol.trim() === '') {
      throw new HttpException({ message: 'Token symbol is required', error: 'Validation Failed', statusCode: 400 }, 400);
    }

    if (!dto.uri || dto.uri.trim() === '') {
      throw new HttpException({ message: 'Token URI is required', error: 'Validation Failed', statusCode: 400 }, 400);
    }
    
    const request: CreateTokenRequest = {
      name: dto.name,
      symbol: dto.symbol,
      uri: dto.uri,
      description: dto.description,
      socials: dto.socials,
      useVanityAddress: true,
    };

    const result = await this.tokenManagementService.createToken(walletAddress, request);
    
    if (!result.success || !result.txId) {
      const errorMsg = result.error || 'Failed to prepare create transaction';
      
      const isUserError = 
        errorMsg.toLowerCase().includes('invalid') ||
        errorMsg.includes('required') ||
        errorMsg.includes('must be');

      const statusCode = isUserError ? 400 : 500;
      
      throw new HttpException(
        {
          message: errorMsg,
          error: isUserError ? 'Validation Failed' : 'Create Transaction Failed',
          statusCode,
        },
        statusCode,
      );
    }

    return {
      transaction: result.txId,
      tokenMint: result.tokenMint,
      vanityAddress: result.vanityAddress,
      type: TransactionType.CREATE,
    };
  }

  @Get(':tokenMint/trade-limits')
  @ApiOperation({ 
    summary: 'Get current trade limits for a token',
    description: 'Returns maximum buy/sell amounts based on current bonding curve liquidity. Use this to show users the max trade size before they attempt a transaction.',
  })
  @ApiResponse({ status: 200, description: 'Trade limits retrieved successfully' })
  async getTradeLimits(
    @Param('tokenMint') tokenMint: string,
  ): Promise<{
    maxBuySOL: number;
    recommendedMaxBuySOL: number;
    maxSellTokens: number;
    recommendedMaxSellTokens: number;
    liquiditySOL: number;
    isMigrated: boolean;
    tokenMint: string;
  }> {
    return await this.tokenManagementService.getTradeLimits(tokenMint);
  }

  @Post('create-and-buy')
  @ApiOperation({ summary: 'Create and buy a token in one transaction' })
  @ApiBody({ type: CreateTokenDto })
  @ApiResponse({ status: 200, description: 'Token creation and buy transaction prepared', type: TransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid token parameters or buy amount' })
  async createAndBuyToken(
    @Req() req: Request,
    @Body() dto: CreateTokenDto & { solAmount: number },
  ): Promise<TransactionResponseDto> {
    const walletAddress = (req as any)?.user?.walletPubkey || (req as any).walletAddress;
    
    // Validate input
    if (!dto.name || dto.name.trim() === '') {
      throw new HttpException({ message: 'Token name is required', error: 'Validation Failed', statusCode: 400 }, 400);
    }

    if (!dto.symbol || dto.symbol.trim() === '') {
      throw new HttpException({ message: 'Token symbol is required', error: 'Validation Failed', statusCode: 400 }, 400);
    }

    if (!dto.uri || dto.uri.trim() === '') {
      throw new HttpException({ message: 'Token URI is required', error: 'Validation Failed', statusCode: 400 }, 400);
    }

    if (!dto.solAmount || dto.solAmount <= 0) {
      throw new HttpException({ message: 'SOL amount must be greater than 0', error: 'Validation Failed', statusCode: 400 }, 400);
    }

    if (dto.solAmount > 1000) {
      throw new HttpException({ message: 'SOL amount too large. Maximum 1000 SOL per transaction.', error: 'Validation Failed', statusCode: 400 }, 400);
    }
    
    const request: CreateAndBuyTokenRequest = {
      name: dto.name,
      symbol: dto.symbol,
      uri: dto.uri,
      description: dto.description,
      socials: dto.socials,
      useVanityAddress: true,
      solAmount: dto.solAmount,
    };

    const result = await this.tokenManagementService.createAndBuyToken(walletAddress, request);
    
    if (!result.success || !result.txId) {
      const errorMsg = result.error || 'Failed to prepare create-and-buy transaction';
      
      // Check if it's a user input error
      const isUserError = 
        errorMsg.toLowerCase().includes('invalid') ||
        errorMsg.includes('required') ||
        errorMsg.includes('must be');

      const statusCode = isUserError ? 400 : 500;
      
      throw new HttpException(
        {
          message: errorMsg,
          error: isUserError ? 'Validation Failed' : 'Create Transaction Failed',
          statusCode,
        },
        statusCode,
      );
    }

    // Record transaction in history
    const pendingRecord = await this.transactionHistoryService.recordTransaction(
      walletAddress,
      '',
      TransactionType.CREATE_AND_BUY,
      result.tokenMint,
      dto.solAmount,
    );

    return {
      transaction: result.txId,
      pendingTransactionId: pendingRecord.id,
      tokenMint: result.tokenMint,
      vanityAddress: result.vanityAddress,
      type: TransactionType.CREATE_AND_BUY,
      solAmount: dto.solAmount,
    };
  }

  @Post(':pendingId/submit-signed')
  @ApiOperation({ 
    summary: 'Submit a signed transaction and update pending transaction record',
    description: 'Submit a signed transaction and update the pending transaction record with the actual signature.'
  })
  @ApiBody({ type: SubmitSignedTransactionDto })
  @ApiResponse({ status: 200, description: 'Transaction submitted successfully', type: SubmitTransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid transaction or signature' })
  async submitSignedTransactionWithPendingId(
    @Req() req: Request,
    @Param('pendingId') pendingId: string,
    @Body() dto: SubmitSignedTransactionDto,
  ): Promise<SubmitTransactionResponseDto> {
    const walletAddress = (req as any)?.user?.walletPubkey || (req as any).walletAddress;
    if (dto.walletAddress && dto.walletAddress !== walletAddress) {
      throw new HttpException(
        { message: 'walletAddress does not match authenticated wallet', error: 'Unauthorized', statusCode: 401 },
        401,
      );
    }
    
    // Validate input
    if (!dto.signedTransaction || dto.signedTransaction.trim() === '') {
      throw new HttpException(
        {
          message: 'Signed transaction data is required',
          error: 'Validation Failed',
          statusCode: 400,
        },
        400,
      );
    }
    
    try {
      const result = await this.tokenManagementService.submitSignedTransaction(
        dto.signedTransaction,
        walletAddress,
        dto.useJito ?? false
      );

      if (!result.success || !result.txId) {
        const errorMsg = result.error || 'Failed to submit transaction';
        console.error('Transaction submission failed:', errorMsg);
        
        // Check if it's a user error or blockchain error
        const isUserError = 
          errorMsg.includes('Invalid signature') ||
          errorMsg.includes('not signed') ||
          errorMsg.includes('blockhash not found') ||
          errorMsg.includes('already processed');

        const statusCode = isUserError ? 400 : 500;
        
        throw new HttpException(
          {
            message: errorMsg,
            error: isUserError ? 'Validation Failed' : 'Transaction Submission Failed',
            statusCode,
          },
          statusCode,
        );
      }

      // Update the pending transaction record with the actual signature
      await this.transactionHistoryService.updateTransactionSignature(
        pendingId,
        result.txId
      );

      return {
        transactionSignature: result.txId,
        status: 'submitted',
        pendingTransactionId: pendingId,
      };
    } catch (error) {
      console.error('Error in submitSignedTransactionWithPendingId controller:', error);
      throw error;
    }
  }

  @Post('submit-signed')
  @ApiOperation({ 
    summary: 'Submit a signed transaction to the blockchain',
    description: 'After the user signs a transaction with their Phantom wallet, submit it to the blockchain. The transaction must be signed by the wallet authenticated via x-request-signature.'
  })
  @ApiBody({ type: SubmitSignedTransactionDto })
  @ApiResponse({ status: 200, description: 'Transaction submitted successfully', type: SubmitTransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid transaction or not signed correctly' })
  async submitSignedTransaction(
    @Req() req: Request,
    @Body() dto: SubmitSignedTransactionDto,
  ): Promise<SubmitTransactionResponseDto> {
    const walletAddress = (req as any)?.user?.walletPubkey || (req as any).walletAddress;
    if (dto.walletAddress && dto.walletAddress !== walletAddress) {
      throw new HttpException(
        { message: 'walletAddress does not match authenticated wallet', error: 'Unauthorized', statusCode: 401 },
        401,
      );
    }
    
    // Validate input
    if (!dto.signedTransaction || dto.signedTransaction.trim() === '') {
      throw new HttpException(
        {
          message: 'Signed transaction data is required',
          error: 'Validation Failed',
          statusCode: 400,
        },
        400,
      );
    }
    
    try {
      const result = await this.tokenManagementService.submitSignedTransaction(
        dto.signedTransaction,
        walletAddress,
        dto.useJito ?? false
      );

      if (!result.success || !result.txId) {
        const errorMsg = result.error || 'Failed to submit transaction';
        console.error('Transaction submission failed:', errorMsg);
        
        // Check if it's a user error or blockchain error
        const isUserError = 
          errorMsg.includes('Invalid signature') ||
          errorMsg.includes('not signed') ||
          errorMsg.includes('blockhash not found') ||
          errorMsg.includes('already processed');

        const statusCode = isUserError ? 400 : 500;
        
        throw new HttpException(
          {
            message: errorMsg,
            error: isUserError ? 'Validation Failed' : 'Transaction Submission Failed',
            statusCode,
          },
          statusCode,
        );
      }

      // Update transaction history if there's a pending transaction ID
      // The frontend should pass the pendingTransactionId if available
      const pendingTransactionId = (req.body as any).pendingTransactionId;
      if (pendingTransactionId) {
        await this.transactionHistoryService.updateTransactionSignature(
          pendingTransactionId,
          result.txId
        );
      }

      return {
        transactionSignature: result.txId,
        status: 'submitted',
        pendingTransactionId: pendingTransactionId,
      };
    } catch (error) {
      console.error('Error in submitSignedTransaction controller:', error);
      throw error;
    }
  }

}
