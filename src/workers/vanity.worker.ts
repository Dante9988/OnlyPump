import { parentPort, workerData } from 'worker_threads';
import { Keypair } from '@solana/web3.js';

interface WorkerData {
  targetCount: number;
  suffix: string;
  workerId: number;
}

interface VanityResult {
  publicKey: string;
  secretKey: number[];
  generatedAt: number;
  attempts: number;
}

function generateVanityKeypair(suffix: string): VanityResult | null {
  let attempts = 0;
  const maxAttempts = 100000; // Reduced from 1M to 100K for faster generation
  
  while (attempts < maxAttempts) {
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    
    if (publicKey.endsWith(suffix)) {
      return {
        publicKey,
        secretKey: Array.from(keypair.secretKey),
        generatedAt: Date.now(),
        attempts: attempts + 1
      };
    }
    
    attempts++;
    
    // Yield control every 1000 attempts to prevent blocking
    if (attempts % 1000 === 0) {
      // Small delay to prevent blocking the event loop
      const start = Date.now();
      while (Date.now() - start < 1) {}
    }
  }
  
  return null;
}

function generateVanityKeypairs(targetCount: number, suffix: string): VanityResult[] {
  const results: VanityResult[] = [];
  let totalAttempts = 0;
  
  console.log(`Worker ${workerData.workerId}: Starting to generate ${targetCount} vanity keypairs with suffix "${suffix}"`);
  
  while (results.length < targetCount) {
    const result = generateVanityKeypair(suffix);
    if (result) {
      results.push(result);
      totalAttempts += result.attempts;
      console.log(`Worker ${workerData.workerId}: Generated ${results.length}/${targetCount} (${totalAttempts} total attempts)`);
    }
  }
  
  console.log(`Worker ${workerData.workerId}: Completed! Generated ${results.length} keypairs in ${totalAttempts} attempts`);
  return results;
}

if (parentPort) {
  const { targetCount, suffix, workerId } = workerData as WorkerData;
  
  try {
    const results = generateVanityKeypairs(targetCount, suffix);
    parentPort.postMessage({
      success: true,
      results,
      workerId
    });
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      workerId
    });
  }
}
