#!/usr/bin/env node

/**
 * Script to generate vanity keypairs ending with 'pump'
 * This script uses Solana's native keypair generation to find addresses ending with 'pump'
 * 
 * Usage:
 * node generate-vanity-keypairs.js --count=10 --suffix=pump --output=keypairs.json
 */

const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cluster = require('cluster');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace(/^--/, '')] = value;
  return acc;
}, {});

const COUNT = parseInt(args.count || '10', 10);
const SUFFIX = (args.suffix || 'pump').toLowerCase();
const OUTPUT_FILE = args.output || 'vanity-keypairs.json';
const NUM_WORKERS = args.workers ? parseInt(args.workers, 10) : os.cpus().length;

// Function to check if a keypair has the desired suffix
function hasDesiredSuffix(keypair, suffix) {
  const pubkeyString = keypair.publicKey.toString();
  return pubkeyString.toLowerCase().endsWith(suffix);
}

// Function to save keypairs to a file
function saveKeypairsToFile(keypairs, outputFile) {
  const outputPath = path.resolve(process.cwd(), outputFile);
  const data = keypairs.map(keypair => ({
    publicKey: keypair.publicKey.toString(),
    secretKey: Array.from(keypair.secretKey)
  }));
  
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Saved ${keypairs.length} keypairs to ${outputPath}`);
}

// Main function to generate vanity keypairs
function generateVanityKeypairs() {
  if (cluster.isMaster) {
    console.log(`Starting vanity keypair generation with ${NUM_WORKERS} workers`);
    console.log(`Looking for keypairs ending with "${SUFFIX}"`);
    console.log(`Target: ${COUNT} keypairs`);
    
    const startTime = Date.now();
    let foundCount = 0;
    const keypairs = [];
    
    // Fork workers
    for (let i = 0; i < NUM_WORKERS; i++) {
      const worker = cluster.fork();
      
      worker.on('message', (message) => {
        if (message.type === 'found') {
          foundCount++;
          
          // Reconstruct the keypair from the message
          const secretKey = new Uint8Array(message.secretKey);
          const keypair = Keypair.fromSecretKey(secretKey);
          
          keypairs.push(keypair);
          console.log(`[${foundCount}/${COUNT}] Found keypair ending with "${SUFFIX}": ${keypair.publicKey.toString()}`);
          
          if (foundCount >= COUNT) {
            // We've found enough keypairs, save them and exit
            saveKeypairsToFile(keypairs, OUTPUT_FILE);
            
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            console.log(`Generated ${COUNT} vanity keypairs in ${duration.toFixed(2)} seconds`);
            
            // Kill all workers
            for (const id in cluster.workers) {
              cluster.workers[id].kill();
            }
            
            process.exit(0);
          }
        } else if (message.type === 'progress') {
          process.stdout.write(`\rAttempts: ${message.attempts.toLocaleString()}`);
        }
      });
    }
  } else {
    // Worker process
    console.log(`Worker ${process.pid} started`);
    let attempts = 0;
    
    // Report progress every 10,000 attempts
    const reportInterval = 10000;
    
    while (true) {
      attempts++;
      
      // Generate a keypair
      const keypair = Keypair.generate();
      
      // Check if it has the desired suffix
      if (hasDesiredSuffix(keypair, SUFFIX)) {
        // Send the keypair to the master process
        process.send({
          type: 'found',
          secretKey: Array.from(keypair.secretKey),
          publicKey: keypair.publicKey.toString()
        });
      }
      
      // Report progress
      if (attempts % reportInterval === 0) {
        process.send({
          type: 'progress',
          attempts
        });
      }
    }
  }
}

// Start the generation process
generateVanityKeypairs();
