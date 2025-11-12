import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

/**
 * Service for wallet signature verification
 * Verifies that requests are signed by the wallet's private key
 */
@Injectable()
export class WalletAuthService {
  private readonly logger = new Logger(WalletAuthService.name);

  /**
   * Verify a wallet signature
   * @param walletAddress - The public key of the wallet
   * @param signature - Base64 encoded signature
   * @param message - The message that was signed
   * @returns true if signature is valid
   */
  verifySignature(
    walletAddress: string,
    signature: string,
    message: string,
  ): boolean {
    try {
      const publicKey = new PublicKey(walletAddress);
      const signatureBytes = Buffer.from(signature, 'base64');
      const messageBytes = Buffer.from(message, 'utf8');

      // Verify using ed25519 (Solana uses ed25519)
      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKey.toBytes(),
      );

      if (!isValid) {
        this.logger.warn(
          `Invalid signature for wallet: ${walletAddress}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Error verifying signature: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  /**
   * Generate a nonce for wallet authentication
   * This should be unique per request to prevent replay attacks
   */
  generateNonce(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Create a standard message for the user to sign
   * Uses a fixed message format that doesn't require a nonce (simpler for frontend)
   * @param walletAddress - The wallet address
   * @returns The message to sign
   */
  createSignMessage(walletAddress: string): string {
    return `Sign this message to authenticate with OnlyPump API.\n\nWallet: ${walletAddress}\n\nThis signature proves you own this wallet and allows you to interact with the API.`;
  }

  /**
   * Create a message for the user to sign (with nonce for extra security)
   * @param walletAddress - The wallet address
   * @param nonce - A unique nonce
   * @param action - The action being performed (e.g., 'buy', 'sell')
   * @returns The message to sign
   */
  createSignMessageWithNonce(
    walletAddress: string,
    nonce: string,
    action?: string,
  ): string {
    const timestamp = new Date().toISOString();
    const actionPart = action ? `\nAction: ${action}` : '';
    return `Sign this message to authenticate with OnlyPump API.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\nNonce: ${nonce}${actionPart}\n\nThis signature proves you own this wallet and allows you to interact with the API.`;
  }

  /**
   * Extract signature from request header
   * @param signatureHeader - The x-request-signature header value
   * @returns Object with wallet address and signature
   */
  parseSignatureHeader(signatureHeader: string): {
    walletAddress: string;
    signature: string;
    message: string;
  } {
    try {
      // Format: "wallet:address,signature:base64,message:utf8"
      // Or JSON: {"wallet":"address","signature":"base64","message":"utf8"}
      if (signatureHeader.startsWith('{')) {
        const parsed = JSON.parse(signatureHeader);
        return {
          walletAddress: parsed.wallet || parsed.walletAddress,
          signature: parsed.signature,
          message: parsed.message,
        };
      } else {
        // Parse comma-separated format
        const parts = signatureHeader.split(',');
        const walletPart = parts.find((p) => p.startsWith('wallet:'));
        const sigPart = parts.find((p) => p.startsWith('signature:'));
        const msgPart = parts.find((p) => p.startsWith('message:'));

        return {
          walletAddress: walletPart?.split(':')[1] || '',
          signature: sigPart?.split(':')[1] || '',
          message: msgPart?.split(':')[1] || '',
        };
      }
    } catch (error) {
      this.logger.error(
        `Error parsing signature header: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new UnauthorizedException('Invalid signature format');
    }
  }

  /**
   * Verify request signature from header (legacy method for backward compatibility)
   * @param signatureHeader - The x-request-signature header value (JSON format)
   * @returns The verified wallet address
   * @throws UnauthorizedException if signature is invalid or expired
   */
  verifyRequestSignature(signatureHeader: string): string {
    if (!signatureHeader) {
      throw new UnauthorizedException('Missing x-request-signature header');
    }

    const { walletAddress, signature, message } =
      this.parseSignatureHeader(signatureHeader);

    if (!walletAddress || !signature || !message) {
      throw new UnauthorizedException('Invalid signature format');
    }

    // Verify timestamp is within 1 hour
    const timestampMatch = message.match(/Timestamp: (.+)/);
    if (timestampMatch) {
      const messageTimestamp = new Date(timestampMatch[1]);
      const now = new Date();
      const diffMs = now.getTime() - messageTimestamp.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours > 1) {
        this.logger.warn(
          `Signature expired: ${diffHours.toFixed(2)} hours old for wallet: ${walletAddress}`,
        );
        throw new UnauthorizedException(
          'Signature expired. Please generate a new signature (valid for 1 hour).',
        );
      }

      if (diffHours < 0) {
        this.logger.warn(
          `Signature from future: ${Math.abs(diffHours).toFixed(2)} hours ahead for wallet: ${walletAddress}`,
        );
        throw new UnauthorizedException('Invalid signature timestamp');
      }
    }

    if (!this.verifySignature(walletAddress, signature, message)) {
      throw new UnauthorizedException('Invalid signature');
    }

    return walletAddress;
  }
}

