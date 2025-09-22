import { Module } from '@nestjs/common';
import { PumpSwapService } from './pump-swap.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PumpSwapService,
      useFactory: (configService: ConfigService) => {
        const rpcUrl = configService.get<string>('RPC_ENDPOINT');
        return new PumpSwapService(rpcUrl);
      },
      inject: [ConfigService],
    }
  ],
  exports: [PumpSwapService],
})
export class PumpSwapModule {}
