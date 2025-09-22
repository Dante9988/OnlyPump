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
