import { Keypair } from '@solana/web3.js';

/**
 * Service for generating vanity Solana addresses
 */
export class VanityAddressService {
  private workers: Worker[] = [];
  private isGenerating = false;
  private totalAttempts = 0;
  private suffix: string = '';
  private onProgressCallback: ((attempts: number) => void) | null = null;
  private resolvePromise: ((keypair: Keypair) => void) | null = null;
  private rejectPromise: ((error: Error) => void) | null = null;
  
  // Configuration
  private readonly NUM_WORKERS = 4; // Number of parallel workers
  private readonly BATCH_SIZE = 100000; // Keypairs per batch
  private readonly MAX_TOTAL_ATTEMPTS = 10000000; // Safety limit
  
  constructor() {
    // Web Workers are only available in browser environment
    if (typeof window !== 'undefined') {
      this.initWorkers();
    }
  }
  
  /**
   * Initialize Web Workers
   */
  private initWorkers() {
    // Clean up any existing workers
    this.terminateWorkers();
    
    // Create new workers
    for (let i = 0; i < this.NUM_WORKERS; i++) {
      try {
        const worker = new Worker(new URL('../workers/vanity-address.worker.ts', import.meta.url));
        
        worker.onmessage = (e) => this.handleWorkerMessage(e.data);
        worker.onerror = (error) => {
          console.error(`Worker ${i} error:`, error);
          if (this.rejectPromise) {
            this.rejectPromise(new Error(`Worker error: ${error.message}`));
          }
        };
        
        this.workers.push(worker);
      } catch (error) {
        console.error('Failed to create Web Worker:', error);
      }
    }
  }
  
  /**
   * Handle messages from workers
   */
  private handleWorkerMessage(data: any) {
    // Update total attempts
    this.totalAttempts += data.attempts;
    
    // Call progress callback if provided
    if (this.onProgressCallback) {
      this.onProgressCallback(this.totalAttempts);
    }
    
    // If a match is found
    if (data.found && this.resolvePromise) {
      // Convert the secret key back to Uint8Array
      const secretKey = new Uint8Array(data.secretKey);
      const keypair = Keypair.fromSecretKey(secretKey);
      
      // Resolve the promise with the keypair
      this.resolvePromise(keypair);
      
      // Stop generation
      this.stopGeneration();
    }
    
    // If a batch is completed and we're still generating, start a new batch
    if (data.batchCompleted && this.isGenerating) {
      // Check if we've exceeded the maximum attempts
      if (this.totalAttempts >= this.MAX_TOTAL_ATTEMPTS) {
        if (this.rejectPromise) {
          this.rejectPromise(new Error(`Failed to find vanity address after ${this.totalAttempts} attempts`));
        }
        this.stopGeneration();
        return;
      }
      
      // Start a new batch for this worker
      this.workers[data.workerId].postMessage({
        suffix: this.suffix,
        batchSize: this.BATCH_SIZE,
        workerId: data.workerId
      });
    }
  }
  
  /**
   * Stop all generation and clean up
   */
  private stopGeneration() {
    this.isGenerating = false;
    this.resolvePromise = null;
    this.rejectPromise = null;
    this.onProgressCallback = null;
  }
  
  /**
   * Terminate all workers
   */
  private terminateWorkers() {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
  }
  
  /**
   * Generate a keypair with a public key ending with the specified suffix
   * 
   * @param suffix The desired suffix for the public key
   * @param onProgress Optional callback for progress updates
   * @returns Promise resolving to a keypair with matching suffix
   */
  async generateVanityKeypair(
    suffix: string,
    onProgress?: (attempts: number) => void
  ): Promise<Keypair> {
    // If we're in a non-browser environment, fall back to synchronous generation
    if (typeof window === 'undefined' || this.workers.length === 0) {
      return this.generateVanityKeypairSync(suffix, onProgress);
    }
    
    // If already generating, return a rejected promise
    if (this.isGenerating) {
      return Promise.reject(new Error('Already generating a vanity address'));
    }
    
    // Reset state
    this.isGenerating = true;
    this.totalAttempts = 0;
    this.suffix = suffix;
    this.onProgressCallback = onProgress || null;
    
    return new Promise<Keypair>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
      
      // Start generation on all workers
      for (let i = 0; i < this.workers.length; i++) {
        this.workers[i].postMessage({
          suffix,
          batchSize: this.BATCH_SIZE,
          workerId: i
        });
      }
      
      // Set a timeout as a safety measure
      setTimeout(() => {
        if (this.isGenerating && this.rejectPromise) {
          this.rejectPromise(new Error('Vanity address generation timed out'));
          this.stopGeneration();
        }
      }, 60000); // 1 minute timeout
    });
  }
  
  /**
   * Synchronous version of vanity keypair generation (fallback)
   */
  private generateVanityKeypairSync(
    suffix: string,
    onProgress?: (attempts: number) => void
  ): Promise<Keypair> {
    return new Promise<Keypair>((resolve, reject) => {
      // Convert suffix to lowercase for case-insensitive matching
      const targetSuffix = suffix.toLowerCase();
      
      // For safety, limit the number of attempts
      const MAX_ATTEMPTS = 1000000;
      
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const keypair = Keypair.generate();
        const pubkeyString = keypair.publicKey.toString();
        
        // Check if the public key ends with the target suffix
        if (pubkeyString.toLowerCase().endsWith(targetSuffix)) {
          if (onProgress) {
            onProgress(i + 1);
          }
          resolve(keypair);
          return;
        }
        
        // Log progress every 10,000 attempts
        if ((i + 1) % 10000 === 0) {
          console.log(`Searching for vanity address... ${i+1} attempts so far`);
          if (onProgress) {
            onProgress(i + 1);
          }
        }
      }
      
      // If we couldn't find a matching keypair after MAX_ATTEMPTS, reject
      reject(new Error(`Could not find vanity address ending with "${suffix}" after ${MAX_ATTEMPTS} attempts`));
    });
  }
  
  /**
   * Clean up resources when the service is no longer needed
   */
  cleanup() {
    this.terminateWorkers();
  }
}
