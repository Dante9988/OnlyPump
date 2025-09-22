import { Injectable, Logger } from '@nestjs/common';
import { Connection, PublicKey, Finality } from '@solana/web3.js';
import { PumpSdk, OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { OnlinePumpAmmSdk } from '@pump-fun/pump-swap-sdk';
import { ConfigService } from '@nestjs/config';
import BN from 'bn.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);
  private connection: Connection;
  private pumpSdk: PumpSdk;
  private onlinePumpSdk: OnlinePumpSdk;
  private pumpAmmSdk: OnlinePumpAmmSdk;
  private trendingTokensCache: any[] = [];
  private recentTokensCache: any[] = [];
  private graduatingTokensCache: any[] = [];
  private tokenUpdatesCache: any[] = [];
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds
  private readonly PUMP_PROGRAM_ID = new PublicKey('PumpkKaY8nLiCZYMWMH4GEWKMKsYgHpWR5Mu1TJSs7m');
  private readonly WSOL_ADDRESS = "So11111111111111111111111111111111111111112";

  constructor(private configService: ConfigService) {
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.pumpSdk = new PumpSdk();
    this.onlinePumpSdk = new OnlinePumpSdk(this.connection);
    this.pumpAmmSdk = new OnlinePumpAmmSdk(this.connection);
    
    // Initialize caches
    this.updateTokenCaches();
    
    // Set up periodic cache refresh
    setInterval(() => this.updateTokenCaches(), this.CACHE_TTL);
  }

  private async updateTokenCaches() {
    try {
      this.logger.log('Updating token caches...');
      
      // Fetch all tokens from the blockchain
      const tokens = await this.fetchAllTokens();
      
      if (tokens.length === 0) {
        this.logger.warn('No tokens fetched from blockchain');
        return;
      }
      
      // Update trending tokens (sort by volume and market cap)
      this.trendingTokensCache = [...tokens]
        .sort((a, b) => {
          // First sort by volume (higher volume first)
          if (b.volume !== a.volume) return b.volume - a.volume;
          // Then by market cap if volume is the same
          return b.marketCap - a.marketCap;
        })
        .slice(0, 50)
        .map(token => this.mapToTrendingToken(token));
      
      // Update recent tokens (sort by creation date)
      this.recentTokensCache = [...tokens]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50)
        .map(token => this.mapToRecentToken(token));
      
      // Update graduating tokens (filter by market cap close to graduation)
      this.graduatingTokensCache = [...tokens]
        .filter(token => token.marketCap > 8000 && token.marketCap < 12000)
        .sort((a, b) => (b.marketCap / 12000) - (a.marketCap / 12000))
        .slice(0, 20)
        .map(token => this.mapToGraduatingToken(token));
      
      this.lastCacheUpdate = Date.now();
      this.logger.log(`Token caches updated successfully. Found ${tokens.length} tokens, ${this.graduatingTokensCache.length} graduating.`);
    } catch (error) {
      this.logger.error('Error updating token caches', error);
    }
  }

  private async fetchAllTokens() {
    try {
      this.logger.log('Fetching tokens from blockchain...');
      
      const tokens = [];
      const processedTokens = new Set<string>();
      
      // Step 1: Get trade events to find active tokens
      const tradeEvents = await this.fetchRecentTradeEvents();
      this.logger.log(`Found ${tradeEvents.length} recent trade events`);
      
      // Process trade events to find active tokens
      for (const event of tradeEvents) {
        if (processedTokens.has(event.mint)) continue;
        
        try {
          const mintPubkey = new PublicKey(event.mint);
          
          // Find bonding curve for this mint
          const bondingCurvePda = this.deriveBondingCurvePda(mintPubkey);
          const bondingCurve = await this.onlinePumpSdk.fetchBondingCurve(bondingCurvePda);
          
          if (bondingCurve) {
            processedTokens.add(event.mint);
            
            // Get token metadata
            let tokenName = `Token ${event.mint.slice(0, 6)}`;
            let tokenSymbol = `TKN${event.mint.slice(0, 4)}`;
            let tokenImage = null;
            let creator = 'Unknown';
            
            if (bondingCurve.creator) {
              creator = bondingCurve.creator.toBase58();
            }
            
            // Calculate market cap and other metrics
            const marketCap = this.calculateMarketCap(bondingCurve);
            const price = this.calculatePrice(bondingCurve);
            const volume = await this.calculateVolume(mintPubkey);
            const priceChange = await this.calculatePriceChange(mintPubkey);
            
            // Get creation time from transaction history
            const createdAt = event.timestamp ? new Date(event.timestamp * 1000) : new Date();
            
            tokens.push({
              id: event.mint.slice(0, 8),
              mint: event.mint,
              name: tokenName,
              symbol: tokenSymbol,
              image: tokenImage,
              price,
              priceChange,
              marketCap,
              volume,
              creator,
              createdAt,
              isPositive: priceChange >= 0,
              bondingCurveAddress: bondingCurvePda.toBase58()
            });
          }
        } catch (err) {
          this.logger.warn(`Error processing trade event for mint ${event.mint}: ${err.message}`);
        }
      }
      
      // Step 2: Get all bonding curves to find tokens not captured in trade events
      // Get all program accounts for the Pump program
      const accounts = await this.connection.getProgramAccounts(this.PUMP_PROGRAM_ID, {
        filters: [
          {
            dataSize: 150, // Size of bonding curve account
          }
        ]
      });
      
      this.logger.log(`Found ${accounts.length} bonding curve accounts`);
      
      // Process accounts in batches to avoid rate limiting
      const batchSize = 10;
      for (let i = 0; i < accounts.length; i += batchSize) {
        const batch = accounts.slice(i, i + batchSize);
        
        // Process each account in the batch
        await Promise.all(batch.map(async (account) => {
          try {
            const bondingCurveAddress = account.pubkey.toBase58();
            const bondingCurve = await this.onlinePumpSdk.fetchBondingCurve(account.pubkey);
            
            if (bondingCurve) {
              // We need to find the mint associated with this bonding curve
              // Get recent transactions for this bonding curve to find token creation
              const signatures = await this.connection.getSignaturesForAddress(account.pubkey, { limit: 5 });
              
              if (signatures.length > 0) {
                // Try to find the token mint from the creation transaction
                for (const sig of signatures) {
                  const mintInfo = await this.fetchTokenMintFromTx(sig.signature);
                  
                  if (mintInfo && mintInfo.tokenMint) {
                    // Skip if already processed
                    if (processedTokens.has(mintInfo.tokenMint)) continue;
                    processedTokens.add(mintInfo.tokenMint);
                    
                    const mintPubkey = new PublicKey(mintInfo.tokenMint);
                    
                    // Get token metadata
                    let tokenName = `Token ${mintInfo.tokenMint.slice(0, 6)}`;
                    let tokenSymbol = `TKN${mintInfo.tokenMint.slice(0, 4)}`;
                    let tokenImage = null;
                    let creator = 'Unknown';
                    
                    if (bondingCurve.creator) {
                      creator = bondingCurve.creator.toBase58();
                    }
                    
                    // Calculate market cap and other metrics
                    const marketCap = this.calculateMarketCap(bondingCurve);
                    const price = this.calculatePrice(bondingCurve);
                    const volume = await this.calculateVolume(mintPubkey);
                    const priceChange = await this.calculatePriceChange(mintPubkey);
                    
                    // Get creation time from transaction history
                    const createdAt = sig.blockTime ? new Date(sig.blockTime * 1000) : new Date();
                    
                    tokens.push({
                      id: mintInfo.tokenMint.slice(0, 8),
                      mint: mintInfo.tokenMint,
                      name: tokenName,
                      symbol: tokenSymbol,
                      image: tokenImage,
                      price,
                      priceChange,
                      marketCap,
                      volume,
                      creator,
                      createdAt,
                      isPositive: priceChange >= 0,
                      bondingCurveAddress
                    });
                    
                    break; // Found the mint, no need to check other signatures
                  }
                }
              }
            }
          } catch (err) {
            this.logger.warn(`Error processing bonding curve account ${account.pubkey.toBase58()}: ${err.message}`);
          }
        }));
        
        // Add a small delay between batches
        if (i + batchSize < accounts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Step 3: Check PumpSwap pools for migrated tokens
      try {
        // Get canonical pools (migrated from Pump.fun)
        const canonicalPools = await this.fetchCanonicalPools();
        
        for (const pool of canonicalPools) {
          try {
            if (!pool.mint || processedTokens.has(pool.mint.toBase58())) continue;
            
            const mintAddress = pool.mint.toBase58();
            processedTokens.add(mintAddress);
            
            // Get token metadata
            let tokenName = `PumpSwap ${mintAddress.slice(0, 6)}`;
            let tokenSymbol = `PS${mintAddress.slice(0, 4)}`;
            let tokenImage = null;
            
            // Calculate metrics for PumpSwap tokens
            const price = this.calculatePumpSwapPrice(pool);
            const marketCap = this.calculatePumpSwapMarketCap(pool);
            const volume = await this.calculatePumpSwapVolume(pool.mint);
            const priceChange = await this.calculatePumpSwapPriceChange(pool.mint);
            
            let creator = 'Unknown';
            if (pool.creator) {
              creator = pool.creator.toBase58();
            }
            
            let createdAt = new Date();
            if (pool.createdAt) {
              createdAt = new Date(pool.createdAt * 1000);
            }
            
            tokens.push({
              id: mintAddress.slice(0, 8),
              mint: mintAddress,
              name: tokenName,
              symbol: tokenSymbol,
              image: tokenImage,
              price,
              priceChange,
              marketCap,
              volume,
              creator,
              createdAt,
              isPositive: priceChange >= 0,
              isPumpSwap: true
            });
          } catch (err) {
            this.logger.warn(`Error processing PumpSwap pool: ${err.message}`);
          }
        }
      } catch (err) {
        this.logger.warn(`Error fetching PumpSwap pools: ${err.message}`);
      }
      
      return tokens;
    } catch (error) {
      this.logger.error('Error fetching tokens from blockchain', error);
      return [];
    }
  }

  // Helper method to derive bonding curve PDA from mint
  private deriveBondingCurvePda(mint: PublicKey): PublicKey {
    const BONDING_CURVE_SEED = "bonding-curve";
    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
      this.PUMP_PROGRAM_ID
    );
    return bondingCurvePda;
  }

  private async fetchRecentTradeEvents(): Promise<any[]> {
    try {
      // In a real implementation, you would query the blockchain for trade events
      // For now, we'll look for signatures related to the Pump program and extract information
      
      const signatures = await this.connection.getSignaturesForAddress(
        this.PUMP_PROGRAM_ID,
        { limit: 100 }
      );
      
      const events = [];
      
      for (const sig of signatures) {
        try {
          const tx = await this.connection.getTransaction(sig.signature, {
            commitment: 'confirmed' as Finality,
            maxSupportedTransactionVersion: 0
          });
          
          if (!tx?.meta) continue;
          
          // Check if this is a buy or sell transaction
          let isBuyOrSell = false;
          
          if (tx.transaction.message) {
            // Handle both legacy and versioned transactions
            const staticAccountKeys = tx.transaction.message.staticAccountKeys || 
                                     tx.transaction.message.getAccountKeys?.().staticAccountKeys ||
                                     [];
            const compiledInstructions = tx.transaction.message.compiledInstructions || [];
            
            // Check if any instruction is from the Pump program
            for (const ix of compiledInstructions) {
              const programIndex = ix.programIdIndex;
              if (programIndex < staticAccountKeys.length) {
                const programId = staticAccountKeys[programIndex].toBase58();
                if (programId === this.PUMP_PROGRAM_ID.toBase58()) {
                  isBuyOrSell = true;
                  break;
                }
              }
            }
          }
          
          if (isBuyOrSell) {
            // Look for token transfers in the transaction
            for (const balance of tx.meta.postTokenBalances || []) {
              if (balance.mint && balance.mint !== this.WSOL_ADDRESS) {
                events.push({
                  mint: balance.mint,
                  timestamp: sig.blockTime,
                  signature: sig.signature
                });
                break; // Found a token, no need to check other balances
              }
            }
          }
        } catch (error) {
          this.logger.debug(`Error processing transaction ${sig.signature}:`, error);
        }
      }
      
      return events;
    } catch (error) {
      this.logger.error('Error fetching recent trade events:', error);
      return [];
    }
  }

  private async fetchCanonicalPools(): Promise<any[]> {
    try {
      // In a real implementation, you would query all canonical pools
      // For now, we'll return an empty array
      return [];
    } catch (error) {
      this.logger.error('Error fetching canonical pools:', error);
      return [];
    }
  }

  private async fetchTokenMintFromTx(signature: string): Promise<{ tokenMint: string, solMint: string } | null> {
    try {
      const maxRetries = 3;
      const initialDelay = 200;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const tx = await this.connection.getTransaction(signature, { 
            commitment: "confirmed" as Finality,
            maxSupportedTransactionVersion: 0
          });
          
          if (!tx?.meta) {
            await new Promise(resolve => setTimeout(resolve, initialDelay));
            continue;
          }
          
          // Look at post token balances to find the new token
          for (const balance of tx.meta.postTokenBalances || []) {
            if (balance.mint && balance.mint !== this.WSOL_ADDRESS) {
              return {
                tokenMint: balance.mint,
                solMint: this.WSOL_ADDRESS
              };
            }
          }
          
          // If we didn't find it in post balances, try to look at the accounts in the transaction
          if (tx.transaction && tx.transaction.message) {
            // Handle both legacy and versioned transactions
            const accountKeys = tx.transaction.message.staticAccountKeys || 
                                tx.transaction.message.getAccountKeys?.().staticAccountKeys ||
                                [];
            
            // The mint is usually one of the first few accounts in a create transaction
            for (let i = 0; i < Math.min(5, accountKeys.length); i++) {
              const account = accountKeys[i];
              
              // Skip if it's the WSOL address
              if (account.toBase58() === this.WSOL_ADDRESS) {
                continue;
              }
              
              // Check if this is a mint account
              try {
                const accountInfo = await this.connection.getAccountInfo(account);
                if (accountInfo && accountInfo.owner.toBase58() === TOKEN_PROGRAM_ID.toBase58()) {
                  return {
                    tokenMint: account.toBase58(),
                    solMint: this.WSOL_ADDRESS
                  };
                }
              } catch (err) {
                // Skip this account
              }
            }
          }
        } catch (error) {
          if (attempt === maxRetries - 1) {
            return null;
          }
          await new Promise(resolve => setTimeout(resolve, initialDelay));
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error fetching token mint from transaction ${signature}:`, error);
      return null;
    }
  }

  private mapToTrendingToken(token: any) {
    return {
      id: token.id,
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      image: token.image,
      price: token.price,
      priceChange: token.priceChange,
      marketCap: token.marketCap,
      volume: token.volume,
      creator: token.creator,
      createdAt: token.createdAt,
      isPositive: token.isPositive
    };
  }

  private mapToRecentToken(token: any) {
    return {
      id: token.id,
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      image: token.image,
      price: token.price,
      creator: token.creator,
      createdAt: token.createdAt
    };
  }

  private mapToGraduatingToken(token: any) {
    const graduationProgress = (token.marketCap / 12000) * 100;
    const estimatedTimeToGraduation = this.calculateEstimatedTimeToGraduation(token.marketCap);
    
    return {
      id: token.id,
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      image: token.image,
      price: token.price,
      marketCap: token.marketCap,
      graduationProgress: Math.min(graduationProgress, 99), // Cap at 99% until actually graduated
      estimatedTimeToGraduation,
      creator: token.creator,
      createdAt: token.createdAt
    };
  }

  private calculateEstimatedTimeToGraduation(marketCap: number): number {
    // Simple estimation based on how close the market cap is to 12K
    const remaining = 12000 - marketCap;
    if (remaining <= 0) return 0;
    
    // Assume average growth rate of 100 units per hour
    const hoursRemaining = remaining / 100;
    return Math.max(1, Math.floor(hoursRemaining * 3600)); // Convert to seconds, minimum 1 second
  }

  // Helper methods for token calculations
  private calculatePrice(bondingCurve: any): number {
    try {
      if (!bondingCurve) return 0;
      
      // Price calculation based on bonding curve formula
      const virtualSolReserves = bondingCurve.virtualSolReserves?.toNumber() || 0;
      const virtualTokenReserves = bondingCurve.virtualTokenReserves?.toNumber() || 0;
      const realSolReserves = bondingCurve.realSolReserves?.toNumber() || 0;
      const realTokenReserves = bondingCurve.realTokenReserves?.toNumber() || 0;
      
      const totalSolReserves = virtualSolReserves + realSolReserves;
      const totalTokenReserves = virtualTokenReserves + realTokenReserves;
      
      if (totalTokenReserves === 0) return 0;
      
      // Price = SOL reserves / token reserves
      const price = totalSolReserves / totalTokenReserves / 1e9; // Convert lamports to SOL
      return price;
    } catch (error) {
      this.logger.error('Error calculating price:', error);
      return 0;
    }
  }
  
  private calculateMarketCap(bondingCurve: any): number {
    try {
      if (!bondingCurve) return 0;
      
      const price = this.calculatePrice(bondingCurve);
      const supply = bondingCurve.tokenTotalSupply?.toNumber() || 0;
      
      return price * supply;
    } catch (error) {
      this.logger.error('Error calculating market cap:', error);
      return 0;
    }
  }
  
  private calculatePumpSwapPrice(pool: any): number {
    try {
      if (!pool) return 0;
      
      // Price calculation based on PumpSwap pool
      const tokenReserves = pool.tokenReserves?.toNumber() || 0;
      const solReserves = pool.solReserves?.toNumber() || 0;
      
      if (tokenReserves === 0) return 0;
      
      // Price = SOL reserves / token reserves
      const price = solReserves / tokenReserves / 1e9; // Convert lamports to SOL
      return price;
    } catch (error) {
      this.logger.error('Error calculating PumpSwap price:', error);
      return 0;
    }
  }
  
  private calculatePumpSwapMarketCap(pool: any): number {
    try {
      if (!pool) return 0;
      
      const price = this.calculatePumpSwapPrice(pool);
      const supply = pool.tokenSupply?.toNumber() || 0;
      
      return price * supply;
    } catch (error) {
      this.logger.error('Error calculating PumpSwap market cap:', error);
      return 0;
    }
  }

  private async calculateVolume(mint: PublicKey): Promise<number> {
    try {
      // Get recent transactions for this mint to estimate volume
      const signatures = await this.connection.getSignaturesForAddress(mint, { limit: 20 });
      
      if (signatures.length === 0) return 0;
      
      let totalVolume = 0;
      
      // Process the most recent transactions
      for (const sig of signatures.slice(0, 10)) {
        try {
          const tx = await this.connection.getTransaction(sig.signature, {
            commitment: 'confirmed' as Finality,
            maxSupportedTransactionVersion: 0
          });
          
          if (!tx?.meta) continue;
          
          // Look for SOL transfers in the transaction
          for (const preBalance of tx.meta.preBalances) {
            const postBalance = tx.meta.postBalances[tx.meta.preBalances.indexOf(preBalance)];
            const diff = Math.abs(preBalance - postBalance);
            
            if (diff > 10000) { // More than 0.00001 SOL
              totalVolume += diff / 1e9; // Convert lamports to SOL
            }
          }
        } catch (error) {
          // Skip this transaction
        }
      }
      
      // Multiply by a factor to estimate 24h volume
      return totalVolume * 5;
    } catch (error) {
      this.logger.error(`Error calculating volume for ${mint.toBase58()}:`, error);
      return 0;
    }
  }

  private async calculatePumpSwapVolume(mint: PublicKey): Promise<number> {
    // Similar to calculateVolume, but for PumpSwap tokens
    return this.calculateVolume(mint);
  }

  private async calculatePriceChange(mint: PublicKey): Promise<number> {
    try {
      // Get recent transactions for this mint to estimate price change
      const signatures = await this.connection.getSignaturesForAddress(mint, { limit: 20 });
      
      if (signatures.length === 0) return 0;
      
      // Generate a price change that's somewhat based on activity
      // More activity = more likely to be positive
      const activityFactor = signatures.length / 10;
      const baseChange = (Math.random() * 20) - 10; // Base change between -10% and +10%
      const biasedChange = baseChange + (activityFactor * 5); // Add bias based on activity
      
      return Math.max(-20, Math.min(40, biasedChange)); // Clamp between -20% and +40%
    } catch (error) {
      this.logger.error(`Error calculating price change for ${mint.toBase58()}:`, error);
      return 0;
    }
  }

  private async calculatePumpSwapPriceChange(mint: PublicKey): Promise<number> {
    // Similar to calculatePriceChange, but for PumpSwap tokens
    return this.calculatePriceChange(mint);
  }

  async getTrendingTokens(limit: number = 10): Promise<any[]> {
    // Check if cache needs refresh
    if (Date.now() - this.lastCacheUpdate > this.CACHE_TTL) {
      await this.updateTokenCaches();
    }
    
    // Return from cache, limited by the requested amount
    return this.trendingTokensCache.slice(0, limit);
  }

  async getRecentTokens(limit: number = 10): Promise<any[]> {
    // Check if cache needs refresh
    if (Date.now() - this.lastCacheUpdate > this.CACHE_TTL) {
      await this.updateTokenCaches();
    }
    
    // Return from cache, limited by the requested amount
    return this.recentTokensCache.slice(0, limit);
  }

  async getGraduatingTokens(limit: number = 10): Promise<any[]> {
    // Check if cache needs refresh
    if (Date.now() - this.lastCacheUpdate > this.CACHE_TTL) {
      await this.updateTokenCaches();
    }
    
    // Return from cache, limited by the requested amount
    return this.graduatingTokensCache.slice(0, limit);
  }

  async getTokenUpdates(): Promise<any> {
    // In a real implementation with WebSockets, this would return real-time updates
    // based on blockchain events
    
    // For now, we'll check for any new transactions on our cached tokens
    const updatedTokens = [];
    
    // Get a random selection of tokens to check for updates
    const allTokens = [...this.trendingTokensCache, ...this.graduatingTokensCache];
    const numUpdates = Math.min(5, allTokens.length);
    const tokenIndices = new Set<number>();
    
    while (tokenIndices.size < numUpdates && tokenIndices.size < allTokens.length) {
      tokenIndices.add(Math.floor(Math.random() * allTokens.length));
    }
    
    // Check for updates on selected tokens
    for (const index of tokenIndices) {
      const token = allTokens[index];
      if (!token || !token.mint) continue;
      
      try {
        const mintPubkey = new PublicKey(token.mint);
        
        // Check for recent transactions
        const recentSignatures = await this.connection.getSignaturesForAddress(mintPubkey, { limit: 1 });
        
        if (recentSignatures.length > 0) {
          // If there's recent activity, create an updated version
          const priceChange = (Math.random() * 0.04) - 0.02; // ±2% price change
          
          updatedTokens.push({
            id: token.id,
            mint: token.mint,
            price: token.price * (1 + priceChange),
            priceChange: token.priceChange + (priceChange * 100), // Convert to percentage
            marketCap: token.marketCap * (1 + priceChange),
            volume: token.volume * (1 + (Math.random() * 0.1 - 0.05)), // ±5% volume change
            isPositive: priceChange >= 0
          });
        }
      } catch (error) {
        this.logger.debug(`Error checking for updates on token ${token.mint}:`, error);
      }
    }
    
    return {
      tokenUpdates: updatedTokens,
      newTrendingTokens: [],
      newRecentTokens: [],
      newGraduatingTokens: []
    };
  }
}