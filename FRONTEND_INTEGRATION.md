# Frontend Integration Guide

This guide explains how to integrate the OnlyPump API with a frontend application using Phantom wallet.

## Authentication Flow Overview

The API uses a **two-step authentication process**:

1. **Off-chain Authentication** (API Access): User signs a message with their wallet to prove ownership
2. **On-chain Transaction Signing** (Blockchain): User signs the actual transaction returned by the API

## Step-by-Step Flow

### 1. Connect Wallet (Phantom)

```typescript
import { Connection, PublicKey } from '@solana/web3.js';

// Check if Phantom is installed
if (!window.solana || !window.solana.isPhantom) {
  throw new Error('Phantom wallet not found. Please install Phantom.');
}

// Connect to Phantom
const response = await window.solana.connect();
const walletAddress = response.publicKey.toString();
```

### 2. Generate Off-chain Authentication Signature

Before calling any API endpoint, you need to sign an authentication message:

```typescript
/**
 * Sign authentication message for API access (off-chain)
 * This proves the user owns the wallet without requiring a blockchain transaction
 */
async function signAuthMessage(walletAddress: string): Promise<string> {
  const message = `Sign this message to authenticate with OnlyPump API.\n\nWallet: ${walletAddress}\n\nThis signature proves you own this wallet and allows you to interact with the API.`;
  
  // Convert message to Uint8Array
  const messageBytes = new TextEncoder().encode(message);
  
  // Request signature from Phantom
  const signedMessage = await window.solana.signMessage(messageBytes, 'utf8');
  
  // Convert signature to base64
  const signatureBase64 = Buffer.from(signedMessage.signature).toString('base64');
  
  return signatureBase64;
}
```

### 3. Call API Endpoint

Now you can call the API with the authentication signature:

```typescript
/**
 * Make authenticated API request
 */
async function callAPI(
  endpoint: string,
  method: 'GET' | 'POST',
  body?: any,
  walletAddress: string,
  signature: string
) {
  const response = await fetch(`http://localhost:3000${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-request-signature': signature,
      'x-wallet-address': walletAddress,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'API request failed');
  }
  
  return response.json();
}
```

### 4. Sign and Submit Transaction (On-chain)

After receiving a serialized transaction from the API, sign it with Phantom and submit:

```typescript
import { Connection, Transaction } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

/**
 * Sign and submit transaction returned from API
 */
async function signAndSubmitTransaction(
  serializedTransactionBase64: string
): Promise<string> {
  // Deserialize transaction
  const transactionBuffer = Buffer.from(serializedTransactionBase64, 'base64');
  const transaction = Transaction.from(transactionBuffer);
  
  // Request signature from Phantom
  const signedTransaction = await window.solana.signTransaction(transaction);
  
  // Submit to blockchain
  const signature = await connection.sendRawTransaction(
    signedTransaction.serialize(),
    {
      skipPreflight: false,
      maxRetries: 3,
    }
  );
  
  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed');
  
  return signature;
}
```

## Complete Example: Create Token

Here's a complete example of creating a token:

```typescript
async function createToken() {
  try {
    // 1. Connect wallet
    const response = await window.solana.connect();
    const walletAddress = response.publicKey.toString();
    
    // 2. Sign authentication message (off-chain)
    const authSignature = await signAuthMessage(walletAddress);
    
    // 3. Call API to create token
    const apiResponse = await callAPI(
      '/api/tokens/create',
      'POST',
      {
        name: 'My Awesome Token',
        symbol: 'MAT',
        uri: 'https://example.com/metadata.json',
        description: 'This is my awesome token',
        socials: {
          twitter: 'https://twitter.com/mytoken',
          telegram: 'https://t.me/mytoken',
        },
      },
      walletAddress,
      authSignature
    );
    
    // 4. Sign and submit transaction (on-chain)
    const transactionSignature = await signAndSubmitTransaction(
      apiResponse.transaction
    );
    
    console.log('Token created! Transaction:', transactionSignature);
    console.log('Token mint:', apiResponse.tokenMint);
    console.log('Vanity address:', apiResponse.vanityAddress);
    
    // 5. Update transaction record (optional)
    await callAPI(
      `/api/transactions/${apiResponse.pendingTransactionId}/update-signature`,
      'POST',
      { transactionSignature },
      walletAddress,
      authSignature
    );
    
    return {
      tokenMint: apiResponse.tokenMint,
      transactionSignature,
      vanityAddress: apiResponse.vanityAddress,
    };
  } catch (error) {
    console.error('Error creating token:', error);
    throw error;
  }
}
```

## Complete Example: Buy Token

```typescript
async function buyToken(tokenMint: string, solAmount: number) {
  try {
    // 1. Connect wallet
    const response = await window.solana.connect();
    const walletAddress = response.publicKey.toString();
    
    // 2. Sign authentication message (off-chain)
    const authSignature = await signAuthMessage(walletAddress);
    
    // 3. Call API to prepare buy transaction
    const apiResponse = await callAPI(
      '/api/tokens/buy',
      'POST',
      {
        tokenMint,
        solAmount,
      },
      walletAddress,
      authSignature
    );
    
    // 4. Sign and submit transaction (on-chain)
    const transactionSignature = await signAndSubmitTransaction(
      apiResponse.transaction
    );
    
    console.log('Tokens bought! Transaction:', transactionSignature);
    
    // 5. Update transaction record (optional)
    await callAPI(
      `/api/transactions/${apiResponse.pendingTransactionId}/update-signature`,
      'POST',
      { transactionSignature },
      walletAddress,
      authSignature
    );
    
    return transactionSignature;
  } catch (error) {
    console.error('Error buying token:', error);
    throw error;
  }
}
```

## Complete Example: Sell Token

```typescript
async function sellToken(tokenMint: string, percentage: number) {
  try {
    // 1. Connect wallet
    const response = await window.solana.connect();
    const walletAddress = response.publicKey.toString();
    
    // 2. Sign authentication message (off-chain)
    const authSignature = await signAuthMessage(walletAddress);
    
    // 3. Call API to prepare sell transaction
    const apiResponse = await callAPI(
      '/api/tokens/sell',
      'POST',
      {
        tokenMint,
        percentage, // 1-100
      },
      walletAddress,
      authSignature
    );
    
    // 4. Sign and submit transaction (on-chain)
    const transactionSignature = await signAndSubmitTransaction(
      apiResponse.transaction
    );
    
    console.log('Tokens sold! Transaction:', transactionSignature);
    
    // 5. Update transaction record (optional)
    await callAPI(
      `/api/transactions/${apiResponse.pendingTransactionId}/update-signature`,
      'POST',
      { transactionSignature },
      walletAddress,
      authSignature
    );
    
    return transactionSignature;
  } catch (error) {
    console.error('Error selling token:', error);
    throw error;
  }
}
```

## React Hook Example

Here's a React hook for easy integration:

```typescript
import { useState, useCallback } from 'react';
import { Connection, Transaction, PublicKey } from '@solana/web3.js';

const API_BASE_URL = 'http://localhost:3000';
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

export function useOnlyPumpAPI() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (!window.solana || !window.solana.isPhantom) {
      throw new Error('Phantom wallet not found');
    }

    setIsConnecting(true);
    try {
      const response = await window.solana.connect();
      const address = response.publicKey.toString();
      setWalletAddress(address);
      return address;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Sign authentication message
  const signAuthMessage = useCallback(async (address: string): Promise<string> => {
    const message = `Sign this message to authenticate with OnlyPump API.\n\nWallet: ${address}\n\nThis signature proves you own this wallet and allows you to interact with the API.`;
    const messageBytes = new TextEncoder().encode(message);
    const signedMessage = await window.solana.signMessage(messageBytes, 'utf8');
    return Buffer.from(signedMessage.signature).toString('base64');
  }, []);

  // Make authenticated API call
  const apiCall = useCallback(async (
    endpoint: string,
    method: 'GET' | 'POST',
    body?: any
  ) => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    const signature = await signAuthMessage(walletAddress);
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-request-signature': signature,
        'x-wallet-address': walletAddress,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }, [walletAddress, signAuthMessage]);

  // Sign and submit transaction
  const signAndSubmit = useCallback(async (
    serializedTransactionBase64: string
  ): Promise<string> => {
    const transactionBuffer = Buffer.from(serializedTransactionBase64, 'base64');
    const transaction = Transaction.from(transactionBuffer);
    const signedTransaction = await window.solana.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(
      signedTransaction.serialize(),
      { skipPreflight: false, maxRetries: 3 }
    );
    await connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }, []);

  // Create token
  const createToken = useCallback(async (tokenData: {
    name: string;
    symbol: string;
    uri: string;
    description?: string;
    socials?: { [key: string]: string };
  }) => {
    const apiResponse = await apiCall('/api/tokens/create', 'POST', tokenData);
    const txSignature = await signAndSubmit(apiResponse.transaction);
    
    // Update transaction record
    await apiCall(
      `/api/transactions/${apiResponse.pendingTransactionId}/update-signature`,
      'POST',
      { transactionSignature: txSignature }
    );
    
    return { ...apiResponse, transactionSignature: txSignature };
  }, [apiCall, signAndSubmit]);

  // Buy token
  const buyToken = useCallback(async (tokenMint: string, solAmount: number) => {
    const apiResponse = await apiCall('/api/tokens/buy', 'POST', {
      tokenMint,
      solAmount,
    });
    const txSignature = await signAndSubmit(apiResponse.transaction);
    
    await apiCall(
      `/api/transactions/${apiResponse.pendingTransactionId}/update-signature`,
      'POST',
      { transactionSignature: txSignature }
    );
    
    return txSignature;
  }, [apiCall, signAndSubmit]);

  // Sell token
  const sellToken = useCallback(async (tokenMint: string, percentage: number) => {
    const apiResponse = await apiCall('/api/tokens/sell', 'POST', {
      tokenMint,
      percentage,
    });
    const txSignature = await signAndSubmit(apiResponse.transaction);
    
    await apiCall(
      `/api/transactions/${apiResponse.pendingTransactionId}/update-signature`,
      'POST',
      { transactionSignature: txSignature }
    );
    
    return txSignature;
  }, [apiCall, signAndSubmit]);

  return {
    walletAddress,
    isConnecting,
    connectWallet,
    createToken,
    buyToken,
    sellToken,
  };
}
```

## Usage in React Component

```typescript
import React from 'react';
import { useOnlyPumpAPI } from './hooks/useOnlyPumpAPI';

function TokenCreator() {
  const { walletAddress, connectWallet, createToken } = useOnlyPumpAPI();
  const [loading, setLoading] = React.useState(false);

  const handleCreate = async () => {
    if (!walletAddress) {
      await connectWallet();
      return;
    }

    setLoading(true);
    try {
      const result = await createToken({
        name: 'My Token',
        symbol: 'MTK',
        uri: 'https://example.com/metadata.json',
      });
      alert(`Token created! Mint: ${result.tokenMint}`);
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {walletAddress ? (
        <button onClick={handleCreate} disabled={loading}>
          {loading ? 'Creating...' : 'Create Token'}
        </button>
      ) : (
        <button onClick={handleCreate}>Connect Wallet</button>
      )}
    </div>
  );
}
```

## Key Points

1. **Two Signatures Required**:
   - **Off-chain signature** (`x-request-signature`): Proves wallet ownership for API access
   - **On-chain signature**: Signs the actual blockchain transaction

2. **Message Format**: The authentication message must match exactly:
   ```
   Sign this message to authenticate with OnlyPump API.

   Wallet: {wallet_address}

   This signature proves you own this wallet and allows you to interact with the API.
   ```

3. **Transaction Flow**:
   - API returns a **serialized transaction** (base64)
   - Frontend **deserializes** it
   - Phantom **signs** the transaction
   - Frontend **submits** to blockchain

4. **Error Handling**: Always handle wallet rejections gracefully:
   ```typescript
   try {
     await window.solana.signMessage(...);
   } catch (error) {
     if (error.code === 4001) {
       // User rejected the signature request
       console.log('User rejected signature');
     }
   }
   ```

## Testing

For testing without a frontend, use the provided script:

```bash
yarn generate-signature
```

This generates the `x-request-signature` header for Postman/curl testing.

