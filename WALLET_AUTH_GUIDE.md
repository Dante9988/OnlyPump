# Wallet Authentication & Transaction History Guide

## Overview

This backend implements **self-custody wallet authentication** where users sign requests with their wallet's private key, ensuring only the wallet owner can make API calls. The backend builds transactions and returns them to the frontend, where users sign and send them - maintaining full self-custody.

## Architecture

### Flow

1. **Frontend**: User connects wallet (Phantom, Solflare, etc.)
2. **Frontend**: User signs a message with their wallet to authenticate
3. **Frontend**: Sends request with `x-request-signature` header
4. **Backend**: Verifies signature and builds transaction
5. **Backend**: Returns serialized transaction (base64)
6. **Frontend**: User signs transaction with their wallet
7. **Frontend**: Sends transaction to blockchain
8. **Backend**: Tracks transaction in history

### Key Features

- ✅ **Self-Custody**: Private keys never leave user's wallet
- ✅ **Signature Authentication**: Requests verified via wallet signatures
- ✅ **Transaction Building**: Backend prepares transactions, frontend signs
- ✅ **Transaction History**: Automatic tracking of buy/sell operations
- ✅ **API-Based**: No direct on-chain calls from frontend (faster development)

## Authentication

### Signature Format

The `x-request-signature` header must contain a JSON object:

```json
{
  "wallet": "WalletPublicKeyBase58",
  "signature": "Base64EncodedSignature",
  "message": "Message that was signed"
}
```

### Frontend Implementation Example

```typescript
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';

async function signAndSendRequest(endpoint: string, body: any) {
  const { publicKey, signMessage } = useWallet();
  
  if (!publicKey || !signMessage) {
    throw new Error('Wallet not connected');
  }

  // Create message to sign
  const nonce = `${Date.now()}-${Math.random()}`;
  const message = `Sign this message to authenticate with OnlyPump API.\n\nWallet: ${publicKey.toString()}\nTimestamp: ${new Date().toISOString()}\nNonce: ${nonce}\n\nThis signature proves you own this wallet and allows you to interact with the API.`;

  // Sign message
  const messageBytes = new TextEncoder().encode(message);
  const signature = await signMessage(messageBytes);
  const signatureBase64 = Buffer.from(signature).toString('base64');

  // Create signature header
  const signatureHeader = JSON.stringify({
    wallet: publicKey.toString(),
    signature: signatureBase64,
    message: message,
  });

  // Send request
  const response = await fetch(`http://localhost:3000/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-request-signature': signatureHeader,
    },
    body: JSON.stringify(body),
  });

  return response.json();
}
```

## API Endpoints

### Buy Token

```typescript
POST /api/tokens/buy
Headers: {
  'x-request-signature': '{"wallet":"...","signature":"...","message":"..."}'
}
Body: {
  tokenMint: string;
  solAmount: number;
}

Response: {
  transaction: string; // Base64 serialized transaction
  tokenMint: string;
  type: 'buy';
  solAmount: number;
}
```

### Sell Token

```typescript
POST /api/tokens/sell
Headers: {
  'x-request-signature': '{"wallet":"...","signature":"...","message":"..."}'
}
Body: {
  tokenMint: string;
  percentage: number; // 1-100
}

Response: {
  transaction: string; // Base64 serialized transaction
  tokenMint: string;
  type: 'sell';
}
```

### Get Transaction History

```typescript
GET /api/transactions
Headers: {
  'x-request-signature': '{"wallet":"...","signature":"...","message":"..."}'
}
Query: {
  type?: 'buy' | 'sell' | 'create' | 'create_and_buy';
  limit?: number;
}

Response: TransactionRecord[]
```

### Get Transaction Statistics

```typescript
GET /api/transactions/stats
Headers: {
  'x-request-signature': '{"wallet":"...","signature":"...","message":"..."}'
}

Response: {
  totalTransactions: number;
  buyCount: number;
  sellCount: number;
  totalSolSpent: number;
  totalSolReceived: number;
}
```

## Frontend Integration

### Complete Example: Buy Token

```typescript
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';

async function buyToken(tokenMint: string, solAmount: number) {
  const { publicKey, signMessage, signTransaction, sendTransaction } = useWallet();
  const { connection } = useConnection();

  if (!publicKey || !signMessage || !signTransaction || !sendTransaction) {
    throw new Error('Wallet not connected');
  }

  // 1. Authenticate with backend
  const nonce = `${Date.now()}-${Math.random()}`;
  const authMessage = `Sign this message to authenticate with OnlyPump API.\n\nWallet: ${publicKey.toString()}\nTimestamp: ${new Date().toISOString()}\nNonce: ${nonce}\nAction: buy\n\nThis signature proves you own this wallet and allows you to interact with the API.`;
  const messageBytes = new TextEncoder().encode(authMessage);
  const signature = await signMessage(messageBytes);
  const signatureBase64 = Buffer.from(signature).toString('base64');
  const signatureHeader = JSON.stringify({
    wallet: publicKey.toString(),
    signature: signatureBase64,
    message: authMessage,
  });

  // 2. Get transaction from backend
  const response = await fetch('http://localhost:3000/api/tokens/buy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-request-signature': signatureHeader,
    },
    body: JSON.stringify({
      tokenMint,
      solAmount,
    }),
  });

  const { transaction: transactionBase64 } = await response.json();

  // 3. Deserialize transaction
  const transaction = Transaction.from(Buffer.from(transactionBase64, 'base64'));

  // 4. Sign transaction with user's wallet
  const signedTransaction = await signTransaction(transaction);

  // 5. Send transaction to blockchain
  const signature = await sendTransaction(signedTransaction, connection);
  await connection.confirmTransaction(signature, 'confirmed');

  console.log('Transaction confirmed:', signature);
  return signature;
}
```

## Security Notes

1. **Message Uniqueness**: Always include a nonce/timestamp in the message to prevent replay attacks
2. **Action-Specific Messages**: Include the action (buy/sell) in the message for additional security
3. **Signature Verification**: Backend verifies signatures using ed25519 (Solana's signature algorithm)
4. **Self-Custody**: Private keys never leave the user's wallet - backend only receives signatures

## Transaction History

Transactions are automatically tracked when:
- User calls `/api/tokens/buy`
- User calls `/api/tokens/sell`

The history service:
- Stores transaction records in memory (use database in production)
- Verifies transactions on-chain
- Updates status (pending → confirmed/failed)
- Provides statistics (total spent/received, counts)

## Production Considerations

1. **Database**: Replace in-memory storage with Prisma/TypeORM
2. **Rate Limiting**: Add rate limiting to prevent abuse
3. **Caching**: Cache transaction status checks
4. **Webhooks**: Add webhooks for transaction confirmations
5. **Nonce Management**: Store used nonces to prevent replay attacks

## Installation

```bash
yarn add tweetnacl
```

The `tweetnacl` package is used for ed25519 signature verification.

