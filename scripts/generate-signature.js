#!/usr/bin/env node

/**
 * JavaScript version - No TypeScript compilation needed
 * 
 * Usage:
 *   node scripts/generate-signature.js
 *   node scripts/generate-signature.js --private-key YOUR_PRIVATE_KEY_BASE58
 *   node scripts/generate-signature.js --action buy
 */

const { Keypair } = require('@solana/web3.js');
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;
const nacl = require('tweetnacl');
const readline = require('readline');

async function getPrivateKey() {
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

function parsePrivateKey(privateKeyInput) {
  // Clean the input
  let cleaned = privateKeyInput.trim();
  
  // Remove any quotes if present
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  
  // Remove newlines and escape sequences
  cleaned = cleaned.replace(/\\n/g, '').replace(/\n/g, '').trim();
  
  try {
    // Try parsing as JSON array first (common format from Solana CLI)
    if (cleaned.startsWith('[')) {
      try {
        const keyArray = JSON.parse(cleaned);
        if (Array.isArray(keyArray) && keyArray.length >= 32) {
          if (keyArray.length === 64) {
            // Solana keypairs are 64 bytes, but we only need the first 32 for the secret key
            return new Uint8Array(keyArray.slice(0, 32));
          } else if (keyArray.length >= 32) {
            return new Uint8Array(keyArray.slice(0, 32));
          }
        }
      } catch (e) {
        // Not valid JSON, continue
      }
    }
    
    // Try base58 decode (most common format from Phantom)
    try {
      const decoded = bs58.decode(cleaned);
      if (decoded.length === 64) {
        // Solana keypairs are 64 bytes (secret + public)
        // Keypair.fromSecretKey expects the full 64 bytes
        return new Uint8Array(decoded);
      } else if (decoded.length === 32) {
        // Some formats only export the secret key (32 bytes)
        // We need to derive the public key to make it 64 bytes
        // For now, just return it and let Keypair handle it
        return new Uint8Array(decoded);
      }
    } catch (e) {
      // Not base58, continue
    }
    
    // Try hex
    const hexCleaned = cleaned.replace(/^0x/i, '');
    if (/^[0-9a-fA-F]+$/.test(hexCleaned)) {
      if (hexCleaned.length >= 64) {
        const hexBytes = Buffer.from(hexCleaned, 'hex');
        // If it's 64 bytes, take first 32
        return hexBytes.length === 64 ? hexBytes.slice(0, 32) : hexBytes;
      }
    }
    
    // Try comma-separated numbers
    if (cleaned.includes(',')) {
      const keyArray = cleaned.split(',').map(n => parseInt(n.trim(), 10));
      if (keyArray.length >= 32 && keyArray.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
        const bytes = new Uint8Array(keyArray);
        return bytes.length === 64 ? bytes.slice(0, 32) : bytes;
      }
    }
    
    throw new Error('Could not parse private key in any supported format');
  } catch (error) {
    // Provide helpful error message
    const preview = cleaned.length > 50 ? cleaned.substring(0, 50) + '...' : cleaned;
    throw new Error(`Invalid private key format. Preview: "${preview}". Tried JSON array, base58, hex, and comma-separated. Error: ${error.message}`);
  }
}

function generateSignature(options = {}) {
  let keypair;
  let walletAddress;

  if (options.privateKey) {
    try {
      const privateKeyBytes = parsePrivateKey(options.privateKey);
      keypair = Keypair.fromSecretKey(privateKeyBytes);
      walletAddress = keypair.publicKey.toString();
      console.log(`✅ Using wallet: ${walletAddress}`);
    } catch (error) {
      console.error('\n❌ Error parsing private key:');
      console.error(`   ${error.message}\n`);
      console.error('💡 Supported formats:');
      console.error('   - Base58: "5Kd3N... (from Phantom export)');
      console.error('   - JSON array: [123,45,67,...] (from Solana CLI)');
      console.error('   - Hex: "0x1234abcd..." or "1234abcd..."');
      console.error('   - Comma-separated: "123,45,67,..."\n');
      throw error;
    }
  } else if (options.walletAddress) {
    console.warn('Warning: Only wallet address provided. Generating a test keypair for demonstration.');
    keypair = Keypair.generate();
    walletAddress = options.walletAddress;
  } else {
    keypair = Keypair.generate();
    walletAddress = keypair.publicKey.toString();
    console.log('\n⚠️  Generated test keypair (for testing only):');
    console.log(`Public Key: ${walletAddress}`);
    console.log(`Private Key: ${bs58.encode(keypair.secretKey)}\n`);
  }

  // Create standard message (no timestamp/nonce needed - simpler for frontend)
  const message = `Sign this message to authenticate with OnlyPump API.\n\nWallet: ${walletAddress}\n\nThis signature proves you own this wallet and allows you to interact with the API.`;

  // Sign the message
  const messageBytes = Buffer.from(message, 'utf8');
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signatureBase64 = Buffer.from(signature).toString('base64');

  // Return signature and wallet address separately
  return {
    signature: signatureBase64,
    walletAddress: walletAddress,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};

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

  // If no private key provided, try to get from environment
  if (!options.privateKey && !options.walletAddress) {
    const envPrivateKey = process.env.SOLANA_PRIVATE_KEY;
    if (envPrivateKey) {
      options.privateKey = envPrivateKey.trim();
      const preview = envPrivateKey.length > 20 
        ? envPrivateKey.substring(0, 20) + '...' 
        : envPrivateKey.substring(0, Math.min(envPrivateKey.length, 20));
      console.log(`📝 Using private key from SOLANA_PRIVATE_KEY environment variable`);
      console.log(`   Preview: ${preview} (length: ${envPrivateKey.length} chars)`);
      
      // Check if it looks like it might need trimming or has extra characters
      if (envPrivateKey.includes('\n') || envPrivateKey.includes('\\n')) {
        console.log('   ⚠️  Warning: Private key contains newlines. Trimming...');
        options.privateKey = envPrivateKey.replace(/\\n/g, '').replace(/\n/g, '').trim();
      }
    } else {
      console.log('\n💡 No private key provided. You can:');
      console.log('   1. Press Enter to generate a test keypair (for testing only)');
      console.log('   2. Enter your private key in one of these formats:');
      console.log('      - Base58: "5Kd3N..." (from Phantom wallet export)');
      console.log('      - JSON array: "[123,45,67,...]" (from Solana CLI)');
      console.log('      - Hex: "0x1234abcd..." or "1234abcd..."');
      console.log('      - Comma-separated: "123,45,67,..."\n');
      const input = await getPrivateKey();
      if (input) {
        options.privateKey = input.trim();
      }
    }
  }

  try {
    const { signature, walletAddress } = generateSignature(options);
    
    console.log('\n✅ Generated signature:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Wallet Address:', walletAddress);
    console.log('x-request-signature:', signature);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📋 Postman Setup:');
    console.log('   1. Go to Headers tab');
    console.log('   2. Add header: Key = "x-request-signature", Value = (signature above)');
    console.log('   3. Use wallet address in route: /api/transactions/{walletAddress}');
    console.log('   4. Make your API request\n');
    
    // Also output as a curl command example
    console.log('📝 Example curl commands:');
    console.log(`# Get transaction history:`);
    console.log(`curl -X GET http://localhost:3000/api/transactions/${walletAddress} \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -H "x-request-signature: ${signature}"\n`);
    console.log(`# Get transaction stats:`);
    console.log(`curl -X GET http://localhost:3000/api/transactions/${walletAddress}/stats \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -H "x-request-signature: ${signature}"\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message || error);
    process.exit(1);
  }
}

main().catch(console.error);

