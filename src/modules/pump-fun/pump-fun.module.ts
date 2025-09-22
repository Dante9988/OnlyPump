import { Module } from '@nestjs/common';
import { PumpFunService } from './pump-fun.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PumpFunService,
      useFactory: (configService: ConfigService) => {
        const rpcUrl = configService.get<string>('RPC_ENDPOINT');
        return new PumpFunService(rpcUrl);
      },
      inject: [ConfigService],
    }
  ],
  exports: [PumpFunService],
})
export class PumpFunModule {}
