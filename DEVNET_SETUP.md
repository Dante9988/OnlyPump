# Devnet Setup Guide

## Quick Setup

### 1. Create `.env` file

Create a `.env` file in the root directory:

```bash
# Solana Configuration - DEVNET
SOLANA_RPC_URL=https://api.devnet.solana.com

# Server Configuration
PORT=3000
```

### 2. Start the Backend

```bash
# Development mode (with hot reload)
yarn start:dev

# Or production mode
yarn start
```

The backend will start on `http://localhost:3000`

## About @solana/kit

**You don't need `@solana/kit`** - your project is already using `@solana/web3.js` which is the standard Solana JavaScript library. The [Solana Kit API](https://www.solanakit.com/api) is a newer, more modular approach, but `@solana/web3.js` works perfectly fine for your use case.

Your current setup uses:
- `@solana/web3.js` - Core Solana library ✅
- `@pump-fun/pump-sdk` - Pump.fun SDK ✅
- `@coral-xyz/anchor` - Anchor framework ✅

No changes needed!

## Testing the API

### 1. Generate Signature

```bash
export SOLANA_PRIVATE_KEY="your_private_key"
yarn generate-signature
```

### 2. Test Transaction History Endpoint

Since you're on devnet and haven't made any transactions yet, you should get an empty list:

```bash
curl -X GET http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -H "x-request-signature: {your_generated_signature}"
```

Expected response:
```json
[]
```

### 3. Test Buy Token Endpoint

```bash
curl -X POST http://localhost:3000/api/tokens/buy \
  -H "Content-Type: application/json" \
  -H "x-request-signature: {your_generated_signature}" \
  -d '{
    "tokenMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "solAmount": 0.1
  }'
```

This will return a serialized transaction ready for signing.

## Devnet vs Mainnet

- **Devnet**: Free, for testing, tokens have no real value
- **Mainnet**: Real SOL, real tokens, real money

The backend is now configured to use **devnet by default**. To switch back to mainnet, set:

```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Swagger Documentation

Once the backend is running, visit:
- http://localhost:3000/api/docs

This shows all available endpoints with examples.

