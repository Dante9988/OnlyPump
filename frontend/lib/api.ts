import axios from 'axios';
import { 
  CreateTokenParams, 
  BuyTokenParams, 
  SellTokenParams, 
  PumpFunResult, 
  TokenInfo,
  TrendingToken,
  RecentToken,
  GraduatingToken,
  UserProfile,
  CreatedToken
} from './types';

// Get API URL from environment variable or use default
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Cache storage
const cache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache TTL

// Request queue for rate limiting
type QueuedRequest = {
  url: string;
  method: string;
  data?: any;
  headers?: any;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
};

const requestQueue: QueuedRequest[] = [];
let isProcessingQueue = false;
const REQUEST_DELAY = 300; // 300ms between requests

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle network errors
    if (!error.response) {
      console.error('Network error:', error);
      return Promise.reject({ error: 'Network error. Please check your connection.' });
    }
    
    // Handle rate limiting (429 errors)
    if (error.response.status === 429) {
      console.warn('Rate limited. Will retry with exponential backoff.');
      // The request will be retried by the queue processor
    }
    
    // Handle API errors
    const errorMessage = error.response.data?.error || error.message || 'Unknown error';
    console.error('API error:', errorMessage);
    return Promise.reject({ error: errorMessage });
  }
);

// Rate limiting function
async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const request = requestQueue.shift()!;
    
    try {
      let response;
      if (request.method === 'get') {
        response = await api.get(request.url, { headers: request.headers });
      } else if (request.method === 'post') {
        response = await api.post(request.url, request.data, { headers: request.headers });
      }
      
      request.resolve(response?.data);
    } catch (error: any) {
      if (error.response?.status === 429) {
        // If rate limited, put back in queue with exponential backoff
        console.warn('Rate limited. Adding back to queue with delay.');
        setTimeout(() => {
          requestQueue.push(request);
        }, 20000); // Wait 20 seconds before retrying
      } else {
        request.reject(error);
      }
    }
    
    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
  }
  
  isProcessingQueue = false;
}

// Wrapper for API calls with caching and rate limiting
async function apiCall<T>(method: string, url: string, data?: any, headers?: any, skipCache = false): Promise<T> {
  const cacheKey = `${method}:${url}:${JSON.stringify(data || {})}`;
  
  // Check cache for GET requests
  if (method === 'get' && !skipCache) {
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.data as T;
    }
  }
  
  // Add to request queue
  return new Promise<T>((resolve, reject) => {
    requestQueue.push({
      url,
      method,
      data,
      headers,
      resolve: (data) => {
        // Cache the result for GET requests
        if (method === 'get') {
          cache.set(cacheKey, { data, timestamp: Date.now() });
        }
        resolve(data);
      },
      reject
    });
    
    // Start processing queue if not already processing
    if (!isProcessingQueue) {
      processQueue();
    }
  });
}

// API functions

/**
 * Create a new token on Pump.fun
 */
export async function createToken(params: CreateTokenParams): Promise<PumpFunResult> {
  try {
    // In a real app, we would get the wallet from the wallet adapter
    // and sign the transaction. For this demo, we'll just simulate it.
    const response = await api.post('/api/pump-fun/create-token', params, {
      headers: {
        'x-wallet-public-key': localStorage.getItem('walletPublicKey') || '',
      },
    });
    return response.data;
  } catch (error: any) {
    return { 
      success: false, 
      error: error.error || 'Failed to create token' 
    };
  }
}

/**
 * Buy a token on Pump.fun
 */
export async function buyToken(params: BuyTokenParams): Promise<PumpFunResult> {
  try {
    // Check if the token has migrated to PumpSwap
    const hasPool = await checkTokenHasPool(params.tokenMint);
    
    // Use the appropriate API endpoint based on token status
    const endpoint = hasPool 
      ? '/api/pump-swap/buy-token' 
      : '/api/pump-fun/buy-token';
    
    const response = await api.post(endpoint, params, {
      headers: {
        'x-wallet-public-key': localStorage.getItem('walletPublicKey') || '',
      },
    });
    return response.data;
  } catch (error: any) {
    return { 
      success: false, 
      error: error.error || 'Failed to buy token' 
    };
  }
}

/**
 * Sell a token on Pump.fun or PumpSwap
 */
export async function sellToken(params: SellTokenParams): Promise<PumpFunResult> {
  try {
    // Check if the token has migrated to PumpSwap
    const hasPool = await checkTokenHasPool(params.tokenMint);
    
    // Use the appropriate API endpoint based on token status
    const endpoint = hasPool 
      ? '/api/pump-swap/sell-token' 
      : '/api/pump-fun/sell-token';
    
    const response = await api.post(endpoint, params, {
      headers: {
        'x-wallet-public-key': localStorage.getItem('walletPublicKey') || '',
      },
    });
    return response.data;
  } catch (error: any) {
    return { 
      success: false, 
      error: error.error || 'Failed to buy token' 
    };
  }
}

/**
 * Get token information
 */
export async function getTokenInfo(tokenMint: string): Promise<TokenInfo | null> {
  try {
    return await apiCall<TokenInfo>('get', `/api/pump-fun/token-info/${tokenMint}`);
  } catch (error) {
    console.error('Error getting token info:', error);
    return null;
  }
}

/**
 * Check if a token is a Pump.fun token
 */
export async function isPumpFunToken(tokenMint: string): Promise<boolean> {
  try {
    const response = await api.get(`/api/pump-fun/is-pump-fun-token/${tokenMint}`);
    return response.data;
  } catch (error) {
    console.error('Error checking if token is Pump.fun token:', error);
    return false;
  }
}

/**
 * Check if a token's bonding curve is complete
 */
export async function isBondingCurveComplete(tokenMint: string): Promise<boolean> {
  try {
    const response = await api.get(`/api/pump-fun/is-bonding-curve-complete/${tokenMint}`);
    return response.data;
  } catch (error) {
    console.error('Error checking if bonding curve is complete:', error);
    return false;
  }
}

/**
 * Check if a token has a PumpSwap pool
 */
export async function checkTokenHasPool(tokenMint: string): Promise<boolean> {
  try {
    return await apiCall<boolean>('get', `/api/pump-swap/has-pool/${tokenMint}`);
  } catch (error) {
    console.error('Error checking if token has PumpSwap pool:', error);
    return false;
  }
}

/**
 * Get trending tokens
 */
export async function getTrendingTokens(limit: number = 10): Promise<TrendingToken[]> {
  try {
    const response = await api.get(`/api/tokens/trending?limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error('Error getting trending tokens:', error);
    return [];
  }
}

/**
 * Get recently created tokens
 */
export async function getRecentTokens(limit: number = 10): Promise<RecentToken[]> {
  try {
    const response = await api.get(`/api/tokens/recent?limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error('Error getting recent tokens:', error);
    return [];
  }
}

/**
 * Get tokens about to graduate
 */
export async function getGraduatingTokens(limit: number = 10): Promise<GraduatingToken[]> {
  try {
    const response = await api.get(`/api/tokens/graduating?limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error('Error getting graduating tokens:', error);
    return [];
  }
}

/**
 * Subscribe to real-time token updates
 */
export function subscribeToTokenUpdates(callback: (data: any) => void) {
  // In a real implementation, this would use WebSockets or Server-Sent Events
  // For now, we'll simulate it with a polling mechanism
  const interval = setInterval(async () => {
    try {
      const response = await api.get('/api/tokens/updates');
      callback(response.data);
    } catch (error) {
      console.error('Error getting token updates:', error);
    }
  }, 5000); // Poll every 5 seconds
  
  // Return a function to unsubscribe
  return () => clearInterval(interval);
}

/**
 * Get user profile data
 */
export async function getUserProfile(address: string): Promise<UserProfile | null> {
  try {
    const response = await api.get(`/api/users/profile/${address}`);
    return response.data;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Get tokens created by a user
 */
export async function getUserCreatedTokens(address: string): Promise<CreatedToken[]> {
  try {
    const response = await api.get(`/api/users/${address}/created-tokens`);
    return response.data;
  } catch (error) {
    console.error('Error getting user created tokens:', error);
    return [];
  }
}

/**
 * Get user token balances
 */
export async function getUserTokenBalances(address: string): Promise<any[]> {
  try {
    const response = await api.get(`/api/users/${address}/token-balances`);
    return response.data;
  } catch (error) {
    console.error('Error getting user token balances:', error);
    return [];
  }
}

/**
 * Get user SOL balance
 */
export async function getUserSolBalance(address: string): Promise<number> {
  try {
    const response = await api.get(`/api/users/${address}/sol-balance`);
    return response.data.balance;
  } catch (error) {
    console.error('Error getting user SOL balance:', error);
    return 0;
  }
}

/**
 * Get creator fees for a user
 */
export async function getUserCreatorFees(address: string): Promise<number> {
  try {
    const response = await api.get(`/api/users/${address}/creator-fees`);
    return response.data.fees;
  } catch (error) {
    console.error('Error getting user creator fees:', error);
    return 0;
  }
}

/**
 * Collect creator fees
 */
export async function collectCreatorFees(address: string): Promise<PumpFunResult> {
  try {
    const response = await api.post(`/api/users/${address}/collect-fees`, {}, {
      headers: {
        'x-wallet-public-key': localStorage.getItem('walletPublicKey') || '',
      },
    });
    return response.data;
  } catch (error: any) {
    return { 
      success: false, 
      error: error.error || 'Failed to collect creator fees' 
    };
  }
}