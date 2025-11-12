import { Controller, Post, Body, Get, Req, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { TokenManagementService, CreateTokenRequest, CreateAndBuyTokenRequest, BuyTokenRequest, SellTokenRequest } from '../../services/token-management.service';
import { TransactionHistoryService, TransactionType } from '../../services/transaction-history.service';
import { TransactionResponseDto } from '../dto/transaction.dto';
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
    };

    const result = await this.tokenManagementService.sellToken(walletAddress, request);
    
    if (!result.success || !result.txId) {
      throw new Error(result.error || 'Failed to prepare sell transaction');
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

}
