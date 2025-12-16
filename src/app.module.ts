import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TokenManagementController } from './api/controllers/token-management.controller';
import { TransactionHistoryController } from './api/controllers/transaction-history.controller';
import { HealthController } from './api/controllers/health.controller';
import { TokensVanityController } from './api/controllers/tokens-vanity.controller';
import { JitoService } from './services/jito.service';
import { TokenManagementService } from './services/token-management.service';
import { WalletAuthService } from './services/wallet-auth.service';
import { TransactionHistoryService } from './services/transaction-history.service';
import { VanityAddressManagerService } from './services/vanity-address-manager.service';
import { SupabaseService } from './services/supabase.service';
import { PriceService } from './services/price.service';
import { WalletMiddleware } from './api/middleware/wallet.middleware';
import supabaseConfig from './config/supabase.config';
import { PresaleModule } from './modules/presale/presale.module';
import { SolanaModule } from './modules/solana/solana.module';
import { XRequestSignatureGuard } from './api/guards/x-request-signature.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [supabaseConfig],
    }),
    SolanaModule,
    PresaleModule,
  ],
  controllers: [
    TokenManagementController,
    TokensVanityController,
    TransactionHistoryController,
    HealthController,
  ],
  providers: [
    JitoService,
    TokenManagementService,
    WalletAuthService,
    VanityAddressManagerService,
    SupabaseService,
    PriceService,
    TransactionHistoryService,
    XRequestSignatureGuard,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // Legacy WalletMiddleware removed from routes:
    // - /api/presale/* and /api/tokens/* use JSON x-request-signature (XRequestSignatureGuard)
    // - /api/transactions/* also uses JSON x-request-signature (XRequestSignatureGuard)
    // Keeping WalletMiddleware in the codebase for now for backwards compatibility if needed later.
    // Note: api/transactions/tx/:signature is public (no auth required)
  }
}