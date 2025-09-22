import { PublicKey } from '@solana/web3.js';

/**
 * Bonding curve account structure from Pump.fun
 */
export interface BondingCurveAccount {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

/**
 * Global account structure from Pump.fun
 */
export interface GlobalAccount {
  initialized: boolean;
  authority: PublicKey;
  feeRecipient: PublicKey;
  initialVirtualTokenReserves: bigint;
  initialVirtualSolReserves: bigint;
  initialRealTokenReserves: bigint;
  tokenTotalSupply: bigint;
  feeBasisPoints: bigint;
}

/**
 * Transaction speed options for Solana transactions
 */
export enum TransactionSpeed {
  NORMAL = 'normal',
  FAST = 'fast',
  TURBO = 'turbo',
  ULTRA = 'ultra'
}

/**
 * Slippage presets for trades
 */
export enum SlippagePreset {
  LOW = 100, // 1%
  MEDIUM = 500, // 5%
  HIGH = 1000, // 10%
  EXTREME = 2000, // 20%
  CUSTOM = 0 // Custom value
}

/**
 * Base settings for PumpFun transactions
 */
export interface PumpFunSettings {
  speed: TransactionSpeed;
  slippageBps: number;
  useJito: boolean;
  jitoTipLamports: number;
}

/**
 * Settings specific to buy operations
 */
export interface BuySettings extends PumpFunSettings {
  buySlippagePreset?: SlippagePreset | number;
}

/**
 * Settings specific to sell operations
 */
export interface SellSettings extends PumpFunSettings {
  sellSlippagePreset?: SlippagePreset | number;
}

/**
 * Result of a PumpFun transaction
 */
export interface PumpFunResult {
  success: boolean;
  txId?: string;
  error?: string;
  tokenAmount?: number;
  solAmount?: number;
}

/**
 * Token information structure
 */
export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  decimals?: number;
  supply: bigint;
  price?: number;
  marketCap?: number;
  volume24h?: number;
  bondingCurveAddress?: string;
  bondingCurveComplete?: boolean;
  migratedToRaydium?: boolean;
  isComplete?: boolean;
  uri?: string;
  liquidity?: number;
}

/**
 * Market data for a token
 */
export interface TokenMarketData {
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  liquiditySol: number;
}
