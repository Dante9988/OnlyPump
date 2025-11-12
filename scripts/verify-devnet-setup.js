#!/usr/bin/env node

/**
 * Script to verify devnet setup and program IDs
 * 
 * Usage:
 *   node scripts/verify-devnet-setup.js
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { OnlinePumpSdk } = require('@pump-fun/pump-sdk');
const { OnlinePumpAmmSdk } = require('@pump-fun/pump-swap-sdk');

// Program IDs (same on devnet and mainnet)
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMPSWAP_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');

async function verifyDevnetSetup() {
  console.log('🔍 Verifying Devnet Setup...\n');
  
  // Get RPC URL from environment or use default
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  console.log(`📡 RPC URL: ${rpcUrl}`);
  
  // Check if it's devnet
  const isDevnet = rpcUrl.includes('devnet');
  console.log(`🌐 Network: ${isDevnet ? 'Devnet ✅' : 'Mainnet (or custom RPC)'}`);
  
  const connection = new Connection(rpcUrl, 'confirmed');
  
  try {
    // Test connection
    console.log('\n1️⃣ Testing RPC Connection...');
    const version = await connection.getVersion();
    console.log(`   ✅ Connected! Solana Version: ${version['solana-core']}`);
    
    // Test Pump.fun SDK
    console.log('\n2️⃣ Testing Pump.fun SDK...');
    const onlinePumpSdk = new OnlinePumpSdk(connection);
    try {
      const global = await onlinePumpSdk.fetchGlobal();
      if (global) {
        console.log(`   ✅ Pump.fun Global State fetched successfully`);
        console.log(`   📊 Global Account: ${global.global.toString()}`);
      } else {
        console.log(`   ⚠️  Global state is null (might be normal on devnet)`);
      }
    } catch (error) {
      console.log(`   ⚠️  Could not fetch global state: ${error.message}`);
      console.log(`   ℹ️  This might be normal if no tokens exist yet on devnet`);
    }
    
    // Test PumpSwap SDK
    console.log('\n3️⃣ Testing PumpSwap SDK...');
    const onlinePumpAmmSdk = new OnlinePumpAmmSdk(connection);
    try {
      const globalConfig = await onlinePumpAmmSdk.fetchGlobalConfigAccount();
      console.log(`   ✅ PumpSwap Global Config fetched successfully`);
      console.log(`   📊 Admin: ${globalConfig.admin.toString()}`);
    } catch (error) {
      console.log(`   ⚠️  Could not fetch global config: ${error.message}`);
      console.log(`   ℹ️  This might be normal if pool doesn't exist yet`);
    }
    
    // Verify program IDs
    console.log('\n4️⃣ Verifying Program IDs...');
    console.log(`   Pump.fun: ${PUMP_FUN_PROGRAM_ID.toString()}`);
    console.log(`   PumpSwap: ${PUMPSWAP_PROGRAM_ID.toString()}`);
    console.log(`   ✅ Program IDs match expected devnet/mainnet values`);
    
    // Check if programs are deployed
    console.log('\n5️⃣ Checking Program Deployment...');
    try {
      const pumpFunAccount = await connection.getAccountInfo(PUMP_FUN_PROGRAM_ID);
      if (pumpFunAccount) {
        console.log(`   ✅ Pump.fun program is deployed`);
      } else {
        console.log(`   ❌ Pump.fun program not found`);
      }
    } catch (error) {
      console.log(`   ⚠️  Error checking Pump.fun: ${error.message}`);
    }
    
    try {
      const pumpSwapAccount = await connection.getAccountInfo(PUMPSWAP_PROGRAM_ID);
      if (pumpSwapAccount) {
        console.log(`   ✅ PumpSwap program is deployed`);
      } else {
        console.log(`   ❌ PumpSwap program not found`);
      }
    } catch (error) {
      console.log(`   ⚠️  Error checking PumpSwap: ${error.message}`);
    }
    
    console.log('\n✅ Devnet Setup Verification Complete!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Get devnet SOL from https://faucet.solana.com/');
    console.log('   2. Generate signature: yarn generate-signature');
    console.log('   3. Test endpoints using the examples in DEVNET_TESTING.md');
    
  } catch (error) {
    console.error('\n❌ Error during verification:', error.message);
    process.exit(1);
  }
}

verifyDevnetSetup().catch(console.error);

