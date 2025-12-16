import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { WalletAuthService } from '../../services/wallet-auth.service';
import * as crypto from 'crypto';

interface SignaturePayload {
  wallet: string;
  signature: string;
  timestamp: number;
  nonce: string;
  method: string;
  path: string;
  bodyHash: string;
  cluster?: string;
}

/**
 * Guard that verifies x-request-signature with:
 * - wallet (public key)
 * - signature (base64)
 * - timestamp (unix ms)
 * - nonce (unique per request)
 * - method + path
 * - bodyHash (sha256 hex of raw JSON body)
 *
 * Expected header format (JSON string):
 * {
 *   "wallet": "WalletPubkey111...",
 *   "signature": "base64Signature",
 *   "timestamp": 1710000000000,
 *   "nonce": "uuid-or-random",
 *   "method": "POST",
 *   "path": "/api/presale/...",
 *   "bodyHash": "sha256hex..."
 * }
 */
@Injectable()
export class XRequestSignatureGuard implements CanActivate {
  private readonly logger = new Logger(XRequestSignatureGuard.name);

  // Simple in-memory nonce store with TTL; can be swapped to Redis later.
  private readonly nonceStore = new Map<string, number>();
  private readonly NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly walletAuthService: WalletAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-request-signature'];
    const clusterHeader = req.headers['x-solana-cluster'];

    if (!header || typeof header !== 'string') {
      throw new UnauthorizedException('Missing x-request-signature header');
    }

    let payload: SignaturePayload;
    try {
      payload = JSON.parse(header) as SignaturePayload;
    } catch (err) {
      this.logger.error('Failed to parse x-request-signature as JSON', err as Error);
      throw new UnauthorizedException('Invalid x-request-signature format (expected JSON)');
    }

    const { wallet, signature, timestamp, nonce, method, path, bodyHash } = payload;
    if (!wallet || !signature || !timestamp || !nonce || !method || !path || !bodyHash) {
      throw new UnauthorizedException('Incomplete x-request-signature payload');
    }

    const cluster =
      (typeof payload.cluster === 'string' && payload.cluster.trim()) ||
      (typeof clusterHeader === 'string' && clusterHeader.trim()) ||
      'devnet';
    const normalizedCluster =
      cluster.toLowerCase() === 'mainnet' ? 'mainnet-beta' : cluster.toLowerCase();
    if (normalizedCluster !== 'devnet' && normalizedCluster !== 'mainnet-beta') {
      throw new UnauthorizedException(`Unsupported Solana cluster: ${normalizedCluster}`);
    }
    // If both provided, enforce they match
    if (
      typeof payload.cluster === 'string' &&
      typeof clusterHeader === 'string' &&
      payload.cluster.trim().toLowerCase() !== clusterHeader.trim().toLowerCase()
    ) {
      throw new UnauthorizedException('Cluster mismatch between header and signature payload');
    }

    const now = Date.now();
    const delta = Math.abs(now - timestamp);
    if (delta > this.MAX_CLOCK_SKEW_MS) {
      throw new UnauthorizedException('Signature timestamp out of allowed window');
    }

    // Replay protection
    this.evictExpiredNonces(now);
    if (this.nonceStore.has(nonce)) {
      throw new UnauthorizedException('Replay detected: nonce already used');
    }
    this.nonceStore.set(nonce, now);

    // Verify method + path match current request
    const requestPath = req.originalUrl || req.url;
    if (method.toUpperCase() !== req.method.toUpperCase()) {
      throw new UnauthorizedException('Method mismatch in signature payload');
    }
    if (!requestPath.startsWith(path)) {
      // allow minor variations (e.g. query params) but require prefix match
      throw new UnauthorizedException('Path mismatch in signature payload');
    }

    // Compute body hash
    const rawBody =
      (req as any).rawBody ??
      (req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '');
    const computedBodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    if (computedBodyHash !== bodyHash) {
      throw new UnauthorizedException('Body hash mismatch');
    }

    // Build canonical message to verify with wallet
    const messageV2 = [
      `method:${method.toUpperCase()}`,
      `path:${path}`,
      `timestamp:${timestamp}`,
      `nonce:${nonce}`,
      `bodyHash:${bodyHash}`,
      `cluster:${normalizedCluster}`,
    ].join('|');

    // Backward compatibility:
    // - Old clients didn't include cluster in the signed message.
    // - We ONLY allow v1 when cluster was not explicitly provided and resolves to devnet.
    const messageV1 = [
      `method:${method.toUpperCase()}`,
      `path:${path}`,
      `timestamp:${timestamp}`,
      `nonce:${nonce}`,
      `bodyHash:${bodyHash}`,
    ].join('|');

    const hasExplicitCluster =
      (typeof payload.cluster === 'string' && payload.cluster.trim().length > 0) ||
      (typeof clusterHeader === 'string' && clusterHeader.trim().length > 0);

    const isValidV2 = this.walletAuthService.verifySignature(wallet, signature, messageV2);
    const isValidV1 =
      !hasExplicitCluster &&
      normalizedCluster === 'devnet' &&
      this.walletAuthService.verifySignature(wallet, signature, messageV1);

    if (!isValidV2 && !isValidV1) {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    // Attach user context to request for downstream handlers
    (req as any).walletAddress = wallet;
    (req as any).user = { walletPubkey: wallet };
    (req as any).solanaCluster = normalizedCluster;

    return true;
  }

  private evictExpiredNonces(now: number) {
    for (const [nonce, createdAt] of this.nonceStore.entries()) {
      if (now - createdAt > this.NONCE_TTL_MS) {
        this.nonceStore.delete(nonce);
      }
    }
  }
}


