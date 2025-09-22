# PumpFun and PumpSwap Integration Guide

This guide explains how to integrate the PumpFun and PumpSwap services into different platforms.

## Overview

The services are designed to be modular and platform-agnostic, allowing you to use them in:

- Web dApps with wallet extensions
- Telegram bots
- Discord bots
- Command-line tools
- Any other JavaScript/TypeScript environment

## Key Components

### WalletProvider Interface

The `WalletProvider` interface is the key to platform-agnostic wallet integration:

```typescript
export interface WalletProvider {
  getPublicKey(): Promise<PublicKey>;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>;
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
}
```

Two implementations are provided:

1. `KeypairWalletProvider`: For private key-based wallets (CLI, bots)
2. `Web3WalletProvider`: For web wallet adapters (@solana/wallet-adapter)

### Services

1. **PumpFunService**: Handles interactions with Pump.fun tokens
   - Create tokens
   - Buy tokens
   - Sell tokens
   - Check token info

2. **PumpSwapService**: Handles interactions with PumpSwap AMM
   - Buy tokens
   - Sell tokens
   - Monitor migrations
   - Monitor new tokens

## Integration Example

### Web dApp Integration

```typescript
import { PumpFunService, PumpSwapService } from 'pumpfun-content';
import { Web3WalletProvider } from 'pumpfun-content';

// Initialize services
const pumpFunService = new PumpFunService(rpcUrl);
const pumpSwapService = new PumpSwapService(rpcUrl);

// Connect wallet using @solana/wallet-adapter
const wallet = useWallet(); // React hook from @solana/wallet-adapter
const walletProvider = new Web3WalletProvider(wallet);

// Create token
const result = await pumpFunService.createToken(
  walletProvider,
  'My Token',
  'MTK',
  'https://example.com/metadata.json',
  'My token description',
  { website: 'https://example.com' }
);

// Buy token
const buyResult = await pumpFunService.buyToken(
  walletProvider,
  'TokenMintAddress',
  0.1 // SOL
);

// Sell token
const sellResult = await pumpFunService.sellToken(
  walletProvider,
  'TokenMintAddress',
  50 // 50%
);
```

## Token Creation with Metadata

When creating tokens, you can include additional metadata:

```typescript
const result = await pumpFunService.createToken(
  walletProvider,
  'My Token',
  'MTK',
  'https://example.com/metadata.json', // URI to metadata
  'My token description',
  {
    website: 'https://example.com',
    twitter: 'https://twitter.com/mytoken',
    telegram: 'https://t.me/mytoken',
    discord: 'https://discord.gg/mytoken'
  }
);
```

The metadata URI should point to a JSON file with the following structure:

```json
{
  "name": "My Token",
  "symbol": "MTK",
  "description": "My token description",
  "image": "https://example.com/image.png",
  "external_url": "https://example.com",
  "properties": {
    "socials": {
      "website": "https://example.com",
      "twitter": "https://twitter.com/mytoken",
      "telegram": "https://t.me/mytoken",
      "discord": "https://discord.gg/mytoken"
    }
  }
}
```

## Migration Detection

The services automatically handle migrations between Pump.fun and PumpSwap:

```typescript
// Check if token has migrated
const isMigrated = await pumpFunService.isBondingCurveComplete(tokenMint);

// Buy token from the appropriate platform
if (isMigrated) {
  await pumpSwapService.buyToken(walletProvider, tokenMint, 0.1);
} else {
  await pumpFunService.buyToken(walletProvider, tokenMint, 0.1);
}
```

You can also monitor for migrations:

```typescript
pumpSwapService.monitorMigrations((tokenMint) => {
  console.log(`Token ${tokenMint} has migrated to PumpSwap`);
});
```

## Running Examples

The package includes examples:

```bash
# Run basic examples
npm run example
npm run example:test # with env.test

# Run web dApp example
npm run dapp
npm run dapp:test # with env.test
```
