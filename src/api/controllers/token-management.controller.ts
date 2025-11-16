import { Controller, Post, Body, Get, Req, Query, Param, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { TokenManagementService, CreateTokenRequest, CreateAndBuyTokenRequest, BuyTokenRequest, SellTokenRequest } from '../../services/token-management.service';
import { TransactionHistoryService, TransactionType } from '../../services/transaction-history.service';
import { TransactionResponseDto, SubmitSignedTransactionDto, SubmitTransactionResponseDto } from '../dto/transaction.dto';
import { CreateTokenDto, BuyTokenDto, SellTokenDto } from '../dto/token.dto';

@ApiTags('Token Management')
@Controller('api/tokens')
@ApiHeader({
  name: 'x-request-signature',
  description: 'Base64 encoded signature of the authentication message',
  required: true,
})
export class TokenManagementController {
  constructor(
    private readonly tokenManagementService: TokenManagementService,
    private readonly transactionHistoryService: TransactionHistoryService,
  ) {}

  @Post('buy')
  @ApiOperation({ 
    summary: 'Buy tokens from an existing Pump.fun token',
    description: 'Returns a serialized transaction that must be signed by the user\'s wallet and sent to the blockchain. The transaction is automatically tracked in history.',
  })
  @ApiBody({ type: BuyTokenDto })
  @ApiResponse({ status: 200, description: 'Token buy transaction prepared', type: TransactionResponseDto })
  async buyToken(
    @Req() req: Request,
    @Body() dto: BuyTokenDto,
  ): Promise<TransactionResponseDto> {
    const walletAddress = (req as any).walletAddress;
    
    const request: BuyTokenRequest = {
      tokenMint: dto.tokenMint,
      solAmount: dto.solAmount,
    };

    const result = await this.tokenManagementService.buyToken(walletAddress, request);
    
    if (!result.success || !result.txId) {
      throw new Error(result.error || 'Failed to prepare buy transaction');
    }

    // Record transaction in history (will be updated when transaction is confirmed)
    const pendingRecord = await this.transactionHistoryService.recordTransaction(
      walletAddress,
      '', // Will be updated after user signs and sends
      TransactionType.BUY,
      dto.tokenMint,
      dto.solAmount,
    );

    return {
      transaction: result.txId,
      pendingTransactionId: pendingRecord.id,
      tokenMint: result.tokenMint,
      type: TransactionType.BUY,
      solAmount: dto.solAmount,
    };
  }

  @Post('sell')
  @ApiOperation({ 
    summary: 'Sell tokens to Pump.fun bonding curve',
    description: 'Returns a serialized transaction that must be signed by the user\'s wallet and sent to the blockchain. The transaction is automatically tracked in history.',
  })
  @ApiBody({ type: SellTokenDto })
  @ApiResponse({ status: 200, description: 'Token sell transaction prepared', type: TransactionResponseDto })
  async sellToken(
    @Req() req: Request,
    @Body() dto: SellTokenDto,
  ): Promise<TransactionResponseDto> {
    const walletAddress = (req as any).walletAddress;
    
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
      const message = result.error || 'Failed to prepare sell transaction';
      // Map common user-facing errors to 400 instead of 500
      const isUserInputError =
        message.includes('No tokens found') ||
        message.includes('Invalid sell amount') ||
        message.toLowerCase().includes('slippage');

      const status = isUserInputError ? 400 : 500;

      throw new HttpException(
        {
          message,
          error: 'Sell Transaction Preparation Failed',
          statusCode: status,
        },
        status,
      );
    }

    // Record transaction in history
    const pendingRecord = await this.transactionHistoryService.recordTransaction(
      walletAddress,
      '', // Will be updated after user signs and sends
      TransactionType.SELL,
      dto.tokenMint,
    );

    return {
      transaction: result.txId,
      pendingTransactionId: pendingRecord.id,
      tokenMint: result.tokenMint,
      type: TransactionType.SELL,
    };
  }

  @Post('create')
  @ApiOperation({ summary: 'Create a new token on Pump.fun' })
  @ApiBody({ type: CreateTokenDto })
  @ApiResponse({ status: 200, description: 'Token creation transaction prepared', type: TransactionResponseDto })
  async createToken(
    @Req() req: Request,
    @Body() dto: CreateTokenDto,
  ): Promise<TransactionResponseDto> {
    const walletAddress = (req as any).walletAddress;
    
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
      throw new Error(result.error || 'Failed to prepare create transaction');
    }

    return {
      transaction: result.txId,
      tokenMint: result.tokenMint,
      vanityAddress: result.vanityAddress,
      type: TransactionType.CREATE,
    };
  }

  @Post('create-and-buy')
  @ApiOperation({ summary: 'Create and buy a token in one transaction' })
  @ApiBody({ type: CreateTokenDto })
  @ApiResponse({ status: 200, description: 'Token creation and buy transaction prepared', type: TransactionResponseDto })
  async createAndBuyToken(
    @Req() req: Request,
    @Body() dto: CreateTokenDto & { solAmount: number },
  ): Promise<TransactionResponseDto> {
    const walletAddress = (req as any).walletAddress;
    
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
      throw new Error(result.error || 'Failed to prepare create-and-buy transaction');
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
  async submitSignedTransactionWithPendingId(
    @Req() req: Request,
    @Param('pendingId') pendingId: string,
    @Body() dto: SubmitSignedTransactionDto,
  ): Promise<SubmitTransactionResponseDto> {
    const walletAddress = (req as any).walletAddress;
    
    try {
      const result = await this.tokenManagementService.submitSignedTransaction(
        dto.signedTransaction,
        walletAddress,
        dto.useJito ?? false
      );

      if (!result.success || !result.txId) {
        const errorMsg = result.error || 'Failed to submit transaction';
        console.error('Transaction submission failed:', errorMsg);
        throw new HttpException(
          {
            message: errorMsg,
            error: 'Transaction Submission Failed',
            statusCode: 400,
          },
          400,
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
    const walletAddress = (req as any).walletAddress;
    
    try {
      const result = await this.tokenManagementService.submitSignedTransaction(
        dto.signedTransaction,
        walletAddress,
        dto.useJito ?? false
      );

      if (!result.success || !result.txId) {
        const errorMsg = result.error || 'Failed to submit transaction';
        console.error('Transaction submission failed:', errorMsg);
        // Throw as BadRequestException to get proper HTTP status and error message
        throw new HttpException(
          {
            message: errorMsg,
            error: 'Transaction Submission Failed',
            statusCode: 400,
          },
          400,
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
