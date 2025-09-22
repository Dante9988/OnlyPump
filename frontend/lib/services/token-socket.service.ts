import { io, Socket } from 'socket.io-client';
import { TokenInfo } from '../types';

export class TokenSocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  
  // Event callbacks
  private onConnectCallback: (() => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private onNewTokenCallback: ((token: TokenInfo) => void) | null = null;
  private onAboutToGraduateCallback: ((token: TokenInfo) => void) | null = null;
  private onGraduatedCallback: ((token: TokenInfo) => void) | null = null;
  private onInitialTokensCallback: ((data: {
    newTokens: TokenInfo[];
    aboutToGraduateTokens: TokenInfo[];
    graduatedTokens: TokenInfo[];
  }) => void) | null = null;
  
  constructor(private readonly socketUrl: string) {}
  
  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.isConnected) return;
    
    try {
      this.socket = io(`${this.socketUrl}/token-monitor`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
      });
      
      this.setupEventListeners();
    } catch (error) {
      console.error('Error connecting to token monitor socket:', error);
    }
  }
  
  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (!this.isConnected || !this.socket) return;
    
    try {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    } catch (error) {
      console.error('Error disconnecting from token monitor socket:', error);
    }
  }
  
  /**
   * Request initial token data
   */
  requestTokens(): void {
    if (!this.isConnected || !this.socket) return;
    
    this.socket.emit('requestTokens');
  }
  
  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;
    
    this.socket.on('connect', () => {
      console.log('Connected to token monitor socket');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      if (this.onConnectCallback) {
        this.onConnectCallback();
      }
      
      // Request initial token data
      this.requestTokens();
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from token monitor socket');
      this.isConnected = false;
      
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback();
      }
    });
    
    this.socket.on('initialTokens', (data) => {
      console.log('Received initial token data');
      
      if (this.onInitialTokensCallback) {
        this.onInitialTokensCallback(data);
      }
    });
    
    this.socket.on('newToken', (token) => {
      console.log('New token detected:', token.name);
      
      if (this.onNewTokenCallback) {
        this.onNewTokenCallback(token);
      }
    });
    
    this.socket.on('aboutToGraduate', (token) => {
      console.log('Token about to graduate:', token.name);
      
      if (this.onAboutToGraduateCallback) {
        this.onAboutToGraduateCallback(token);
      }
    });
    
    this.socket.on('graduated', (token) => {
      console.log('Token graduated:', token.name);
      
      if (this.onGraduatedCallback) {
        this.onGraduatedCallback(token);
      }
    });
    
    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
    
    this.socket.on('reconnect_attempt', (attempt) => {
      console.log(`Reconnect attempt ${attempt}/${this.maxReconnectAttempts}`);
      this.reconnectAttempts = attempt;
    });
    
    this.socket.on('reconnect_failed', () => {
      console.error('Failed to reconnect to token monitor socket');
    });
  }
  
  /**
   * Set event callbacks
   */
  onConnect(callback: () => void): void {
    this.onConnectCallback = callback;
  }
  
  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }
  
  onInitialTokens(callback: (data: {
    newTokens: TokenInfo[];
    aboutToGraduateTokens: TokenInfo[];
    graduatedTokens: TokenInfo[];
  }) => void): void {
    this.onInitialTokensCallback = callback;
  }
  
  onNewToken(callback: (token: TokenInfo) => void): void {
    this.onNewTokenCallback = callback;
  }
  
  onAboutToGraduate(callback: (token: TokenInfo) => void): void {
    this.onAboutToGraduateCallback = callback;
  }
  
  onGraduated(callback: (token: TokenInfo) => void): void {
    this.onGraduatedCallback = callback;
  }
  
  /**
   * Check if connected to the WebSocket server
   */
  isSocketConnected(): boolean {
    return this.isConnected;
  }
}
