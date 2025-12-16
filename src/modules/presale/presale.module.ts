import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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


