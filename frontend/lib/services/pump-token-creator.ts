import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { OnlinePumpSdk, PumpSdk, getBuyTokenAmountFromSolAmount } from '@pump-fun/pump-sdk';
import BN from 'bn.js';
import { WalletProvider } from './wallet.interface';
import { VanityKeypairPool } from './vanity-keypair-pool';

/**
 * Service for creating tokens on Pump.fun using the official SDK
 */
export class PumpTokenCreator {
  private connection: Connection;
  private pumpSdk: PumpSdk;
  private onlinePumpSdk: OnlinePumpSdk;
  private _isGeneratingVanityAddress = false;
  private vanityAddressProgress = 0;
  private vanityAddressProgressCallback: ((progress: number) => void) | null = null;
  private abortController: AbortController | null = null;
  private vanityKeypairPool: VanityKeypairPool;

  constructor(rpcUrl?: string) {
    this.connection = new Connection(
      rpcUrl || process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    this.pumpSdk = new PumpSdk();
    this.onlinePumpSdk = new OnlinePumpSdk(this.connection);
    
    // Initialize the vanity keypair pool
    this.vanityKeypairPool = new VanityKeypairPool();
  }

  /**
   * Set a callback to receive vanity address generation progress updates
   * @param callback Function to call with progress updates
   */
  setVanityAddressProgressCallback(callback: (progress: number) => void) {
    this.vanityAddressProgressCallback = callback;
  }

  /**
   * Get the current vanity address generation progress
   * @returns Current progress (number of attempts)
   */
  getVanityAddressProgress(): number {
    return this.vanityAddressProgress;
  }

  /**
   * Check if currently generating a vanity address
   * @returns True if generating, false otherwise
   */
  isGeneratingVanityAddress(): boolean {
    return this._isGeneratingVanityAddress;
  }

  /**
   * Cancel any ongoing vanity address generation
   */
  cancelVanityAddressGeneration() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this._isGeneratingVanityAddress = false;
  }

  /**
   * Generate a keypair with a public key ending with the specified suffix
   * @param suffix The desired suffix for the public key
   * @returns Promise resolving to a keypair with matching suffix
   */
  private async generateVanityKeypair(suffix: string): Promise<Keypair> {
    this._isGeneratingVanityAddress = true;
    this.vanityAddressProgress = 0;
    this.abortController = new AbortController();

    try {
      return await new Promise<Keypair>((resolve, reject) => {
        // Convert suffix to lowercase for case-insensitive matching
        const targetSuffix = suffix.toLowerCase();
        
        // For safety, limit the number of attempts
        const MAX_ATTEMPTS = 10000000; // Increased for better chances of finding "pump" suffix
        let attempts = 0;
        
        // Function to update progress
        const updateProgress = (currentAttempts: number) => {
          this.vanityAddressProgress = currentAttempts;
          if (this.vanityAddressProgressCallback) {
            this.vanityAddressProgressCallback(currentAttempts);
          }
        };
        
        // Set up abort handling
        this.abortController!.signal.addEventListener('abort', () => {
          reject(new Error('Vanity address generation cancelled'));
        });
        
        // Start the generation process
        const startTime = Date.now();
        console.log(`Starting vanity address generation for suffix "${suffix}"...`);
        
        // Use a timeout to avoid blocking the UI
        const searchForVanityAddress = () => {
          // Check if we should continue
          if (this.abortController?.signal.aborted) {
            return;
          }
          
          // Generate keypairs in batches for better performance
          const BATCH_SIZE = 50000; // Significantly increased batch size for better chances
          const batchStartTime = Date.now();
          
          for (let i = 0; i < BATCH_SIZE; i++) {
            attempts++;
            
            const keypair = Keypair.generate();
            const pubkeyString = keypair.publicKey.toString();
            
            // Check if the public key ends with the target suffix
            if (pubkeyString.toLowerCase().endsWith(targetSuffix)) {
              const duration = Date.now() - startTime;
              console.log(`Found vanity address after ${attempts} attempts (${duration}ms): ${pubkeyString}`);
              updateProgress(attempts);
              resolve(keypair);
              return;
            }
            
            // Check if we've exceeded the maximum attempts
            if (attempts >= MAX_ATTEMPTS) {
              reject(new Error(`Could not find vanity address ending with "${suffix}" after ${MAX_ATTEMPTS} attempts`));
              return;
            }
          }
          
          // Update progress every batch
          updateProgress(attempts);
          
          // Log progress every 50,000 attempts
          if (attempts % 50000 === 0) {
            const elapsedTime = Date.now() - startTime;
            const attemptsPerSecond = Math.round((attempts / elapsedTime) * 1000);
            console.log(`⏳ Vanity address search: ${attempts.toLocaleString()} attempts, ${attemptsPerSecond.toLocaleString()}/sec`);
          }
          
          // Schedule the next batch with a small delay to allow UI updates
          setTimeout(searchForVanityAddress, 0);
        };
        
        // Start the search
        searchForVanityAddress();
      });
    } finally {
      this._isGeneratingVanityAddress = false;
      this.abortController = null;
    }
  }

  /**
   * Creates a new token on Pump.fun
   * 
   * @param wallet The wallet provider
   * @param name Token name
   * @param symbol Token symbol
   * @param uri Token metadata URI
   * @param useVanityAddress Whether to generate a vanity address ending with "pump"
   * @returns Object containing transaction ID and token mint address
   */
  async createToken(
    wallet: WalletProvider,
    name: string,
    symbol: string,
    uri: string,
    useVanityAddress = true
  ): Promise<{ success: boolean; txId?: string; tokenMint?: string; error?: string }> {
    try {
      // Get wallet public key
      const walletPublicKey = await wallet.getPublicKey();
      
      // Create a mint keypair - either vanity or random
      let mintKeypair: Keypair;
      
      if (useVanityAddress) {
        try {
          console.log("Getting vanity address ending with 'pump'...");
          
          // Wait for the keypair pool to load (max 5 seconds)
          const poolLoaded = await this.vanityKeypairPool.waitForLoaded(5000);
          const poolSize = this.vanityKeypairPool.getPoolSize();
          console.log(`Keypair pool loaded: ${poolLoaded ? '✅ Yes' : '❌ No'}, size: ${poolSize}`);
          
          if (poolSize === 0) {
            console.warn("⚠️ Vanity keypair pool is empty or failed to load.");
            console.log("Checking if vanity-keypairs.json exists in the public folder...");
            
            try {
              // Try to directly access the file to check if it exists
              const checkResponse = await fetch('/vanity-keypairs.json', { 
                method: 'HEAD',
                cache: 'no-store'
              });
              
              if (checkResponse.ok) {
                console.log("✅ File exists, but couldn't load keypairs. Trying again...");
                
                // Try to reload the keypair pool
                this.vanityKeypairPool = new VanityKeypairPool('/vanity-keypairs.json');
                await this.vanityKeypairPool.waitForLoaded(3000);
                
                const newPoolSize = this.vanityKeypairPool.getPoolSize();
                console.log(`After reload: pool size = ${newPoolSize}`);
              } else {
                console.error(`❌ File not found: ${checkResponse.status} ${checkResponse.statusText}`);
                console.log("Make sure vanity-keypairs.json is in the public folder and accessible at /vanity-keypairs.json");
              }
            } catch (checkError) {
              console.error("❌ Error checking for vanity keypair file:", checkError);
            }
          }
          
          // First try to get a keypair from the pool
          let poolKeypair = this.vanityKeypairPool.getKeypair();
          
          if (poolKeypair) {
            console.log(`✅ Using pre-generated vanity address from pool: ${poolKeypair.publicKey.toString()}`);
            mintKeypair = poolKeypair;
          } else {
            // If the pool is empty, fall back to generating one on-the-fly
            console.log("⚠️ Vanity keypair pool is empty, generating on-the-fly...");
            console.log("This will take time - please wait...");
            this._isGeneratingVanityAddress = true;
            
            if (this.vanityAddressProgressCallback) {
              this.vanityAddressProgressCallback(0);
            }
            
            mintKeypair = await this.generateVanityKeypair("pump");
            console.log(`✅ Generated vanity address: ${mintKeypair.publicKey.toString()}`);
            
            this._isGeneratingVanityAddress = false;
          }
        } catch (error) {
          console.error("❌ Failed to get/generate vanity address, falling back to random keypair:", error);
          mintKeypair = Keypair.generate();
          this._isGeneratingVanityAddress = false;
        }
      } else {
        mintKeypair = Keypair.generate();
      }
      
      // Create a new transaction
      const transaction = new Transaction();
      
      // Create token instruction
      const instruction = await this.pumpSdk.createInstruction({
        mint: mintKeypair.publicKey,
        name,
        symbol,
        uri,
        creator: walletPublicKey,
        user: walletPublicKey,
      });
      
      // Add instruction to transaction
      transaction.add(instruction);
      
      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = walletPublicKey;
      
      // Partially sign with the mint keypair
      transaction.partialSign(mintKeypair);
      
      // Sign transaction with wallet provider
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send transaction
      const txid = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        { skipPreflight: false }
      );
      
      return {
        success: true,
        txId: txid,
        tokenMint: mintKeypair.publicKey.toString()
      };
    } catch (error: any) {
      console.error('Error creating Pump.fun token:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating token'
      };
    }
  }

  /**
   * Creates a new token on Pump.fun and buys it in the same transaction
   * 
   * @param wallet The wallet provider
   * @param name Token name
   * @param symbol Token symbol
   * @param uri Token metadata URI
   * @param solAmount Amount of SOL to buy with (in SOL)
   * @param useVanityAddress Whether to generate a vanity address ending with "pump"
   * @returns Object containing transaction ID and token mint address
   */
  async createAndBuyToken(
    wallet: WalletProvider,
    name: string,
    symbol: string,
    uri: string,
    solAmount: number,
    useVanityAddress = true
  ): Promise<{ success: boolean; txId?: string; tokenMint?: string; error?: string }> {
    try {
      // Get wallet public key
      const walletPublicKey = await wallet.getPublicKey();
      
      // Create a mint keypair - either vanity or random
      let mintKeypair: Keypair;
      
      if (useVanityAddress) {
        try {
          console.log("Getting vanity address ending with 'pump'...");
          
          // Wait for the keypair pool to load (max 5 seconds)
          const poolLoaded = await this.vanityKeypairPool.waitForLoaded(5000);
          const poolSize = this.vanityKeypairPool.getPoolSize();
          console.log(`Keypair pool loaded: ${poolLoaded ? '✅ Yes' : '❌ No'}, size: ${poolSize}`);
          
          if (poolSize === 0) {
            console.warn("⚠️ Vanity keypair pool is empty or failed to load.");
            console.log("Checking if vanity-keypairs.json exists in the public folder...");
            
            try {
              // Try to directly access the file to check if it exists
              const checkResponse = await fetch('/vanity-keypairs.json', { 
                method: 'HEAD',
                cache: 'no-store'
              });
              
              if (checkResponse.ok) {
                console.log("✅ File exists, but couldn't load keypairs. Trying again...");
                
                // Try to reload the keypair pool
                this.vanityKeypairPool = new VanityKeypairPool('/vanity-keypairs.json');
                await this.vanityKeypairPool.waitForLoaded(3000);
                
                const newPoolSize = this.vanityKeypairPool.getPoolSize();
                console.log(`After reload: pool size = ${newPoolSize}`);
              } else {
                console.error(`❌ File not found: ${checkResponse.status} ${checkResponse.statusText}`);
                console.log("Make sure vanity-keypairs.json is in the public folder and accessible at /vanity-keypairs.json");
              }
            } catch (checkError) {
              console.error("❌ Error checking for vanity keypair file:", checkError);
            }
          }
          
          // First try to get a keypair from the pool
          let poolKeypair = this.vanityKeypairPool.getKeypair();
          
          if (poolKeypair) {
            console.log(`✅ Using pre-generated vanity address from pool: ${poolKeypair.publicKey.toString()}`);
            mintKeypair = poolKeypair;
          } else {
            // If the pool is empty, fall back to generating one on-the-fly
            console.log("⚠️ Vanity keypair pool is empty, generating on-the-fly...");
            console.log("This will take time - please wait...");
            this._isGeneratingVanityAddress = true;
            
            if (this.vanityAddressProgressCallback) {
              this.vanityAddressProgressCallback(0);
            }
            
            mintKeypair = await this.generateVanityKeypair("pump");
            console.log(`✅ Generated vanity address: ${mintKeypair.publicKey.toString()}`);
            
            this._isGeneratingVanityAddress = false;
          }
        } catch (error) {
          console.error("❌ Failed to get/generate vanity address, falling back to random keypair:", error);
          mintKeypair = Keypair.generate();
          this._isGeneratingVanityAddress = false;
        }
      } else {
        mintKeypair = Keypair.generate();
      }
      
      // Create a new transaction
      const transaction = new Transaction();
      
      // Fetch global state
      const global = await this.onlinePumpSdk.fetchGlobal();
      
      if (!global) {
        throw new Error('Failed to fetch Pump.fun global state');
      }
      
      // Convert SOL amount to lamports
      const solAmountBN = new BN(Math.floor(solAmount * 1e9));
      
      // Create and buy instructions
      const instructions = await this.pumpSdk.createAndBuyInstructions({
        global,
        mint: mintKeypair.publicKey,
        name,
        symbol,
        uri,
        creator: walletPublicKey,
        user: walletPublicKey,
        solAmount: solAmountBN,
        amount: getBuyTokenAmountFromSolAmount({
          global,
          bondingCurve: null,
          amount: solAmountBN,
          feeConfig: null,
          mintSupply: null
        }),
      });
      
      // Add all instructions to the transaction
      for (const ix of instructions) {
        transaction.add(ix);
      }
      
      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = walletPublicKey;
      
      // Partially sign with the mint keypair
      transaction.partialSign(mintKeypair);
      
      // Sign transaction with wallet provider
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send transaction
      const txid = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        { skipPreflight: false }
      );
      
      return {
        success: true,
        txId: txid,
        tokenMint: mintKeypair.publicKey.toString()
      };
    } catch (error: any) {
      console.error('Error creating and buying Pump.fun token:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating and buying token'
      };
    }
  }

  /**
   * Clean up resources when the service is no longer needed
   */
  cleanup() {
    this.cancelVanityAddressGeneration();
  }
}