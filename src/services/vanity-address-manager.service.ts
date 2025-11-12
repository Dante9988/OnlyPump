import { Injectable, Logger } from '@nestjs/common';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

interface VanityKeypair {
  public_key: string;
  private_key: string;
}

interface VanityAddressData {
  suffix: string;
  count: number;
  generated_at: string;
  keypairs: VanityKeypair[];
}

@Injectable()
export class VanityAddressManagerService {
  private readonly logger = new Logger(VanityAddressManagerService.name);
  private readonly jsonFilePath = path.join(process.cwd(), 'src/common/live_fan_addresses.json');
  private readonly usedAddressesFile = path.join(process.cwd(), 'src/common/used_fan_addresses.json');
  private keypairs: VanityKeypair[] = [];
  private usedAddresses: Set<string> = new Set();

  constructor() {
    this.loadKeypairs();
    this.loadUsedAddresses();
  }

  /**
   * Load all vanity keypairs from JSON file
   */
  private loadKeypairs(): void {
    try {
      if (!fs.existsSync(this.jsonFilePath)) {
        this.logger.warn(`Vanity addresses file not found: ${this.jsonFilePath}`);
        return;
      }

      const fileContent = fs.readFileSync(this.jsonFilePath, 'utf8');
      const data: VanityAddressData = JSON.parse(fileContent);

      if (data.keypairs && Array.isArray(data.keypairs)) {
        this.keypairs = data.keypairs;
        this.logger.log(`Loaded ${this.keypairs.length} vanity addresses from file`);
      } else {
        this.logger.error('Invalid JSON structure: missing keypairs array');
      }
    } catch (error) {
      this.logger.error(`Error loading vanity addresses: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            this.logger.warn(`Public key mismatch for ${keypairData.public_key}`);
            continue;
          }

          // Mark as used
          this.usedAddresses.add(keypairData.public_key);
          this.saveUsedAddresses();

          this.logger.log(`Assigned vanity address: ${keypairData.public_key}`);
          return {
            publicKey: keypairData.public_key,
            keypair,
          };
        } catch (error) {
          this.logger.error(`Error parsing keypair for ${keypairData.public_key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          continue;
        }
      }
    }

    this.logger.warn('No available vanity addresses remaining');
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

