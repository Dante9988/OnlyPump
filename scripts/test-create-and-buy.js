#!/usr/bin/env node

/**
 * Test script to demonstrate the full flow:
 * 1. Authenticate with x-request-signature
 * 2. Call create-and-buy endpoint to get transaction
 * 3. Sign transaction locally (simulating Phantom wallet)
 * 4. Submit signed transaction to backend
 * 
 * Usage:
 *   # Uses WALLET_PRIVATE_KEY from .env file
 *   node scripts/test-create-and-buy.js
 *   
 *   # Override private key via command line
 *   node scripts/test-create-and-buy.js --private-key YOUR_PRIVATE_KEY
 *   
 *   # Override API URL
 *   node scripts/test-create-and-buy.js --api-url http://localhost:3000
 *   
 *   # Override SOL amount (default: 0.1)
 *   node scripts/test-create-and-buy.js --sol-amount 0.5
 *   
 *   # Use Jito for faster transaction execution
 *   node scripts/test-create-and-buy.js --use-jito
 * 
 * Environment Variables (from .env):
 *   WALLET_PRIVATE_KEY - Private key for devnet wallet (base58)
 *   SOLANA_RPC_URL - Solana RPC endpoint (default: devnet)
 *   API_URL - Backend API URL (default: http://localhost:3000)
 *   USE_JITO - Set to 'true' to enable Jito by default (default: false)
 */

// Load environment variables from .env file if available
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, that's okay
}

const { Keypair, Transaction, Connection, PublicKey } = require('@solana/web3.js');
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;
const nacl = require('tweetnacl');
const readline = require('readline');

// Default API URL
const DEFAULT_API_URL = process.env.API_URL || 'http://localhost:3000';
const DEFAULT_SOL_AMOUNT = 0.1;
const DEFAULT_USE_JITO = process.env.USE_JITO === 'true' || false;

function parsePrivateKey(privateKeyInput) {
  let cleaned = privateKeyInput.trim();
  
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  
  cleaned = cleaned.replace(/\\n/g, '').replace(/\n/g, '').trim();
  
  try {
    if (cleaned.startsWith('[')) {
      try {
        const keyArray = JSON.parse(cleaned);
        if (Array.isArray(keyArray) && keyArray.length >= 32) {
          return new Uint8Array(keyArray.length === 64 ? keyArray.slice(0, 32) : keyArray);
        }
      } catch (e) {}
    }
    
    try {
      const decoded = bs58.decode(cleaned);
      return new Uint8Array(decoded.length === 64 ? decoded : decoded);
    } catch (e) {}
    
    const hexCleaned = cleaned.replace(/^0x/i, '');
    if (/^[0-9a-fA-F]+$/.test(hexCleaned) && hexCleaned.length >= 64) {
      const hexBytes = Buffer.from(hexCleaned, 'hex');
      return hexBytes.length === 64 ? hexBytes.slice(0, 32) : hexBytes;
    }
    
    if (cleaned.includes(',')) {
      const keyArray = cleaned.split(',').map(n => parseInt(n.trim(), 10));
      if (keyArray.length >= 32 && keyArray.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
        const bytes = new Uint8Array(keyArray);
        return bytes.length === 64 ? bytes.slice(0, 32) : bytes;
      }
    }
    
    throw new Error('Could not parse private key');
  } catch (error) {
    throw new Error(`Invalid private key format: ${error.message}`);
  }
}

/**
 * Generate authentication signature following the exact same implementation
 * as WalletAuthService.createSignMessage() and WalletAuthService.verifySignature()
 * 
 * Message format must match exactly:
 * "Sign this message to authenticate with OnlyPump API.\n\nWallet: {walletAddress}\n\nThis signature proves you own this wallet and allows you to interact with the API."
 * 
 * Signature process:
 * 1. Create message with wallet address
 * 2. Convert message to UTF-8 bytes
 * 3. Sign using nacl.sign.detached (ed25519)
 * 4. Encode signature as base64
 */
function generateAuthSignature(keypair) {
  const walletAddress = keypair.publicKey.toString();
  
  // Use the exact same message format as WalletAuthService.createSignMessage()
  const message = `Sign this message to authenticate with OnlyPump API.\n\nWallet: ${walletAddress}\n\nThis signature proves you own this wallet and allows you to interact with the API.`;
  
  // Convert message to bytes (UTF-8 encoding)
  const messageBytes = Buffer.from(message, 'utf8');
  
  // Sign using ed25519 (Solana uses ed25519) - detached signature
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  
  // Encode signature as base64 (matches backend verification)
  return Buffer.from(signature).toString('base64');
}

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

async function main() {
  const args = process.argv.slice(2);
  let privateKey = null;
  let apiUrl = DEFAULT_API_URL;
  let solAmount = DEFAULT_SOL_AMOUNT;
  let useJito = DEFAULT_USE_JITO;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--private-key' && args[i + 1]) {
      privateKey = args[i + 1];
      i++;
    } else if (args[i] === '--api-url' && args[i + 1]) {
      apiUrl = args[i + 1];
      i++;
    } else if (args[i] === '--sol-amount' && args[i + 1]) {
      solAmount = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--use-jito') {
      useJito = true;
    }
  }

  // Get private key
  if (!privateKey) {
    // First try WALLET_PRIVATE_KEY (for devnet)
    const envPrivateKey = process.env.WALLET_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY;
    if (envPrivateKey) {
      privateKey = envPrivateKey.trim().replace(/\\n/g, '').replace(/\n/g, '');
      const envVarName = process.env.WALLET_PRIVATE_KEY ? 'WALLET_PRIVATE_KEY' : 'SOLANA_PRIVATE_KEY';
      console.log(`📝 Using private key from ${envVarName} environment variable`);
    } else {
      console.log('\n💡 No private key provided. You can:');
      console.log('   1. Set WALLET_PRIVATE_KEY in .env file');
      console.log('   2. Press Enter to generate a test keypair (for testing only)');
      console.log('   3. Enter your private key\n');
      const input = await getPrivateKey();
      if (input) {
        privateKey = input.trim();
      }
    }
  }

  // Create keypair
  let keypair;
  if (privateKey) {
    try {
      const privateKeyBytes = parsePrivateKey(privateKey);
      keypair = Keypair.fromSecretKey(privateKeyBytes);
      console.log(`✅ Using wallet: ${keypair.publicKey.toString()}\n`);
    } catch (error) {
      console.error('❌ Error parsing private key:', error.message);
      process.exit(1);
    }
  } else {
    keypair = Keypair.generate();
    console.log('\n⚠️  Generated test keypair (for testing only):');
    console.log(`Public Key: ${keypair.publicKey.toString()}`);
    console.log(`Private Key: ${bs58.encode(keypair.secretKey)}\n`);
  }

  const walletAddress = keypair.publicKey.toString();

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Testing Create and Buy Flow');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`SOL Amount: ${solAmount} SOL`);
    console.log(`Use Jito: ${useJito ? 'Yes' : 'No'}\n`);

    // Step 1: Generate authentication signature
    console.log('📝 Step 1: Generating authentication signature...');
    const authSignature = generateAuthSignature(keypair);
    console.log(`✅ Authentication signature generated\n`);

    // Step 2: Call create-and-buy endpoint
    console.log('📝 Step 2: Calling create-and-buy endpoint...');
    const createAndBuyPayload = {
      name: `Test Token ${Date.now()}`,
      symbol: 'TEST',
      uri: 'https://example.com/metadata.json',
      description: 'Test token created via script',
      solAmount: solAmount,
      walletAddress: walletAddress, // Middleware expects wallet address in body
    };

    console.log(`   API URL: ${apiUrl}/api/tokens/create-and-buy`);
    console.log(`   Payload:`, JSON.stringify(createAndBuyPayload, null, 2));
    console.log(`   x-request-signature: ${authSignature.substring(0, 20)}...`);

    const createResponse = await fetch(`${apiUrl}/api/tokens/create-and-buy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-signature': authSignature,
      },
      body: JSON.stringify(createAndBuyPayload),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Create-and-buy failed: ${createResponse.status} ${createResponse.statusText}\n${errorText}`);
    }

    const createResult = await createResponse.json();
    console.log(`✅ Transaction prepared successfully`);
    console.log(`   Token Mint: ${createResult.tokenMint}`);
    console.log(`   Vanity Address: ${createResult.vanityAddress || 'N/A'}`);
    console.log(`   Pending Transaction ID: ${createResult.pendingTransactionId}\n`);

    // Step 3: Sign the transaction locally (simulating Phantom wallet)
    console.log('📝 Step 3: Signing transaction locally (simulating Phantom wallet)...');
    const transactionBuffer = Buffer.from(createResult.transaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);

    // Log existing signatures before signing
    console.log(`   Transaction has ${transaction.signatures.length} signature(s) before user signing`);
    transaction.signatures.forEach((sig, idx) => {
      console.log(`     Signature ${idx}: ${sig.publicKey.toString()} - ${sig.signature ? 'signed' : 'not signed'}`);
    });

    // Note: We don't refresh the blockhash here because the transaction is already
    // partially signed by the backend with the mint keypair. Refreshing would invalidate
    // that signature. The backend should use a recent blockhash that's valid for ~60 seconds.

    // Sign the transaction with the user's keypair using Solana's partialSign
    // This uses ed25519 signing (nacl) under the hood, same as Phantom wallet
    console.log(`   Signing with wallet: ${keypair.publicKey.toString()}`);
    transaction.partialSign(keypair);
    
    // Verify our signature was added and is valid
    const userSignature = transaction.signatures.find(sig => sig.publicKey.equals(keypair.publicKey));
    if (!userSignature || !userSignature.signature) {
      throw new Error('Failed to sign transaction with user keypair');
    }
    
    // Verify the signature cryptographically using Solana libraries
    try {
      // Re-serialize to verify signature is valid
      const testSerialize = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: true // Verify signatures during this test serialization
      });
      console.log(`   ✅ Signature verified cryptographically`);
    } catch (error) {
      throw new Error(`Signature verification failed: ${error.message}`);
    }
    
    console.log(`   ✅ User signature added and verified: ${keypair.publicKey.toString()}`);
    console.log(`   Transaction now has ${transaction.signatures.length} signature(s):`);
    transaction.signatures.forEach((sig, idx) => {
      const status = sig.signature ? '✅ signed' : '❌ not signed';
      console.log(`     ${idx + 1}. ${sig.publicKey.toString()} - ${status}`);
    });
    console.log('');
    
    // Serialize the signed transaction for submission
    // We use requireAllSignatures: false because we want to include all present signatures
    // verifySignatures: false because we already verified above, and network will verify on submission
    const signedTransaction = transaction.serialize({
      requireAllSignatures: false, // Include all signatures that are present
      verifySignatures: false // Network will verify on submission
    });
    const signedTransactionBase64 = Buffer.from(signedTransaction).toString('base64');
    console.log(`✅ Transaction signed and serialized successfully (${signedTransaction.length} bytes)\n`);

    // Step 4: Submit signed transaction to backend
    console.log('📝 Step 4: Submitting signed transaction to backend...');
    if (useJito) {
      console.log('   🚀 Using Jito for faster transaction execution');
    }
    // Include walletAddress in body for middleware authentication
    const submitPayload = {
      signedTransaction: signedTransactionBase64,
      walletAddress: walletAddress,
      useJito: useJito,
    };

    const submitResponse = await fetch(`${apiUrl}/api/tokens/${createResult.pendingTransactionId}/submit-signed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-signature': authSignature,
      },
      body: JSON.stringify(submitPayload),
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      throw new Error(`Submit failed: ${submitResponse.status} ${submitResponse.statusText}\n${errorText}`);
    }

    const submitResult = await submitResponse.json();
    console.log(`✅ Transaction submitted successfully!`);
    console.log(`   Transaction Signature: ${submitResult.transactionSignature}`);
    console.log(`   Status: ${submitResult.status}\n`);

    // Step 5: Check transaction status
    console.log('📝 Step 5: Checking transaction status...');
    try {
      // Use SOLANA_RPC_URL from .env or default to devnet
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      const txStatus = await connection.getSignatureStatus(submitResult.transactionSignature);
      if (txStatus.value) {
        console.log(`   Status: ${txStatus.value.confirmationStatus || 'unknown'}`);
        if (txStatus.value.err) {
          console.log(`   ❌ Error: ${JSON.stringify(txStatus.value.err)}`);
        } else {
          console.log(`   ✅ Transaction confirmed!`);
        }
      } else {
        console.log(`   ⏳ Transaction pending confirmation...`);
      }
    } catch (error) {
      console.log(`   ⚠️  Could not check status: ${error.message}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Full flow completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 Summary:');
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   Token Mint: ${createResult.tokenMint}`);
    console.log(`   Transaction Signature: ${submitResult.transactionSignature}`);
    console.log(`   View on Explorer: https://solscan.io/tx/${submitResult.transactionSignature}?cluster=devnet\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message || error);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Check if fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ This script requires Node.js 18+ or you need to install node-fetch');
  console.error('   Run: npm install node-fetch@2');
  process.exit(1);
}

main().catch(console.error);

