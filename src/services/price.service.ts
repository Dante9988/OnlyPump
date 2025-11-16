import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { OnlinePumpAmmSdk } from '@pump-fun/pump-swap-sdk';
import { getMint } from '@solana/spl-token';
import BN from 'bn.js';

export interface TokenPriceData {
  priceSol: number;
  priceUsd: number;
  marketCapSol: number;
  marketCapUsd: number;
  volume24hSol: number;
  volume24hUsd: number;
  holders: number;
}

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private solPriceUsd: number | null = null;
  private solPriceLastUpdate: number = 0;
  private readonly SOL_PRICE_CACHE_TTL = 60000; // 1 minute cache
  private onlinePumpSdk: OnlinePumpSdk;
  private onlinePumpAmmSdk: OnlinePumpAmmSdk;

  constructor(
    private configService: ConfigService,
    private connection: Connection,
  ) {
    this.onlinePumpSdk = new OnlinePumpSdk(this.connection);
    this.onlinePumpAmmSdk = new OnlinePumpAmmSdk(this.connection);
  }

  /**
   * Fetch SOL price in USD from DexScreener
   */
  async getSolPriceUsd(): Promise<number> {
    const now = Date.now();
    
    // Return cached price if still valid
    if (this.solPriceUsd && (now - this.solPriceLastUpdate) < this.SOL_PRICE_CACHE_TTL) {
      return this.solPriceUsd;
    }

    try {
      // DexScreener API for SOL/USD pair
      const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
      
      if (!response.ok) {
        throw new Error(`DexScreener API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Find SOL/USDC or SOL/USDT pair
      const pairs = data.pairs || [];
      const solUsdPair = pairs.find((pair: any) => 
        (pair.quoteToken?.symbol === 'USDC' || pair.quoteToken?.symbol === 'USDT') &&
        pair.chainId === 'solana'
      );

      if (solUsdPair && solUsdPair.priceUsd) {
        this.solPriceUsd = parseFloat(solUsdPair.priceUsd);
        this.solPriceLastUpdate = now;
        this.logger.log(`SOL price updated: $${this.solPriceUsd.toFixed(2)}`);
        return this.solPriceUsd;
      }

      // Fallback: try direct SOL/USDC pair
      const solUsdcResponse = await fetch('https://api.dexscreener.com/latest/dex/pairs/solana/So11111111111111111111111111111111111111112/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const solUsdcData = await solUsdcResponse.json();
      
      if (solUsdcData.pair && solUsdcData.pair.priceUsd) {
        this.solPriceUsd = parseFloat(solUsdcData.pair.priceUsd);
        this.solPriceLastUpdate = now;
        this.logger.log(`SOL price updated (fallback): $${this.solPriceUsd.toFixed(2)}`);
        return this.solPriceUsd;
      }

      throw new Error('Could not find SOL/USD price from DexScreener');
    } catch (error) {
      this.logger.error(`Error fetching SOL price: ${error}`);
      
      // Fallback to a default price if API fails
      if (!this.solPriceUsd) {
        this.logger.warn('Using fallback SOL price: $150');
        return 150; // Fallback price
      }
      
      return this.solPriceUsd; // Return cached price if available
    }
  }

  /**
   * Calculate token price and market data from bonding curve
   */
  async getTokenPriceData(tokenMint: string): Promise<TokenPriceData | null> {
    try {
      const mint = new PublicKey(tokenMint);
      const solPriceUsd = await this.getSolPriceUsd();

      // Check if token has migrated
      let isMigrated = false;
      let priceSol = 0;
      let marketCapSol = 0;
      let volume24hSol = 0;
      let holders = 0;

      try {
        const { bondingCurve: bc } = await this.onlinePumpSdk.fetchBuyState(
          mint,
          new PublicKey('11111111111111111111111111111111') // Dummy wallet
        );
        
        isMigrated = bc?.complete === true;

        if (!isMigrated && bc) {
          // Token is on bonding curve - calculate price
          const virtualSolReserves = bc.virtualSolReserves.toNumber();
          const virtualTokenReserves = bc.virtualTokenReserves.toNumber();
          const realSolReserves = bc.realSolReserves.toNumber();
          const realTokenReserves = bc.realTokenReserves.toNumber();
          
          // Get token decimals from mint account
          let tokenDecimals = 6; // Default for Pump.fun tokens
          try {
            const mintInfo = await getMint(this.connection, mint);
            tokenDecimals = mintInfo.decimals;
          } catch (error) {
            this.logger.warn(`Could not fetch decimals for ${tokenMint}, using default 6`);
          }
          
          // Get total supply from bonding curve
          // tokenTotalSupply is in base units (with decimals)
          const tokenTotalSupplyBase = bc.tokenTotalSupply?.toNumber() || 1e15; // Fallback: 1 billion * 1e6 decimals
          const tokenTotalSupplyTokens = tokenTotalSupplyBase / Math.pow(10, tokenDecimals);

          // Price = virtual SOL reserves / virtual token reserves
          // virtualSolReserves is in lamports (1e9 per SOL)
          // virtualTokenReserves is in base units (10^decimals per token)
          // Convert both to their native units: SOL and tokens
          if (virtualTokenReserves > 0) {
            const virtualSolReservesSOL = virtualSolReserves / 1e9;
            const virtualTokenReservesTokens = virtualTokenReserves / Math.pow(10, tokenDecimals);
            priceSol = virtualSolReservesSOL / virtualTokenReservesTokens;
          }

          // Market cap = price per token × total supply
          // This is the correct calculation for market cap
          marketCapSol = priceSol * tokenTotalSupplyTokens;
          
          // Cap at reasonable maximum to prevent database overflow
          // DECIMAL(30, 9) can store up to ~10^21, but we'll cap at 1 trillion SOL
          const MAX_MARKET_CAP = 1e12; // 1 trillion SOL
          if (marketCapSol > MAX_MARKET_CAP) {
            this.logger.warn(`Market cap too large for ${tokenMint}, capping: ${marketCapSol} → ${MAX_MARKET_CAP} SOL`);
            marketCapSol = MAX_MARKET_CAP;
          }
          
          // Log for debugging
          this.logger.log(`Token ${tokenMint}: decimals=${tokenDecimals}, price=${priceSol.toFixed(9)} SOL, supply=${tokenTotalSupplyTokens.toFixed(0)}, marketCap=${marketCapSol.toFixed(2)} SOL`);

          // For now, we don't have 24h volume data easily available
          // Would need to query transaction history
          volume24hSol = 0;

          // Holders count - would need to query on-chain
          holders = 0;
        } else {
          // Token migrated to PumpSwap - would need to query AMM pool
          // For now, return null and let caller handle
          this.logger.warn(`Token ${tokenMint} has migrated, AMM price calculation not implemented yet`);
          return null;
        }
      } catch (error) {
        this.logger.error(`Error fetching token price data for ${tokenMint}: ${error}`);
        return null;
      }

      // Convert to USD
      const priceUsd = priceSol * solPriceUsd;
      const marketCapUsd = marketCapSol * solPriceUsd;
      const volume24hUsd = volume24hSol * solPriceUsd;

      return {
        priceSol,
        priceUsd,
        marketCapSol,
        marketCapUsd,
        volume24hSol,
        volume24hUsd,
        holders,
      };
    } catch (error) {
      this.logger.error(`Error calculating token price data: ${error}`);
      return null;
    }
  }

  /**
   * Update token price in database after buy/sell
   */
  async updateTokenPrice(tokenMint: string): Promise<void> {
    try {
      const priceData = await this.getTokenPriceData(tokenMint);
      
      if (!priceData) {
        this.logger.warn(`Could not calculate price data for ${tokenMint}`);
        return;
      }

      // This will be called from SupabaseService
      // We'll pass the data to update
      return;
    } catch (error) {
      this.logger.error(`Error updating token price: ${error}`);
    }
  }
}

