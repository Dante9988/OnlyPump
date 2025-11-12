import { ApiProperty } from '@nestjs/swagger';
import { TransactionType } from '../../services/transaction-history.service';

export class TransactionResponseDto {
  @ApiProperty({ description: 'Serialized transaction (base64) ready for signing' })
  transaction: string;

  @ApiProperty({ description: 'Pending transaction ID (use this to update after sending)', required: false })
  pendingTransactionId?: string;

  @ApiProperty({ description: 'Token mint address (if applicable)', required: false })
  tokenMint?: string;

  @ApiProperty({ description: 'Vanity address used (if applicable)', required: false })
  vanityAddress?: string;

  @ApiProperty({ description: 'Transaction type' })
  type: TransactionType;

  @ApiProperty({ description: 'Estimated SOL amount' })
  solAmount?: number;

  @ApiProperty({ description: 'Estimated token amount', required: false })
  tokenAmount?: number;
}

export class TransactionRecordDto {
  @ApiProperty({ description: 'Transaction ID (signature)' })
  id: string;

  @ApiProperty({ description: 'Wallet address' })
  walletAddress: string;

  @ApiProperty({ description: 'Transaction signature' })
  transactionSignature: string;

  @ApiProperty({ description: 'Transaction type', enum: TransactionType })
  type: TransactionType;

  @ApiProperty({ description: 'Token mint address', required: false })
  tokenMint?: string;

  @ApiProperty({ description: 'SOL amount', required: false })
  solAmount?: number;

  @ApiProperty({ description: 'Token amount', required: false })
  tokenAmount?: number;

  @ApiProperty({ description: 'Transaction timestamp' })
  timestamp: Date;

  @ApiProperty({ description: 'Transaction status', enum: ['pending', 'confirmed', 'failed'] })
  status: 'pending' | 'confirmed' | 'failed';

  @ApiProperty({ description: 'Block time', required: false })
  blockTime?: number;
}

export class WalletStatsDto {
  @ApiProperty({ description: 'Total number of transactions' })
  totalTransactions: number;

  @ApiProperty({ description: 'Number of buy transactions' })
  buyCount: number;

  @ApiProperty({ description: 'Number of sell transactions' })
  sellCount: number;

  @ApiProperty({ description: 'Total SOL spent' })
  totalSolSpent: number;

  @ApiProperty({ description: 'Total SOL received' })
  totalSolReceived: number;
}

