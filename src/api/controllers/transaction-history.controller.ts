import { Controller, Get, Post, Req, Query, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { TransactionHistoryService, TransactionType } from '../../services/transaction-history.service';
import { TransactionRecordDto, WalletStatsDto } from '../dto/transaction.dto';

@ApiTags('Transaction History')
@Controller('api/transactions')
@ApiHeader({
  name: 'x-request-signature',
  description: 'Base64 encoded signature of the authentication message',
  required: true,
})
export class TransactionHistoryController {
  constructor(
    private readonly transactionHistoryService: TransactionHistoryService,
  ) {}

  @Get('tx/:signature')
  @ApiOperation({ 
    summary: 'Get a specific transaction by signature',
    description: 'Returns transaction details for a specific transaction signature. No authentication required.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Transaction details', 
    type: TransactionRecordDto 
  })
  async getTransaction(
    @Param('signature') signature: string,
  ): Promise<TransactionRecordDto | null> {
    const transaction = await this.transactionHistoryService.getTransaction(signature);
    return transaction || null;
  }

  @Get(':walletAddress/stats')
  @ApiOperation({ 
    summary: 'Get transaction statistics for a wallet',
    description: 'Returns statistics including total transactions, buy/sell counts, and SOL amounts. Wallet address must match the signature.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Transaction statistics', 
    type: WalletStatsDto 
  })
  async getStats(
    @Param('walletAddress') walletAddress: string,
  ): Promise<WalletStatsDto> {
    return this.transactionHistoryService.getWalletStats(walletAddress);
  }

  @Get(':walletAddress')
  @ApiOperation({ 
    summary: 'Get transaction history for a wallet',
    description: 'Returns all transactions for the specified wallet. Wallet address must match the signature.',
  })
  @ApiQuery({ 
    name: 'type', 
    enum: TransactionType, 
    required: false, 
    description: 'Filter by transaction type' 
  })
  @ApiQuery({ 
    name: 'limit', 
    type: Number, 
    required: false, 
    description: 'Limit number of results' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Transaction history', 
    type: [TransactionRecordDto] 
  })
  async getTransactions(
    @Param('walletAddress') walletAddress: string,
    @Query('type') type?: TransactionType,
    @Query('limit') limit?: number,
  ): Promise<TransactionRecordDto[]> {
    const transactions = await this.transactionHistoryService.getWalletTransactions(
      walletAddress,
      type,
      limit ? parseInt(limit.toString(), 10) : undefined,
    );
    return transactions;
  }

  @Post(':pendingId/update-signature')
  @ApiOperation({ 
    summary: 'Update a pending transaction with actual signature',
    description: 'Called after user sends transaction to blockchain to update the record',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Transaction updated', 
    type: TransactionRecordDto 
  })
  async updateTransactionSignature(
    @Param('pendingId') pendingId: string,
    @Body() body: { transactionSignature: string },
  ): Promise<TransactionRecordDto> {
    const updated = await this.transactionHistoryService.updateTransactionSignature(
      pendingId,
      body.transactionSignature,
    );
    if (!updated) {
      throw new Error('Transaction not found');
    }
    return updated;
  }
}

