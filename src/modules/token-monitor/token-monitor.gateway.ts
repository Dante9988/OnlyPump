import { 
  WebSocketGateway, 
  WebSocketServer, 
  OnGatewayConnection, 
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';
import { ConfigService } from '@nestjs/config';
import { TokenMonitorService } from './token-monitor.service.js';
import { safeStringify } from '../../utils/bigint-serializer';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'token-monitor',
})
@Injectable()
export class TokenMonitorGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(TokenMonitorGateway.name);
  private clientCount = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenMonitorService: TokenMonitorService,
  ) {}

  afterInit() {
    this.logger.log('Token Monitor WebSocket Gateway initialized');
    
    // Start monitoring tokens when the gateway initializes
    this.tokenMonitorService.startMonitoring(
      (token) => this.handleNewToken(token),
      (token) => this.handleAboutToGraduate(token),
      (token) => this.handleGraduated(token),
    );
  }

  handleConnection(client: Socket) {
    this.clientCount++;
    this.logger.log(`Client connected: ${client.id}. Total clients: ${this.clientCount}`);
    
    // Send initial token data to the client
    this.sendInitialData(client);
  }

  handleDisconnect(client: Socket) {
    this.clientCount--;
    this.logger.log(`Client disconnected: ${client.id}. Total clients: ${this.clientCount}`);
    
    // If no clients are connected, we could optionally pause monitoring
    if (this.clientCount === 0) {
      // this.tokenMonitorService.pauseMonitoring();
    }
  }

  @SubscribeMessage('requestTokens')
  async handleRequestTokens(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    await this.sendInitialData(client);
    return { success: true };
  }

  @SubscribeMessage('buyToken')
  async handleBuyToken(
    @MessageBody() data: { tokenMint: string, solAmount: number },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Buy token request: ${JSON.stringify(data)}`);
    // In a real implementation, you would handle the buy request here
    // This would require user authentication and wallet management
    
    return { success: true, message: 'Buy request received' };
  }

  private async sendInitialData(client: Socket) {
    try {
      const { newTokens, aboutToGraduateTokens, graduatedTokens } = 
        await this.tokenMonitorService.fetchTokens();
      
      // Use safe stringify to handle BigInt values
      const data = {
        newTokens: this.prepareBigIntData(newTokens),
        aboutToGraduateTokens: this.prepareBigIntData(aboutToGraduateTokens),
        graduatedTokens: this.prepareBigIntData(graduatedTokens),
      };
      
      client.emit('initialTokens', data);
    } catch (error) {
      this.logger.error('Error sending initial data', error);
    }
  }
  
  /**
   * Prepare data for sending to client by handling BigInt values
   */
  private prepareBigIntData(tokens: any[]) {
    return tokens.map(token => {
      // Convert BigInt supply to string if it exists
      if (token.supply && typeof token.supply === 'bigint') {
        return {
          ...token,
          supply: token.supply.toString()
        };
      }
      return token;
    });
  }

  private handleNewToken(token: any) {
    this.logger.log(`New token detected: ${token.name}`);
    // Prepare token data for sending to client
    const preparedToken = this.prepareBigIntData([token])[0];
    this.server.emit('newToken', preparedToken);
  }

  private handleAboutToGraduate(token: any) {
    this.logger.log(`Token about to graduate: ${token.name}`);
    // Prepare token data for sending to client
    const preparedToken = this.prepareBigIntData([token])[0];
    this.server.emit('aboutToGraduate', preparedToken);
  }

  private handleGraduated(token: any) {
    this.logger.log(`Token graduated: ${token.name}`);
    // Prepare token data for sending to client
    const preparedToken = this.prepareBigIntData([token])[0];
    this.server.emit('graduated', preparedToken);
  }
}
