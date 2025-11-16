#!/usr/bin/env node

/**
 * Test script to buy tokens only:
 * 1. Authenticate with x-request-signature
 * 2. Buy token for specified SOL amount
 * 3. Sign transaction locally (simulating Phantom wallet)
 * 4. Submit signed transaction to backend
 * 5. Verify transaction on-chain
 * 
 * Usage:
 *   # Uses WALLET_PRIVATE_KEY from .env file
 *   node scripts/test-buy.js --token-mint TOKEN_MINT_ADDRESS
 *   
 *   # Override private key via command line
 *   node scripts/test-buy.js --token-mint TOKEN_MINT --private-key YOUR_PRIVATE_KEY
 *   
 *   # Override API URL
 *   node scripts/test-buy.js --token-mint TOKEN_MINT --api-url http://localhost:3000
 *   
 *   # Override SOL amount (default: 0.5)
 *   node scripts/test-buy.js --token-mint TOKEN_MINT --sol-amount 1.0
 *   
 *   # Use Jito for faster transaction execution
 *   node scripts/test-buy.js --token-mint TOKEN_MINT --use-jito
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
const DEFAULT_SOL_AMOUNT = 0.5;
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
 */
function generateAuthSignature(keypair) {
  const walletAddress = keypair.publicKey.toString();
  const message = `Sign this message to authenticate with OnlyPump API.\n\nWallet: ${walletAddress}\n\nThis signature proves you own this wallet and allows you to interact with the API.`;
  const messageBytes = Buffer.from(message, 'utf8');
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
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

async function waitForConfirmation(connection, signature, maxWaitTime = 30000) {
  console.log(`   Waiting for transaction confirmation (max ${maxWaitTime/1000}s)...`);
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const status = await connection.getSignatureStatus(signature);
      if (status.value) {
        if (status.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
        }
        if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
          console.log(`   ✅ Transaction confirmed with status: ${status.value.confirmationStatus}`);
          return true;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      if (error.message.includes('Transaction failed')) {
        throw error;
      }
    }
  }
  
  console.log(`   ⚠️  Transaction not confirmed within ${maxWaitTime/1000}s, but continuing...`);
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  let privateKey = null;
  let apiUrl = DEFAULT_API_URL;
  let solAmount = DEFAULT_SOL_AMOUNT;
  let tokenMint = null;
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
    } else if (args[i] === '--token-mint' && args[i + 1]) {
      tokenMint = args[i + 1];
      i++;
    } else if (args[i] === '--use-jito') {
      useJito = true;
    }
  }

  // Validate required arguments
  if (!tokenMint) {
    console.error('❌ Error: --token-mint is required');
    console.error('Usage: node scripts/test-buy.js --token-mint TOKEN_MINT_ADDRESS');
    process.exit(1);
  }

  // Get private key
  if (!privateKey) {
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
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Testing Buy Token Flow');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Token Mint: ${tokenMint}`);
    console.log(`Buy Amount: ${solAmount} SOL`);
    console.log(`Use Jito: ${useJito ? 'Yes' : 'No'}\n`);

    // Step 1: Generate authentication signature
    console.log('📝 Step 1: Generating authentication signature...');
    const authSignature = generateAuthSignature(keypair);
    console.log(`✅ Authentication signature generated\n`);

    // Step 2: Buy token
    console.log('📝 Step 2: Buying token...');
    const buyPayload = {
      tokenMint: tokenMint,
      solAmount: solAmount,
      walletAddress: walletAddress,
    };

    console.log(`   API URL: ${apiUrl}/api/tokens/buy`);
    console.log(`   Payload:`, JSON.stringify(buyPayload, null, 2));

    const buyResponse = await fetch(`${apiUrl}/api/tokens/buy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-signature': authSignature,
      },
      body: JSON.stringify(buyPayload),
    });

    if (!buyResponse.ok) {
      const errorText = await buyResponse.text();
      throw new Error(`Buy failed: ${buyResponse.status} ${buyResponse.statusText}\n${errorText}`);
    }

    const buyResult = await buyResponse.json();
    console.log(`✅ Buy transaction prepared successfully`);
    console.log(`   Pending Transaction ID: ${buyResult.pendingTransactionId}\n`);

    // Step 3: Sign buy transaction
    console.log('📝 Step 3: Signing buy transaction...');
    const buyTransactionBuffer = Buffer.from(buyResult.transaction, 'base64');
    const buyTransaction = Transaction.from(buyTransactionBuffer);

    console.log(`   Transaction has ${buyTransaction.signatures.length} signature(s) before user signing`);
    buyTransaction.signatures.forEach((sig, idx) => {
      console.log(`     Signature ${idx}: ${sig.publicKey.toString()} - ${sig.signature ? 'signed' : 'not signed'}`);
    });

    console.log(`   Signing with wallet: ${keypair.publicKey.toString()}`);
    buyTransaction.partialSign(keypair);

    const buyUserSignature = buyTransaction.signatures.find(sig => sig.publicKey.equals(keypair.publicKey));
    if (!buyUserSignature || !buyUserSignature.signature) {
      throw new Error('Failed to sign buy transaction with user keypair');
    }

    // Verify signature
    try {
      buyTransaction.serialize({
        requireAllSignatures: false,
        verifySignatures: true
      });
      console.log(`   ✅ Signature verified cryptographically`);
    } catch (error) {
      throw new Error(`Buy signature verification failed: ${error.message}`);
    }

    const buySignedTransaction = buyTransaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    const buySignedTransactionBase64 = Buffer.from(buySignedTransaction).toString('base64');
    console.log(`✅ Buy transaction signed successfully (${buySignedTransaction.length} bytes)\n`);

    // Step 4: Submit buy transaction
    console.log('📝 Step 4: Submitting buy transaction...');
    if (useJito) {
      console.log('   🚀 Using Jito for faster transaction execution');
    }
    const buySubmitPayload = {
      signedTransaction: buySignedTransactionBase64,
      walletAddress: walletAddress,
      useJito: useJito,
    };

    const buySubmitResponse = await fetch(`${apiUrl}/api/tokens/${buyResult.pendingTransactionId}/submit-signed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-signature': authSignature,
      },
      body: JSON.stringify(buySubmitPayload),
    });

    if (!buySubmitResponse.ok) {
      const errorText = await buySubmitResponse.text();
      throw new Error(`Buy submit failed: ${buySubmitResponse.status} ${buySubmitResponse.statusText}\n${errorText}`);
    }

    const buySubmitResult = await buySubmitResponse.json();
    const buyTxSignature = buySubmitResult.transactionSignature;
    console.log(`✅ Buy transaction submitted successfully!`);
    console.log(`   Transaction Signature: ${buyTxSignature}\n`);

    // Step 5: Verify buy transaction
    console.log('📝 Step 5: Verifying buy transaction...');
    const buyConfirmed = await waitForConfirmation(connection, buyTxSignature);
    
    if (buyConfirmed) {
      const buyTxDetails = await connection.getTransaction(buyTxSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      
      if (buyTxDetails && buyTxDetails.meta) {
        if (buyTxDetails.meta.err) {
          throw new Error(`Buy transaction failed: ${JSON.stringify(buyTxDetails.meta.err)}`);
        }
        console.log(`   ✅ Buy transaction confirmed on-chain`);
        console.log(`   Block Time: ${buyTxDetails.blockTime ? new Date(buyTxDetails.blockTime * 1000).toISOString() : 'N/A'}`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Buy flow completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 Summary:');
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   Token Mint: ${tokenMint}`);
    console.log(`   Buy Amount: ${solAmount} SOL`);
    console.log(`   Transaction Signature: ${buyTxSignature}`);
    console.log(`   View on Explorer: https://solscan.io/tx/${buyTxSignature}?cluster=devnet\n`);

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

