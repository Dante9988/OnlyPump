import BN from 'bn.js';

/**
 * Bonding curve trade limit utilities
 * 
 * Pump.fun enforces trade size limits to prevent price manipulation:
 * - Trades cannot exceed a certain percentage of the virtual reserves
 * - This percentage is typically 10-15% of the curve's liquidity
 */

export interface BondingCurveState {
  virtualSolReserves: BN;
  virtualTokenReserves: BN;
  realSolReserves: BN;
  realTokenReserves: BN;
  tokenTotalSupply: BN;
  complete: boolean;
}

export interface TradeLimits {
  maxBuyLamports: number;
  maxBuySOL: number;
  maxSellTokens: number;
  recommendedMaxBuySOL: number; // Conservative limit (90% of max)
  recommendedMaxSellTokens: number;
  liquiditySOL: number;
  priceImpactPercentage: number;
}

/**
 * Calculate the maximum safe trade size for a bonding curve
 * 
 * Pump.fun's on-chain program enforces limits to prevent:
 * 1. Single trades that move the price too much
 * 2. Draining too much liquidity in one transaction
 * 
 * The typical limit is around 10-15% of virtual reserves per trade
 */
export function calculateTradeLimits(
  bondingCurve: BondingCurveState,
  requestedBuySOL?: number,
  requestedSellTokens?: number
): TradeLimits {
  // Pump.fun typically allows trades up to ~10-15% of virtual reserves
  // We'll use 12% as a conservative estimate
  const MAX_TRADE_PERCENTAGE = 0.12;
  
  // For safety, recommend 90% of the theoretical max
  const SAFETY_MARGIN = 0.9;

  const virtualSolReservesNum = bondingCurve.virtualSolReserves.toNumber();
  const virtualTokenReservesNum = bondingCurve.virtualTokenReserves.toNumber();

  // Calculate max buy in lamports (SOL input)
  const maxBuyLamports = Math.floor(virtualSolReservesNum * MAX_TRADE_PERCENTAGE);
  const maxBuySOL = maxBuyLamports / 1e9;
  const recommendedMaxBuySOL = maxBuySOL * SAFETY_MARGIN;

  // Calculate max sell in tokens (token input)
  const maxSellTokens = Math.floor(virtualTokenReservesNum * MAX_TRADE_PERCENTAGE);
  const recommendedMaxSellTokens = Math.floor(maxSellTokens * SAFETY_MARGIN);

  // Calculate liquidity (real reserves)
  const liquiditySOL = bondingCurve.realSolReserves.toNumber() / 1e9;

  // Calculate price impact if requested amounts provided
  let priceImpactPercentage = 0;
  if (requestedBuySOL) {
    const requestedLamports = requestedBuySOL * 1e9;
    priceImpactPercentage = (requestedLamports / virtualSolReservesNum) * 100;
  } else if (requestedSellTokens) {
    priceImpactPercentage = (requestedSellTokens / virtualTokenReservesNum) * 100;
  }

  return {
    maxBuyLamports,
    maxBuySOL,
    maxSellTokens,
    recommendedMaxBuySOL,
    recommendedMaxSellTokens,
    liquiditySOL,
    priceImpactPercentage,
  };
}

/**
 * Validate if a buy amount is within safe limits
 */
export function validateBuyAmount(
  solAmount: number,
  bondingCurve: BondingCurveState
): { valid: boolean; error?: string; limits?: TradeLimits } {
  if (bondingCurve.complete) {
    return {
      valid: false,
      error: 'Token has migrated to PumpSwap. Use AMM trade limits instead.',
    };
  }

  const limits = calculateTradeLimits(bondingCurve, solAmount);
  
  if (solAmount > limits.maxBuySOL) {
    return {
      valid: false,
      error: `Buy amount ${solAmount} SOL exceeds maximum of ${limits.recommendedMaxBuySOL.toFixed(4)} SOL at current liquidity (${limits.liquiditySOL.toFixed(2)} SOL). Price impact: ${limits.priceImpactPercentage.toFixed(2)}%.`,
      limits,
    };
  }

  // Warn if approaching the limit (above 80% of max)
  if (solAmount > limits.recommendedMaxBuySOL) {
    return {
      valid: true,
      error: `Warning: Large buy (${solAmount} SOL) may cause high slippage. Consider reducing to ${limits.recommendedMaxBuySOL.toFixed(4)} SOL or less.`,
      limits,
    };
  }

  return { valid: true, limits };
}

/**
 * Validate if a sell amount is within safe limits
 */
export function validateSellAmount(
  tokenAmount: number,
  bondingCurve: BondingCurveState
): { valid: boolean; error?: string; limits?: TradeLimits } {
  if (bondingCurve.complete) {
    return {
      valid: false,
      error: 'Token has migrated to PumpSwap. Use AMM trade limits instead.',
    };
  }

  const limits = calculateTradeLimits(bondingCurve, undefined, tokenAmount);
  
  if (tokenAmount > limits.maxSellTokens) {
    return {
      valid: false,
      error: `Sell amount ${tokenAmount} tokens exceeds maximum of ${limits.recommendedMaxSellTokens.toLocaleString()} tokens at current liquidity. Price impact: ${limits.priceImpactPercentage.toFixed(2)}%.`,
      limits,
    };
  }

  // Warn if approaching the limit
  if (tokenAmount > limits.recommendedMaxSellTokens) {
    return {
      valid: true,
      error: `Warning: Large sell (${tokenAmount} tokens) may cause high slippage. Consider reducing to ${limits.recommendedMaxSellTokens.toLocaleString()} tokens or less.`,
      limits,
    };
  }

  return { valid: true, limits };
}

/**
 * Calculate dynamic slippage based on trade size and liquidity
 */
export function calculateRecommendedSlippage(
  priceImpact: number,
  baseSlippageBps: number = 500
): number {
  // If price impact is < 1%, use base slippage (5%)
  if (priceImpact < 1) {
    return baseSlippageBps;
  }
  
  // If price impact is 1-5%, use 2x base slippage (10%)
  if (priceImpact < 5) {
    return baseSlippageBps * 2;
  }
  
  // If price impact is 5-10%, use 3x base slippage (15%)
  if (priceImpact < 10) {
    return baseSlippageBps * 3;
  }
  
  // If price impact is > 10%, use 4x base slippage (20%)
  return baseSlippageBps * 4;
}

