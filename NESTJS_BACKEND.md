# NestJS Backend API Documentation

This document covers the NestJS backend API for OnlyPump, which provides a self-custody interface for interacting with Pump.fun token operations on Solana.

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Devnet Testing](#devnet-testing)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Services](#services)
- [Running the Application](#running-the-application)
- [Testing](#testing)

## Overview

The NestJS backend provides RESTful APIs for:
- **Token Management**: Create, buy, and sell tokens on Pump.fun and PumpSwap (Raydium)
- **Transaction History**: Track and query user transactions
- **Wallet Authentication**: Self-custody authentication using wallet signatures
- **Jito Integration**: MEV-protected transactions with priority fee support
- **Transaction Speed Control**: Configure transaction priority (NORMAL, FAST, TURBO)

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
│   ├── vanity-address-manager.service.ts
│   ├── jito.service.ts
│   ├── encryption.service.ts
│   ├── vanity-address.service.ts
│   ├── simple-vanity-address.service.ts
│   └── advanced-vanity-address.service.ts
├── interfaces/               # TypeScript interfaces
│   ├── pump-fun.interface.ts
│   └── wallet.interface.ts
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

# Jito Configuration (for MEV-protected transactions)
JITO_ENDPOINT=https://mainnet.block-engine.jito.wtf/api/v1
JITO_UUID=your_jito_uuid_here

# Transaction Priority Fees (in microlamports per compute unit)
PRIORITY_FEE_NORMAL=10000
PRIORITY_FEE_FAST=50000
PRIORITY_FEE_TURBO=100000
```

### RPC URLs

- **Devnet**: `https://api.devnet.solana.com`
- **Mainnet**: Use a high-performance RPC provider (e.g., Helius, QuickNode)

### Program IDs

**Important:** Pump.fun and PumpSwap use the **same program IDs** on both Devnet and Mainnet:

- **Pump.fun**: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
- **PumpSwap**: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`

The SDKs automatically detect the network based on your RPC URL. No additional configuration needed.

## Devnet Testing

Before implementing authentication features, test all endpoints on devnet. See [DEVNET_TESTING.md](./DEVNET_TESTING.md) for a complete guide.

### Quick Verification

Run the verification script to check your devnet setup:

```bash
yarn verify-devnet
```

This will:
- Verify RPC connection
- Test Pump.fun SDK connectivity
- Test PumpSwap SDK connectivity
- Confirm program IDs are correct
- Check program deployment status

### Getting Devnet SOL

Request devnet SOL from:
- **Web**: https://faucet.solana.com/
- **CLI**: `solana airdrop 2 YOUR_ADDRESS --url devnet`

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
    "solAmount": 0.1,
    "slippageBps": 500,
    "speed": "fast"
  }
```

**Parameters:**
- `tokenMint` (required): Token mint address
- `solAmount` (required): Amount of SOL to spend
- `slippageBps` (optional): Slippage tolerance in basis points (default: 500 = 5%)
- `speed` (optional): Transaction speed - "normal", "fast", or "turbo" (default: "normal")

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

**Note:** This endpoint automatically detects if the token has migrated to PumpSwap (Raydium) and uses the appropriate SDK. Works for both:
- **Non-migrated tokens**: Uses Pump.fun bonding curve
- **Migrated tokens**: Uses PumpSwap AMM

#### Sell Token
```http
POST /api/tokens/sell
Headers:
  x-request-signature: <base64_signature>
Body:
  {
    "tokenMint": "token_mint_address",
    "percentage": 50,
    "slippageBps": 500,
    "speed": "fast"
  }
```

**Parameters:**
- `tokenMint` (required): Token mint address
- `percentage` (required): Percentage of tokens to sell (1-100)
- `slippageBps` (optional): Slippage tolerance in basis points (default: 500 = 5%)
- `speed` (optional): Transaction speed - "normal", "fast", or "turbo" (default: "normal")

**Response:**
```json
{
  "transaction": "base64_serialized_transaction",
  "pendingTransactionId": "pending_id",
  "tokenMint": "token_mint_address",
  "type": "SELL"
}
```

**Note:** This endpoint automatically detects if the token has migrated to PumpSwap (Raydium) and uses the appropriate SDK. Works for both:
- **Non-migrated tokens**: Uses Pump.fun bonding curve
- **Migrated tokens**: Uses PumpSwap AMM

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

The API uses a **two-step authentication process**:

1. **Off-chain Authentication** (API Access): User signs a message with their wallet to prove ownership
2. **On-chain Transaction Signing** (Blockchain): User signs the actual transaction returned by the API

### Authentication Flow

#### Step 1: Off-chain Authentication (API Access)

1. **Frontend**: User connects wallet (e.g., Phantom)
2. **Frontend**: Signs authentication message with wallet using `signMessage()` (off-chain, no blockchain transaction)
3. **Frontend**: Sends request with signature in `x-request-signature` header
4. **Backend**: Verifies signature matches wallet address

#### Step 2: On-chain Transaction Signing

1. **Backend**: Returns serialized transaction (base64 encoded)
2. **Frontend**: Deserializes transaction
3. **Frontend**: Signs transaction with Phantom using `signTransaction()` (on-chain)
4. **Frontend**: Submits signed transaction to blockchain

### Message Format for Off-chain Authentication

The message to sign for API authentication is:
```
Sign this message to authenticate with OnlyPump API.

Wallet: {wallet_address}

This signature proves you own this wallet and allows you to interact with the API.
```

**Important**: This is an off-chain signature (message signing), not a blockchain transaction. It only proves wallet ownership for API access.

### Frontend Integration

For complete frontend integration examples, see [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md).

### Generating Signatures for Testing

Use the provided script to generate test signatures for Postman/curl:

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
  -H "x-request-signature: BASE64_SIGNATURE" \
  -H "x-wallet-address: WALLET_ADDRESS"
```

### Route Parameters

For transaction endpoints, the wallet address is included in the route:
- `/api/transactions/:walletAddress`
- `/api/transactions/:walletAddress/stats`

The middleware verifies that the signature matches the wallet address in the route.

## Services

### TokenManagementService

Handles all Pump.fun and PumpSwap token operations:
- `createToken()`: Create a new token
- `buyToken()`: Buy tokens (automatically handles migrated and non-migrated tokens)
- `sellToken()`: Sell tokens (automatically handles migrated and non-migrated tokens)
- `createAndBuyToken()`: Create and buy in one transaction

**Key Features:**
- Uses vanity addresses from `src/common/live_fan_addresses.json` for token creation
- Returns serialized transactions ready for frontend signing
- Integrates with Pump.fun SDK (`@pump-fun/pump-sdk` v1.21.0) for bonding curve operations
- Integrates with PumpSwap SDK (`@pump-fun/pump-swap-sdk` v1.10.0) for migrated tokens on Raydium
- **Automatic migration detection**: Buy/sell endpoints automatically detect if a token has migrated and use the appropriate SDK
- **Priority fee support**: Configurable transaction speed (NORMAL, FAST, TURBO)
- **Slippage control**: Customizable slippage tolerance in basis points
- **Jito integration**: Optional MEV-protected transactions

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

### JitoService

Handles MEV-protected transaction submission via Jito:
- `getRandomTipAccount()`: Get a random Jito tip account for MEV protection
- `sendBundle()`: Submit transaction bundles with tip instructions
- `getTipInstruction()`: Create tip instructions for priority execution
- Integrates with `jito-js-rpc` for mainnet MEV protection

**Features:**
- Protects transactions from front-running and sandwich attacks
- Supports configurable tip amounts for priority execution
- Provides fallback to standard RPC if Jito unavailable

### EncryptionService

Handles secure data encryption and decryption:
- Encrypts sensitive data like private keys
- Supports secure key management
- Used for wallet and vanity address encryption

### VanityAddressService, SimpleVanityAddressService, AdvancedVanityAddressService

Multiple vanity address generation services:
- Generate custom vanity addresses with specific prefixes
- Support for parallel generation
- Configurable difficulty and patterns

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

### Testing Scripts

Several test scripts are available for testing token operations:

```bash
# Test buy functionality
yarn test-buy

# Test sell functionality
yarn test-sell

# Test both buy and sell operations
yarn test-buy-sell
```

These scripts test:
- Buying tokens on bonding curve
- Buying tokens on migrated pools (PumpSwap/Raydium)
- Selling tokens on bonding curve
- Selling tokens on migrated pools
- Transaction speed options
- Slippage configurations

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

## Transaction Speed and Priority Fees

The API supports three transaction speed levels:

### Speed Options

- **NORMAL** (default): Standard priority fee (~10,000 microlamports/CU)
- **FAST**: Higher priority fee (~50,000 microlamports/CU)
- **TURBO**: Maximum priority fee (~100,000 microlamports/CU)

### Slippage Configuration

Slippage is specified in basis points (bps):
- **100 bps** = 1%
- **500 bps** = 5% (default)
- **1000 bps** = 10%

Presets available:
- `SlippagePreset.LOW` = 100 bps (1%)
- `SlippagePreset.MEDIUM` = 500 bps (5%)
- `SlippagePreset.HIGH` = 1000 bps (10%)
- `SlippagePreset.VERY_HIGH` = 2000 bps (20%)

## MEV Protection with Jito

For mainnet operations, the service supports Jito integration to protect against MEV attacks:

1. Set `JITO_ENDPOINT` and `JITO_UUID` in environment variables
2. Transactions can be bundled with tip instructions
3. Protects against front-running and sandwich attacks
4. Ensures priority execution during high network congestion

## SDK Versions

Current SDK versions used:
- `@pump-fun/pump-sdk`: **1.21.0**
- `@pump-fun/pump-swap-sdk`: **1.10.0**
- `@solana/web3.js`: **1.95.5**
- `jito-js-rpc`: **0.2.2**

## Notes

- **Devnet vs Mainnet**: Configure via `SOLANA_RPC_URL` environment variable
- **Vanity Addresses**: Only used for token creation, loaded from JSON file
- **Transaction Serialization**: All transactions are returned as base64 strings for frontend signing
- **Self-Custody**: Users always sign transactions with their own wallet - backend never holds private keys
- **Automatic Migration Detection**: Buy/sell endpoints automatically detect migrated tokens and use appropriate SDK
- **Priority Fees**: Configurable via environment variables or per-request speed parameter
- **Jito Support**: Optional MEV protection for mainnet transactions

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

