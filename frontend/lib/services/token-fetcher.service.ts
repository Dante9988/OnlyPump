import { Connection, PublicKey, Finality } from '@solana/web3.js';
import { TokenInfo } from '../types';

// Constants
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMPSWAP_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const GRADUATION_THRESHOLD_USD = 12000; // $12K threshold for "about to graduate"

export class TokenFetcherService {
  private connection: Connection;
  
  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }
  
  /**
   * Fetch token mint address from transaction signature
   */
  async fetchTokenMintFromTx(signature: string): Promise<{ tokenMint: string; solMint: string } | null> {
    const metrics = {
      txFetch: 0,
      parsing: 0,
      total: 0,
      attempts: 0
    };

    const startTotal = performance.now();
    const maxRetries = 10;
    const initialDelay = 200;
    const WSOL_ADDRESS = "So11111111111111111111111111111111111111112";
    
    console.log(`Solscan: https://solscan.io/tx/${signature}`);
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      metrics.attempts++;
      try {
        const startTxFetch = performance.now();
        const tx = await this.connection.getTransaction(signature, { 
          commitment: "confirmed" as Finality,
          maxSupportedTransactionVersion: 0
        });
        metrics.txFetch = performance.now() - startTxFetch;

        if (!tx?.meta) {
          await new Promise(resolve => setTimeout(resolve, initialDelay));
          continue;
        }

        const startParsing = performance.now();
        
        // Look at post token balances to find the new token
        for (const balance of tx.meta.postTokenBalances || []) {
          if (balance.mint && balance.mint !== WSOL_ADDRESS) {
            metrics.parsing = performance.now() - startParsing;
            metrics.total = performance.now() - startTotal;

            console.log(`\n📊 Token Found from Post Balances (Attempt ${attempt + 1}):
• Total Time: ${metrics.total.toFixed(2)}ms
• TX Fetch: ${metrics.txFetch.toFixed(2)}ms
• Parsing: ${metrics.parsing.toFixed(2)}ms
• Token Mint: ${balance.mint}`);

            return {
              tokenMint: balance.mint,
              solMint: WSOL_ADDRESS
            };
          }
        }
      } catch (error) {
        console.log(`❌ Attempt ${attempt + 1} failed:`, error);
        if (attempt === maxRetries - 1) {
          metrics.total = performance.now() - startTotal;
          console.error(`❌ All attempts failed (${metrics.total.toFixed(2)}ms)`);
          return null;
        }
        await new Promise(resolve => setTimeout(resolve, initialDelay));
      }
    }

    metrics.total = performance.now() - startTotal;
    console.log(`❌ Failed to find token mint after ${maxRetries} attempts (${metrics.total.toFixed(2)}ms)`);
    return null;
  }
  
  /**
   * Check if bonding curve is complete
   */
  async getBondingCurveState(mint: PublicKey): Promise<boolean> {
    try {
      // Derive bonding curve PDA
      const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("bonding-curve"),
          mint.toBuffer()
        ],
        PUMP_FUN_PROGRAM_ID
      );

      // Fetch the bonding curve account
      const account = await this.connection.getAccountInfo(bondingCurvePDA);
      if (!account) return false;

      // Skip 8 bytes of discriminator
      const complete = account.data[account.data.length - 1] === 1; // complete is the last boolean field
      return complete;
    } catch (error) {
      console.error('Error checking bonding curve state:', error);
      return false;
    }
  }
  
  /**
   * Check if logs indicate a PumpSwap pool creation
   */
  isPumpSwapPoolCreation(logs: string[]): boolean {
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
   * Check if logs indicate a bonding curve completion
   */
  isBondingCurveComplete(logs: string[]): boolean {
    // Look for CompleteEvent discriminator or withdraw instruction in the logs
    const COMPLETE_EVENT_DISCRIMINATOR = [95, 114, 97, 156, 212, 46, 152, 8];
    
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
   * Extract token mint from logs
   */
  getTokenMintFromLogs(logs: string[]): PublicKey | null {
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

      console.log("Debug: Could not find mint in logs");
      return null;
    } catch (error) {
      console.error('Error extracting token mint:', error);
      return null;
    }
  }
  
  /**
   * Verify if a migration has occurred
   */
  async verifyPumpFunMigration(
    logs: string[],
    mint: PublicKey
  ): Promise<boolean> {
    // First verify this is a pool creation
    if (!this.isPumpSwapPoolCreation(logs)) return false;

    // Then check if the token's bonding curve is complete
    const isBondingComplete = await this.getBondingCurveState(mint);
    return isBondingComplete;
  }
  
  /**
   * Set up WebSocket connection to listen for new tokens
   */
  setupWebSocketForNewTokens(onNewToken: (signature: string) => void): WebSocket {
    const wsUrl = this.connection.rpcEndpoint.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log("🚀 Listening for new tokens on Pump.fun...");
      const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "logsSubscribe",
        params: [
          {
            mentions: [PUMP_FUN_PROGRAM_ID.toBase58()], // Listening for logs from Pump.fun program
          },
          {
            commitment: "processed",
          },
        ],
      };
      ws.send(JSON.stringify(request));
    };
    
    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.result !== undefined) {
          console.log("✅ Subscribed to Pump.fun!");
          return;
        }

        const logs = message.params?.result?.value?.logs;
        if (!logs || !logs.some((log: string) => log.includes("Program log: Instruction: InitializeMint2"))) {
          return;
        }

        const signature = message.params.result.value.signature;
        onNewToken(signature);
      } catch (error) {
        console.error("💥 Error processing message:", error);
      }
    };
    
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    
    ws.onclose = () => {
      console.log("WebSocket connection closed");
    };
    
    return ws;
  }
}
