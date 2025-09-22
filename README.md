# PumpFun Content Platform

A comprehensive platform for creating, buying, and selling tokens on Solana using Pump.fun and PumpSwap services.

## Features

- Create tokens on Pump.fun with customizable attributes (name, symbol, image, socials)
- Buy tokens on Pump.fun or PumpSwap (depending on migration status)
- Sell tokens with optimized transaction settings
- Monitor new token launches and migrations
- Accelerated transactions with Jito integration
- Modern React frontend with Solana wallet integration

## Project Structure

The project consists of two main parts:

1. **Backend API**: A NestJS application that provides endpoints for interacting with Pump.fun and PumpSwap services.
2. **Frontend**: A Next.js application that provides a user interface for creating and trading tokens.

### Backend API

- `src/modules/pump-fun`: Service for interacting with the Pump.fun program
- `src/modules/pump-swap`: Service for interacting with the PumpSwap program
- `src/api/controllers`: API endpoints for the services
- `src/services/jito.service.ts`: Service for accelerating transactions with Jito

### Frontend

- `frontend/app`: Next.js app directory
- `frontend/components`: React components
- `frontend/lib`: 
  - `api.ts`: API client for read operations
  - `blockchain.ts`: Direct blockchain interactions for write operations
  - `types.ts`: Type definitions

## Getting Started

### Prerequisites

- Node.js (v16+)
- Yarn package manager
- Solana CLI tools (optional)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/pumpfun-content.git
   cd pumpfun-content
   ```

2. Install backend dependencies:
   ```bash
   yarn install
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend
   yarn install
   cd ..
   ```

4. Create a `.env` file in the root directory with the following content:
   ```
   RPC_ENDPOINT=https://mainnet.helius-rpc.com/?api-key=your-api-key
   JITO_FEE=0.0001
   PORT=3000
   ```

5. Create a `.env.local` file in the `frontend` directory:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3000
   NEXT_PUBLIC_RPC_ENDPOINT=https://mainnet.helius-rpc.com/?api-key=your-api-key
   ```

### Running the Application

1. Start the backend API:
   ```bash
   yarn start
   ```

2. Start the frontend development server:
   ```bash
   cd frontend
   yarn dev
   ```

3. Open your browser and navigate to `http://localhost:3001` to access the application.

## Architecture

This project follows a hybrid architecture:

1. **Read Operations**: Use the backend API for read-only operations like fetching token information
2. **Write Operations**: Interact directly with the blockchain from the frontend for write operations like creating, buying, and selling tokens

This approach ensures:
- True decentralization for write operations (users sign transactions directly)
- Self-custody of funds (private keys never leave the user's browser)
- Efficient read operations through cached and indexed data

## API Documentation

Swagger documentation is available at `http://localhost:3000/api/docs` when the backend is running.

### Key Endpoints (Read Operations)

- `GET /api/pump-fun/token-info/:tokenMint`: Get information about a token
- `GET /api/pump-fun/is-pump-fun-token/:tokenMint`: Check if a token is a Pump.fun token
- `GET /api/pump-fun/is-bonding-curve-complete/:tokenMint`: Check if a token's bonding curve is complete
- `GET /api/pump-swap/has-pool/:tokenMint`: Check if a token has a PumpSwap pool

### Direct Blockchain Operations (Write Operations)

These operations are performed directly from the frontend using the user's wallet:

- Creating tokens on Pump.fun
- Buying tokens on Pump.fun or PumpSwap
- Selling tokens on Pump.fun or PumpSwap

## Testing

Run the tests with:

```bash
yarn test
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.