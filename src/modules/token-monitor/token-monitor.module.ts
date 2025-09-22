import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TokenMonitorService } from './token-monitor.service';
import { TokenMonitorGateway } from './token-monitor.gateway';

@Module({
  imports: [ConfigModule],
  providers: [TokenMonitorService, TokenMonitorGateway],
  exports: [TokenMonitorService],
})
export class TokenMonitorModule {}
