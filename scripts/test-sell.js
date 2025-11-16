#!/usr/bin/env node

/**
 * Test script to sell tokens only:
 * 1. Authenticate with x-request-signature
 * 2. Sell specified percentage of tokens
 * 3. Sign transaction locally (simulating Phantom wallet)
 * 4. Submit signed transaction to backend
 * 5. Verify transaction on-chain
 * 
 * Usage:
 *   # Uses WALLET_PRIVATE_KEY from .env file
 *   node scripts/test-sell.js --token-mint TOKEN_MINT_ADDRESS
 *   
 *   # Override private key via command line
 *   node scripts/test-sell.js --token-mint TOKEN_MINT --private-key YOUR_PRIVATE_KEY
 *   
 *   # Override API URL
 *   node scripts/test-sell.js --token-mint TOKEN_MINT --api-url http://localhost:3000
 *   
 *   # Override sell percentage (default: 100%)
 *   node scripts/test-sell.js --token-mint TOKEN_MINT --percentage 50
 *   
 *   # Use Jito for faster transaction execution
 *   node scripts/test-sell.js --token-mint TOKEN_MINT --use-jito
 *   
 *   # Override slippage tolerance in basis points (default: 1000 = 10%)
 *   node scripts/test-sell.js --token-mint TOKEN_MINT --slippage-bps 2000
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
const DEFAULT_SELL_PERCENTAGE = 100; // Sell 100% of tokens
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
  let sellPercentage = DEFAULT_SELL_PERCENTAGE;
  let tokenMint = null;
  let useJito = DEFAULT_USE_JITO;
  let slippageBps = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--private-key' && args[i + 1]) {
      privateKey = args[i + 1];
      i++;
    } else if (args[i] === '--api-url' && args[i + 1]) {
      apiUrl = args[i + 1];
      i++;
    } else if (args[i] === '--percentage' && args[i + 1]) {
      sellPercentage = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--token-mint' && args[i + 1]) {
      tokenMint = args[i + 1];
      i++;
    } else if (args[i] === '--use-jito') {
      useJito = true;
    } else if (args[i] === '--slippage-bps' && args[i + 1]) {
      slippageBps = parseInt(args[i + 1], 10);
      i++;
    }
  }

  // Validate required arguments
  if (!tokenMint) {
    console.error('❌ Error: --token-mint is required');
    console.error('Usage: node scripts/test-sell.js --token-mint TOKEN_MINT_ADDRESS');
    process.exit(1);
  }

  // Validate percentage
  if (sellPercentage < 1 || sellPercentage > 100) {
    console.error('❌ Error: --percentage must be between 1 and 100');
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
    console.log('🚀 Testing Sell Token Flow');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Token Mint: ${tokenMint}`);
    console.log(`Sell Percentage: ${sellPercentage}%`);
    console.log(`Use Jito: ${useJito ? 'Yes' : 'No'}`);
    if (slippageBps !== null) {
      console.log(`Slippage: ${slippageBps} bps (${slippageBps / 100}%)`);
    }
    console.log('');

    // Step 1: Generate authentication signature
    console.log('📝 Step 1: Generating authentication signature...');
    const authSignature = generateAuthSignature(keypair);
    console.log(`✅ Authentication signature generated\n`);

    // Step 2: Sell token
    console.log('📝 Step 2: Selling token...');
    const sellPayload = {
      tokenMint: tokenMint,
      percentage: sellPercentage,
      walletAddress: walletAddress,
    };
    
    if (slippageBps !== null) {
      sellPayload.slippageBps = slippageBps;
      console.log(`   Using custom slippage: ${slippageBps} basis points (${slippageBps / 100}%)`);
    }

    console.log(`   API URL: ${apiUrl}/api/tokens/sell`);
    console.log(`   Payload:`, JSON.stringify(sellPayload, null, 2));

    const sellResponse = await fetch(`${apiUrl}/api/tokens/sell`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-signature': authSignature,
      },
      body: JSON.stringify(sellPayload),
    });

    if (!sellResponse.ok) {
      const errorText = await sellResponse.text();
      throw new Error(`Sell failed: ${sellResponse.status} ${sellResponse.statusText}\n${errorText}`);
    }

    const sellResult = await sellResponse.json();
    console.log(`✅ Sell transaction prepared successfully`);
    console.log(`   Pending Transaction ID: ${sellResult.pendingTransactionId}\n`);

    // Step 3: Sign sell transaction
    console.log('📝 Step 3: Signing sell transaction...');
    const sellTransactionBuffer = Buffer.from(sellResult.transaction, 'base64');
    const sellTransaction = Transaction.from(sellTransactionBuffer);

    console.log(`   Transaction has ${sellTransaction.signatures.length} signature(s) before user signing`);
    sellTransaction.signatures.forEach((sig, idx) => {
      console.log(`     Signature ${idx}: ${sig.publicKey.toString()} - ${sig.signature ? 'signed' : 'not signed'}`);
    });

    console.log(`   Signing with wallet: ${keypair.publicKey.toString()}`);
    sellTransaction.partialSign(keypair);

    const sellUserSignature = sellTransaction.signatures.find(sig => sig.publicKey.equals(keypair.publicKey));
    if (!sellUserSignature || !sellUserSignature.signature) {
      throw new Error('Failed to sign sell transaction with user keypair');
    }

    // Verify signature
    try {
      sellTransaction.serialize({
        requireAllSignatures: false,
        verifySignatures: true
      });
      console.log(`   ✅ Signature verified cryptographically`);
    } catch (error) {
      throw new Error(`Sell signature verification failed: ${error.message}`);
    }

    const sellSignedTransaction = sellTransaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    const sellSignedTransactionBase64 = Buffer.from(sellSignedTransaction).toString('base64');
    console.log(`✅ Sell transaction signed successfully (${sellSignedTransaction.length} bytes)\n`);

    // Step 4: Submit sell transaction
    console.log('📝 Step 4: Submitting sell transaction...');
    if (useJito) {
      console.log('   🚀 Using Jito for faster transaction execution');
    }
    const sellSubmitPayload = {
      signedTransaction: sellSignedTransactionBase64,
      walletAddress: walletAddress,
      useJito: useJito,
    };

    const sellSubmitResponse = await fetch(`${apiUrl}/api/tokens/${sellResult.pendingTransactionId}/submit-signed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-signature': authSignature,
      },
      body: JSON.stringify(sellSubmitPayload),
    });

    if (!sellSubmitResponse.ok) {
      const errorText = await sellSubmitResponse.text();
      throw new Error(`Sell submit failed: ${sellSubmitResponse.status} ${sellSubmitResponse.statusText}\n${errorText}`);
    }

    const sellSubmitResult = await sellSubmitResponse.json();
    const sellTxSignature = sellSubmitResult.transactionSignature;
    console.log(`✅ Sell transaction submitted successfully!`);
    console.log(`   Transaction Signature: ${sellTxSignature}\n`);

    // Step 5: Verify sell transaction
    console.log('📝 Step 5: Verifying sell transaction...');
    const sellConfirmed = await waitForConfirmation(connection, sellTxSignature);
    
    if (sellConfirmed) {
      const sellTxDetails = await connection.getTransaction(sellTxSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      
      if (sellTxDetails && sellTxDetails.meta) {
        if (sellTxDetails.meta.err) {
          throw new Error(`Sell transaction failed: ${JSON.stringify(sellTxDetails.meta.err)}`);
        }
        console.log(`   ✅ Sell transaction confirmed on-chain`);
        console.log(`   Block Time: ${sellTxDetails.blockTime ? new Date(sellTxDetails.blockTime * 1000).toISOString() : 'N/A'}`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Sell flow completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 Summary:');
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   Token Mint: ${tokenMint}`);
    console.log(`   Sell Percentage: ${sellPercentage}%`);
    console.log(`   Transaction Signature: ${sellTxSignature}`);
    console.log(`   View on Explorer: https://solscan.io/tx/${sellTxSignature}?cluster=devnet\n`);

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

