import { Global, Module, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import { Connection } from '@solana/web3.js';
import type { Request } from 'express';

export type SolanaCluster = 'devnet' | 'mainnet-beta';

function normalizeCluster(input: unknown): SolanaCluster {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw || raw === 'devnet') return 'devnet';
  if (raw === 'mainnet' || raw === 'mainnet-beta') return 'mainnet-beta';
  throw new Error(`Unsupported Solana cluster: ${raw}`);
}

@Global()
@Module({
  providers: [
    {
      provide: Connection,
      scope: Scope.REQUEST,
      inject: [ConfigService, REQUEST],
      useFactory: (configService: ConfigService, req: Request) => {
        const cluster = normalizeCluster(
          (req.headers['x-solana-cluster'] as string) ||
            (req.query as any)?.cluster ||
            configService.get<string>('SOLANA_CLUSTER') ||
            'devnet',
        );

        // Attach cluster to request for downstream logic (guards/controllers/services)
        (req as any).solanaCluster = cluster;

        const rpcUrl =
          cluster === 'mainnet-beta'
            ? configService.get<string>('SOLANA_RPC_URL_MAINNET') || 'https://api.mainnet-beta.solana.com'
            : configService.get<string>('SOLANA_RPC_URL_DEVNET') || 'https://api.devnet.solana.com';

        return new Connection(rpcUrl, 'confirmed');
      },
    },
  ],
  exports: [Connection],
})
export class SolanaModule {}


