import { Keypair } from '@solana/web3.js';
// Direct import of the keypairs JSON file
import vanityKeypairsData from '../../public/vanity-keypairs.json';

/**
 * Interface for a stored keypair
 */
interface StoredKeypair {
  publicKey: string;
  secretKey: number[];
}

/**
 * Service to manage a pool of pre-generated vanity keypairs
 */
export class VanityKeypairPool {
  private keypairs: Keypair[] = [];
  private poolUrl: string;
  private suffix: string;
  private isLoaded: boolean = false;
  private isLoading: boolean = false;
  private loadPromise: Promise<void> | null = null;
  
  /**
   * Create a new VanityKeypairPool
   * @param suffix The suffix to check for (default: 'pump')
   */
  constructor(suffix: string = 'pump') {
    this.poolUrl = ''; // No longer used, but kept for compatibility
    this.suffix = suffix.toLowerCase();
    
    // Start loading keypairs immediately
    this.loadKeypairs();
    
    // Log for debugging
    console.log(`VanityKeypairPool initialized with imported data`);
  }
  
  /**
   * Load keypairs from the pool file
   * @returns Promise that resolves when keypairs are loaded
   */
  private loadKeypairs(): Promise<void> {
    // If already loading, return the existing promise
    if (this.loadPromise) {
      return this.loadPromise;
    }
    
    // If already loaded, return a resolved promise
    if (this.isLoaded) {
      return Promise.resolve();
    }
    
    this.isLoading = true;
    console.log(`Loading vanity keypairs from imported data...`);
    
    this.loadPromise = new Promise<void>((resolve) => {
      try {
        // Use the directly imported JSON data
        const storedKeypairs = vanityKeypairsData as StoredKeypair[];
        console.log(`Loaded ${storedKeypairs.length} keypair data entries from import`);
        
        // Validate the structure of the JSON
        if (!Array.isArray(storedKeypairs)) {
          throw new Error(`Vanity keypairs data is not an array. Found: ${typeof storedKeypairs}`);
        }
        
        // Convert stored keypairs to Solana Keypair objects
        this.keypairs = storedKeypairs.map((stored, index) => {
          try {
            if (!stored.secretKey || !Array.isArray(stored.secretKey)) {
              console.warn(`⚠️ Invalid secretKey format at index ${index}`);
              return null;
            }
            
            // Create a proper Uint8Array with exactly 64 bytes
            const secretKey = new Uint8Array(64);
            
            // Copy the values from the stored secretKey array
            // Only copy up to the length of the stored array or 64, whichever is smaller
            const copyLength = Math.min(stored.secretKey.length, 64);
            for (let i = 0; i < copyLength; i++) {
              secretKey[i] = stored.secretKey[i];
            }
            
            // For debugging
            console.log(`Processing keypair ${index}: ${stored.publicKey}`);
            
            try {
              // Try to create the keypair
              const keypair = Keypair.fromSecretKey(secretKey);
              
              // Verify that the public key matches
              if (keypair.publicKey.toString() !== stored.publicKey) {
                console.warn(`⚠️ Generated public key doesn't match stored public key at index ${index}`);
                return null;
              }
              
              return keypair;
            } catch (keypairError) {
              console.error(`❌ Error creating Solana keypair at index ${index}:`, keypairError);
              
              // Try an alternative approach - create a new keypair and use it
              console.log(`Falling back to new keypair generation for index ${index}`);
              const newKeypair = Keypair.generate();
              return newKeypair;
            }
          } catch (err) {
            console.error(`❌ Error processing keypair data at index ${index}:`, err);
            return null;
          }
        }).filter(Boolean) as Keypair[];
        
        console.log(`✅ Successfully loaded ${this.keypairs.length} valid vanity keypairs`);
        
        // Verify keypairs have the correct suffix
        const validKeypairs = this.keypairs.filter(kp => 
          kp.publicKey.toString().toLowerCase().endsWith(this.suffix)
        );
        
        if (validKeypairs.length !== this.keypairs.length) {
          console.warn(`⚠️ Only ${validKeypairs.length} out of ${this.keypairs.length} keypairs have the suffix "${this.suffix}"`);
          this.keypairs = validKeypairs;
        }
        
        // If we don't have any valid keypairs, generate some dummy ones
        if (this.keypairs.length === 0) {
          console.warn(`⚠️ No valid keypairs found, generating 5 dummy keypairs`);
          for (let i = 0; i < 5; i++) {
            const keypair = Keypair.generate();
            this.keypairs.push(keypair);
          }
        }
        
        // Log the first few keypairs for debugging
        if (this.keypairs.length > 0) {
          console.log(`Sample keypairs (first 3):`);
          this.keypairs.slice(0, 3).forEach((kp, i) => {
            console.log(`  ${i+1}: ${kp.publicKey.toString()}`);
          });
        }
        
        this.isLoaded = true;
      } catch (error) {
        console.error('❌ Error loading vanity keypairs:', error);
        this.keypairs = []; // Ensure pool is empty on error
      } finally {
        this.isLoading = false;
        resolve();
      }
    });
    
    return this.loadPromise;
  }
  
  /**
   * Wait until keypairs are loaded
   * @param timeoutMs Maximum time to wait in milliseconds
   * @returns Promise that resolves when keypairs are loaded
   */
  public async waitForLoaded(timeoutMs: number = 5000): Promise<boolean> {
    if (this.isLoaded) {
      return true;
    }
    
    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), timeoutMs);
    });
    
    const loadPromise = this.loadKeypairs().then(() => true);
    
    return Promise.race([loadPromise, timeoutPromise]);
  }
  
  /**
   * Get the number of keypairs in the pool
   */
  public getPoolSize(): number {
    return this.keypairs.length;
  }
  
  /**
   * Check if the pool has any keypairs
   */
  public hasKeypairs(): boolean {
    return this.keypairs.length > 0;
  }
  
  /**
   * Get a keypair from the pool
   * @returns A keypair from the pool, or null if the pool is empty
   */
  public getKeypair(): Keypair | null {
    if (this.keypairs.length === 0) {
      console.warn('⚠️ Vanity keypair pool is empty');
      return null;
    }
    
    // Remove and return the first keypair from the pool
    const keypair = this.keypairs.shift();
    console.log(`Retrieved vanity keypair: ${keypair?.publicKey.toString()}. Remaining: ${this.keypairs.length}`);
    return keypair || null;
  }
  
  /**
   * Add a keypair to the pool
   * @param keypair The keypair to add
   * @returns True if the keypair was added, false otherwise
   */
  public addKeypair(keypair: Keypair): boolean {
    // Check if the keypair has the desired suffix
    if (!keypair.publicKey.toString().toLowerCase().endsWith(this.suffix)) {
      return false;
    }
    
    this.keypairs.push(keypair);
    return true;
  }
  
  /**
   * Generate a new keypair with the desired suffix
   * @returns A promise that resolves to a keypair with the desired suffix
   */
  public async generateKeypair(): Promise<Keypair> {
    // This is a fallback method for when the pool is empty
    // It's not efficient and should be avoided in production
    console.warn('⚠️ VanityKeypairPool: Generating keypair on-the-fly, this is inefficient');
    
    return new Promise<Keypair>((resolve) => {
      // Keep generating keypairs until we find one with the desired suffix
      const startTime = Date.now();
      let attempts = 0;
      let batchSize = 10000; // Increased batch size
      
      const generateAndCheck = () => {
        for (let i = 0; i < batchSize; i++) {
          attempts++;
          const keypair = Keypair.generate();
          
          if (keypair.publicKey.toString().toLowerCase().endsWith(this.suffix)) {
            const duration = (Date.now() - startTime) / 1000;
            console.log(`✅ Generated vanity keypair after ${attempts.toLocaleString()} attempts (${duration.toFixed(2)}s)`);
            resolve(keypair);
            return;
          }
          
          // Progress logging
          if (attempts % 100000 === 0) {
            console.log(`⏳ Vanity generation: ${attempts.toLocaleString()} attempts...`);
          }
        }
        
        // If we didn't find a match, try again in the next tick
        setTimeout(generateAndCheck, 0);
      };
      
      generateAndCheck();
    });
  }
}