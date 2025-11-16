import { Injectable, Logger } from '@nestjs/common';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { vanityAddressesData, VanityKeypair, VanityAddressData } from '../common/live-fan-addresses';

// Re-export types for backward compatibility
export type { VanityKeypair, VanityAddressData };

@Injectable()
export class VanityAddressManagerService {
  private readonly logger = new Logger(VanityAddressManagerService.name);
  private readonly usedAddressesFile = path.join(process.cwd(), 'src/common/used_fan_addresses.json');
  private keypairs: VanityKeypair[] = [];
  private usedAddresses: Set<string> = new Set();

  constructor() {
    this.loadKeypairs();
    this.loadUsedAddresses();
  }

  /**
   * Load all vanity keypairs from TypeScript import
   * This is more reliable than reading from disk as it works in both dev and production
   */
  private loadKeypairs(): void {
    try {
      // Import from TypeScript file (which handles JSON loading internally)
      const data = vanityAddressesData;

      if (data.keypairs && Array.isArray(data.keypairs)) {
        this.keypairs = data.keypairs;
        this.logger.log(`✅ Loaded ${this.keypairs.length} vanity addresses from TypeScript import`);
        this.logger.log(`   Suffix: ${data.suffix}, Generated at: ${data.generated_at}`);
      } else {
        this.logger.error('Invalid data structure: missing keypairs array');
        this.keypairs = [];
      }
    } catch (error) {
      this.logger.error(`Error loading vanity addresses: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof Error && error.stack) {
        this.logger.error(`Stack trace: ${error.stack}`);
      }
      this.keypairs = [];
    }
  }

  /**
   * Load used addresses from tracking file
   */
  private loadUsedAddresses(): void {
    try {
      if (fs.existsSync(this.usedAddressesFile)) {
        const fileContent = fs.readFileSync(this.usedAddressesFile, 'utf8');
        const used: string[] = JSON.parse(fileContent);
        this.usedAddresses = new Set(used);
        this.logger.log(`Loaded ${this.usedAddresses.size} used addresses`);
      } else {
        this.usedAddresses = new Set();
        this.logger.log('No used addresses file found, starting fresh');
      }
    } catch (error) {
      this.logger.error(`Error loading used addresses: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.usedAddresses = new Set();
    }
  }

  /**
   * Save used addresses to file
   */
  private saveUsedAddresses(): void {
    try {
      const usedArray = Array.from(this.usedAddresses);
      fs.writeFileSync(this.usedAddressesFile, JSON.stringify(usedArray, null, 2), 'utf8');
    } catch (error) {
      this.logger.error(`Error saving used addresses: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get an available vanity address and its keypair
   * Returns null if no addresses are available
   */
  getAvailableVanityAddress(): { publicKey: string; keypair: Keypair } | null {
    if (this.keypairs.length === 0) {
      this.logger.warn('No vanity keypairs loaded. Check if file exists and is properly formatted.');
      return null;
    }

    this.logger.log(`Checking ${this.keypairs.length} vanity addresses, ${this.usedAddresses.size} already used`);

    // Find first unused keypair
    for (const keypairData of this.keypairs) {
      if (!this.usedAddresses.has(keypairData.public_key)) {
        try {
          // Parse private key and create keypair
          const bs58Module = require('bs58');
          const bs58 = bs58Module.default || bs58Module;
          const privateKeyBytes = bs58.decode(keypairData.private_key);
          
          // Solana keypairs are 64 bytes, use first 32 for secret key
          const secretKey = privateKeyBytes.length === 64 
            ? new Uint8Array(privateKeyBytes.slice(0, 32))
            : new Uint8Array(privateKeyBytes);
          
          const keypair = Keypair.fromSecretKey(secretKey);
          
          // Verify public key matches
          if (keypair.publicKey.toString() !== keypairData.public_key) {
            this.logger.warn(`Public key mismatch for ${keypairData.public_key}. Expected: ${keypairData.public_key}, Got: ${keypair.publicKey.toString()}`);
            continue;
          }

          // Mark as used
          this.usedAddresses.add(keypairData.public_key);
          this.saveUsedAddresses();

          this.logger.log(`✅ Assigned vanity address: ${keypairData.public_key}`);
          return {
            publicKey: keypairData.public_key,
            keypair,
          };
        } catch (error) {
          this.logger.error(`Error parsing keypair for ${keypairData.public_key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          if (error instanceof Error && error.stack) {
            this.logger.error(`Stack trace: ${error.stack}`);
          }
          continue;
        }
      }
    }

    this.logger.warn(`No available vanity addresses remaining. Total: ${this.keypairs.length}, Used: ${this.usedAddresses.size}`);
    return null;
  }

  /**
   * Get statistics about vanity addresses
   */
  getStats(): {
    total: number;
    used: number;
    available: number;
  } {
    return {
      total: this.keypairs.length,
      used: this.usedAddresses.size,
      available: this.keypairs.length - this.usedAddresses.size,
    };
  }

  /**
   * Check if an address is available
   */
  isAvailable(publicKey: string): boolean {
    return !this.usedAddresses.has(publicKey);
  }
}

