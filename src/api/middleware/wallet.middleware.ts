import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PublicKey } from '@solana/web3.js';
import { WalletAuthService } from '../../services/wallet-auth.service';

/**
 * Middleware to verify wallet signatures from x-request-signature header
 * This ensures requests are authenticated by the wallet's private key
 */
@Injectable()
export class WalletMiddleware implements NestMiddleware {
  constructor(private walletAuthService: WalletAuthService) {}

  use(req: Request, res: Response, next: NextFunction) {
    try {
      // Get signature from header
      const signature = req.headers['x-request-signature'] as string;

      if (!signature) {
        throw new UnauthorizedException(
          'Missing x-request-signature header. Please sign the request with your wallet.',
        );
      }

      // Get wallet address from route params (e.g., /api/transactions/:walletAddress)
      // Fallback to body or query for other endpoints
      const walletAddress = 
        (req.params as any).walletAddress || 
        (req.body as any)?.walletAddress ||
        (req.query as any)?.walletAddress;

      if (!walletAddress) {
        throw new UnauthorizedException(
          'Missing wallet address. Please provide wallet address in route parameter, body, or query.',
        );
      }

      // Create standard message to verify
      const message = this.walletAuthService.createSignMessage(walletAddress);

      // Verify signature matches the wallet address
      if (!this.walletAuthService.verifySignature(walletAddress, signature, message)) {
        throw new UnauthorizedException('Invalid signature. Signature does not match wallet address.');
      }

      // Attach verified wallet address to request
      (req as any).walletAddress = walletAddress;
      (req as any).walletPublicKey = new PublicKey(walletAddress);

      next();
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(
        `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
