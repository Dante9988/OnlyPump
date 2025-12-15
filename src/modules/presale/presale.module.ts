import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Connection } from '@solana/web3.js';
import { PresaleController } from '../../api/controllers/presale.controller';
import { PresaleService } from '../../services/presale.service';
import { PresaleOrchestratorService } from '../../services/presale-orchestrator.service';
import { XRequestSignatureGuard } from '../../api/guards/x-request-signature.guard';
import { WalletAuthService } from '../../services/wallet-auth.service';
import { TokenManagementService } from '../../services/token-management.service';
import { JitoService } from '../../services/jito.service';
import { VanityAddressManagerService } from '../../services/vanity-address-manager.service';
import { SupabaseService } from '../../services/supabase.service';
import { PriceService } from '../../services/price.service';

@Module({
  imports: [ConfigModule],
  controllers: [PresaleController],
  providers: [
    {
      provide: Connection,
      useFactory: (configService: ConfigService) => {
        // Prefer SOLANA_DEVNET_RPC_URL for devnet testing, fallback to SOLANA_RPC_URL for production
        const rpcUrl =
          configService.get<string>('SOLANA_DEVNET_RPC_URL') ||
          configService.get<string>('SOLANA_RPC_URL') ||
          'https://api.devnet.solana.com';
        console.log(`[PresaleModule] Creating Connection with RPC URL: ${rpcUrl}`);
        return new Connection(rpcUrl, 'confirmed');
      },
      inject: [ConfigService],
    },
    PresaleService,
    PresaleOrchestratorService,
    XRequestSignatureGuard,
    // Reuse existing services for orchestrator dependencies
    WalletAuthService,
    TokenManagementService,
    JitoService,
    VanityAddressManagerService,
    SupabaseService,
    PriceService,
  ],
  exports: [PresaleService, PresaleOrchestratorService],
})
export class PresaleModule {}


