import { 
  Connection, 
  PublicKey, 
  SendOptions
} from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { 
  PumpFunResult,
  TransactionSpeed
} from './types';
import { PumpFunService } from './services/pump-fun.service';
import { PumpSwapService } from './services/pump-swap.service';
import { PumpTokenCreator } from './services/pump-token-creator';
import { PumpTokenOperations } from './services/pump-token-operations';
import { Web3WalletProvider } from './services/wallet.interface';

// Get RPC URL from environment variable or use default
const RPC_URL = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';

// Create connection to Solana
const connection = new Connection(RPC_URL);

// Create service instances
const pumpFunService = new PumpFunService(RPC_URL);
const pumpSwapService = new PumpSwapService(RPC_URL);
// Initialize the token creator with the RPC URL (vanity keypairs are now imported directly)
const pumpTokenCreator = new PumpTokenCreator(RPC_URL);
const pumpTokenOperations = new PumpTokenOperations(RPC_URL);

/**
 * Create a token directly using the user's wallet
 * If solAmount is provided, it will create and buy the token in a single transaction
 */
export async function createTokenDirect(
  publicKey: PublicKey,
  name: string,
  symbol: string,
  uri: string,
  solAmount: number | undefined,
  description?: string,
  socials?: { [key: string]: string },
  settings?: any,
  wallet?: any,
  onProgress?: (progress: number) => void
): Promise<PumpFunResult> {
  try {
    // Create a Web3WalletProvider that wraps the wallet adapter
    const walletProvider = new Web3WalletProvider(wallet);
    
    // Set progress callback if provided
    if (onProgress) {
      pumpTokenCreator.setVanityAddressProgressCallback(onProgress);
    }
    
    // Use the new PumpTokenCreator service with the official SDK
    if (solAmount && solAmount > 0) {
      // Create and buy token in one transaction
      return await pumpTokenCreator.createAndBuyToken(
        walletProvider,
        name,
        symbol,
        uri,
        solAmount,
        true // Use vanity address
      );
    } else {
      // Just create the token
      return await pumpTokenCreator.createToken(
        walletProvider,
        name,
        symbol,
        uri,
        true // Use vanity address
      );
    }
  } catch (error: any) {
    console.error('Error creating token:', error);
    return {
      success: false,
      error: error.message || 'Failed to create token'
    };
  }
}

/**
 * Buy a token directly using the user's wallet
 */
export async function buyTokenDirect(
  publicKey: PublicKey,
  tokenMint: string,
  solAmount: number,
  settings: any,
  wallet: any
): Promise<PumpFunResult> {
  try {
    // Create a Web3WalletProvider that wraps the wallet adapter
    const walletProvider = new Web3WalletProvider(wallet);
    
    // For now, always use PumpFun (not PumpSwap)
    console.log(`Buying token ${tokenMint} with ${solAmount} SOL using PumpFun`);
    
    // Use the PumpTokenOperations service with the official SDK
    return await pumpTokenOperations.buyToken(
      walletProvider,
      tokenMint,
      solAmount,
      settings
    );
  } catch (error: any) {
    console.error('Error buying token:', error);
    return {
      success: false,
      error: error.message || 'Failed to buy token'
    };
  }
}

/**
 * Sell a token directly using the user's wallet
 */
export async function sellTokenDirect(
  publicKey: PublicKey,
  tokenMint: string,
  percentage: number,
  settings: any,
  wallet: any
): Promise<PumpFunResult> {
  try {
    // Create a Web3WalletProvider that wraps the wallet adapter
    const walletProvider = new Web3WalletProvider(wallet);
    
    // For now, always use PumpFun (not PumpSwap)
    console.log(`Selling ${percentage}% of token ${tokenMint} using PumpFun`);
    
    // Use the PumpTokenOperations service with the official SDK
    return await pumpTokenOperations.sellToken(
      walletProvider,
      tokenMint,
      percentage,
      settings
    );
  } catch (error: any) {
    console.error('Error selling token:', error);
    return {
      success: false,
      error: error.message || 'Failed to sell token'
    };
  }
}

/**
 * Collect creator fees directly using the user's wallet
 */
export async function collectCreatorFeesDirect(
  publicKey: PublicKey,
  wallet: any
): Promise<PumpFunResult> {
  try {
    // Create a Web3WalletProvider that wraps the wallet adapter
    const walletProvider = new Web3WalletProvider(wallet);
    
    // Use the new PumpTokenOperations service with the official SDK
    return await pumpTokenOperations.collectCreatorFees(walletProvider);
  } catch (error: any) {
    console.error('Error collecting creator fees:', error);
    return {
      success: false,
      error: error.message || 'Failed to collect creator fees'
    };
  }
}

/**
 * Helper function to create a transaction with the specified speed setting
 */
export function getTransactionOptions(speed: TransactionSpeed): SendOptions {
  switch (speed) {
    case TransactionSpeed.FAST:
      return { skipPreflight: false, preflightCommitment: 'processed' };
    case TransactionSpeed.TURBO:
      return { skipPreflight: true, preflightCommitment: 'processed' };
    case TransactionSpeed.ULTRA:
      return { skipPreflight: true, preflightCommitment: 'confirmed' };
    default:
      return { skipPreflight: false, preflightCommitment: 'processed' };
  }
}

/**
 * Hook to use blockchain operations with the connected wallet
 */
export function useBlockchain() {
  const wallet = useWallet();
  const { publicKey, signTransaction, signAllTransactions } = wallet;

  const createToken = async (
    name: string,
    symbol: string,
    uri: string,
    solAmount?: number,
    description?: string,
    socials?: { [key: string]: string },
    settings?: any,
    onProgress?: (progress: number) => void
  ): Promise<PumpFunResult> => {
    if (!publicKey || !signTransaction || !signAllTransactions) {
      return { success: false, error: 'Wallet not connected' };
    }
    return createTokenDirect(publicKey, name, symbol, uri, solAmount, description, socials, settings, wallet, onProgress);
  };

  const buyToken = async (
    tokenMint: string,
    solAmount: number,
    settings?: any
  ): Promise<PumpFunResult> => {
    if (!publicKey || !signTransaction || !signAllTransactions) {
      return { success: false, error: 'Wallet not connected' };
    }
    return buyTokenDirect(publicKey, tokenMint, solAmount, settings, wallet);
  };

  const sellToken = async (
    tokenMint: string,
    percentage: number,
    settings?: any
  ): Promise<PumpFunResult> => {
    if (!publicKey || !signTransaction || !signAllTransactions) {
      return { success: false, error: 'Wallet not connected' };
    }
    return sellTokenDirect(publicKey, tokenMint, percentage, settings, wallet);
  };

  const collectCreatorFees = async (): Promise<PumpFunResult> => {
    if (!publicKey || !signTransaction || !signAllTransactions) {
      return { success: false, error: 'Wallet not connected' };
    }
    return collectCreatorFeesDirect(publicKey, wallet);
  };

  // Additional utility functions
  const isPumpFunToken = async (tokenMint: string): Promise<boolean> => {
    return await pumpFunService.isTokenPumpFun(tokenMint);
  };

  const getTokenInfo = async (tokenMint: string) => {
    return await pumpFunService.getTokenInfo(tokenMint);
  };

  const hasPumpSwapPool = async (tokenMint: string): Promise<boolean> => {
    return await pumpTokenOperations.hasPool(tokenMint);
  };

  const getCreatorFees = async (creator: string): Promise<string> => {
    return await pumpTokenOperations.getCreatorFees(creator);
  };

  return {
    connected: !!publicKey,
    publicKey,
    createToken,
    buyToken,
    sellToken,
    collectCreatorFees,
    isPumpFunToken,
    getTokenInfo,
    hasPumpSwapPool,
    getCreatorFees
  };
}