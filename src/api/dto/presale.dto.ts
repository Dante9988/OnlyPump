import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsPositive,
  Min,
} from 'class-validator';

export class InitializePlatformDto {
  @ApiProperty({ description: 'Operator wallet public key', example: 'OperatorPubkey111...' })
  @IsString()
  operator: string;

  @ApiProperty({ description: 'Treasury wallet public key', example: 'TreasuryPubkey111...' })
  @IsString()
  treasury: string;

  @ApiProperty({ description: 'Platform fee in basis points (100 = 1%)', example: 100 })
  @IsNumber()
  feeBps: number;
}

export class CreatePresaleDto {
  @ApiProperty({ description: 'Human-readable token name for this presale', example: 'OnlyPump Legends' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Token ticker/symbol', example: 'OPUMP' })
  @IsString()
  symbol: string;

  @ApiPropertyOptional({ description: 'Token/presale description', example: 'VIP + public presale for OnlyPump Legends' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'SPL token mint address (e.g. Pump.fun mint)', example: 'TokenMint111...' })
  @IsString()
  mint: string;

  @ApiProperty({ description: 'Authority wallet that controls the presale', example: 'AuthorityPubkey111...' })
  @IsString()
  authority: string;

  @ApiProperty({ description: 'Public presale start timestamp (seconds since epoch)', example: Math.floor(Date.now() / 1000) + 60 })
  @IsNumber()
  publicStartTs: number;

  @ApiProperty({ description: 'Public presale end timestamp (seconds since epoch)', example: Math.floor(Date.now() / 1000) + 3600 })
  @IsNumber()
  publicEndTs: number;

  @ApiProperty({ description: 'Price in lamports per token (with mint decimals)', example: 1_000_000 })
  @IsNumber()
  publicPriceLamportsPerToken: number;

  @ApiProperty({ description: 'Hard cap in lamports', example: 400 * 1e9 })
  @IsNumber()
  hardCapLamports: number;
}

export class FundPresaleDto {
  @ApiProperty({ description: 'Amount of tokens to transfer into the presale vault (raw units, not human decimals)', example: '800000000000000' })
  @IsString()
  amount: string;

  @ApiProperty({ description: 'Authority token account that currently holds the presale tokens', example: 'AuthorityTokenAccount111...' })
  @IsString()
  fromTokenAccount: string;
}

export class WhitelistUserDto {
  @ApiProperty({ description: 'User wallet public key to whitelist', example: 'UserPubkey111...' })
  @IsString()
  user: string;

  @ApiProperty({ description: 'Whitelist tier (e.g. 1 = basic)', example: 1 })
  @IsNumber()
  tier: number;

  @ApiProperty({ description: 'Maximum SOL contribution in lamports (0 = unlimited for this tier)', example: 10 * 1e9, required: false })
  @IsNumber()
  @IsOptional()
  maxContributionLamports?: number;
}

export class ContributePublicDto {
  @ApiProperty({ description: 'Contribution amount in lamports', example: 1 * 1e9 })
  @IsNumber()
  @Min(1)
  amountLamports: number;
}

export class FinalizePresaleDto {
  // Admin wallet comes from x-request-signature, no body parameters needed
}

export class MigratePresaleDto {
  @ApiProperty({ description: 'Admin wallet public key performing migration', example: 'AdminPubkey111...' })
  @IsString()
  admin: string;

  @ApiProperty({ description: 'LP token account to receive LP tokens', example: 'LpTokenAccount111...' })
  @IsString()
  lpTokenAccount: string;

  @ApiProperty({ description: 'LP SOL account to receive SOL for LP', example: 'LpSolAccount111...' })
  @IsString()
  lpSolAccount: string;

  @ApiProperty({ description: 'Treasury wallet that receives remaining SOL', example: 'TreasuryPubkey111...' })
  @IsString()
  treasury: string;

  @ApiProperty({ description: 'SOL amount in lamports to pair for LP', example: 0.5 * 1e9 })
  @IsNumber()
  lpSolAmount: number;
}

export class ClaimTokensDto {
  @ApiProperty({ description: 'User wallet public key claiming tokens', example: 'UserPubkey111...' })
  @IsString()
  user: string;

  @ApiProperty({ description: 'User token account (ATA) to receive claimed tokens', example: 'UserTokenAccount111...' })
  @IsString()
  userTokenAccount: string;
}

export class OrchestrateFundDto {
  @ApiProperty({ description: 'SPL token mint address for the presale', example: 'TokenMint111...' })
  @IsString()
  mint: string;

  @ApiPropertyOptional({
    description: 'Optional target token amount to fund into presale vault (raw units)',
    example: '800000000000000',
  })
  @IsString()
  @IsOptional()
  targetTokenAmount?: string;

  @ApiProperty({ description: 'Total SOL budget (in SOL, not lamports) to split across wallets', example: 10 })
  @IsNumber()
  @IsPositive()
  buyBudgetSol: number;

  @ApiProperty({
    description: 'Bundled wallets (devnet for now) that will perform buys',
    type: () => [WalletSecretDto],
  })
  @IsArray()
  wallets: WalletSecretDto[];

  @ApiPropertyOptional({
    description: 'Deployer token account (ATA) to consolidate tokens to. If omitted, uses deployer ATA.',
    example: 'DeployerTokenAccount111...',
  })
  @IsString()
  @IsOptional()
  deployerTokenAccount?: string;

  @ApiPropertyOptional({ description: 'Slippage in basis points for buys', example: 500 })
  @IsNumber()
  @IsOptional()
  slippageBps?: number;

  @ApiPropertyOptional({ description: 'Whether to use Jito for bundled buys', example: false })
  @IsBoolean()
  @IsOptional()
  useJito?: boolean;
}

export class WalletSecretDto {
  @ApiProperty({
    description: 'Base58-encoded secret key for the wallet (devnet only, DO NOT use mainnet keys here)',
  })
  @IsString()
  secretKeyBase58: string;
}

export class OrchestrateFundResponseDto {
  @ApiProperty({ description: 'Per-wallet buy results' })
  @IsArray()
  perWallet: WalletBuyResultDto[];

  @ApiProperty({ description: 'Consolidation transaction signatures' })
  @IsArray()
  consolidationSignatures: string[];

  @ApiProperty({ description: 'Presale fund_presale_tokens transaction signature (if executed)', required: false })
  @IsString()
  @IsOptional()
  fundPresaleSignature?: string;

  @ApiProperty({ description: 'Final deployer token balance (raw units) after consolidation', example: '800000000000000' })
  @IsString()
  finalDeployerTokenBalance: string;

  @ApiProperty({ description: 'Final presale token vault balance (raw units) after funding', required: false })
  @IsString()
  @IsOptional()
  finalVaultTokenBalance?: string;
}

export class WalletBuyResultDto {
  @ApiProperty({ description: 'Wallet public key used for the buy' })
  @IsString()
  wallet: string;

  @ApiProperty({ description: 'Buy transaction signature (if any)', required: false })
  @IsString()
  @IsOptional()
  txSignature?: string;

  @ApiProperty({ description: 'Token amount acquired in this wallet (raw units)', required: false })
  @IsString()
  @IsOptional()
  tokenAmount?: string;

  @ApiProperty({ description: 'Error message if the buy failed', required: false })
  @IsString()
  @IsOptional()
  error?: string;
}

export class PresalePricingInputDto {
  @ApiProperty({
    description: 'VIP raise amount in SOL used to seed LP (e.g. 85)',
    example: 85,
  })
  @IsNumber()
  @IsPositive()
  vipCapSol: number;

  @ApiProperty({
    description: 'Number of tokens allocated to LP at migration (e.g. 200_000_000)',
    example: 200_000_000,
  })
  @IsNumber()
  @IsPositive()
  lpTokenAmount: number;

  @ApiProperty({
    description: 'Number of tokens allocated to public presale (e.g. 400_000_000)',
    example: 400_000_000,
  })
  @IsNumber()
  @IsPositive()
  publicTokenAmount: number;

  @ApiPropertyOptional({
    description:
      'Multiplier over migration price for public presale (1.0 = same price, 1.2 = 20% higher)',
    example: 1.0,
  })
  @IsNumber()
  @IsOptional()
  @IsPositive()
  publicPriceMultiple?: number;
}

export class PresalePricingOutputDto {
  @ApiProperty({
    description: 'Migration price in SOL per token (85 SOL / 200M tokens, for example)',
  })
  migrationPriceSolPerToken: number;

  @ApiProperty({
    description: 'Migration price in lamports per token (rounded to nearest integer)',
  })
  migrationPriceLamportsPerToken: number;

  @ApiProperty({
    description: 'Public presale price in SOL per token (after applying multiple)',
  })
  publicPriceSolPerToken: number;

  @ApiProperty({
    description: 'Public presale price in lamports per token (rounded)',
  })
  publicPriceLamportsPerToken: number;

  @ApiProperty({
    description: 'Public presale hard cap in SOL given publicTokenAmount and price',
  })
  publicHardCapSol: number;

  @ApiProperty({
    description: 'Public presale hard cap in lamports',
  })
  publicHardCapLamports: number;
}

export class LaunchTokenFromPresaleDto {
  @ApiProperty({ description: 'Reserved mint address (from presale)', example: 'MintPubkey111...' })
  @IsString()
  mint: string;

  @ApiProperty({ description: 'Token metadata URI', example: 'https://example.com/metadata.json' })
  @IsString()
  uri: string;

  @ApiProperty({ description: 'Token name', example: 'OnlyPump Legends' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Token symbol', example: 'OPUMP' })
  @IsString()
  symbol: string;

  @ApiPropertyOptional({ description: 'Token description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Amount of SOL (in SOL, not lamports) to use for initial buy', example: 10 })
  @IsNumber()
  @IsPositive()
  buyAmountSol: number;

  @ApiPropertyOptional({ description: 'Slippage in basis points', example: 500 })
  @IsNumber()
  @IsOptional()
  slippageBps?: number;

  @ApiPropertyOptional({ description: 'Use Jito for faster execution', example: false })
  @IsBoolean()
  @IsOptional()
  useJito?: boolean;
}



