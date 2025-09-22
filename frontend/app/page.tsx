'use client';

import { useState, useEffect } from 'react';
import PageLayout from '@/components/PageLayout';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/solid';
import { getTrendingTokens, getRecentTokens, getGraduatingTokens, subscribeToTokenUpdates } from '@/lib/api';
import { TrendingToken, RecentToken, GraduatingToken } from '@/lib/types';

export default function Home() {
  const { connected } = useWallet();
  const [activeTab, setActiveTab] = useState('trending');
  const [isLoading, setIsLoading] = useState(true);
  
  // Token data states
  const [trendingTokens, setTrendingTokens] = useState<TrendingToken[]>([]);
  const [recentTokens, setRecentTokens] = useState<RecentToken[]>([]);
  const [graduatingTokens, setGraduatingTokens] = useState<GraduatingToken[]>([]);
  
  // Load initial data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      
      try {
        // Fetch data based on active tab
        if (activeTab === 'trending' || activeTab === '') {
          const trending = await getTrendingTokens(10);
          setTrendingTokens(trending);
        }
        
        if (activeTab === 'recent' || activeTab === '') {
          const recent = await getRecentTokens(6);
          setRecentTokens(recent);
        }
        
        if (activeTab === 'graduating' || activeTab === '') {
          const graduating = await getGraduatingTokens(6);
          setGraduatingTokens(graduating);
        }
      } catch (error) {
        console.error('Error fetching token data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [activeTab]);
  
  // Subscribe to real-time updates
  useEffect(() => {
    // Subscribe to token updates
    const unsubscribe = subscribeToTokenUpdates((data) => {
      // Process new tokens and updates
      if (data.newTrendingTokens && data.newTrendingTokens.length > 0) {
        handleNewTrendingTokens(data.newTrendingTokens);
      }
      
      if (data.newRecentTokens && data.newRecentTokens.length > 0) {
        handleNewRecentTokens(data.newRecentTokens);
      }
      
      if (data.newGraduatingTokens && data.newGraduatingTokens.length > 0) {
        handleNewGraduatingTokens(data.newGraduatingTokens);
      }
      
      // Process token updates (price changes, etc.)
      if (data.tokenUpdates) {
        updateTokenData(data.tokenUpdates);
      }
    });
    
    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [trendingTokens, recentTokens, graduatingTokens]);
  
  // Handle new trending tokens
  const handleNewTrendingTokens = (newTokens: TrendingToken[]) => {
    if (newTokens.length === 0) return;
    
    // Merge new tokens with existing tokens
    const mergedTokens = [...newTokens, ...trendingTokens]
      // Remove duplicates
      .filter((token, index, self) => 
        index === self.findIndex(t => t.id === token.id)
      )
      // Sort by market cap
      .sort((a, b) => b.marketCap - a.marketCap);
    
    // Update state with merged tokens
    setTrendingTokens(mergedTokens);
  };
  
  // Handle new recent tokens
  const handleNewRecentTokens = (newTokens: RecentToken[]) => {
    if (newTokens.length === 0) return;
    
    // Merge new tokens with existing tokens
    const mergedTokens = [...newTokens, ...recentTokens]
      // Remove duplicates
      .filter((token, index, self) => 
        index === self.findIndex(t => t.id === token.id)
      )
      // Sort by creation date (newest first)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Update state with merged tokens
    setRecentTokens(mergedTokens);
  };
  
  // Handle new graduating tokens
  const handleNewGraduatingTokens = (newTokens: GraduatingToken[]) => {
    if (newTokens.length === 0) return;
    
    // Merge new tokens with existing tokens
    const mergedTokens = [...newTokens, ...graduatingTokens]
      // Remove duplicates
      .filter((token, index, self) => 
        index === self.findIndex(t => t.id === token.id)
      )
      // Sort by graduation progress (highest first)
      .sort((a, b) => b.graduationProgress - a.graduationProgress);
    
    // Update state with merged tokens
    setGraduatingTokens(mergedTokens);
  };
  
  // Update token data (prices, progress bars, etc.)
  const updateTokenData = (updates: any[]) => {
    // Process updates for trending tokens
    const updatedTrending = trendingTokens.map(token => {
      const update = updates.find(u => u.id === token.id);
      if (update) {
        return { ...token, ...update };
      }
      return token;
    });
    setTrendingTokens(updatedTrending);
    
    // Process updates for recent tokens
    const updatedRecent = recentTokens.map(token => {
      const update = updates.find(u => u.id === token.id);
      if (update) {
        return { ...token, ...update };
      }
      return token;
    });
    setRecentTokens(updatedRecent);
    
    // Process updates for graduating tokens
    const updatedGraduating = graduatingTokens.map(token => {
      const update = updates.find(u => u.id === token.id);
      if (update) {
        return { ...token, ...update };
      }
      return token;
    });
    setGraduatingTokens(updatedGraduating);
  };
  
  // Format time to graduation
  const formatTimeToGraduation = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m`;
    }
    
    if (seconds < 86400) {
      return `${Math.floor(seconds / 3600)}h`;
    }
    
    return `${Math.floor(seconds / 86400)}d`;
  };
  
  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4">
        {/* Hero section */}
        <div className="py-8 mb-8">
          <h1 className="text-4xl font-bold mb-4">Welcome to OnlyPump</h1>
          <p className="text-xl text-base-content/70 mb-6">
            Create, trade, and discover meme coins on Solana
          </p>
          
          <div className="flex flex-wrap gap-4">
            <Link href="/create" className="btn btn-primary btn-lg">
              Create Token
            </Link>
            <Link href="/scan" className="btn btn-outline btn-lg">
              Explore Tokens
            </Link>
          </div>
        </div>
        
        {/* Tab navigation */}
        <div className="flex border-b border-base-700 mb-6">
          <button 
            className={`px-6 py-3 ${activeTab === 'trending' ? 'border-b-2 border-primary font-bold' : 'text-base-content/70'}`}
            onClick={() => setActiveTab('trending')}
          >
            Trending
          </button>
          <button 
            className={`px-6 py-3 ${activeTab === 'recent' ? 'border-b-2 border-primary font-bold' : 'text-base-content/70'}`}
            onClick={() => setActiveTab('recent')}
          >
            Recently Created
          </button>
          <button 
            className={`px-6 py-3 ${activeTab === 'graduating' ? 'border-b-2 border-primary font-bold' : 'text-base-content/70'}`}
            onClick={() => setActiveTab('graduating')}
          >
            About to Graduate
          </button>
        </div>
        
        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <div className="loading loading-spinner loading-lg"></div>
          </div>
        )}
        
        {/* Trending tokens */}
        {!isLoading && activeTab === 'trending' && (
          <div>
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th className="bg-base-800">#</th>
                    <th className="bg-base-800">Token</th>
                    <th className="bg-base-800 text-right">Price</th>
                    <th className="bg-base-800 text-right">24h</th>
                    <th className="bg-base-800 text-right">Market Cap</th>
                    <th className="bg-base-800 text-right">Volume</th>
                    <th className="bg-base-800">Creator</th>
                    <th className="bg-base-800"></th>
                  </tr>
                </thead>
                <tbody>
                  {trendingTokens.map((token, index) => (
                    <tr 
                      key={token.id} 
                      className="hover:bg-base-800/50"
                    >
                      <td>{index + 1}</td>
                      <td>
                        <div className="flex items-center space-x-3">
                          <div className="avatar">
                            <div className="mask mask-squircle w-12 h-12">
                              <div className="bg-primary w-12 h-12 flex items-center justify-center text-white font-bold">
                                {token.symbol.substring(0, 1)}
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="font-bold">{token.name}</div>
                            <div className="text-sm opacity-50">{token.symbol}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-right">
                        ${token.price.toFixed(8)}
                      </td>
                      <td className={`text-right ${token.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                        <div className="flex items-center justify-end">
                          {token.isPositive ? (
                            <ArrowUpIcon className="w-4 h-4 mr-1" />
                          ) : (
                            <ArrowDownIcon className="w-4 h-4 mr-1" />
                          )}
                          {Math.abs(token.priceChange).toFixed(2)}%
                        </div>
                      </td>
                      <td className="text-right">${token.marketCap.toLocaleString()}</td>
                      <td className="text-right">${token.volume.toLocaleString()}</td>
                      <td>{token.creator}</td>
                      <td>
                        <Link href={`/trade/${token.mint}`} className="btn btn-sm btn-primary">
                          Trade
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {trendingTokens.length === 0 && !isLoading && (
              <div className="text-center py-10">
                <p className="text-base-content/70">No trending tokens found</p>
              </div>
            )}
            
            <div className="flex justify-center mt-6">
              <Link href="/explore" className="btn btn-outline">
                View All Tokens
              </Link>
            </div>
          </div>
        )}
        
        {/* Recently created tokens */}
        {!isLoading && activeTab === 'recent' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentTokens.map((token) => (
              <div 
                key={token.id} 
                className="card bg-base-800 shadow-xl"
              >
                <div className="card-body">
                  <div className="flex items-center space-x-3">
                    <div className="avatar">
                      <div className="mask mask-squircle w-12 h-12">
                        <div className="bg-primary w-12 h-12 flex items-center justify-center text-white font-bold">
                          {token.symbol.substring(0, 1)}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h2 className="card-title">{token.name}</h2>
                      <p className="text-sm opacity-50">{token.symbol}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="badge badge-primary">New</div>
                    <div className="text-sm opacity-70 mt-2">
                      Created {Math.floor((Date.now() - new Date(token.createdAt).getTime()) / (1000 * 60))} minutes ago
                    </div>
                    {token.price && (
                      <div className="text-sm mt-1">
                        Price: ${token.price.toFixed(8)}
                      </div>
                    )}
                  </div>
                  
                  <div className="card-actions justify-end mt-4">
                    <Link href={`/trade/${token.mint}`} className="btn btn-primary btn-sm">
                      Trade
                    </Link>
                    <Link href={`/token/${token.mint}`} className="btn btn-outline btn-sm">
                      Details
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            
            {recentTokens.length === 0 && !isLoading && (
              <div className="col-span-3 text-center py-10">
                <p className="text-base-content/70">No recently created tokens found</p>
              </div>
            )}
          </div>
        )}
        
        {/* About to graduate */}
        {!isLoading && activeTab === 'graduating' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {graduatingTokens.map((token) => (
              <div 
                key={token.id} 
                className="card bg-base-800 shadow-xl"
              >
                <div className="card-body">
                  <div className="flex items-center space-x-3">
                    <div className="avatar">
                      <div className="mask mask-squircle w-12 h-12">
                        <div className="bg-primary w-12 h-12 flex items-center justify-center text-white font-bold">
                          {token.symbol.substring(0, 1)}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h2 className="card-title">{token.name}</h2>
                      <p className="text-sm opacity-50">{token.symbol}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-1">
                      <div className="text-sm">Graduation Progress</div>
                      <div className="text-sm font-medium">{token.graduationProgress}%</div>
                    </div>
                    <div className="w-full bg-base-700 rounded-full h-2.5">
                      <div 
                        className="bg-primary h-2.5 rounded-full progress-bar-animate" 
                        style={{ width: `${token.graduationProgress}%` }}
                      ></div>
                    </div>
                    <div className="text-xs mt-1 opacity-70">
                      Est. time to graduation: {formatTimeToGraduation(token.estimatedTimeToGraduation)}
                    </div>
                    <div className="text-sm mt-2">
                      Market Cap: ${token.marketCap.toLocaleString()}
                    </div>
                    <div className="text-sm">
                      Price: ${token.price.toFixed(8)}
                    </div>
                  </div>
                  
                  <div className="card-actions justify-end mt-4">
                    <Link href={`/trade/${token.mint}`} className="btn btn-primary btn-sm">
                      Trade
                    </Link>
                    <Link href={`/token/${token.mint}`} className="btn btn-outline btn-sm">
                      Details
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            
            {graduatingTokens.length === 0 && !isLoading && (
              <div className="col-span-3 text-center py-10">
                <p className="text-base-content/70">No tokens about to graduate found</p>
                <p className="text-base-content/70 mt-2">
                  Tokens with a market cap over 12K USD will appear here
                </p>
                <Link href="/scan?tab=about-to-graduate" className="btn btn-primary mt-4">
                  View Scan Page
                </Link>
              </div>
            )}
          </div>
        )}
        
        {/* Get started section */}
        <div className="mt-16 mb-8">
          <h2 className="text-2xl font-bold mb-6">Get Started</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card bg-base-800 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">
                  <span className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center mr-2">1</span>
                  Create Your Token
                </h3>
                <p className="mt-4">Launch your own token on Solana in minutes with customizable properties</p>
                <div className="card-actions justify-end mt-4">
                  <Link href="/create" className="btn btn-primary">
                    Create Now
                  </Link>
                </div>
              </div>
            </div>
            
            <div className="card bg-base-800 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">
                  <span className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center mr-2">2</span>
                  Trade Tokens
                </h3>
                <p className="mt-4">Buy and sell tokens with our simple trading interface</p>
                <div className="card-actions justify-end mt-4">
                  <Link href="/trade" className="btn btn-primary">
                    Start Trading
                  </Link>
                </div>
              </div>
            </div>
            
            <div className="card bg-base-800 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">
                  <span className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center mr-2">3</span>
                  Monitor Tokens
                </h3>
                <p className="mt-4">Track new tokens and migrations to PumpSwap</p>
                <div className="card-actions justify-end mt-4">
                  <Link href="/scan" className="btn btn-primary">
                    Scan Now
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}