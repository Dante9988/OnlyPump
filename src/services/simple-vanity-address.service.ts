import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@solana/web3.js';

export interface VanityKeypair {
  keypair: Keypair;
  publicKey: string;
  secretKey: number[];
  generatedAt: number;
}

@Injectable()
export class SimpleVanityAddressService implements OnModuleInit {
  private readonly logger = new Logger(SimpleVanityAddressService.name);
  private keypairPool: VanityKeypair[] = [];
  private readonly suffix = this.configService.get<string>('VANITY_SUFFIX', 'pump');
  private readonly minPoolSize = this.configService.get<number>('VANITY_POOL_MIN', 10);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.logger.log('Initializing Simple Vanity Address Service...');
    await this.generateInitialPool();
    this.logger.log(`Vanity pool initialized with ${this.keypairPool.length} keypairs`);
  }

  private async generateInitialPool() {
    this.logger.log(`Generating ${this.minPoolSize} vanity keypairs with suffix "${this.suffix}"...`);
    
    let generated = 0;
    const maxAttempts = 100000; // Limit attempts to prevent infinite loops
    
    for (let i = 0; i < maxAttempts && generated < this.minPoolSize; i++) {
      const keypair = Keypair.generate();
      const publicKey = keypair.publicKey.toString();
      
      if (publicKey.endsWith(this.suffix)) {
        this.keypairPool.push({
          keypair,
          publicKey,
          secretKey: Array.from(keypair.secretKey),
          generatedAt: Date.now()
        });
        generated++;
        this.logger.log(`Generated ${generated}/${this.minPoolSize} vanity keypairs`);
      }
      
      // Yield control every 1000 attempts
      if (i % 1000 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    if (generated < this.minPoolSize) {
      this.logger.warn(`Only generated ${generated} vanity keypairs out of ${this.minPoolSize} requested`);
    }
  }

  getVanityKeypair(): VanityKeypair | null {
    const keypair = this.keypairPool.shift();
    if (keypair) {
      this.logger.log(`Using vanity address: ${keypair.publicKey}`);
      // Refill pool if it's getting low
      if (this.keypairPool.length < 3) {
        this.generateInitialPool();
      }
    } else {
      this.logger.warn('No vanity keypairs available, using random keypair');
    }
    return keypair;
  }

  getPoolStats() {
    return {
      size: this.keypairPool.length,
      isGenerating: false,
      suffix: this.suffix
    };
  }

  async refreshPool() {
    this.logger.log('Refreshing vanity pool...');
    this.keypairPool = [];
    await this.generateInitialPool();
  }
}
