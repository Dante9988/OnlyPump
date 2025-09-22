import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PumpFunModule } from './modules/pump-fun/pump-fun.module';
import { PumpSwapModule } from './modules/pump-swap/pump-swap.module';
import { TokenMonitorModule } from './modules/token-monitor/token-monitor.module';
import { TokensModule } from './tokens/tokens.module';
import { UsersModule } from './users/users.module';
import { PumpFunController } from './api/controllers/pump-fun.controller';
import { PumpSwapController } from './api/controllers/pump-swap.controller';
import { JitoService } from './services/jito.service';
import { WalletMiddleware } from './api/middleware/wallet.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PumpFunModule,
    PumpSwapModule,
    TokenMonitorModule,
    TokensModule,
    UsersModule,
  ],
  controllers: [PumpFunController, PumpSwapController],
  providers: [JitoService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(WalletMiddleware)
      .forRoutes(
        { path: 'api/pump-fun/create-token', method: RequestMethod.POST },
        { path: 'api/pump-fun/buy-token', method: RequestMethod.POST },
        { path: 'api/pump-fun/sell-token', method: RequestMethod.POST },
        { path: 'api/pump-swap/buy-token', method: RequestMethod.POST },
        { path: 'api/pump-swap/sell-token', method: RequestMethod.POST },
        { path: 'api/users/:address/collect-fees', method: RequestMethod.POST },
      );
  }
}