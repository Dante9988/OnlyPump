import { Controller, Get, Post, Query, Param, Body, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { TransactionHistoryService, TransactionType } from '../../services/transaction-history.service';
import { TransactionRecordDto, WalletStatsDto } from '../dto/transaction.dto';
import { XRequestSignatureGuard } from '../guards/x-request-signature.guard';

@ApiTags('Transaction History')
@Controller('api/transactions')
@ApiHeader({
  name: 'x-request-signature',
  description:
    'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash (same format as /api/presale/* and /api/tokens/*)',
  required: true,
})
@ApiHeader({
  name: 'x-solana-cluster',
  description: 'Target Solana cluster: devnet | mainnet-beta (default: devnet)',
  required: false,
})
@UseGuards(XRequestSignatureGuard)
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
    @Req() req: Request,
    @Param('walletAddress') walletAddress: string,
  ): Promise<WalletStatsDto> {
    const authedWallet = (req as any)?.user?.walletPubkey || (req as any)?.walletAddress;
    if (authedWallet && authedWallet !== walletAddress) {
      throw new UnauthorizedException('walletAddress does not match authenticated wallet');
    }
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
    @Req() req: Request,
    @Param('walletAddress') walletAddress: string,
    @Query('type') type?: TransactionType,
    @Query('limit') limit?: number,
  ): Promise<TransactionRecordDto[]> {
    const authedWallet = (req as any)?.user?.walletPubkey || (req as any)?.walletAddress;
    if (authedWallet && authedWallet !== walletAddress) {
      throw new UnauthorizedException('walletAddress does not match authenticated wallet');
    }
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

