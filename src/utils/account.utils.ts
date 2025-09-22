import { Connection, PublicKey } from '@solana/web3.js';
import { BONDING_CURVE_SEED, GLOBAL_SEED, PUMP_FUN_PROGRAM_ID } from '../common/constants';
import { BondingCurveAccount, GlobalAccount } from '../interfaces/pump-fun.interface';
import * as bs58 from 'bs58';

/**
 * Utility functions for account operations
 */

/**
 * Derives the bonding curve PDA for a token mint
 * @param mint The token mint public key
 * @returns The bonding curve PDA
 */
export function deriveBondingCurvePDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BONDING_CURVE_SEED, mint.toBuffer()],
    PUMP_FUN_PROGRAM_ID
  );
}

/**
 * Derives the global state PDA
 * @returns The global state PDA
 */
export function deriveGlobalPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [GLOBAL_SEED],
    PUMP_FUN_PROGRAM_ID
  );
}

/**
 * Fetches and parses a bonding curve account
 * @param connection Solana connection
 * @param mint Token mint address
 * @returns Parsed bonding curve account or null if not found
 */
export async function fetchBondingCurveAccount(
  connection: Connection,
  mint: PublicKey
): Promise<BondingCurveAccount | null> {
  try {
    const [bondingCurvePDA] = deriveBondingCurvePDA(mint);
    
    const account = await connection.getAccountInfo(bondingCurvePDA);
    if (!account) return null;
    
    // Skip 8 bytes of discriminator
    const data = account.data.slice(8);
    
    // Parse the data according to the BondingCurve struct layout
    const virtualTokenReserves = BigInt('0x' + Buffer.from(data.slice(0, 8)).reverse().toString('hex'));
    const virtualSolReserves = BigInt('0x' + Buffer.from(data.slice(8, 16)).reverse().toString('hex'));
    const realTokenReserves = BigInt('0x' + Buffer.from(data.slice(16, 24)).reverse().toString('hex'));
    const realSolReserves = BigInt('0x' + Buffer.from(data.slice(24, 32)).reverse().toString('hex'));
    const tokenTotalSupply = BigInt('0x' + Buffer.from(data.slice(32, 40)).reverse().toString('hex'));
    const complete = data[40] === 1;
    
    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete
    };
  } catch (error) {
    console.error('Error fetching bonding curve account:', error);
    return null;
  }
}

/**
 * Fetches and parses the global state account
 * @param connection Solana connection
 * @returns Parsed global account or null if not found
 */
export async function fetchGlobalAccount(
  connection: Connection
): Promise<GlobalAccount | null> {
  try {
    const [globalPDA] = deriveGlobalPDA();
    
    const account = await connection.getAccountInfo(globalPDA);
    if (!account) return null;
    
    // Skip 8 bytes of discriminator
    const data = account.data.slice(8);
    
    // Parse the data according to the Global struct layout
    const initialized = data[0] === 1;
    const authority = new PublicKey(data.slice(1, 33));
    const feeRecipient = new PublicKey(data.slice(33, 65));
    const initialVirtualTokenReserves = BigInt('0x' + Buffer.from(data.slice(65, 73)).reverse().toString('hex'));
    const initialVirtualSolReserves = BigInt('0x' + Buffer.from(data.slice(73, 81)).reverse().toString('hex'));
    const initialRealTokenReserves = BigInt('0x' + Buffer.from(data.slice(81, 89)).reverse().toString('hex'));
    const tokenTotalSupply = BigInt('0x' + Buffer.from(data.slice(89, 97)).reverse().toString('hex'));
    const feeBasisPoints = BigInt('0x' + Buffer.from(data.slice(97, 105)).reverse().toString('hex'));
    
    return {
      initialized,
      authority,
      feeRecipient,
      initialVirtualTokenReserves,
      initialVirtualSolReserves,
      initialRealTokenReserves,
      tokenTotalSupply,
      feeBasisPoints
    };
  } catch (error) {
    console.error('Error fetching global account:', error);
    return null;
  }
}

/**
 * Checks if a token is a Pump.fun token by looking for its bonding curve
 * @param connection Solana connection
 * @param mint Token mint address
 * @returns True if the token is a Pump.fun token
 */
export async function isPumpFunToken(
  connection: Connection,
  mint: PublicKey
): Promise<boolean> {
  try {
    const bondingCurve = await fetchBondingCurveAccount(connection, mint);
    return bondingCurve !== null;
  } catch (error) {
    console.error('Error checking if token is a Pump.fun token:', error);
    return false;
  }
}

/**
 * Extracts token mint from transaction logs
 * @param logs Transaction logs
 * @returns Token mint public key or null if not found
 */
export function getTokenMintFromLogs(logs: string[]): PublicKey | null {
  try {
    // Look for Create_pool instruction
    const liquidityLog = logs.find(log => 
      typeof log === "string" && 
      log.includes("Create_pool") && 
      log.includes("WSOL")
    );

    if (liquidityLog) {
      // Extract token amount and symbol before "and X WSOL"
      const tokenMatch = liquidityLog.match(/Create_pool ([\d,.]+ [A-Z0-9]+)/);
      if (tokenMatch && tokenMatch[1]) {
        // Find a transfer log containing this token amount and symbol
        const transferLog = logs.find(log =>
          typeof log === "string" && 
          log.includes("Transfer") &&
          log.includes(tokenMatch[1])
        );
        if (transferLog) {
          const mintMatch = transferLog.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
          if (mintMatch) {
            return new PublicKey(mintMatch[0]);
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting token mint:', error);
    return null;
  }
}
