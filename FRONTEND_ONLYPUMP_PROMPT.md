# OnlyPump Frontend – Cursor AI Prompt (Wire UI ↔ Backend)

Use this as the system prompt / task brief for implementing the OnlyPump **frontend** that integrates with the existing OnlyPump **NestJS backend**.

## Goal

Build a frontend that:
- Authenticates API calls using the backend’s `x-request-signature` scheme.
- Consumes backend endpoints that return **unsigned** (or partially signed) Solana transactions (base64).
- Signs and sends those transactions using the user’s wallet (Phantom / Solana Wallet Adapter).
- Implements the presale lifecycle UX: create → contribute (VIP/public) → vote → launch bundle → (later) claim/refund.

## Non-negotiable rules

- **Never send private keys to the backend.**
- **All Solana transactions are signed client-side** using the connected wallet.
- Treat any backend `transaction` field as a **base64 serialized transaction** that must be deserialized, wallet-signed, and broadcast by the client.
- Some returned txs may already be **partially signed** by the backend (e.g., Pump.fun mint keypair). The frontend must sign in a way that **preserves existing signatures** (Wallet Adapter `signTransaction` is fine; avoid using `.sign()` with a Keypair on the same tx in the browser).

## Environment / Config

- **Backend base URL**: `NEXT_PUBLIC_API_URL` (e.g. `https://<railway-app>.up.railway.app`)
- **Solana cluster**: devnet for now
- **RPC**: `NEXT_PUBLIC_SOLANA_RPC_URL` (devnet RPC)

## Auth: `x-request-signature` header (critical)

Protected routes require a header named `x-request-signature` whose value is a JSON string.

### Canonical message format

The backend verifies a detached Ed25519 signature over a canonical message:

```
method:<METHOD_UPPER>|path:<PATH>|timestamp:<TIMESTAMP_MS>|nonce:<NONCE>|bodyHash:<SHA256_HEX>
```

Where:
- `path` must match exactly (e.g. `/api/presale/<mint>/contribute`)
- `timestamp` is `Date.now()` (milliseconds)
- `nonce` is any unique string (recommend `<timestamp>-<random>`)
- `bodyHash` is SHA-256 hex of the raw JSON string of the request body (or `''` for empty body)

### Header JSON payload

Send the header value as JSON-stringified object:

```json
{
  "wallet": "<walletBase58>",
  "signature": "<base64SignatureBytes>",
  "timestamp": 1730000000000,
  "nonce": "1730000000000-abc123",
  "method": "POST",
  "path": "/api/presale/<mint>/contribute",
  "bodyHash": "<sha256hex>"
}
```

### Signing in browser

Use wallet adapter `signMessage(Uint8Array)` to sign `canonicalMessage` bytes.
The returned signature bytes must be base64-encoded into `signature`.

## Tx handling: how to sign and send backend-built txs

Backend responds with base64-serialized Solana **legacy** transactions.

Client flow:
1. `const tx = Transaction.from(Buffer.from(base64, 'base64'))`
2. `const signedTx = await wallet.signTransaction(tx)`
3. `const sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false, maxRetries: 3 })`
4. `await connection.confirmTransaction({ signature: sig, ...await connection.getLatestBlockhash() })`

Show a Solscan link: `https://solscan.io/tx/<sig>?cluster=devnet`

## Presale endpoints to integrate (current)

### Read

- `POST /api/presale/pricing/preview`
- `GET /api/presale/:mint`
- `GET /api/presale/:mint/position/:user`
- `GET /api/presale/:mint/whitelist/:user`
- `GET /api/presale/:mint/bonding-curve`
  - Returns Pump.fun bonding curve status and `solToCompleteLamports` (display as SOL).

### Write (requires `x-request-signature`)

#### Create presale

- `POST /api/presale`
  - Returns `{ transaction, presale, publicSolVault, ... }`
  - Frontend signs+sends the returned tx.

#### VIP whitelist (admin/creator-only; devnet flow)

- `POST /api/presale/:mint/whitelist`
  - Returns `{ transaction, presale, whitelist }`
  - Sign+send.

#### Contribute (VIP or public)

- `POST /api/presale/:mint/contribute`
  - Body: `{ amountLamports: number }`
  - Returns `{ transaction, presale, userPosition }`
  - Sign+send.
  - VIP users are whitelisted; public users are not.

#### Finalize + vote flow

- `POST /api/presale/:mint/finalize` → returns tx
- `POST /api/presale/:mint/start-vote` → body `{ votingEndsTs: number }` → returns tx
- `POST /api/presale/:mint/cast-vote` → body `{ supportLaunch: boolean }` → returns tx
- `POST /api/presale/:mint/resolve-vote` OR `POST /api/presale/:mint/finalize-vote` (depends on backend route naming)
  - The e2e uses `/finalize-vote`.

#### Launch bundle (creator-only)

- `POST /api/presale/:mint/launch`
  - Returns multiple base64 txs:
    - `withdrawTransaction`
    - `createAndBuyTransaction`
    - `initializeVaultsTransaction`
    - `fundPresaleTransaction`
  - The frontend must sign+send **in order**, waiting for confirmation between each:
    1) withdraw SOL from presale vault → creator wallet
    2) create+buy Pump.fun token (partially signed by backend for mint)
    3) initialize presale vaults
    4) transfer 50% of bought tokens to presale `token_vault`

#### Claim (future UX)

- `POST /api/presale/:mint/claim`
  - Backend should return an unsigned claim tx for the caller wallet (if enabled).
  - UX: create/get user ATA, then claim, then refresh user position.

#### Creator rewards

- `POST /api/presale/claim-creator-rewards`
  - Returns a tx that transfers 50% to the platform fee vault.

## UI / UX requirements (high-level)

- **Wallet connect** (Solana Wallet Adapter)
- **Network indicator** (devnet)
- **Presale dashboard**:
  - Presale state (phase, outcome, vault balances)
  - Bonding curve status (complete? SOL to complete)
  - User position (contribution lamports, tokens allocated/claimed)
- **Contribute**:
  - Input SOL amount; show expected tokens allocated using backend pricing (and/or the deterministic formula)
  - Handle VIP vs public path (whitelist status)
- **Vote**:
  - Show countdown to voting end; disable vote after end; expose “Resolve” CTA for anyone if allowed by backend
- **Creator launch screen**:
  - One “Launch” button that executes the 4 returned txs sequentially with progress UI and tx links

## Notes for the implementer AI

- Follow the backend contract exactly:
  - Auth header path must match route string exactly.
  - Always compute `bodyHash` from the exact JSON string you send.
- Use robust error surfaces:
  - Backend returns 400s for user errors; show the `message`.
- Do not assume `claim_tokens` is available until migration/claim gates are finalized; implement UI but feature-flag it.


