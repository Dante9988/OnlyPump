## OnlyPump Frontend Integration Guide

This document explains how a frontend (or other client) should integrate with the OnlyPump backend for:

- Off-chain authentication (`x-request-signature`)
- Creating a token and buying at launch
- Buying an existing token
- Selling an existing token
- Submitting user-signed transactions (with optional Jito acceleration)

The flows described here match the working Node test scripts:
- `scripts/test-create-and-buy.js`
- `scripts/test-buy.js`
- `scripts/test-sell.js`
- `scripts/test-buy-and-sell.js`

---

## 1. Off-chain Authentication (`x-request-signature`)

All protected endpoints require an `x-request-signature` header.  
The backend verifies this using the connected wallet’s private key (ed25519 / Solana).

### 1.1 Message Format

The message **must match exactly**:

```text
Sign this message to authenticate with OnlyPump API.

Wallet: {WALLET_ADDRESS}

This signature proves you own this wallet and allows you to interact with the API.
```

Where:
- `{WALLET_ADDRESS}` = base58 Solana public key of the user’s wallet (e.g. Phantom).

### 1.2 How to Generate `x-request-signature`

On the client (browser) using a Solana wallet adapter:

```ts
import { PublicKey } from '@solana/web3.js';

async function generateAuthSignature(walletPublicKey: PublicKey, signMessage: (msg: Uint8Array) => Promise<Uint8Array>) {
  const walletAddress = walletPublicKey.toBase58();

  const message = `Sign this message to authenticate with OnlyPump API.\n\n` +
                  `Wallet: ${walletAddress}\n\n` +
                  `This signature proves you own this wallet and allows you to interact with the API.`;

  const messageBytes = new TextEncoder().encode(message);

  // Wallet signs the message using ed25519 (Solana-style message signing)
  const signature = await signMessage(messageBytes);

  // Backend expects base64-encoded signature string
  const signatureBase64 = Buffer.from(signature).toString('base64');

  return {
    walletAddress,
    authSignature: signatureBase64,
  };
}
```

Use this on **every** protected request:

```ts
const { walletAddress, authSignature } = await generateAuthSignature(
  wallet.publicKey,
  wallet.signMessage,
);

await fetch(`${API_URL}/api/tokens/...`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-request-signature': authSignature,
  },
  body: JSON.stringify({
    ...payload,
    walletAddress, // also included in body for middleware
  }),
});
```

> Note: The backend also expects the `walletAddress` in the **JSON body** for middleware usage.

---

## 2. High-level Transaction Flow

All token operations (create, buy, sell) follow the same pattern:

1. **Client → Backend**: Request a prepared transaction (create, buy, or sell).  
   - Backend returns a **base64-encoded Solana transaction** and a `pendingTransactionId`.
2. **Client**: Deserializes and signs the transaction with the user’s wallet.
3. **Client → Backend**: Sends the **signed transaction (base64)** back to `/submit-signed` with the same wallet and optional `useJito`.
4. **Backend**:
   - Verifies signatures and fee payer.
   - Submits the transaction directly or via Jito.
   - Returns the on-chain **transaction signature**.
5. **Client**: Optionally polls Solana RPC or builds explorer links for UX.

Endpoints:
- `POST /api/tokens/create-and-buy`
- `POST /api/tokens/buy`
- `POST /api/tokens/sell`
- `POST /api/tokens/:pendingTransactionId/submit-signed`

All use the same `x-request-signature` auth header and `walletAddress` in the body.

---

## 3. Create & Buy Flow (`/api/tokens/create-and-buy`)

### 3.1 Request

**Endpoint:**
- `POST /api/tokens/create-and-buy`

**Headers:**
- `Content-Type: application/json`
- `x-request-signature: <base64 signature generated as above>`

**Body (JSON):**

```json
{
  "name": "My Token",
  "symbol": "MYT",
  "uri": "https://example.com/metadata.json",
  "description": "My token description",
  "solAmount": 0.1,
  "walletAddress": "<WALLET_ADDRESS>",
  "speed": "FAST",              // optional, TransactionSpeed enum
  "slippageBps": 1000,          // optional, 1000 = 10%
  "useJito": false,             // optional, Jito acceleration for *submission* step
  "jitoTipLamports": 10000000   // optional, Jito tip
}
```

> In practice, `create-and-buy` currently uses Pump SDK with internal defaults; `useJito` is applied at the **submit-signed** step, not at creation.

### 3.2 Response

```json
{
  "transaction": "<BASE64_SERIALIZED_TRANSACTION>",
  "pendingTransactionId": "pending-...",
  "tokenMint": "<NEW_TOKEN_MINT>",
  "vanityAddress": "<OPTIONAL_VANITY_ADDRESS>",
  "type": "CREATE_AND_BUY"
}
```

### 3.3 Client: Sign the Transaction

```ts
import { Transaction } from '@solana/web3.js';

const txBuffer = Buffer.from(response.transaction, 'base64');
const transaction = Transaction.from(txBuffer);

// Let the user sign with Phantom / wallet adapter
const signedTx = await wallet.signTransaction(transaction);

const signedTxBase64 = Buffer.from(signedTx.serialize({
  requireAllSignatures: false,
  verifySignatures: false,
})).toString('base64');
```

### 3.4 Submit Signed Transaction

**Endpoint:**
- `POST /api/tokens/:pendingTransactionId/submit-signed`

**Headers:**
- `Content-Type: application/json`
- `x-request-signature: <same authSignature used above>`

**Body:**

```json
{
  "signedTransaction": "<BASE64_SIGNED_TRANSACTION>",
  "walletAddress": "<WALLET_ADDRESS>",
  "useJito": false
}
```

### 3.5 Response

```json
{
  "transactionSignature": "<ON_CHAIN_TX_SIGNATURE>",
  "status": "submitted",
  "pendingTransactionId": "pending-..."
}
```

The client can show a link like:

```ts
const url = `https://solscan.io/tx/${transactionSignature}?cluster=devnet`;
```

---

## 4. Buy Existing Token (`/api/tokens/buy`)

### 4.1 Request

**Endpoint:**
- `POST /api/tokens/buy`

**Headers:**
- `Content-Type: application/json`
- `x-request-signature: <authSignature>`

**Body:**

```json
{
  "tokenMint": "<EXISTING_TOKEN_MINT>",
  "solAmount": 0.5,
  "walletAddress": "<WALLET_ADDRESS>",
  "speed": "FAST",        // optional
  "slippageBps": 500,     // optional, 500 = 5% (currently backend uses a fixed 5% for buys)
  "useJito": false,       // optional (used at submit stage)
  "jitoTipLamports": 10000000
}
```

### 4.2 Response

Same shape as `create-and-buy`:

```json
{
  "transaction": "<BASE64_SERIALIZED_TRANSACTION>",
  "pendingTransactionId": "pending-...",
  "tokenMint": "<MINT>",
  "type": "BUY",
  "solAmount": 0.5,
  "tokenAmount": 123456789
}
```

### 4.3 Sign & Submit

Same as in the create-and-buy flow:
- Deserialize → sign with wallet → base64 encode → POST to:
  - `POST /api/tokens/:pendingTransactionId/submit-signed`
  - Body: `{ signedTransaction, walletAddress, useJito }`

---

## 5. Sell Tokens (`/api/tokens/sell`)

The backend supports both:
- Non-migrated tokens (on Pump.fun bonding curve)
- Migrated tokens (on PumpSwap AMM)

For non-migrated tokens, the backend:
- Computes your SPL token balance.
- Uses the **requested percentage (1–100%) as-is** to compute the sell amount.
- Uses Pump.fun SDK for pricing and slippage. If the trade is too large for current liquidity, the on-chain program may still return `TooLittleSolReceived`.

### 5.1 Request

**Endpoint:**
- `POST /api/tokens/sell`

**Headers:**
- `Content-Type: application/json`
- `x-request-signature: <authSignature>`

**Body:**

```json
{
  "tokenMint": "<TOKEN_MINT>",
  "percentage": 100,
  "walletAddress": "<WALLET_ADDRESS>",
  "speed": "FAST",        // optional
  "slippageBps": 1000,    // optional, 1000 = 10% (backend clamps 0–10000)
  "useJito": false,       // optional (used at submit stage)
  "jitoTipLamports": 10000000
}
```

> Note: `percentage` is honored as requested (1–100). Large sells on illiquid tokens can still fail with `TooLittleSolReceived` from the Pump program; frontends may choose to offer a UI that suggests smaller chunks (e.g. 25–50%) for better execution.

### 5.2 Response

```json
{
  "transaction": "<BASE64_SERIALIZED_TRANSACTION>",
  "pendingTransactionId": "pending-...",
  "tokenMint": "<MINT>",
  "type": "SELL"
}
```

### 5.3 Sign & Submit

Same as other flows:

```ts
// Deserialize & sign
const txBuffer = Buffer.from(response.transaction, 'base64');
const transaction = Transaction.from(txBuffer);
const signedTx = await wallet.signTransaction(transaction);
const signedTxBase64 = Buffer.from(signedTx.serialize({
  requireAllSignatures: false,
  verifySignatures: false,
})).toString('base64');

// Submit
await fetch(`${API_URL}/api/tokens/${pendingTransactionId}/submit-signed`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-request-signature': authSignature,
  },
  body: JSON.stringify({
    signedTransaction: signedTxBase64,
    walletAddress,
    useJito, // optional
  }),
});
```

---

## 6. Jito Acceleration (Optional)

If `useJito: true` is passed in the **submit-signed** body:

- Backend:
  - Converts the legacy `Transaction` to a `VersionedTransaction` while preserving signatures.
  - Builds a separate Jito tip transaction using a backend keypair.
  - Bundles tip + user tx and sends via `jito-js-rpc` (`JitoJsonRpcClient`).
  - Falls back to regular `sendRawTransaction` if Jito fails.

**Client responsibilities:**
- Just set `useJito: true` on the `submit-signed` call if you want acceleration.
- No change is needed to signing logic; you always sign the same legacy transaction the backend prepared.

---

## 7. Summary for Frontend Implementation

- **Always**:
  - Generate a fresh `x-request-signature` with the exact message format.
  - Include `walletAddress` in the **body** as well as signing the header.
- **Flow per operation**:
  1. `POST /api/tokens/[create-and-buy | buy | sell]` with `x-request-signature` + JSON body.
  2. Receive `{ transaction, pendingTransactionId, tokenMint, ... }`.
  3. Deserialize transaction, sign with connected wallet, base64 encode.
  4. `POST /api/tokens/:pendingTransactionId/submit-signed` with `{ signedTransaction, walletAddress, useJito }`.
  5. Use returned `transactionSignature` for explorer links / confirmations.
- **Slippage**:
  - `slippageBps` is in **basis points** (100 = 1%, 1000 = 10%).
  - Backend currently:
    - Uses ~5% fixed for buys.
    - Allows up to 100% for sells and converts to the Pump SDK’s percent format.
- **Sell safety**:
  - Backend clamps each sell tx to at most 10% of your token balance to avoid `TooLittleSolReceived`.
  - Frontend can call the sell flow multiple times if it truly needs to exit 100%.

This document should be enough for a frontend-focused client or another AI agent to integrate OnlyPump’s backend safely and correctly. 


