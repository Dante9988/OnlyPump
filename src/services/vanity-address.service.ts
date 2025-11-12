import { Injectable, Logger } from '@nestjs/common';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface VanityKeypair {
  keypair: Keypair;
  publicKey: string;
  secretKey: number[];
  generatedAt: number;
}

@Injectable()
export class VanityAddressService {
  private readonly logger = new Logger(VanityAddressService.name);
  private keypairPool: VanityKeypair[] = [];
  private readonly POOL_SIZE = 100; // Number of pre-generated keypairs to maintain
  private readonly SUFFIX = 'pump';
  private readonly POOL_FILE = path.join(process.cwd(), 'vanity-keypairs.json');
  private isGenerating = false;

  constructor() {
    this.loadKeypairPool();
    // Start pool generation in background (non-blocking)
    setImmediate(() => {
      this.ensurePoolSize();
    });
  }

  /**
   * Load existing keypairs from file
   */
  private loadKeypairPool(): void {
    try {
      if (fs.existsSync(this.POOL_FILE)) {
        const data = fs.readFileSync(this.POOL_FILE, 'utf8');
        const pool = JSON.parse(data);
        
        // Convert back to Keypair objects
        this.keypairPool = pool.map((item: any) => ({
          keypair: Keypair.fromSecretKey(new Uint8Array(item.secretKey)),
          publicKey: item.publicKey,
          secretKey: item.secretKey,
          generatedAt: item.generatedAt
        }));
        
        this.logger.log(`Loaded ${this.keypairPool.length} vanity keypairs from pool`);
      }
    } catch (error) {
      this.logger.error('Error loading keypair pool:', error);
      this.keypairPool = [];
    }
  }

  /**
   * Save keypairs to file
   */
  private saveKeypairPool(): void {
    try {
      const poolData = this.keypairPool.map(item => ({
        publicKey: item.publicKey,
        secretKey: Array.from(item.secretKey),
        generatedAt: item.generatedAt
      }));
      
      fs.writeFileSync(this.POOL_FILE, JSON.stringify(poolData, null, 2));
      this.logger.log(`Saved ${this.keypairPool.length} vanity keypairs to pool`);
    } catch (error) {
      this.logger.error('Error saving keypair pool:', error);
    }
  }

  /**
   * Generate a single vanity keypair
   */
  private generateVanityKeypair(): VanityKeypair | null {
    const targetSuffix = this.SUFFIX.toLowerCase();
    const maxAttempts = 1000000; // Limit attempts to prevent blocking
    
    for (let i = 0; i < maxAttempts; i++) {
      const keypair = Keypair.generate();
      const pubkeyString = keypair.publicKey.toString().toLowerCase();
      
      if (pubkeyString.endsWith(targetSuffix)) {
        return {
          keypair,
          publicKey: keypair.publicKey.toString(),
          secretKey: Array.from(keypair.secretKey),
          generatedAt: Date.now()
        };
      }
    }
    
    return null;
  }

  /**
   * Generate multiple vanity keypairs in parallel
   */
  private async generateKeypairs(count: number): Promise<VanityKeypair[]> {
    const keypairs: VanityKeypair[] = [];
    const promises: Promise<VanityKeypair | null>[] = [];
    
    // Generate keypairs in parallel
    for (let i = 0; i < count; i++) {
      promises.push(
        new Promise<VanityKeypair | null>((resolve) => {
          // Use setTimeout to prevent blocking
          setTimeout(() => {
            resolve(this.generateVanityKeypair());
          }, 0);
        })
      );
    }
    
    const results = await Promise.all(promises);
    
    // Filter out null results
    for (const result of results) {
      if (result) {
        keypairs.push(result);
      }
    }
    
    return keypairs;
  }

  /**
   * Ensure the pool has enough keypairs
   */
  private async ensurePoolSize(): Promise<void> {
    if (this.isGenerating) return;
    
    const needed = this.POOL_SIZE - this.keypairPool.length;
    if (needed <= 0) return;
    
    this.isGenerating = true;
    this.logger.log(`Generating ${needed} vanity keypairs...`);
    
    try {
      const newKeypairs = await this.generateKeypairs(needed);
      this.keypairPool.push(...newKeypairs);
      
      // Save the updated pool
      this.saveKeypairPool();
      
      this.logger.log(`Generated ${newKeypairs.length} new vanity keypairs. Pool size: ${this.keypairPool.length}`);
    } catch (error) {
      this.logger.error('Error generating vanity keypairs:', error);
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Get a vanity keypair from the pool
   */
  getVanityKeypair(): VanityKeypair | null {
    if (this.keypairPool.length === 0) {
      this.logger.warn('Vanity keypair pool is empty');
      return null;
    }
    
    // Remove and return the first keypair
    const keypair = this.keypairPool.shift();
    
    // Trigger pool refill if needed
    this.ensurePoolSize();
    
    return keypair || null;
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): { size: number; isGenerating: boolean; suffix: string } {
    return {
      size: this.keypairPool.length,
      isGenerating: this.isGenerating,
      suffix: this.SUFFIX
    };
  }

  /**
   * Force refresh the pool
   */
  async refreshPool(): Promise<void> {
    this.keypairPool = [];
    await this.ensurePoolSize();
  }

  /**
   * Get a vanity keypair by public key
   */
  getKeypairByPublicKey(publicKey: string): VanityKeypair | null {
    return this.keypairPool.find(item => item.publicKey === publicKey) || null;
  }

  /**
   * Add a keypair to the pool (for testing or manual addition)
   */
  addKeypair(keypair: Keypair): void {
    const vanityKeypair: VanityKeypair = {
      keypair,
      publicKey: keypair.publicKey.toString(),
      secretKey: Array.from(keypair.secretKey),
      generatedAt: Date.now()
    };
    
    this.keypairPool.push(vanityKeypair);
    this.saveKeypairPool();
  }
}
