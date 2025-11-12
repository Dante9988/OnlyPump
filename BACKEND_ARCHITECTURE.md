# Backend Architecture - Self-Custody Wallet Authentication

## Summary

This backend implements a **self-custody wallet authentication system** where:
- Users connect their wallets in the frontend (Phantom, Solflare, etc.)
- Users sign API requests with their wallet's private key
- Backend verifies signatures and builds transactions
- Backend returns serialized transactions to frontend
- Frontend signs transactions with user's wallet and sends to blockchain
- Backend tracks transaction history automatically

## Key Components

### 1. Wallet Authentication Service (`wallet-auth.service.ts`)
- Verifies ed25519 signatures from Solana wallets
- Parses `x-request-signature` header
- Generates nonces for replay attack prevention
- Creates signable messages for frontend

### 2. Wallet Middleware (`wallet.middleware.ts`)
- Intercepts requests to protected endpoints
- Verifies wallet signatures from headers
- Attaches verified wallet address to request object
- Throws `UnauthorizedException` if signature is invalid

### 3. Transaction History Service (`transaction-history.service.ts`)
- Tracks buy/sell transactions
- Stores transaction records in memory (use database in production)
- Verifies transactions on-chain
- Updates status (pending → confirmed/failed)
- Provides statistics (total spent/received, counts)

### 4. Updated Controllers
- **TokenManagementController**: Buy/sell endpoints with signature auth
- **TransactionHistoryController**: Get history, stats, and update transactions

## API Endpoints

### Protected Endpoints (Require `x-request-signature` header)

#### Buy Token
```
POST /api/tokens/buy
Headers: { 'x-request-signature': '{"wallet":"...","signature":"...","message":"..."}' }
Body: { tokenMint: string, solAmount: number }
Response: { transaction: string, pendingTransactionId: string, ... }
```

#### Sell Token
```
POST /api/tokens/sell
Headers: { 'x-request-signature': '{"wallet":"...","signature":"...","message":"..."}' }
Body: { tokenMint: string, percentage: number }
Response: { transaction: string, pendingTransactionId: string, ... }
```

#### Get Transaction History
```
GET /api/transactions?type=buy&limit=10
Headers: { 'x-request-signature': '...' }
Response: TransactionRecord[]
```

#### Get Transaction Statistics
```
GET /api/transactions/stats
Headers: { 'x-request-signature': '...' }
Response: { totalTransactions, buyCount, sellCount, totalSolSpent, totalSolReceived }
```

#### Update Transaction Signature
```
POST /api/transactions/:pendingId/update-signature
Body: { transactionSignature: string }
Response: TransactionRecord
```

## Frontend Integration Flow

1. **User connects wallet** → Frontend gets `publicKey`, `signMessage`, `signTransaction`
2. **User wants to buy token** → Frontend calls API
3. **Frontend signs auth message** → Creates `x-request-signature` header
4. **Backend verifies signature** → Builds transaction, returns serialized transaction
5. **Frontend deserializes transaction** → Signs with user's wallet
6. **Frontend sends to blockchain** → Gets transaction signature
7. **Frontend updates backend** → Calls `/api/transactions/:pendingId/update-signature`
8. **Backend tracks transaction** → Verifies on-chain, updates status

## Security Features

1. **Signature Verification**: All requests verified using ed25519
2. **Nonce/Timestamp**: Messages include nonce to prevent replay attacks
3. **Action-Specific**: Messages include action type for additional security
4. **Self-Custody**: Private keys never leave user's wallet
5. **Transaction Building**: Backend builds, frontend signs (no private key exposure)

## Dependencies Added

- `tweetnacl@^1.0.3` - For ed25519 signature verification

## Next Steps for Production

1. **Database**: Replace in-memory storage with Prisma/TypeORM
2. **Nonce Management**: Store used nonces to prevent replay attacks
3. **Rate Limiting**: Add rate limiting to prevent abuse
4. **Caching**: Cache transaction status checks
5. **Webhooks**: Add webhooks for transaction confirmations
6. **Error Handling**: Improve error messages and logging

## Files Created/Modified

### Created
- `src/services/wallet-auth.service.ts` - Signature verification
- `src/services/transaction-history.service.ts` - Transaction tracking
- `src/api/controllers/transaction-history.controller.ts` - History endpoints
- `src/api/dto/transaction.dto.ts` - Transaction DTOs
- `WALLET_AUTH_GUIDE.md` - Detailed integration guide

### Modified
- `src/api/middleware/wallet.middleware.ts` - Updated for signature verification
- `src/api/controllers/token-management.controller.ts` - Updated for signature auth
- `src/app.module.ts` - Added new services and controllers
- `package.json` - Added tweetnacl dependency

## Testing

To test the endpoints:

1. Install dependencies: `yarn install`
2. Start backend: `yarn start:dev`
3. Use Swagger UI: `http://localhost:3000/api/docs`
4. Test with Postman/curl using wallet signatures

See `WALLET_AUTH_GUIDE.md` for detailed frontend integration examples.

