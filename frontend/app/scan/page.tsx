'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import PageLayout from '@/components/PageLayout';
import TokenCard from '@/components/TokenCard';
import { useBlockchain } from '@/lib/blockchain';
import { TokenInfo } from '@/lib/types';
import { TokenSocketService } from '@/lib/services/token-socket.service';
import toast from 'react-hot-toast';

// Constants
const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMPSWAP_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const GRADUATION_THRESHOLD_USD = 12000; // $12K threshold for "about to graduate"

// Tab types
type TabType = 'newly-created' | 'about-to-graduate' | 'graduated';

export default function ScanPage() {
  const { connected, publicKey } = useWallet();
  const { isPumpFunToken, hasPumpSwapPool } = useBlockchain();
  
  // State
  const [activeTab, setActiveTab] = useState<TabType>('newly-created');
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [newTokens, setNewTokens] = useState<TokenInfo[]>([]);
  const [aboutToGraduateTokens, setAboutToGraduateTokens] = useState<TokenInfo[]>([]);
  const [graduatedTokens, setGraduatedTokens] = useState<TokenInfo[]>([]);
  
  // References
  const tokenSocketRef = useRef<TokenSocketService | null>(null);

  // Initialize token socket service
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    tokenSocketRef.current = new TokenSocketService(socketUrl);
    setIsClient(true);
    
    // Connect to the WebSocket server
    setupWebSocketListeners();
    
    // Cleanup function
    return () => {
      if (tokenSocketRef.current) {
        tokenSocketRef.current.disconnect();
      }
    };
  }, []);

  // Set up WebSocket listeners for token events
  const setupWebSocketListeners = () => {
    if (!tokenSocketRef.current) return;
    
    try {
      const tokenSocket = tokenSocketRef.current;
      
      // Set up event handlers
      tokenSocket.onConnect(() => {
        console.log('Connected to token monitor');
        setIsLoading(true);
      });
      
      tokenSocket.onDisconnect(() => {
        console.log('Disconnected from token monitor');
        toast.error('Disconnected from token monitor. Reconnecting...');
      });
      
      tokenSocket.onInitialTokens((data) => {
        console.log('Received initial token data');
        setNewTokens(data.newTokens);
        setAboutToGraduateTokens(data.aboutToGraduateTokens);
        setGraduatedTokens(data.graduatedTokens);
        setIsLoading(false);
      });
      
      tokenSocket.onNewToken((token) => {
        console.log('New token detected:', token.name);
        setNewTokens(prev => [token, ...prev]);
        toast.success(`New token detected: ${token.name}`);
      });
      
      tokenSocket.onAboutToGraduate((token) => {
        console.log('Token about to graduate:', token.name);
        // Remove from new tokens if it exists there
        setNewTokens(prev => prev.filter(t => t.mint !== token.mint));
        // Add to about to graduate tokens
        setAboutToGraduateTokens(prev => [token, ...prev]);
        toast.success(`Token about to graduate: ${token.name}`);
      });
      
      tokenSocket.onGraduated((token) => {
        console.log('Token graduated:', token.name);
        // Remove from new tokens and about to graduate tokens if it exists there
        setNewTokens(prev => prev.filter(t => t.mint !== token.mint));
        setAboutToGraduateTokens(prev => prev.filter(t => t.mint !== token.mint));
        // Add to graduated tokens
        setGraduatedTokens(prev => [token, ...prev]);
        toast.success(`Token graduated: ${token.name}`);
      });
      
      // Connect to the WebSocket server
      tokenSocket.connect();
      
      // For UI demonstration, also add simulated tokens periodically
      const intervalId = setInterval(() => {
        simulateNewToken();
      }, 30000); // Every 30 seconds
      
      return () => {
        clearInterval(intervalId);
        tokenSocket.disconnect();
      };
    } catch (error) {
      console.error('Error setting up WebSocket listeners:', error);
      toast.error('Failed to connect to token monitor');
    }
  };

  // Fetch tokens from the WebSocket server
  const fetchTokens = () => {
    if (!tokenSocketRef.current) return;
    
    setIsLoading(true);
    tokenSocketRef.current.requestTokens();
  };

  // Simulate a new token being created
  const simulateNewToken = () => {
    const newToken = generateMockTokens(1, false, false)[0];
    setNewTokens(prev => [newToken, ...prev]);
    toast.success(`New token detected: ${newToken.name}`);
  };

  // Generate mock token data for UI demonstration
  const generateMockTokens = (count: number, highMarketCap: boolean, graduated: boolean): TokenInfo[] => {
    const tokens: TokenInfo[] = [];
    
    const prefixes = ['PUMP', 'MEME', 'PEPE', 'DOGE', 'CAT', 'SHIB', 'MOON', 'ROCKET', 'FROG', 'APE'];
    const suffixes = ['INU', 'MOON', 'SWAP', 'FUN', 'COIN', 'TOKEN', 'FINANCE', 'CASH', 'GOLD', 'DIAMOND'];
    
    for (let i = 0; i < count; i++) {
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
      const symbol = `${prefix}${suffix}`;
      
      // Generate random market data
      const basePrice = highMarketCap ? 0.0001 + Math.random() * 0.01 : 0.00001 + Math.random() * 0.0001;
      const supply = BigInt(Math.floor(100000000 + Math.random() * 900000000));
      const marketCap = highMarketCap ? 
        12000 + Math.random() * 50000 : 
        1000 + Math.random() * 10000;
      
      tokens.push({
        mint: `${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
        name: `${prefix} ${suffix}`,
        symbol,
        uri: `https://arweave.net/placeholder-${symbol.toLowerCase()}`,
        supply,
        bondingCurveAddress: `bonding-curve-${i}`,
        isComplete: graduated,
        price: basePrice,
        marketCap,
        liquidity: marketCap * 0.3 + Math.random() * marketCap * 0.2
      });
    }
    
    return tokens;
  };

  // Buy a token
  const handleBuyToken = async (token: TokenInfo) => {
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    toast.loading(`Buying ${token.symbol}...`);
    // Implement actual buy logic here
    setTimeout(() => {
      toast.dismiss();
      toast.success(`Successfully bought ${token.symbol}!`);
    }, 2000);
  };

  // Get tokens for the active tab
  const getActiveTokens = () => {
    switch (activeTab) {
      case 'newly-created':
        return newTokens;
      case 'about-to-graduate':
        return aboutToGraduateTokens;
      case 'graduated':
        return graduatedTokens;
      default:
        return [];
    }
  };

  return (
    <PageLayout>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Token Scanner</h1>
          
          <div className="flex items-center space-x-2">
            <button 
              className="btn btn-sm btn-ghost"
              onClick={fetchTokens}
              disabled={isLoading || !tokenSocketRef.current?.isSocketConnected()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="tabs tabs-boxed mb-6">
          <a 
            className={`tab ${activeTab === 'newly-created' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('newly-created')}
          >
            Newly Created
            <span className="ml-2 badge badge-sm">{newTokens.length}</span>
          </a>
          <a 
            className={`tab ${activeTab === 'about-to-graduate' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('about-to-graduate')}
          >
            About to Graduate
            <span className="ml-2 badge badge-sm">{aboutToGraduateTokens.length}</span>
          </a>
          <a 
            className={`tab ${activeTab === 'graduated' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('graduated')}
          >
            Graduated
            <span className="ml-2 badge badge-sm">{graduatedTokens.length}</span>
          </a>
        </div>
        
        {/* Token Grid */}
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="loading loading-spinner loading-lg"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {getActiveTokens().map(token => (
              <TokenCard 
                key={token.mint}
                token={token}
                onBuy={() => handleBuyToken(token)}
              />
            ))}
          </div>
        )}
        
        {!isLoading && getActiveTokens().length === 0 && (
          <div className="text-center py-12">
            <p className="text-lg opacity-70">No tokens found</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
