import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Finality } from '@solana/web3.js';
import { TokenInfo } from '../../interfaces/pump-fun.interface';

// Constants
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMPSWAP_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const GRADUATION_THRESHOLD_USD = 12000; // $12K threshold for "about to graduate"
const COMPLETE_EVENT_DISCRIMINATOR = [95, 114, 97, 156, 212, 46, 152, 8];

@Injectable()
export class TokenMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenMonitorService.name);
  private connection: Connection;
  private isMonitoring = false;
  private subscriptionIds: number[] = [];
  private tokenCache = {
    newTokens: new Map<string, TokenInfo>(),
    aboutToGraduateTokens: new Map<string, TokenInfo>(),
    graduatedTokens: new Map<string, TokenInfo>(),
  };
  
  // Callbacks for token events
  private onNewTokenCallback: ((token: TokenInfo) => void) | null = null;
  private onAboutToGraduateCallback: ((token: TokenInfo) => void) | null = null;
  private onGraduatedCallback: ((token: TokenInfo) => void) | null = null;

  constructor(private readonly configService: ConfigService) {
    // Try both RPC_ENDPOINT and SOLANA_RPC_URL environment variables
    const rpcUrl = this.configService.get<string>('RPC_ENDPOINT') || 
                  this.configService.get<string>('SOLANA_RPC_URL') || 
                  this.configService.get<string>('HELIUS_HTTPS_URI');
    if (!rpcUrl) {
      throw new Error('No RPC URL found in environment variables (tried RPC_ENDPOINT, SOLANA_RPC_URL, HELIUS_HTTPS_URI)');
    }
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  async onModuleInit() {
    // Load initial token data when the service starts
    await this.loadInitialTokenData();
  }

  async onModuleDestroy() {
    // Clean up subscriptions when the service is destroyed
    await this.stopMonitoring();
  }

  /**
   * Start monitoring for new tokens and migrations
   */
  async startMonitoring(
    onNewToken?: (token: TokenInfo) => void,
    onAboutToGraduate?: (token: TokenInfo) => void,
    onGraduated?: (token: TokenInfo) => void,
  ): Promise<void> {
    if (this.isMonitoring) {
      this.logger.warn('Token monitoring is already active');
      return;
    }

    try {
      // Store callbacks
      if (onNewToken) this.onNewTokenCallback = onNewToken;
      if (onAboutToGraduate) this.onAboutToGraduateCallback = onAboutToGraduate;
      if (onGraduated) this.onGraduatedCallback = onGraduated;

      // Subscribe to Pump.fun program logs
      const pumpFunSubscriptionId = this.connection.onLogs(
        PUMP_FUN_PROGRAM_ID,
        (logs) => this.handlePumpFunLogs(logs),
        'confirmed'
      );

      // Subscribe to PumpSwap program logs
      const pumpSwapSubscriptionId = this.connection.onLogs(
        PUMPSWAP_PROGRAM_ID,
        (logs) => this.handlePumpSwapLogs(logs),
        'confirmed'
      );

      this.subscriptionIds.push(pumpFunSubscriptionId, pumpSwapSubscriptionId);
      this.isMonitoring = true;

      this.logger.log('Token monitoring started');
    } catch (error) {
      this.logger.error('Error starting token monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      this.logger.warn('Token monitoring is not active');
      return;
    }

    try {
      // Remove all subscriptions
      for (const id of this.subscriptionIds) {
        await this.connection.removeOnLogsListener(id);
      }

      this.subscriptionIds = [];
      this.isMonitoring = false;

      this.logger.log('Token monitoring stopped');
    } catch (error) {
      this.logger.error('Error stopping token monitoring:', error);
      throw error;
    }
  }

  /**
   * Pause monitoring temporarily
   */
  pauseMonitoring(): void {
    // This is a placeholder for potential future implementation
    // We might want to pause monitoring when no clients are connected
    this.logger.log('Token monitoring paused');
  }

  /**
   * Resume monitoring
   */
  resumeMonitoring(): void {
    // This is a placeholder for potential future implementation
    this.logger.log('Token monitoring resumed');
  }

  /**
   * Fetch tokens from cache
   */
  async fetchTokens(): Promise<{
    newTokens: TokenInfo[];
    aboutToGraduateTokens: TokenInfo[];
    graduatedTokens: TokenInfo[];
  }> {
    return {
      newTokens: Array.from(this.tokenCache.newTokens.values()),
      aboutToGraduateTokens: Array.from(this.tokenCache.aboutToGraduateTokens.values()),
      graduatedTokens: Array.from(this.tokenCache.graduatedTokens.values()),
    };
  }

  /**
   * Load initial token data
   */
  private async loadInitialTokenData(): Promise<void> {
    try {
      // In a real implementation, you would fetch tokens from a database or the blockchain
      // For now, we'll just use mock data
      this.logger.log('Loading initial token data...');
      
      // Generate some mock tokens for demonstration
      const mockNewTokens = this.generateMockTokens(10, false, false);
      const mockAboutToGraduateTokens = this.generateMockTokens(8, true, false);
      const mockGraduatedTokens = this.generateMockTokens(12, true, true);
      
      // Add to cache
      mockNewTokens.forEach(token => this.tokenCache.newTokens.set(token.mint, token));
      mockAboutToGraduateTokens.forEach(token => this.tokenCache.aboutToGraduateTokens.set(token.mint, token));
      mockGraduatedTokens.forEach(token => this.tokenCache.graduatedTokens.set(token.mint, token));
      
      this.logger.log('Initial token data loaded');
    } catch (error) {
      this.logger.error('Error loading initial token data:', error);
    }
  }

  /**
   * Handle logs from Pump.fun program
   */
  private async handlePumpFunLogs(logs: any): Promise<void> {
    try {
      // Check if this is a token creation event
      if (this.isPumpFunTokenCreation(logs)) {
        const tokenMint = await this.extractTokenMintFromLogs(logs);
        if (tokenMint) {
          const tokenInfo = await this.fetchTokenInfo(tokenMint);
          if (tokenInfo) {
            // Add to new tokens cache
            this.tokenCache.newTokens.set(tokenInfo.mint, tokenInfo);
            
            // Notify listeners
            if (this.onNewTokenCallback) {
              this.onNewTokenCallback(tokenInfo);
            }
            
            this.logger.log(`New token detected: ${tokenInfo.name} (${tokenInfo.mint})`);
          }
        }
      }
      
      // Check if this is a bonding curve completion event (migration)
      if (this.isBondingCurveComplete(logs.logs)) {
        const tokenMint = await this.extractTokenMintFromLogs(logs);
        if (tokenMint) {
          const tokenInfo = await this.fetchTokenInfo(tokenMint);
          if (tokenInfo) {
            // Move token from new/about to graduate to graduated
            this.tokenCache.newTokens.delete(tokenInfo.mint);
            this.tokenCache.aboutToGraduateTokens.delete(tokenInfo.mint);
            this.tokenCache.graduatedTokens.set(tokenInfo.mint, {
              ...tokenInfo,
              isComplete: true
            });
            
            // Notify listeners
            if (this.onGraduatedCallback) {
              this.onGraduatedCallback({
                ...tokenInfo,
                isComplete: true
              });
            }
            
            this.logger.log(`Token graduated: ${tokenInfo.name} (${tokenInfo.mint})`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error handling Pump.fun logs:', error);
    }
  }

  /**
   * Handle logs from PumpSwap program
   */
  private async handlePumpSwapLogs(logs: any): Promise<void> {
    try {
      // Check if this is a pool creation event
      if (this.isPumpSwapPoolCreation(logs.logs)) {
        const tokenMint = this.getTokenMintFromLogs(logs.logs);
        if (tokenMint) {
          const tokenInfo = await this.fetchTokenInfo(tokenMint);
          if (tokenInfo) {
            // Move token from new/about to graduate to graduated
            this.tokenCache.newTokens.delete(tokenInfo.mint);
            this.tokenCache.aboutToGraduateTokens.delete(tokenInfo.mint);
            this.tokenCache.graduatedTokens.set(tokenInfo.mint, {
              ...tokenInfo,
              isComplete: true
            });
            
            // Notify listeners
            if (this.onGraduatedCallback) {
              this.onGraduatedCallback({
                ...tokenInfo,
                isComplete: true
              });
            }
            
            this.logger.log(`Token graduated via PumpSwap: ${tokenInfo.name} (${tokenInfo.mint})`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error handling PumpSwap logs:', error);
    }
  }

  /**
   * Check market cap periodically and move tokens to "about to graduate" if they meet the threshold
   */
  async checkMarketCaps(): Promise<void> {
    try {
      // Check all new tokens
      for (const [mint, token] of this.tokenCache.newTokens.entries()) {
        // Update market data
        const updatedToken = await this.updateTokenMarketData(token);
        
        // Check if market cap meets graduation threshold
        if ((updatedToken.marketCap || 0) >= GRADUATION_THRESHOLD_USD) {
          // Move to about to graduate
          this.tokenCache.newTokens.delete(mint);
          this.tokenCache.aboutToGraduateTokens.set(mint, updatedToken);
          
          // Notify listeners
          if (this.onAboutToGraduateCallback) {
            this.onAboutToGraduateCallback(updatedToken);
          }
          
          this.logger.log(`Token about to graduate: ${updatedToken.name} (${updatedToken.mint})`);
        } else {
          // Update the token in the new tokens cache
          this.tokenCache.newTokens.set(mint, updatedToken);
        }
      }
    } catch (error) {
      this.logger.error('Error checking market caps:', error);
    }
  }

  /**
   * Update token market data
   */
  private async updateTokenMarketData(token: TokenInfo): Promise<TokenInfo> {
    try {
      // In a real implementation, you would fetch market data from the blockchain
      // For now, we'll just simulate market data changes
      const priceChange = (Math.random() * 0.2) - 0.1; // -10% to +10%
      const newPrice = token.price ? token.price * (1 + priceChange) : 0.0001;
      const newMarketCap = newPrice * Number(token.supply) / 1e9;
      const newLiquidity = newMarketCap * (0.3 + Math.random() * 0.2); // 30-50% of market cap
      
      return {
        ...token,
        price: newPrice,
        marketCap: newMarketCap,
        liquidity: newLiquidity
      };
    } catch (error) {
      this.logger.error(`Error updating market data for token ${token.mint}:`, error);
      return token;
    }
  }

  /**
   * Check if logs indicate a Pump.fun token creation
   */
  private isPumpFunTokenCreation(logs: any): boolean {
    return logs.logs.some((log: string) => 
      log.includes('Program log: Instruction: InitializeMint2')
    );
  }

  /**
   * Check if logs indicate a bonding curve completion
   */
  private isBondingCurveComplete(logs: string[]): boolean {
    return logs.some(log => 
      typeof log === "string" && (
        // Check for the event discriminator
        log.includes(COMPLETE_EVENT_DISCRIMINATOR.join(", ")) ||
        // Check for withdraw instruction (used for migration)
        log.includes("Program log: Instruction: Withdraw") ||
        // Also check for the completion message
        log.includes("Program log: Bonding curve complete")
      )
    );
  }

  /**
   * Check if logs indicate a PumpSwap pool creation
   */
  private isPumpSwapPoolCreation(logs: string[]): boolean {
    // Check for Create_pool instruction with Pump.fun AMM and extract WSOL amount
    const liquidityLog = logs.find(log => 
      typeof log === "string" && 
      log.includes("Create_pool") && 
      log.includes("WSOL")
    );

    if (!liquidityLog) return false;

    // Extract WSOL amount from the log
    const wsolMatch = liquidityLog.match(/and ([\d,.]+) WSOL/);
    if (!wsolMatch) return false;

    // Parse WSOL amount and check if it's > 80
    const wsolAmount = parseFloat(wsolMatch[1].replace(/,/g, ''));
    if (isNaN(wsolAmount) || wsolAmount <= 80) return false;

    return true;
  }

  /**
   * Extract token mint from transaction logs
   */
  private async extractTokenMintFromLogs(logs: any): Promise<PublicKey | null> {
    try {
      const signature = logs.signature;
      if (!signature) return null;
      
      const tx = await this.connection.getTransaction(signature, { 
        commitment: "confirmed" as Finality,
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx?.meta) return null;
      
      // Look at post token balances to find the new token
      for (const balance of tx.meta.postTokenBalances || []) {
        if (balance.mint && balance.mint !== WSOL_MINT.toBase58()) {
          return new PublicKey(balance.mint);
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error extracting token mint from logs:', error);
      return null;
    }
  }

  /**
   * Extract token mint from logs
   */
  private getTokenMintFromLogs(logs: string[]): PublicKey | null {
    try {
      // Look for Create_pool instruction
      const liquidityLog = logs.find(log => 
        typeof log === "string" && 
        log.includes("Create_pool") && 
        log.includes("WSOL")
      );

      if (liquidityLog) {
        // Extract token amount and symbol before "and X WSOL"
        const tokenMatch = liquidityLog.match(/Create_pool ([\d,.]+ [A-Z0-9]+)/);
        if (tokenMatch && tokenMatch[1]) {
          // Find a transfer log containing this token amount and symbol
          const transferLog = logs.find(log =>
            typeof log === "string" && 
            log.includes("Transfer") &&
            log.includes(tokenMatch[1])
          );
          if (transferLog) {
            const mintMatch = transferLog.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
            if (mintMatch) {
              return new PublicKey(mintMatch[0]);
            }
          }
        }
      }

      this.logger.debug("Could not find mint in logs");
      return null;
    } catch (error) {
      this.logger.error('Error extracting token mint from logs:', error);
      return null;
    }
  }

  /**
   * Fetch token information
   */
  private async fetchTokenInfo(mint: PublicKey): Promise<TokenInfo | null> {
    try {
      // In a real implementation, you would fetch token data from the blockchain
      // For now, we'll just generate a mock token
      
      const symbol = `TOKEN${mint.toBase58().substring(0, 4).toUpperCase()}`;
      const name = `Token ${mint.toBase58().substring(0, 8)}`;
      
      return {
        mint: mint.toBase58(),
        name,
        symbol,
        uri: `https://arweave.net/placeholder-${symbol.toLowerCase()}`,
        supply: BigInt(Math.floor(100000000 + Math.random() * 900000000)),
        bondingCurveAddress: `bonding-curve-${mint.toBase58().substring(0, 8)}`,
        isComplete: false,
        price: 0.00001 + Math.random() * 0.0001,
        marketCap: 1000 + Math.random() * 10000,
        liquidity: 300 + Math.random() * 3000
      };
    } catch (error) {
      this.logger.error(`Error fetching token info for ${mint.toBase58()}:`, error);
      return null;
    }
  }

  /**
   * Generate mock token data for UI demonstration
   */
  private generateMockTokens(count: number, highMarketCap: boolean, graduated: boolean): TokenInfo[] {
    const tokens: TokenInfo[] = [];
    
    const prefixes = ['PUMP', 'MEME', 'PEPE', 'DOGE', 'CAT', 'SHIB', 'MOON', 'ROCKET', 'FROG', 'APE'];
    const suffixes = ['INU', 'MOON', 'SWAP', 'FUN', 'COIN', 'TOKEN', 'FINANCE', 'CASH', 'GOLD', 'DIAMOND'];
    
    for (let i = 0; i < count; i++) {
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
      const symbol = `${prefix}${suffix}`;
      
      // Generate random market data
      const basePrice = highMarketCap ? 0.0001 + Math.random() * 0.01 : 0.00001 + Math.random() * 0.0001;
      const supply = BigInt(Math.floor(100000000 + Math.random() * 900000000));
      const marketCap = highMarketCap ? 
        12000 + Math.random() * 50000 : 
        1000 + Math.random() * 10000;
      
      tokens.push({
        mint: `${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
        name: `${prefix} ${suffix}`,
        symbol,
        uri: `https://arweave.net/placeholder-${symbol.toLowerCase()}`,
        supply,
        bondingCurveAddress: `bonding-curve-${i}`,
        isComplete: graduated,
        price: basePrice,
        marketCap,
        liquidity: marketCap * 0.3 + Math.random() * marketCap * 0.2
      });
    }
    
    return tokens;
  }
}
