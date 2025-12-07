import { PublicKey } from '@solana/web3.js';
import onlypumpPresaleIdl from '../../onlypump-presale/target/idl/onlypump_presale.json';
import type { OnlypumpPresale } from '../../onlypump-presale/target/types/onlypump_presale';

/**
 * Constants for Pump.fun and PumpSwap integration
 * 
 * Note: Program IDs are the SAME on both Devnet and Mainnet
 * - Pump.fun: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
 * - PumpSwap: pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA
 * 
 * The SDKs automatically use the correct network based on the RPC connection.
 * Set SOLANA_RPC_URL to devnet or mainnet RPC endpoint.
 */

// Program IDs (same on devnet and mainnet)
export const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const PUMPSWAP_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');

// Raydium Migration Account
export const PUMP_FUN_RAYDIUM_MIGRATION = new PublicKey('39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg');

// Jito tip program
export const JITO_TIP_PROGRAM_ID = new PublicKey('4R3gSG8BpU4t19KYj8CfnbtRpnT8gtk4dvTHxVRwc2T3');
export const JITO_TIP_ACCOUNT = new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhArj8T');

// WSOL mint address
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Discriminator for CompleteEvent from IDL
export const COMPLETE_EVENT_DISCRIMINATOR = [95, 114, 97, 156, 212, 46, 152, 8];

// PDA Seeds
export const GLOBAL_SEED = Buffer.from('global');
export const BONDING_CURVE_SEED = Buffer.from('bonding-curve');
export const MINT_AUTHORITY_SEED = Buffer.from('mint-authority');

// Default settings
export const DEFAULT_PRIORITY_FEE = {
  NORMAL: 100000,  // 0.0001 SOL
  FAST: 250000,    // 0.00025 SOL
  TURBO: 500000,   // 0.0005 SOL
  ULTRA: 1000000   // 0.001 SOL
};

export const DEFAULT_JITO_TIP = 10000000; // 0.01 SOL

// Token metadata program
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// System programs
export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const RENT_SYSVAR_ID = new PublicKey('SysvarRent111111111111111111111111111111111');

// Event Authority
export const EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// OnlyPump Presale (Anchor) program
export const ONLYPUMP_PRESALE_PROGRAM_ID = new PublicKey(
  '5zqdoDng2LnQ7JbiemiRwzTaPnnEU4eMXMfCCF3P4xQQ',
);

// Anchor IDL for the OnlyPump Presale program
export const ONLYPUMP_PRESALE_IDL = onlypumpPresaleIdl as OnlypumpPresale;
