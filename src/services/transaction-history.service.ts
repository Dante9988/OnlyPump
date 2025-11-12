import { Injectable, Logger } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';

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
 * For now, uses in-memory storage. In production, use a database (Prisma/TypeORM)
 */
@Injectable()
export class TransactionHistoryService {
  private readonly logger = new Logger(TransactionHistoryService.name);
  private transactions: Map<string, TransactionRecord> = new Map();
  private walletTransactions: Map<string, string[]> = new Map(); // wallet -> transaction IDs

  constructor(private connection: Connection) {}

  /**
   * Record a new transaction
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
    const id = transactionSignature || `pending-${Date.now()}-${Math.random()}`;
    
    const record: TransactionRecord = {
      id,
      walletAddress,
      transactionSignature: transactionSignature || id,
      type,
      tokenMint,
      solAmount,
      tokenAmount,
      timestamp: new Date(),
      status: 'pending',
    };

    this.transactions.set(id, record);

    // Track by wallet
    if (!this.walletTransactions.has(walletAddress)) {
      this.walletTransactions.set(walletAddress, []);
    }
    this.walletTransactions.get(walletAddress)!.push(id);

    // Verify transaction on-chain in background if signature is provided
    if (transactionSignature) {
      this.verifyTransaction(transactionSignature).catch((error) => {
        this.logger.error(
          `Error verifying transaction ${transactionSignature}: ${error}`,
        );
      });
    }

    return record;
  }

  /**
   * Update transaction with actual signature after it's sent
   */
  async updateTransactionSignature(
    pendingId: string,
    transactionSignature: string,
  ): Promise<TransactionRecord | null> {
    const record = this.transactions.get(pendingId);
    if (!record) {
      return null;
    }

    // Update the record with actual signature
    record.transactionSignature = transactionSignature;
    record.id = transactionSignature;

    // Move to new key if ID changed
    if (pendingId !== transactionSignature) {
      this.transactions.delete(pendingId);
      this.transactions.set(transactionSignature, record);

      // Update wallet tracking
      const walletTxs = this.walletTransactions.get(record.walletAddress);
      if (walletTxs) {
        const index = walletTxs.indexOf(pendingId);
        if (index !== -1) {
          walletTxs[index] = transactionSignature;
        }
      }
    }

    // Verify transaction on-chain
    this.verifyTransaction(transactionSignature).catch((error) => {
      this.logger.error(
        `Error verifying transaction ${transactionSignature}: ${error}`,
      );
    });

    return record;
  }

  /**
   * Get transaction history for a wallet
   */
  getWalletTransactions(
    walletAddress: string,
    type?: TransactionType,
    limit?: number,
  ): TransactionRecord[] {
    const transactionIds = this.walletTransactions.get(walletAddress) || [];
    let transactions = transactionIds
      .map((id) => this.transactions.get(id))
      .filter((tx): tx is TransactionRecord => tx !== undefined)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (type) {
      transactions = transactions.filter((tx) => tx.type === type);
    }

    if (limit) {
      transactions = transactions.slice(0, limit);
    }

    return transactions;
  }

  /**
   * Get a specific transaction by signature
   */
  getTransaction(transactionSignature: string): TransactionRecord | undefined {
    return this.transactions.get(transactionSignature);
  }

  /**
   * Verify transaction status on-chain
   */
  private async verifyTransaction(transactionSignature: string): Promise<void> {
    try {
      const tx = await this.connection.getTransaction(transactionSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      const record = this.transactions.get(transactionSignature);
      if (!record) {
        return;
      }

      if (tx && tx.meta) {
        if (tx.meta.err) {
          record.status = 'failed';
        } else {
          record.status = 'confirmed';
          record.blockTime = tx.blockTime || undefined;
        }
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
   * Get transaction statistics for a wallet
   */
  getWalletStats(walletAddress: string): {
    totalTransactions: number;
    buyCount: number;
    sellCount: number;
    totalSolSpent: number;
    totalSolReceived: number;
  } {
    const transactions = this.getWalletTransactions(walletAddress);
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
  }
}

