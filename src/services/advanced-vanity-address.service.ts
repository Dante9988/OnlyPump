import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@solana/web3.js';
import { Worker } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';
import { EncryptionService, EncryptedSecret } from './encryption.service';
import * as crypto from 'crypto';

export type PoolStatus = 'available' | 'reserved' | 'used';

export interface PoolItem {
  publicKey: string;
  encryptedSecret: EncryptedSecret;
  generatedAt: number;
  status: PoolStatus;
  reservationId?: string;
  reservedUntil?: number;
  pattern: string;
}

export interface PoolStats {
  available: number;
  reserved: number;
  used: number;
  isGenerating: boolean;
  pattern: string;
  total: number;
}

export interface ReservationResult {
  reservationId: string;
  publicKey: string;
}

@Injectable()
export class AdvancedVanityAddressService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdvancedVanityAddressService.name);
  private pool: PoolItem[] = [];
  private isGenerating = false;
  private sweeperInterval?: NodeJS.Timeout;
  private readonly config = {
    suffix: this.configService.get<string>('VANITY_SUFFIX', 'pump'),
    minPoolSize: this.configService.get<number>('VANITY_POOL_MIN', 10),
    maxPoolSize: this.configService.get<number>('VANITY_POOL_MAX', 50),
    refillBatchSize: this.configService.get<number>('VANITY_REFILL_BATCH', 5),
    ttlMs: this.configService.get<number>('VANITY_RES_TTL_MS', 300000), // 5 minutes
    workers: this.configService.get<number>('VANITY_WORKERS', Math.max(1, require('os').cpus().length - 1)),
    poolFile: this.configService.get<string>('VANITY_POOL_FILE', './vanity-keypairs.json')
  };

  constructor(
    private configService: ConfigService,
    private encryptionService: EncryptionService
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Advanced Vanity Address Service...');
    await this.loadPool();
    this.startSweeper();
    await this.ensurePoolSize();
    this.logger.log(`Vanity pool initialized with ${this.pool.length} keypairs`);
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down Vanity Address Service...');
    if (this.sweeperInterval) {
      clearInterval(this.sweeperInterval);
    }
    await this.savePool();
  }

  private async loadPool() {
    try {
      if (fs.existsSync(this.config.poolFile)) {
        const data = fs.readFileSync(this.config.poolFile, 'utf8');
        this.pool = JSON.parse(data);
        this.logger.log(`Loaded ${this.pool.length} keypairs from disk`);
      } else {
        this.pool = [];
        this.logger.log('No existing pool file found, starting fresh');
      }
    } catch (error) {
      this.logger.error('Error loading pool:', error);
      this.pool = [];
    }
  }

  private async savePool() {
    try {
      const data = JSON.stringify(this.pool, null, 2);
      fs.writeFileSync(this.config.poolFile, data);
      this.logger.log(`Saved ${this.pool.length} keypairs to disk`);
    } catch (error) {
      this.logger.error('Error saving pool:', error);
    }
  }

  private startSweeper() {
    this.sweeperInterval = setInterval(() => {
      this.sweepExpiredReservations();
    }, 15000); // Every 15 seconds
  }

  private sweepExpiredReservations() {
    const now = Date.now();
    let reclaimed = 0;

    for (const item of this.pool) {
      if (item.status === 'reserved' && item.reservedUntil && item.reservedUntil < now) {
        item.status = 'available';
        item.reservationId = undefined;
        item.reservedUntil = undefined;
        reclaimed++;
      }
    }

    if (reclaimed > 0) {
      this.logger.log(`Sweeper reclaimed ${reclaimed} expired reservations`);
      this.savePool();
    }
  }

  async ensurePoolSize() {
    const available = this.pool.filter(item => item.status === 'available').length;
    
    if (available < this.config.minPoolSize && !this.isGenerating) {
      this.logger.log(`Pool below minimum (${available}/${this.config.minPoolSize}), starting refill...`);
      await this.refillPool();
    }
  }

  private async refillPool() {
    if (this.isGenerating) return;
    
    this.isGenerating = true;
    const startTime = Date.now();
    
    try {
      const available = this.pool.filter(item => item.status === 'available').length;
      const needed = Math.min(
        this.config.maxPoolSize - available,
        this.config.refillBatchSize
      );

      if (needed <= 0) {
        this.isGenerating = false;
        return;
      }

      this.logger.log(`Refilling pool with ${needed} keypairs using ${this.config.workers} workers`);
      
      const results = await this.generateVanityKeypairs(needed);
      
      for (const result of results) {
        const encryptedSecret = this.encryptionService.encryptSecret(result.secretKey);
        this.pool.push({
          publicKey: result.publicKey,
          encryptedSecret,
          generatedAt: result.generatedAt,
          status: 'available',
          pattern: this.config.suffix
        });
      }

      await this.savePool();
      
      const duration = Date.now() - startTime;
      this.logger.log(`Refill completed: ${results.length} keypairs in ${duration}ms`);
      
    } catch (error) {
      this.logger.error('Error during refill:', error);
    } finally {
      this.isGenerating = false;
    }
  }

  private async generateVanityKeypairs(count: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const workers: Worker[] = [];
      const results: any[] = [];
      let completedWorkers = 0;
      const perWorker = Math.ceil(count / this.config.workers);
      const timeout = 30000; // 30 second timeout

      // Set overall timeout
      const timeoutId = setTimeout(() => {
        this.logger.warn(`Vanity generation timeout after ${timeout}ms, returning ${results.length} keypairs`);
        workers.forEach(worker => worker.terminate());
        resolve(results);
      }, timeout);

      for (let i = 0; i < this.config.workers; i++) {
        const workerCount = Math.min(perWorker, count - results.length);
        if (workerCount <= 0) break;

        const worker = new Worker(path.join(__dirname, '../workers/vanity.worker.js'), {
          workerData: {
            targetCount: workerCount,
            suffix: this.config.suffix,
            workerId: i
          }
        });

        worker.on('message', (data) => {
          if (data.success) {
            results.push(...data.results);
            this.logger.log(`Worker ${data.workerId} completed: ${data.results.length} keypairs`);
          } else {
            this.logger.error(`Worker ${data.workerId} failed:`, data.error);
          }
          
          completedWorkers++;
          if (completedWorkers === workers.length) {
            clearTimeout(timeoutId);
            workers.forEach(worker => worker.terminate());
            resolve(results);
          }
        });

        worker.on('error', (error) => {
          this.logger.error(`Worker error:`, error);
          completedWorkers++;
          if (completedWorkers === workers.length) {
            clearTimeout(timeoutId);
            workers.forEach(worker => worker.terminate());
            resolve(results);
          }
        });

        workers.push(worker);
      }
    });
  }

  async reserve(): Promise<ReservationResult | null> {
    const availableItem = this.pool.find(item => item.status === 'available');
    
    if (!availableItem) {
      this.logger.warn('No available keypairs in pool');
      await this.ensurePoolSize();
      return null;
    }

    const reservationId = crypto.randomUUID();
    const reservedUntil = Date.now() + this.config.ttlMs;

    availableItem.status = 'reserved';
    availableItem.reservationId = reservationId;
    availableItem.reservedUntil = reservedUntil;

    this.logger.log(`Reserved keypair ${availableItem.publicKey} with ID ${reservationId}`);
    
    return {
      reservationId,
      publicKey: availableItem.publicKey
    };
  }

  async markUsed(reservationId: string): Promise<boolean> {
    const item = this.pool.find(p => p.reservationId === reservationId);
    
    if (!item) {
      this.logger.warn(`Reservation ${reservationId} not found`);
      return false;
    }

    item.status = 'used';
    item.reservationId = undefined;
    item.reservedUntil = undefined;

    this.logger.log(`Marked keypair ${item.publicKey} as used`);
    await this.ensurePoolSize(); // Trigger refill if needed
    
    return true;
  }

  async release(reservationId: string): Promise<boolean> {
    const item = this.pool.find(p => p.reservationId === reservationId);
    
    if (!item) {
      this.logger.warn(`Reservation ${reservationId} not found`);
      return false;
    }

    item.status = 'available';
    item.reservationId = undefined;
    item.reservedUntil = undefined;

    this.logger.log(`Released keypair ${item.publicKey} back to pool`);
    
    return true;
  }

  async materializeKeypair(reservationId: string): Promise<Keypair | null> {
    const item = this.pool.find(p => p.reservationId === reservationId);
    
    if (!item) {
      this.logger.warn(`Reservation ${reservationId} not found`);
      return null;
    }

    try {
      const secretKey = this.encryptionService.decryptSecret(item.encryptedSecret);
      return Keypair.fromSecretKey(new Uint8Array(secretKey));
    } catch (error) {
      this.logger.error('Error materializing keypair:', error);
      return null;
    }
  }

  getStats(): PoolStats {
    const available = this.pool.filter(item => item.status === 'available').length;
    const reserved = this.pool.filter(item => item.status === 'reserved').length;
    const used = this.pool.filter(item => item.status === 'used').length;

    return {
      available,
      reserved,
      used,
      isGenerating: this.isGenerating,
      pattern: this.config.suffix,
      total: this.pool.length
    };
  }

  async refreshPool() {
    this.logger.log('Manual pool refresh requested');
    await this.refillPool();
  }
}
