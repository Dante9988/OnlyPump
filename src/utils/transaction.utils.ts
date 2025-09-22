import { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction, 
  ComputeBudgetProgram, 
  SystemProgram,
  Keypair
} from '@solana/web3.js';
import { 
  DEFAULT_PRIORITY_FEE, 
  JITO_TIP_ACCOUNT, 
  COMPLETE_EVENT_DISCRIMINATOR 
} from '../common/constants';
import { TransactionSpeed } from '../interfaces/pump-fun.interface';

/**
 * Utility functions for transaction operations
 */

/**
 * Creates a compute budget instruction based on the desired transaction speed
 * @param speed Transaction speed setting
 * @returns Compute budget instruction
 */
export function createComputeBudgetInstruction(speed: TransactionSpeed): TransactionInstruction {
  let priorityFee: number;
  
  switch (speed) {
    case TransactionSpeed.ULTRA:
      priorityFee = DEFAULT_PRIORITY_FEE.ULTRA;
      break;
    case TransactionSpeed.TURBO:
      priorityFee = DEFAULT_PRIORITY_FEE.TURBO;
      break;
    case TransactionSpeed.FAST:
      priorityFee = DEFAULT_PRIORITY_FEE.FAST;
      break;
    case TransactionSpeed.NORMAL:
    default:
      priorityFee = DEFAULT_PRIORITY_FEE.NORMAL;
      break;
  }
  
  return ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee
  });
}

/**
 * Creates a Jito tip instruction
 * @param wallet Wallet public key
 * @param lamports Amount of lamports to tip
 * @returns System transfer instruction
 */
export function createJitoTipInstruction(
  wallet: PublicKey,
  lamports: number
): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: wallet,
    toPubkey: JITO_TIP_ACCOUNT,
    lamports: lamports
  });
}

/**
 * Checks if a bonding curve completion event is present in transaction logs
 * @param logs Transaction logs
 * @returns True if the bonding curve is completed
 */
export function isBondingCurveComplete(logs: string[]): boolean {
  // Look for CompleteEvent discriminator or withdraw instruction in the logs
  return logs.some(log => 
    typeof log === "string" && (
      // Check for the event discriminator
      log.includes(COMPLETE_EVENT_DISCRIMINATOR.join(", ")) ||
      // Check for withdraw instruction (used for migration)
      log.includes("Program log: Instruction: Withdraw") ||
      // Also check for the completion message
      log.includes("Program log: Bonding curve complete")
    )
  );
}

/**
 * Checks if transaction logs indicate a PumpSwap pool creation
 * @param logs Transaction logs
 * @returns True if a PumpSwap pool was created
 */
export function isPumpSwapPoolCreation(logs: string[]): boolean {
  // Check for Create_pool instruction with Pump.fun AMM and extract WSOL amount
  const liquidityLog = logs.find(log => 
    typeof log === "string" && 
    log.includes("Create_pool") && 
    log.includes("WSOL")
  );

  if (!liquidityLog) return false;

  // Extract WSOL amount from the log
  const wsolMatch = liquidityLog.match(/and ([\d,.]+) WSOL/);
  if (!wsolMatch) return false;

  // Parse WSOL amount and check if it's > 80
  const wsolAmount = parseFloat(wsolMatch[1].replace(/,/g, ''));
  if (isNaN(wsolAmount) || wsolAmount <= 80) return false;

  return true;
}

/**
 * Signs and sends a transaction
 * @param connection Solana connection
 * @param transaction Transaction to send
 * @param keypair Keypair to sign with
 * @param skipPreflight Whether to skip preflight verification
 * @returns Transaction signature
 */
export async function signAndSendTransaction(
  connection: Connection,
  transaction: Transaction,
  keypair: Keypair,
  skipPreflight = false
): Promise<string> {
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  transaction.feePayer = keypair.publicKey;
  
  transaction.sign(keypair);
  
  const rawTransaction = transaction.serialize();
  
  const txid = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight,
    preflightCommitment: 'confirmed'
  });
  
  return txid;
}

/**
 * Waits for a transaction to be confirmed
 * @param connection Solana connection
 * @param signature Transaction signature
 * @param timeout Timeout in milliseconds
 * @returns Transaction status
 */
export async function confirmTransaction(
  connection: Connection,
  signature: string,
  timeout = 30000
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const { value } = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true
    });
    
    if (value !== null) {
      if (value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(value.err)}`);
      }
      
      if (value.confirmationStatus === 'confirmed' || value.confirmationStatus === 'finalized') {
        return true;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Transaction confirmation timeout: ${signature}`);
}
