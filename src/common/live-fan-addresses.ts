/**
 * Vanity addresses data
 * This file exports the vanity addresses from the JSON file
 * Import this file instead of reading from disk for better performance and reliability
 */

import * as fs from 'fs';
import * as path from 'path';

export interface VanityKeypair {
  public_key: string;
  private_key: string;
}

export interface VanityAddressData {
  suffix: string;
  count: number;
  generated_at: string;
  keypairs: VanityKeypair[];
}

/**
 * Load vanity addresses from JSON file
 * Tries multiple paths to ensure it works in both dev and production
 */
function loadVanityAddresses(): VanityAddressData {
  // Try multiple possible paths
  const possiblePaths = [
    path.join(__dirname, 'live_fan_addresses.json'), // Same directory as this file (compiled)
    path.join(process.cwd(), 'src/common/live_fan_addresses.json'), // From project root (dev)
    path.join(process.cwd(), 'dist/common/live_fan_addresses.json'), // From dist (production)
    path.resolve(process.cwd(), 'src/common/live_fan_addresses.json'), // Alternative
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data: VanityAddressData = JSON.parse(fileContent);
        console.log(`✅ Loaded vanity addresses from: ${filePath}`);
        return data;
      } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        continue;
      }
    }
  }

  throw new Error(
    `Vanity addresses file not found. Tried: ${possiblePaths.join(', ')}\n` +
    `Current working directory: ${process.cwd()}\n` +
    `__dirname: ${typeof __dirname !== 'undefined' ? __dirname : 'undefined'}`
  );
}

// Export the loaded data
export const vanityAddressesData: VanityAddressData = loadVanityAddresses();

// Export just the keypairs for convenience
export const vanityKeypairs: VanityKeypair[] = vanityAddressesData.keypairs;

