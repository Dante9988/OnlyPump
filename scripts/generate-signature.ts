#!/usr/bin/env ts-node

/**
 * Script to generate x-request-signature header for API testing
 * 
 * Usage:
 *   ts-node scripts/generate-signature.ts
 *   ts-node scripts/generate-signature.ts --private-key YOUR_PRIVATE_KEY_BASE58
 *   ts-node scripts/generate-signature.ts --action buy
 * 
 * The script will output the x-request-signature header value that you can use in Postman
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as nacl from 'tweetnacl';
import * as readline from 'readline';

interface Options {
  privateKey?: string;
  action?: string;
  walletAddress?: string;
}

async function getPrivateKey(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Enter your private key (base58) or press Enter to generate a test keypair: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function generateSignature(options: Options = {}): string {
  let keypair: Keypair;
  let walletAddress: string;

  if (options.privateKey) {
    try {
      const privateKeyBytes = bs58.decode(options.privateKey);
      keypair = Keypair.fromSecretKey(privateKeyBytes);
      walletAddress = keypair.publicKey.toString();
    } catch (error) {
      throw new Error('Invalid private key format. Expected base58 encoded private key.');
    }
  } else if (options.walletAddress) {
    // If only wallet address provided, we can't sign, so generate a test keypair
    console.warn('Warning: Only wallet address provided. Generating a test keypair for demonstration.');
    keypair = Keypair.generate();
    walletAddress = options.walletAddress;
  } else {
    // Generate a test keypair
    keypair = Keypair.generate();
    walletAddress = keypair.publicKey.toString();
    console.log('\n⚠️  Generated test keypair (for testing only):');
    console.log(`Public Key: ${walletAddress}`);
    console.log(`Private Key: ${bs58.encode(keypair.secretKey)}\n`);
  }

  // Create message with timestamp and nonce
  const timestamp = new Date().toISOString();
  const nonce = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const actionPart = options.action ? `\nAction: ${options.action}` : '';
  
  const message = `Sign this message to authenticate with OnlyPump API.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\nNonce: ${nonce}${actionPart}\n\nThis signature proves you own this wallet and allows you to interact with the API.`;

  // Sign the message
  const messageBytes = Buffer.from(message, 'utf8');
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signatureBase64 = Buffer.from(signature).toString('base64');

  // Create the signature header object
  const signatureHeader = {
    wallet: walletAddress,
    signature: signatureBase64,
    message: message,
  };

  return JSON.stringify(signatureHeader);
}

async function main() {
  const args = process.argv.slice(2);
  const options: Options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--private-key' && args[i + 1]) {
      options.privateKey = args[i + 1];
      i++;
    } else if (args[i] === '--action' && args[i + 1]) {
      options.action = args[i + 1];
      i++;
    } else if (args[i] === '--wallet' && args[i + 1]) {
      options.walletAddress = args[i + 1];
      i++;
    }
  }

  // If no private key provided, try to get from environment or prompt
  if (!options.privateKey && !options.walletAddress) {
    const envPrivateKey = process.env.SOLANA_PRIVATE_KEY;
    if (envPrivateKey) {
      options.privateKey = envPrivateKey;
      console.log('Using private key from SOLANA_PRIVATE_KEY environment variable');
    } else {
      const input = await getPrivateKey();
      if (input) {
        options.privateKey = input;
      }
    }
  }

  try {
    const signatureHeader = generateSignature(options);
    
    console.log('\n✅ Generated x-request-signature header:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(signatureHeader);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📋 Copy this value and use it as the "x-request-signature" header in Postman\n');
    
    console.log('💡 Postman Setup:');
    console.log('   1. Go to Headers tab');
    console.log('   2. Add header: Key = "x-request-signature", Value = (paste above)');
    console.log('   3. Make your API request\n');
    
    console.log('⏰ Note: This signature is valid for 1 hour (timestamp-based)\n');
    
    // Also output as a curl command example
    console.log('📝 Example curl command:');
    console.log(`curl -X POST http://localhost:3000/api/tokens/buy \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -H "x-request-signature: ${signatureHeader}" \\`);
    console.log(`  -d '{"tokenMint":"...","solAmount":0.1}'\n`);
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch(console.error);

