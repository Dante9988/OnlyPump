import { Injectable, Logger } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';
import { SupabaseService } from './supabase.service';

export enum TransactionType {
  BUY = 'buy',
  SELL = 'sell',
  CREATE = 'create',
  CREATE_AND_BUY = 'create_and_buy',
}

export interface TransactionRecord {
  id: string;
  walletAddress: string;
  transactionSignature: string;
  type: TransactionType;
  tokenMint?: string;
  solAmount?: number;
  tokenAmount?: number;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
  blockTime?: number;
}

/**
 * Service for tracking transaction history
 * Now uses Supabase for persistent storage
 */
@Injectable()
export class TransactionHistoryService {
  private readonly logger = new Logger(TransactionHistoryService.name);

  constructor(
    private connection: Connection,
    private supabase: SupabaseService,
  ) {}

  /**
   * Record a new transaction in database
   * If transactionSignature is empty, creates a pending record that can be updated later
   */
  async recordTransaction(
    walletAddress: string,
    transactionSignature: string,
    type: TransactionType,
    tokenMint?: string,
    solAmount?: number,
    tokenAmount?: number,
  ): Promise<TransactionRecord> {
    // Generate a temporary ID if signature is not provided
    const pending_id = transactionSignature || `pending-${Date.now()}-${Math.random()}`;
    
    try {
      // Store in Supabase
      const dbRecord = await this.supabase.createTransaction({
        pending_id,
        wallet_address: walletAddress,
        token_mint: tokenMint || '',
        type,
        sol_amount: solAmount,
        token_amount: tokenAmount,
      });

      const record: TransactionRecord = {
        id: dbRecord.pending_id,
        walletAddress: dbRecord.wallet_address,
        transactionSignature: transactionSignature || pending_id,
        type: dbRecord.type as TransactionType,
        tokenMint: dbRecord.token_mint,
        solAmount: dbRecord.sol_amount ? Number(dbRecord.sol_amount) : undefined,
        tokenAmount: dbRecord.token_amount ? Number(dbRecord.token_amount) : undefined,
        timestamp: new Date(dbRecord.created_at),
        status: dbRecord.status as 'pending' | 'confirmed' | 'failed',
        blockTime: dbRecord.block_time ? Number(dbRecord.block_time) : undefined,
      };

      this.logger.log(`Transaction recorded in DB: ${pending_id}`);

      // Verify transaction on-chain in background if signature is provided
      if (transactionSignature) {
        this.verifyTransaction(transactionSignature).catch((error) => {
          this.logger.error(
            `Error verifying transaction ${transactionSignature}: ${error}`,
          );
        });
      }

      return record;
    } catch (error) {
      this.logger.error(`Error recording transaction in DB: ${error}`);
      // Return a temporary record even if DB fails
      return {
        id: pending_id,
        walletAddress,
        transactionSignature: transactionSignature || pending_id,
        type,
        tokenMint,
        solAmount,
        tokenAmount,
        timestamp: new Date(),
        status: 'pending',
      };
    }
  }

  /**
   * Update transaction with actual signature after it's sent
   */
  async updateTransactionSignature(
    pendingId: string,
    transactionSignature: string,
  ): Promise<TransactionRecord | null> {
    try {
      // Update in database
      const dbRecord = await this.supabase.updateTransaction(pendingId, {
        signature: transactionSignature,
        status: 'submitted',
      });

      if (!dbRecord) {
        this.logger.warn(`Transaction ${pendingId} not found in DB`);
        return null;
      }

      this.logger.log(`Transaction ${pendingId} updated with signature: ${transactionSignature}`);

      // Verify transaction on-chain
      this.verifyTransaction(transactionSignature).catch((error) => {
        this.logger.error(
          `Error verifying transaction ${transactionSignature}: ${error}`,
        );
      });

      return {
        id: dbRecord.signature || dbRecord.pending_id,
        walletAddress: dbRecord.wallet_address,
        transactionSignature: dbRecord.signature || transactionSignature,
        type: dbRecord.type as TransactionType,
        tokenMint: dbRecord.token_mint,
        solAmount: dbRecord.sol_amount ? Number(dbRecord.sol_amount) : undefined,
        tokenAmount: dbRecord.token_amount ? Number(dbRecord.token_amount) : undefined,
        timestamp: new Date(dbRecord.created_at),
        status: dbRecord.status as 'pending' | 'confirmed' | 'failed',
        blockTime: dbRecord.block_time ? Number(dbRecord.block_time) : undefined,
      };
    } catch (error) {
      this.logger.error(`Error updating transaction signature in DB: ${error}`);
      return null;
    }
  }

  /**
   * Get transaction history for a wallet from database
   */
  async getWalletTransactions(
    walletAddress: string,
    type?: TransactionType,
    limit?: number,
  ): Promise<TransactionRecord[]> {
    try {
      const dbTransactions = await this.supabase.getTransactions(walletAddress, limit || 50);

      let transactions = dbTransactions.map(tx => ({
        id: tx.signature || tx.pending_id,
        walletAddress: tx.wallet_address,
        transactionSignature: tx.signature || tx.pending_id,
        type: tx.type as TransactionType,
        tokenMint: tx.token_mint,
        solAmount: tx.sol_amount ? Number(tx.sol_amount) : undefined,
        tokenAmount: tx.token_amount ? Number(tx.token_amount) : undefined,
        timestamp: new Date(tx.created_at),
        status: tx.status as 'pending' | 'confirmed' | 'failed',
        blockTime: tx.block_time ? Number(tx.block_time) : undefined,
      }));

      if (type) {
        transactions = transactions.filter((tx) => tx.type === type);
      }

      return transactions;
    } catch (error) {
      this.logger.error(`Error fetching wallet transactions from DB: ${error}`);
      return [];
    }
  }

  /**
   * Get a specific transaction by signature from database
   */
  async getTransaction(transactionSignature: string): Promise<TransactionRecord | undefined> {
    try {
      const { data, error } = await this.supabase.db
        .from('transactions')
        .select('*')
        .or(`signature.eq.${transactionSignature},pending_id.eq.${transactionSignature}`)
        .single();

      if (error || !data) {
        return undefined;
      }

      return {
        id: data.signature || data.pending_id,
        walletAddress: data.wallet_address,
        transactionSignature: data.signature || data.pending_id,
        type: data.type as TransactionType,
        tokenMint: data.token_mint,
        solAmount: data.sol_amount ? Number(data.sol_amount) : undefined,
        tokenAmount: data.token_amount ? Number(data.token_amount) : undefined,
        timestamp: new Date(data.created_at),
        status: data.status as 'pending' | 'confirmed' | 'failed',
        blockTime: data.block_time ? Number(data.block_time) : undefined,
      };
    } catch (error) {
      this.logger.error(`Error fetching transaction from DB: ${error}`);
      return undefined;
    }
  }

  /**
   * Verify transaction status on-chain and update database
   */
  private async verifyTransaction(transactionSignature: string): Promise<void> {
    try {
      const tx = await this.connection.getTransaction(transactionSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (tx && tx.meta) {
        // Update in database
        const status = tx.meta.err ? 'failed' : 'confirmed';
        await this.supabase.updateTransactionBySignature(transactionSignature, {
          status,
          block_time: tx.blockTime || undefined,
          slot: tx.slot || undefined,
        });

        this.logger.log(`Transaction ${transactionSignature} verified: ${status}`);
      } else {
        // Transaction not found yet, keep as pending
        // Retry after some time
        setTimeout(() => {
          this.verifyTransaction(transactionSignature).catch((error) => {
            this.logger.error(
              `Error retrying verification for ${transactionSignature}: ${error}`,
            );
          });
        }, 5000);
      }
    } catch (error) {
      this.logger.error(
        `Error verifying transaction ${transactionSignature}: ${error}`,
      );
    }
  }

  /**
   * Get transaction statistics for a wallet from database
   */
  async getWalletStats(walletAddress: string): Promise<{
    totalTransactions: number;
    buyCount: number;
    sellCount: number;
    totalSolSpent: number;
    totalSolReceived: number;
  }> {
    try {
      const transactions = await this.getWalletTransactions(walletAddress);
      const buyTransactions = transactions.filter(
        (tx) => tx.type === TransactionType.BUY || tx.type === TransactionType.CREATE_AND_BUY,
      );
      const sellTransactions = transactions.filter(
        (tx) => tx.type === TransactionType.SELL,
      );

      const totalSolSpent = buyTransactions.reduce(
        (sum, tx) => sum + (tx.solAmount || 0),
        0,
      );
      const totalSolReceived = sellTransactions.reduce(
        (sum, tx) => sum + (tx.solAmount || 0),
        0,
      );

      return {
        totalTransactions: transactions.length,
        buyCount: buyTransactions.length,
        sellCount: sellTransactions.length,
        totalSolSpent,
        totalSolReceived,
      };
    } catch (error) {
      this.logger.error(`Error fetching wallet stats from DB: ${error}`);
      return {
        totalTransactions: 0,
        buyCount: 0,
        sellCount: 0,
        totalSolSpent: 0,
        totalSolReceived: 0,
      };
    }
  }
}

