import { Keypair, PublicKey, Transaction } from '@solana/web3.js';

/**
 * Interface for wallet providers that can be used with our services
 */
export interface WalletProvider {
  /**
   * Gets the public key of the wallet
   */
  getPublicKey(): Promise<PublicKey>;
  
  /**
   * Signs a transaction
   * @param transaction Transaction to sign
   * @returns Signed transaction
   */
  signTransaction(transaction: Transaction): Promise<Transaction>;
  
  /**
   * Signs multiple transactions
   * @param transactions Transactions to sign
   * @returns Signed transactions
   */
  signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>;
  
  /**
   * Signs a message
   * @param message Message to sign
   * @returns Signature
   */
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Keypair-based wallet provider implementation
 */
export class KeypairWalletProvider implements WalletProvider {
  private keypair: Keypair;
  
  constructor(keypair: Keypair) {
    this.keypair = keypair;
  }
  
  async getPublicKey(): Promise<PublicKey> {
    return this.keypair.publicKey;
  }
  
  async signTransaction(transaction: Transaction): Promise<Transaction> {
    transaction.partialSign(this.keypair);
    return transaction;
  }
  
  async signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    return transactions.map(tx => {
      tx.partialSign(this.keypair);
      return tx;
    });
  }
  
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    // Note: This is a simplified implementation
    // In a real implementation, you would use ed25519 to sign the message
    return Uint8Array.from(this.keypair.secretKey.slice(0, 64));
  }
}

/**
 * Web3 wallet adapter implementation
 * This can be used with browser wallet extensions
 */
export class Web3WalletProvider implements WalletProvider {
  private wallet: any; // This would be a wallet adapter from @solana/wallet-adapter
  
  constructor(wallet: any) {
    this.wallet = wallet;
  }
  
  async getPublicKey(): Promise<PublicKey> {
    return this.wallet.publicKey;
  }
  
  async signTransaction(transaction: Transaction): Promise<Transaction> {
    return await this.wallet.signTransaction(transaction);
  }
  
  async signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    return await this.wallet.signAllTransactions(transactions);
  }
  
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    return await this.wallet.signMessage(message);
  }
}
