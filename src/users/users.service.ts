import { Injectable, Logger } from '@nestjs/common';
import { Connection, PublicKey, Transaction, Finality } from '@solana/web3.js';
import { PumpSdk, OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { OnlinePumpAmmSdk } from '@pump-fun/pump-swap-sdk';
import { ConfigService } from '@nestjs/config';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private connection: Connection;
  private pumpSdk: PumpSdk;
  private onlinePumpSdk: OnlinePumpSdk;
  private pumpAmmSdk: OnlinePumpAmmSdk;
  private readonly WSOL_ADDRESS = "So11111111111111111111111111111111111111112";
  private readonly PUMP_PROGRAM_ID = new PublicKey('PumpkKaY8nLiCZYMWMH4GEWKMKsYgHpWR5Mu1TJSs7m');

  constructor(private configService: ConfigService) {
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.pumpSdk = new PumpSdk();
    this.onlinePumpSdk = new OnlinePumpSdk(this.connection);
    this.pumpAmmSdk = new OnlinePumpAmmSdk(this.connection);
  }

  async getUserProfile(address: string): Promise<any> {
    try {
      this.logger.log(`Getting user profile for address: ${address}`);
      
      const publicKey = new PublicKey(address);
      
      // Get SOL balance
      const solBalance = await this.connection.getBalance(publicKey) / 1e9;
      
      // Get creator fees
      const creatorFees = await this.getUserCreatorFeesAmount(address);
      
      // Get created tokens count
      const createdTokens = await this.getUserCreatedTokens(address);
      
      const profile = {
        address,
        username: null,
        bio: null,
        profileImage: null,
        solBalance,
        creatorFees,
        createdTokensCount: createdTokens.length,
        followers: 0,
        following: 0
      };
      
      return profile;
    } catch (error) {
      this.logger.error(`Error getting user profile for ${address}:`, error);
      return null;
    }
  }

  async getUserCreatedTokens(address: string): Promise<any[]> {
    try {
      this.logger.log(`Getting created tokens for address: ${address}`);
      
      const publicKey = new PublicKey(address);
      const createdTokens = [];
      
      try {
        // Get all program accounts for the Pump program
        const pumpProgramId = new PublicKey('PumpkKaY8nLiCZYMWMH4GEWKMKsYgHpWR5Mu1TJSs7m');
        
        // Find bonding curves where this address is the creator
        const accounts = await this.connection.getProgramAccounts(pumpProgramId, {
          filters: [
            {
              memcmp: {
                offset: 8 + 32 + 32 + 32 + 8, // Offset to creator field in bonding curve account
                bytes: publicKey.toBase58()
              }
            }
          ]
        });
        
        this.logger.log(`Found ${accounts.length} bonding curves created by ${address}`);
        
        // Process each bonding curve account
        for (const account of accounts) {
          try {
            const bondingCurveAddress = account.pubkey.toBase58();
            const bondingCurve = await this.onlinePumpSdk.fetchBondingCurve(account.pubkey);
            
            if (bondingCurve) {
              // We need to find the mint associated with this bonding curve
              // Since the bonding curve doesn't contain the mint directly, we need to use the PDA derivation
              // The bondingCurvePda function takes a mint, but we need to go the other way around
              
              // Get recent transactions for this bonding curve to find token creation
              const signatures = await this.connection.getSignaturesForAddress(account.pubkey, { limit: 10 });
              
              if (signatures.length > 0) {
                // Try to find the token mint from the creation transaction
                for (const sig of signatures) {
                  const mintInfo = await this.fetchTokenMintFromTx(sig.signature);
                  
                  if (mintInfo && mintInfo.tokenMint) {
                    const mintPubkey = new PublicKey(mintInfo.tokenMint);
                    
                    // Now we have the mint, get token metadata
                    let tokenName = `Token ${mintInfo.tokenMint.slice(0, 6)}`;
                    let tokenSymbol = `TKN${mintInfo.tokenMint.slice(0, 4)}`;
                    let tokenImage = null;
                    
                    try {
                      // Try to get metadata from token account
                      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
                        publicKey,
                        { mint: mintPubkey }
                      );
                      
                      // Calculate market cap and price
                      const marketCap = this.calculateMarketCap(bondingCurve);
                      const price = this.calculatePrice(bondingCurve);
                      
                      createdTokens.push({
                        id: mintInfo.tokenMint.slice(0, 8),
                        mint: mintInfo.tokenMint,
                        name: tokenName,
                        symbol: tokenSymbol,
                        image: tokenImage,
                        marketCap,
                        price,
                        createdAt: new Date(sig.blockTime * 1000) // Use block time as creation time
                      });
                      
                      break; // Found the mint, no need to check other signatures
                    } catch (err) {
                      this.logger.warn(`Error fetching token metadata for ${mintInfo.tokenMint}: ${err.message}`);
                    }
                  }
                }
              }
            }
          } catch (err) {
            this.logger.warn(`Error processing bonding curve account: ${err.message}`);
            // Continue to next account
          }
        }
      } catch (err) {
        this.logger.error(`Error fetching program accounts: ${err.message}`);
      }
      
      return createdTokens;
    } catch (error) {
      this.logger.error(`Error getting created tokens for ${address}:`, error);
      return [];
    }
  }

  async getUserTokenBalances(address: string): Promise<any[]> {
    try {
      this.logger.log(`Getting token balances for address: ${address}`);
      
      const publicKey = new PublicKey(address);
      const tokenBalances = [];
      
      // Get all token accounts owned by the user
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );
      
      // Process each token account
      for (const { pubkey, account } of tokenAccounts.value) {
        try {
          const accountInfo = account;
          const data = Buffer.from(accountInfo.data);
          
          // SPL Token account data structure
          const mintAddress = new PublicKey(data.slice(0, 32));
          const balance = Number(data.readBigUInt64LE(64));
          
          if (balance > 0 && mintAddress.toBase58() !== this.WSOL_ADDRESS) {
            // Check if this is a Pump.fun token
            let isPumpToken = false;
            let tokenName = `Token ${mintAddress.toBase58().slice(0, 6)}`;
            let tokenSymbol = `TKN${mintAddress.toBase58().slice(0, 4)}`;
            let tokenImage = null;
            let price = 0;
            
            try {
              // Try to find bonding curve for this mint
              // Use the bondingCurvePda helper function
              const bondingCurvePda = this.deriveBondingCurvePda(mintAddress);
              const bondingCurve = await this.onlinePumpSdk.fetchBondingCurve(bondingCurvePda);
              
              if (bondingCurve) {
                isPumpToken = true;
                price = this.calculatePrice(bondingCurve);
              } else {
                // Check if it's a PumpSwap token
                const pool = await this.pumpAmmSdk.fetchPool(mintAddress);
                if (pool) {
                  isPumpToken = true;
                  price = this.calculatePumpSwapPrice(pool);
                }
              }
            } catch (err) {
              // Not a Pump token, skip or handle differently
              this.logger.debug(`Token ${mintAddress.toBase58()} is not a Pump token: ${err.message}`);
            }
            
            if (isPumpToken) {
              tokenBalances.push({
                mint: mintAddress.toBase58(),
                name: tokenName,
                symbol: tokenSymbol,
                image: tokenImage,
                balance,
                price,
                valueUsd: balance * price
              });
            }
          }
        } catch (err) {
          this.logger.warn(`Error processing token account ${pubkey.toBase58()}: ${err.message}`);
          // Continue to next token account
        }
      }
      
      return tokenBalances;
    } catch (error) {
      this.logger.error(`Error getting token balances for ${address}:`, error);
      return [];
    }
  }

  async getUserSolBalance(address: string): Promise<{ balance: number }> {
    try {
      this.logger.log(`Getting SOL balance for address: ${address}`);
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey) / 1e9;
      return { balance };
    } catch (error) {
      this.logger.error(`Error getting SOL balance for ${address}:`, error);
      return { balance: 0 };
    }
  }

  async getUserCreatorFees(address: string): Promise<{ fees: number }> {
    try {
      this.logger.log(`Getting creator fees for address: ${address}`);
      const fees = await this.getUserCreatorFeesAmount(address);
      return { fees };
    } catch (error) {
      this.logger.error(`Error getting creator fees for ${address}:`, error);
      return { fees: 0 };
    }
  }

  private async getUserCreatorFeesAmount(address: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address);
      
      // Get creator fees using the Pump SDK
      const feesInLamports = await this.onlinePumpSdk.getCreatorVaultBalanceBothPrograms(publicKey);
      
      // Convert from lamports to SOL
      return feesInLamports.toNumber() / 1e9;
    } catch (error) {
      this.logger.error(`Error getting creator fees amount for ${address}:`, error);
      return 0;
    }
  }

  async collectCreatorFees(address: string, walletPublicKey: string): Promise<any> {
    try {
      this.logger.log(`Collecting creator fees for address: ${address}`);
      
      const creatorPublicKey = new PublicKey(address);
      
      // Verify that the wallet public key matches the creator address
      if (walletPublicKey !== address) {
        return {
          success: false,
          error: 'Wallet public key does not match creator address'
        };
      }
      
      // Get creator fees instructions using the Pump SDK
      const instructions = await this.onlinePumpSdk.collectCoinCreatorFeeInstructions(creatorPublicKey);
      
      if (instructions.length === 0) {
        return {
          success: false,
          error: 'No creator fees to collect'
        };
      }
      
      // Create transaction
      const transaction = new Transaction();
      instructions.forEach(instruction => transaction.add(instruction));
      
      // Return the transaction for the frontend to sign and submit
      return {
        success: true,
        transaction: transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false
        }).toString('base64')
      };
    } catch (error) {
      this.logger.error(`Error collecting creator fees for ${address}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to collect creator fees'
      };
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

  // Helper method to fetch token mint from a transaction
  private async fetchTokenMintFromTx(signature: string): Promise<{ tokenMint: string, solMint: string } | null> {
    try {
      const maxRetries = 5;
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
          this.logger.warn(`Attempt ${attempt + 1} failed to fetch transaction:`, error);
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
}