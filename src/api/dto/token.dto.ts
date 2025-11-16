import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max, IsEnum } from 'class-validator';
import { TransactionSpeed } from '../../interfaces/pump-fun.interface';

export class CreateTokenDto {
  @ApiProperty({ description: 'Token name', example: 'My Awesome Token' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Token symbol', example: 'MAT' })
  @IsString()
  symbol: string;

  @ApiProperty({ description: 'Token metadata URI', example: 'https://example.com/metadata.json' })
  @IsString()
  uri: string;

  @ApiProperty({ description: 'Token description', example: 'This is my awesome token', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ 
    description: 'Social media links', 
    example: { twitter: 'https://twitter.com/mytoken', telegram: 'https://t.me/mytoken' },
    required: false
  })
  @IsOptional()
  socials?: { [key: string]: string };

  @ApiProperty({ 
    description: 'Transaction speed setting', 
    enum: TransactionSpeed,
    example: TransactionSpeed.FAST,
    required: false
  })
  @IsEnum(TransactionSpeed)
  @IsOptional()
  speed?: TransactionSpeed;

  @ApiProperty({ description: 'Slippage in basis points (1 = 0.01%)', example: 100, required: false })
  @IsNumber()
  @Min(0)
  @Max(10000)
  @IsOptional()
  slippageBps?: number;

  @ApiProperty({ description: 'Whether to use Jito for faster transactions', example: true, required: false })
  @IsBoolean()
  @IsOptional()
  useJito?: boolean;

  @ApiProperty({ description: 'Amount of SOL to tip Jito validators (in lamports)', example: 10000000, required: false })
  @IsNumber()
  @IsOptional()
  jitoTipLamports?: number;
}

export class BuyTokenDto {
  @ApiProperty({ description: 'Token mint address', example: 'TokenMintAddress123' })
  @IsString()
  tokenMint: string;

  @ApiProperty({ description: 'Amount of SOL to spend', example: 0.1 })
  @IsNumber()
  @Min(0.000001)
  solAmount: number;

  @ApiProperty({ description: 'Wallet address (for middleware authentication)', required: false })
  @IsString()
  @IsOptional()
  walletAddress?: string;

  @ApiProperty({ 
    description: 'Transaction speed setting', 
    enum: TransactionSpeed,
    example: TransactionSpeed.FAST,
    required: false
  })
  @IsEnum(TransactionSpeed)
  @IsOptional()
  speed?: TransactionSpeed;

  @ApiProperty({ description: 'Slippage in basis points (1 = 0.01%)', example: 100, required: false })
  @IsNumber()
  @Min(0)
  @Max(10000)
  @IsOptional()
  slippageBps?: number;

  @ApiProperty({ description: 'Whether to use Jito for faster transactions', example: true, required: false })
  @IsBoolean()
  @IsOptional()
  useJito?: boolean;

  @ApiProperty({ description: 'Amount of SOL to tip Jito validators (in lamports)', example: 10000000, required: false })
  @IsNumber()
  @IsOptional()
  jitoTipLamports?: number;
}

export class SellTokenDto {
  @ApiProperty({ description: 'Token mint address', example: 'TokenMintAddress123' })
  @IsString()
  tokenMint: string;

  @ApiProperty({ description: 'Percentage of tokens to sell (1-100)', example: 50 })
  @IsNumber()
  @Min(1)
  @Max(100)
  percentage: number;

  @ApiProperty({ description: 'Wallet address (for middleware authentication)', required: false })
  @IsString()
  @IsOptional()
  walletAddress?: string;

  @ApiProperty({ 
    description: 'Transaction speed setting', 
    enum: TransactionSpeed,
    example: TransactionSpeed.FAST,
    required: false
  })
  @IsEnum(TransactionSpeed)
  @IsOptional()
  speed?: TransactionSpeed;

  @ApiProperty({ description: 'Slippage in basis points (1 = 0.01%)', example: 100, required: false })
  @IsNumber()
  @Min(0)
  @Max(10000)
  @IsOptional()
  slippageBps?: number;

  @ApiProperty({ description: 'Whether to use Jito for faster transactions', example: true, required: false })
  @IsBoolean()
  @IsOptional()
  useJito?: boolean;

  @ApiProperty({ description: 'Amount of SOL to tip Jito validators (in lamports)', example: 10000000, required: false })
  @IsNumber()
  @IsOptional()
  jitoTipLamports?: number;
}

export class TokenInfoDto {
  @ApiProperty({ description: 'Token mint address' })
  @IsString()
  tokenMint: string;
}
