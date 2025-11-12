# NestJS Backend API Documentation

This document covers the NestJS backend API for OnlyPump, which provides a self-custody interface for interacting with Pump.fun token operations on Solana.

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Services](#services)
- [Running the Application](#running-the-application)
- [Testing](#testing)

## Overview

The NestJS backend provides RESTful APIs for:
- **Token Management**: Create, buy, and sell tokens on Pump.fun
- **Transaction History**: Track and query user transactions
- **Wallet Authentication**: Self-custody authentication using wallet signatures

All token operations return serialized transactions that must be signed by the user's wallet on the frontend before being sent to the Solana blockchain.

## Project Structure

```
src/
├── api/
│   ├── controllers/          # API route handlers
│   │   ├── token-management.controller.ts
│   │   └── transaction-history.controller.ts
│   ├── dto/                  # Data Transfer Objects
│   │   ├── token.dto.ts
│   │   └── transaction.dto.ts
│   ├── filters/              # Exception filters
│   ├── middleware/           # Request middleware
│   │   └── wallet.middleware.ts
│   └── swagger.config.ts     # Swagger/OpenAPI setup
├── services/                 # Business logic
│   ├── token-management.service.ts
│   ├── transaction-history.service.ts
│   ├── wallet-auth.service.ts
│   └── vanity-address-manager.service.ts
├── common/                   # Shared resources
│   └── live_fan_addresses.json  # Vanity addresses for token creation
├── app.module.ts            # Root module
└── main.ts                  # Application entry point
```

## Getting Started

### Prerequisites

- Node.js 18+ and Yarn
- Solana CLI (optional, for local development)
- Access to Solana RPC endpoint (devnet or mainnet)

### Installation

```bash
# Install dependencies
yarn install

# Copy environment file
cp env.example .env

# Edit .env with your configuration
```

### Build

```bash
# Build for production
yarn build

# Development mode (watch)
yarn start:dev
```

## Environment Variables

Create a `.env` file in the root directory:

```env
# Solana RPC URL (defaults to devnet)
SOLANA_RPC_URL=https://api.devnet.solana.com

# Server port (defaults to 3000)
PORT=3000

# Optional: Wallet private key for backend operations
WALLET_PRIVATE_KEY=your_private_key_here
```

### RPC URLs

- **Devnet**: `https://api.devnet.solana.com`
- **Mainnet**: Use a high-performance RPC provider (e.g., Helius, QuickNode)

## API Endpoints

Base URL: `http://localhost:3000`

### Swagger Documentation

Once the server is running, visit:
- **Swagger UI**: `http://localhost:3000/api/docs`

### Token Management

#### Create Token
```http
POST /api/tokens/create
Headers:
  x-request-signature: <base64_signature>
Body:
  {
    "name": "My Token",
    "symbol": "MTK",
    "uri": "https://example.com/metadata.json",
    "description": "Token description",
    "socials": {
      "twitter": "https://twitter.com/mytoken"
    }
  }
```

**Response:**
```json
{
  "transaction": "base64_serialized_transaction",
  "tokenMint": "mint_address",
  "vanityAddress": "vanity_address_used",
  "type": "CREATE"
}
```

#### Buy Token
```http
POST /api/tokens/buy
Headers:
  x-request-signature: <base64_signature>
Body:
  {
    "tokenMint": "token_mint_address",
    "solAmount": 0.1
  }
```

**Response:**
```json
{
  "transaction": "base64_serialized_transaction",
  "pendingTransactionId": "pending_id",
  "tokenMint": "token_mint_address",
  "type": "BUY",
  "solAmount": 0.1
}
```

#### Sell Token
```http
POST /api/tokens/sell
Headers:
  x-request-signature: <base64_signature>
Body:
  {
    "tokenMint": "token_mint_address",
    "percentage": 50
  }
```

**Response:**
```json
{
  "transaction": "base64_serialized_transaction",
  "pendingTransactionId": "pending_id",
  "tokenMint": "token_mint_address",
  "type": "SELL"
}
```

#### Create and Buy Token
```http
POST /api/tokens/create-and-buy
Headers:
  x-request-signature: <base64_signature>
Body:
  {
    "name": "My Token",
    "symbol": "MTK",
    "uri": "https://example.com/metadata.json",
    "solAmount": 0.1
  }
```

### Transaction History

#### Get Transaction History
```http
GET /api/transactions/:walletAddress?type=BUY&limit=10
Headers:
  x-request-signature: <base64_signature>
```

**Query Parameters:**
- `type` (optional): Filter by transaction type (`BUY`, `SELL`, `CREATE`, `CREATE_AND_BUY`)
- `limit` (optional): Limit number of results

**Response:**
```json
[
  {
    "id": "transaction_signature",
    "walletAddress": "wallet_address",
    "transactionSignature": "signature",
    "type": "BUY",
    "tokenMint": "token_mint",
    "solAmount": 0.1,
    "timestamp": "2024-01-01T00:00:00.000Z",
    "status": "confirmed"
  }
]
```

#### Get Transaction Statistics
```http
GET /api/transactions/:walletAddress/stats
Headers:
  x-request-signature: <base64_signature>
```

**Response:**
```json
{
  "totalTransactions": 10,
  "buyCount": 5,
  "sellCount": 3,
  "totalSolSpent": 1.5,
  "totalSolReceived": 0.8
}
```

#### Get Specific Transaction
```http
GET /api/transactions/tx/:signature
```

**Note:** This endpoint is public and does not require authentication.

## Authentication

The API uses wallet signature-based authentication. Users must sign a message with their wallet's private key to authenticate requests.

### Authentication Flow

1. **Frontend**: User connects wallet (e.g., Phantom)
2. **Frontend**: Signs authentication message with wallet
3. **Frontend**: Sends request with signature in `x-request-signature` header
4. **Backend**: Verifies signature matches wallet address

### Message Format

The message to sign is:
```
Sign this message to authenticate with OnlyPump API.

Wallet: {wallet_address}

This signature proves you own this wallet and allows you to interact with the API.
```

### Generating Signatures

Use the provided script to generate test signatures:

```bash
yarn generate-signature
```

Or with your private key:
```bash
SOLANA_PRIVATE_KEY=your_private_key yarn generate-signature
```

The script outputs:
- Wallet address
- Base64 signature for `x-request-signature` header

### Example Request

```bash
curl -X GET http://localhost:3000/api/transactions/WALLET_ADDRESS \
  -H "Content-Type: application/json" \
  -H "x-request-signature: BASE64_SIGNATURE"
```

### Route Parameters

For transaction endpoints, the wallet address is included in the route:
- `/api/transactions/:walletAddress`
- `/api/transactions/:walletAddress/stats`

The middleware verifies that the signature matches the wallet address in the route.

## Services

### TokenManagementService

Handles all Pump.fun token operations:
- `createToken()`: Create a new token
- `buyToken()`: Buy tokens from bonding curve
- `sellToken()`: Sell tokens to bonding curve
- `createAndBuyToken()`: Create and buy in one transaction

**Key Features:**
- Uses vanity addresses from `src/common/live_fan_addresses.json` for token creation
- Returns serialized transactions ready for frontend signing
- Integrates with Pump.fun SDK (`@pump-fun/pump-sdk`)

### TransactionHistoryService

Tracks and manages transaction history:
- `recordTransaction()`: Record a new transaction
- `getWalletTransactions()`: Get transactions for a wallet
- `getWalletStats()`: Get wallet statistics
- `updateTransactionSignature()`: Update pending transaction with on-chain signature

**Note:** Currently uses in-memory storage. For production, implement database persistence.

### WalletAuthService

Handles wallet signature verification:
- `verifySignature()`: Verify ed25519 signature
- `createSignMessage()`: Generate standard authentication message

### VanityAddressManagerService

Manages vanity addresses for token creation:
- Loads addresses from `src/common/live_fan_addresses.json`
- Tracks used addresses
- Provides available addresses for token creation

## Running the Application

### Development

```bash
# Start in watch mode
yarn start:dev

# Start with debug
yarn start:debug
```

The server will start on `http://localhost:3000` (or port specified in `.env`).

### Production

```bash
# Build
yarn build

# Start production server
yarn start:prod
```

### Health Check

The application exposes Swagger documentation at:
- `http://localhost:3000/api/docs`

## Testing

### Generate Test Signature

```bash
yarn generate-signature
```

This will:
1. Prompt for private key (or use `SOLANA_PRIVATE_KEY` env var)
2. Generate signature for authentication
3. Display curl examples for testing

### Example Test Flow

1. **Generate signature:**
   ```bash
   yarn generate-signature
   ```

2. **Get transaction history:**
   ```bash
   curl -X GET "http://localhost:3000/api/transactions/YOUR_WALLET_ADDRESS" \
     -H "x-request-signature: YOUR_SIGNATURE"
   ```

3. **Create a token:**
   ```bash
   curl -X POST "http://localhost:3000/api/tokens/create" \
     -H "Content-Type: application/json" \
     -H "x-request-signature: YOUR_SIGNATURE" \
     -d '{
       "name": "Test Token",
       "symbol": "TEST",
       "uri": "https://example.com/metadata.json"
     }'
   ```

### Postman Collection

Import the API endpoints into Postman:
1. Base URL: `http://localhost:3000`
2. Add header: `x-request-signature` with generated signature
3. Use wallet address in route parameters for transaction endpoints

## Architecture

### Middleware

**WalletMiddleware**: Applied to protected routes
- Extracts `x-request-signature` header
- Extracts wallet address from route params, body, or query
- Verifies signature matches wallet address
- Attaches verified wallet info to request

### Controllers

- **TokenManagementController**: Handles token operations
- **TransactionHistoryController**: Handles transaction queries

### DTOs

Data Transfer Objects for request/response validation:
- `CreateTokenDto`, `BuyTokenDto`, `SellTokenDto`
- `TransactionResponseDto`, `TransactionRecordDto`, `WalletStatsDto`

## Notes

- **Devnet vs Mainnet**: Configure via `SOLANA_RPC_URL` environment variable
- **Vanity Addresses**: Only used for token creation, loaded from JSON file
- **Transaction Serialization**: All transactions are returned as base64 strings for frontend signing
- **Self-Custody**: Users always sign transactions with their own wallet - backend never holds private keys

## Troubleshooting

### Signature Verification Fails

- Ensure you're using the correct wallet address
- Regenerate signature (signatures don't expire, but verify the message format)
- Check that the wallet address in the route matches the signed message

### Transaction Creation Fails

- Verify RPC endpoint is accessible
- Check that vanity addresses are available in `src/common/live_fan_addresses.json`
- Ensure Pump.fun program is deployed on the target network

### Port Already in Use

Change the port in `.env`:
```env
PORT=3001
```

