# Devnet Testing Guide

This guide covers testing the NestJS backend API on Solana Devnet before implementing authentication features.

## Program IDs

The Pump.fun and PumpSwap programs use the **same program IDs** on both Devnet and Mainnet:

- **Pump.fun Program ID**: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
- **PumpSwap Program ID**: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`

These are already configured in `src/common/constants.ts` and will work correctly when using a devnet RPC URL.

## Configuration

### Environment Variables

Ensure your `.env` file is configured for devnet:

```env
# Solana RPC URL (devnet)
SOLANA_RPC_URL=https://api.devnet.solana.com

# Server port
PORT=3000
```

### Verify Configuration

The SDKs automatically use the correct program IDs based on the RPC connection. When you connect to devnet RPC, all operations will use devnet.

## Getting Devnet SOL

Before testing, you'll need devnet SOL for your wallet:

1. **Using Solana CLI**:
   ```bash
   solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet
   ```

2. **Using Web Interface**:
   - Visit: https://faucet.solana.com/
   - Enter your wallet address
   - Request devnet SOL

3. **Using curl**:
   ```bash
   curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d '
     {
       "jsonrpc":"2.0","id":1,
       "method":"requestAirdrop",
       "params":["YOUR_WALLET_ADDRESS", 2000000000]
     }
   '
   ```

## Testing Endpoints

### 1. Generate Authentication Signature

```bash
# Using your devnet wallet private key
SOLANA_PRIVATE_KEY=your_devnet_private_key yarn generate-signature
```

This will output:
- Wallet address
- Base64 signature for `x-request-signature` header

### 2. Test Token Creation

```bash
curl -X POST http://localhost:3000/api/tokens/create \
  -H "Content-Type: application/json" \
  -H "x-request-signature: YOUR_SIGNATURE" \
  -d '{
    "name": "Test Token",
    "symbol": "TEST",
    "uri": "https://example.com/metadata.json",
    "description": "Test token on devnet"
  }'
```

**Expected Response:**
```json
{
  "transaction": "base64_serialized_transaction",
  "tokenMint": "mint_address",
  "vanityAddress": "vanity_address",
  "type": "CREATE"
}
```

**Next Steps:**
1. Copy the `transaction` field (base64)
2. Decode and sign with your wallet
3. Send to devnet using Solana CLI or web3.js

### 3. Test Token Buy (Non-Migrated Token)

```bash
curl -X POST http://localhost:3000/api/tokens/buy \
  -H "Content-Type: application/json" \
  -H "x-request-signature: YOUR_SIGNATURE" \
  -d '{
    "tokenMint": "TOKEN_MINT_ADDRESS",
    "solAmount": 0.1
  }'
```

**Note:** The endpoint automatically detects if the token is on bonding curve or migrated to PumpSwap.

### 4. Test Token Sell

```bash
curl -X POST http://localhost:3000/api/tokens/sell \
  -H "Content-Type: application/json" \
  -H "x-request-signature: YOUR_SIGNATURE" \
  -d '{
    "tokenMint": "TOKEN_MINT_ADDRESS",
    "percentage": 50
  }'
```

### 5. Test Transaction History

```bash
# Get transaction history
curl -X GET "http://localhost:3000/api/transactions/YOUR_WALLET_ADDRESS" \
  -H "x-request-signature: YOUR_SIGNATURE"

# Get transaction stats
curl -X GET "http://localhost:3000/api/transactions/YOUR_WALLET_ADDRESS/stats" \
  -H "x-request-signature: YOUR_SIGNATURE"
```

## Testing Migration Flow

To test the automatic migration detection:

1. **Create a token** on devnet
2. **Buy tokens** until the bonding curve completes (reaches migration threshold)
3. **Verify migration** - the bonding curve `complete` field should be `true`
4. **Test buy/sell** - endpoints should automatically use PumpSwap SDK

## Verifying Transactions on Devnet

Use Solana Explorer for devnet:
- **Solscan Devnet**: https://solscan.io/?cluster=devnet
- **Solana Explorer Devnet**: https://explorer.solana.com/?cluster=devnet

## Common Issues

### 1. "Failed to fetch Pump.fun global state"

**Solution:** Ensure `SOLANA_RPC_URL` is set to devnet:
```env
SOLANA_RPC_URL=https://api.devnet.solana.com
```

### 2. "Insufficient funds"

**Solution:** Request devnet SOL from faucet (see above)

### 3. "Invalid signature"

**Solution:** 
- Regenerate signature with `yarn generate-signature`
- Ensure wallet address in route matches the signed wallet

### 4. Transaction fails on-chain

**Possible causes:**
- Insufficient SOL for fees
- Token account doesn't exist (needs to be created first)
- Invalid token mint address

## Testing Checklist

- [ ] Backend starts successfully with devnet RPC
- [ ] Can generate authentication signature
- [ ] Can create token (returns serialized transaction)
- [ ] Can buy token on bonding curve
- [ ] Can sell token on bonding curve
- [ ] Can buy migrated token (PumpSwap)
- [ ] Can sell migrated token (PumpSwap)
- [ ] Transaction history endpoint works
- [ ] Transaction stats endpoint works
- [ ] Vanity addresses are loaded from JSON file

## Next Steps

After verifying all endpoints work on devnet:
1. Implement email/password authentication for creators
2. Add user management (sign up, login, email verification)
3. Link creator accounts to wallet addresses
4. Add creator-specific features (presale management, etc.)

## References

- [Pump.fun Public Docs](https://github.com/pump-fun/pump-public-docs)
- [Pump Program README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md)
- [PumpSwap README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_SWAP_README.md)
- [Solana Devnet Faucet](https://faucet.solana.com/)

