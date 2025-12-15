import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ClaimCreatorRewardsDto {
  @ApiProperty({ 
    description: 'Token mint address for which to claim creator rewards', 
    example: 'TokenMintPubkey111...' 
  })
  @IsString()
  tokenMint: string;

  @ApiProperty({ 
    description: 'Creator token account to receive rewards (ATA recommended)', 
    example: 'CreatorTokenAccount111...',
    required: false 
  })
  @IsString()
  @IsOptional()
  creatorTokenAccount?: string;
}

export class ClaimCreatorRewardsResponseDto {
  @ApiProperty({ description: 'Unsigned transaction for creator to sign (includes claim + 50% platform fee transfer)' })
  transaction: string;

  @ApiProperty({ description: 'Total rewards available to claim (in tokens)' })
  totalRewards: string;

  @ApiProperty({ description: 'Platform fee amount (50% of rewards)' })
  platformFeeAmount: string;

  @ApiProperty({ description: 'Creator receives (50% of rewards)' })
  creatorReceives: string;

  @ApiProperty({ description: 'Token mint address' })
  tokenMint: string;
}

