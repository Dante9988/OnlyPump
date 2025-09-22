import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '../common/constants';
import { fetchBondingCurveAccount } from './account.utils';
import { TokenInfo, TokenMarketData } from '../interfaces/pump-fun.interface';
import { getAssociatedTokenAddress } from '@solana/spl-token';

/**
 * Utility functions for token operations
 */

/**
 * Gets a token's balance for a wallet
 * @param connection Solana connection
 * @param walletAddress Wallet public key
 * @param tokenMint Token mint address
 * @returns Token balance as a number
 */
export async function getTokenBalance(
  connection: Connection,
  walletAddress: PublicKey,
  tokenMint: PublicKey
): Promise<number> {
  try {
    const tokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      walletAddress,
      false,
      TOKEN_PROGRAM_ID
    );
    
    const accountInfo = await connection.getAccountInfo(tokenAccount);
    
    if (!accountInfo) {
      return 0;
    }
    
    // Token account data layout: amount is at bytes 64-72
    const amountBuffer = accountInfo.data.slice(64, 72);
    const amount = BigInt('0x' + Buffer.from(amountBuffer).reverse().toString('hex'));
    
    return Number(amount);
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0;
  }
}

/**
 * Gets SOL balance for a wallet
 * @param connection Solana connection
 * @param walletAddress Wallet public key
 * @returns SOL balance in SOL units
 */
export async function getSolBalance(
  connection: Connection,
  walletAddress: PublicKey
): Promise<number> {
  try {
    const balance = await connection.getBalance(walletAddress);
    return balance / 1e9; // Convert lamports to SOL
  } catch (error) {
    console.error('Error getting SOL balance:', error);
    return 0;
  }
}

/**
 * Calculates the current price of a Pump.fun token
 * @param connection Solana connection
 * @param tokenMint Token mint address
 * @returns Token price in SOL
 */
export async function calculateTokenPrice(
  connection: Connection,
  tokenMint: PublicKey
): Promise<number | null> {
  try {
    const bondingCurve = await fetchBondingCurveAccount(connection, tokenMint);
    
    if (!bondingCurve) {
      return null;
    }
    
    // Calculate price using the bonding curve formula
    // Price = virtualSolReserves / virtualTokenReserves
    const price = Number(bondingCurve.virtualSolReserves) / Number(bondingCurve.virtualTokenReserves);
    
    return price;
  } catch (error) {
    console.error('Error calculating token price:', error);
    return null;
  }
}

/**
 * Gets market data for a Pump.fun token
 * @param connection Solana connection
 * @param tokenMint Token mint address
 * @returns Token market data
 */
export async function getTokenMarketData(
  connection: Connection,
  tokenMint: PublicKey
): Promise<TokenMarketData | null> {
  try {
    const bondingCurve = await fetchBondingCurveAccount(connection, tokenMint);
    
    if (!bondingCurve) {
      return null;
    }
    
    // Calculate current price
    const price = Number(bondingCurve.virtualSolReserves) / Number(bondingCurve.virtualTokenReserves);
    
    // Calculate market cap
    const marketCap = price * Number(bondingCurve.realTokenReserves);
    
    // For simplicity, we're setting placeholder values for metrics that would require historical data
    return {
      price,
      priceChange24h: 0, // Would need historical data
      volume24h: 0, // Would need historical data
      marketCap,
      liquiditySol: Number(bondingCurve.realSolReserves) / 1e9 // Convert lamports to SOL
    };
  } catch (error) {
    console.error('Error getting token market data:', error);
    return null;
  }
}

/**
 * Fetches token metadata
 * @param connection Solana connection
 * @param tokenMint Token mint address
 * @returns Token info object
 */
export async function getTokenInfo(
  connection: Connection,
  tokenMint: PublicKey
): Promise<TokenInfo | null> {
  try {
    // Get token account data
    const accountInfo = await connection.getAccountInfo(tokenMint);
    if (!accountInfo) {
      return null;
    }
    
    // Get bonding curve data
    const bondingCurve = await fetchBondingCurveAccount(connection, tokenMint);
    if (!bondingCurve) {
      return null;
    }
    
    // Get market data
    const marketData = await getTokenMarketData(connection, tokenMint);
    if (!marketData) {
      return null;
    }
    
    // For simplicity, we're using placeholder values for name and symbol
    // In a real implementation, you would fetch this from the token metadata program
    return {
      mint: tokenMint.toString(),
      name: 'Unknown Token', // Would need to fetch from metadata
      symbol: 'UNKNOWN', // Would need to fetch from metadata
      decimals: 9, // Default for most Solana tokens
      supply: bondingCurve.tokenTotalSupply,
      price: marketData.price,
      marketCap: marketData.marketCap,
      volume24h: marketData.volume24h,
      bondingCurveComplete: bondingCurve.complete,
      migratedToRaydium: bondingCurve.complete // Assuming completion means migration
    };
  } catch (error) {
    console.error('Error getting token info:', error);
    return null;
  }
}
