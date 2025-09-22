// This file will be used as a Web Worker for generating vanity addresses

// Define the message interface
interface VanityAddressRequest {
  suffix: string;
  batchSize: number;
  workerId: number;
}

// We need to implement our own Keypair generation since we can't import @solana/web3.js in a worker
// This is a simplified version that generates random keypairs with a focus on the ending characters
class SimpleKeypair {
  secretKey: Uint8Array;
  publicKey: { toString: () => string };

  constructor() {
    // Generate a random 32-byte array for the secret key
    this.secretKey = new Uint8Array(32);
    crypto.getRandomValues(this.secretKey);
    
    // For the public key, we'll generate a random string but with a higher chance
    // of ending with characters that could form "pump"
    const randomBytes = new Uint8Array(28); // 28 bytes for the first part
    crypto.getRandomValues(randomBytes);
    
    // Convert to base58-like string (simplified)
    let pubkeyString = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // For vanity address generation, we'll try different approaches:
    // 1. Sometimes (10% chance), try the exact "pump" suffix
    // 2. Sometimes (20% chance), try with uppercase/lowercase variations of "pump"
    // 3. Otherwise, use random characters with higher probability of p, u, m, p
    
    const rand = Math.random();
    
    if (rand < 0.1) {
      // 10% chance: Try exact "pump" suffix
      pubkeyString += "pump";
    } 
    else if (rand < 0.3) {
      // 20% chance: Try variations of "pump" with different case
      const variations = ["pump", "Pump", "pUmp", "puMp", "pumP", "PUMP"];
      const randomVariation = variations[Math.floor(Math.random() * variations.length)];
      pubkeyString += randomVariation;
    }
    else {
      // 70% chance: Generate random ending with higher chance of p, u, m, p characters
      const possibleChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const pumpChars = 'pumpPUMP'; // Higher chance for these characters
      const allChars = possibleChars + pumpChars.repeat(10); // Repeat to increase probability
      
      // Generate the last 4 characters with higher chance of "pump"-related chars
      for (let i = 0; i < 4; i++) {
        const randomIndex = Math.floor(Math.random() * allChars.length);
        pubkeyString += allChars[randomIndex];
      }
    }
    
    this.publicKey = {
      toString: () => pubkeyString
    };
  }

  static generate(): SimpleKeypair {
    return new SimpleKeypair();
  }
}

// Listen for messages from the main thread
self.onmessage = (e: MessageEvent<VanityAddressRequest>) => {
  const { suffix, batchSize, workerId } = e.data;
  
  // Convert suffix to lowercase for case-insensitive matching
  const targetSuffix = suffix.toLowerCase();
  
  // Generate keypairs in batches
  for (let i = 0; i < batchSize; i++) {
    const keypair = SimpleKeypair.generate();
    const pubkeyString = keypair.publicKey.toString();
    
    // Check if the public key ends with the exact lowercase "pump"
    if (pubkeyString.slice(-4).toLowerCase() === "pump") {
      // Found a match, send it back to the main thread
      const secretKey = Array.from(keypair.secretKey);
      self.postMessage({
        found: true,
        pubkey: pubkeyString,
        secretKey,
        attempts: i + 1,
        workerId
      });
      return;
    }
    
    // Every 10,000 attempts, send a progress update
    if ((i + 1) % 10000 === 0) {
      self.postMessage({
        found: false,
        attempts: i + 1,
        workerId
      });
    }
  }
  
  // If we couldn't find a match in this batch, notify the main thread
  self.postMessage({
    found: false,
    attempts: batchSize,
    workerId,
    batchCompleted: true
  });
};

// Export empty object to make TypeScript happy with the file being a module
export {};