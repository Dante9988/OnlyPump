#!/usr/bin/env node

/**
 * Quick test script - generates a test keypair and signature
 * Use this to test the API without needing a real wallet
 */

const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require('tweetnacl');

// Generate a test keypair
const keypair = Keypair.generate();
const walletAddress = keypair.publicKey.toString();

console.log('\n🧪 TEST MODE - Generated Test Keypair\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Public Key:  ${walletAddress}`);
console.log(`Private Key: ${bs58.encode(keypair.secretKey)}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Create message
const timestamp = new Date().toISOString();
const nonce = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
const message = `Sign this message to authenticate with OnlyPump API.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\nNonce: ${nonce}\n\nThis signature proves you own this wallet and allows you to interact with the API.`;

// Sign
const messageBytes = Buffer.from(message, 'utf8');
const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
const signatureBase64 = Buffer.from(signature).toString('base64');

const signatureHeader = JSON.stringify({
  wallet: walletAddress,
  signature: signatureBase64,
  message: message,
});

console.log('✅ Generated x-request-signature header:\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(signatureHeader);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('📋 Copy the JSON above and use it as the "x-request-signature" header in Postman\n');
console.log('⚠️  NOTE: This is a TEST keypair. It will work for API authentication testing,');
console.log('   but cannot be used for real transactions (no funds).\n');

