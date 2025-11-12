import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Connection } from '@solana/web3.js';
import { TokenManagementController } from './api/controllers/token-management.controller';
import { TransactionHistoryController } from './api/controllers/transaction-history.controller';
import { JitoService } from './services/jito.service';
import { TokenManagementService } from './services/token-management.service';
import { WalletAuthService } from './services/wallet-auth.service';
import { TransactionHistoryService } from './services/transaction-history.service';
import { VanityAddressManagerService } from './services/vanity-address-manager.service';
import { WalletMiddleware } from './api/middleware/wallet.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [
    TokenManagementController,
    TransactionHistoryController,
  ],
  providers: [
    JitoService,
    TokenManagementService,
    WalletAuthService,
    VanityAddressManagerService,
    {
      provide: Connection,
      useFactory: (configService: ConfigService) => {
        const rpcUrl =
          configService.get<string>('SOLANA_RPC_URL') ||
          'https://api.devnet.solana.com';
        return new Connection(rpcUrl, 'confirmed');
      },
      inject: [ConfigService],
    },
    TransactionHistoryService,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(WalletMiddleware)
      .forRoutes(
        { path: 'api/tokens/create', method: RequestMethod.POST },
        { path: 'api/tokens/create-and-buy', method: RequestMethod.POST },
        { path: 'api/tokens/buy', method: RequestMethod.POST },
        { path: 'api/tokens/sell', method: RequestMethod.POST },
        { path: 'api/transactions/:walletAddress', method: RequestMethod.GET },
        { path: 'api/transactions/:walletAddress/stats', method: RequestMethod.GET },
      );
    // Note: api/transactions/tx/:signature is public (no auth required)
  }
}