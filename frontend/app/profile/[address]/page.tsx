'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import PageLayout from '@/components/PageLayout';
import Link from 'next/link';
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { shortenAddress } from '@/lib/utils/address';
import { getUserProfile, getUserCreatedTokens, getUserTokenBalances, getUserSolBalance, getUserCreatorFees, collectCreatorFees } from '@/lib/api';
import { useBlockchain } from '@/lib/blockchain';
import { UserProfile, CreatedToken, TokenBalance } from '@/lib/types';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const params = useParams();
  const { connected, publicKey } = useWallet();
  const { getCreatorFees } = useBlockchain();
  const walletAddress = params.address as string;
  
  const [isLoading, setIsLoading] = useState(true);
  const [isCollectingFees, setIsCollectingFees] = useState(false);
  const [activeTab, setActiveTab] = useState('balances');
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [createdTokens, setCreatedTokens] = useState<CreatedToken[]>([]);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  
  // Check if the profile is the current user's profile
  const isOwnProfile = connected && publicKey?.toString() === walletAddress;
  
  useEffect(() => {
    const fetchProfileData = async () => {
      setIsLoading(true);
      
      try {
        // Fetch user profile data
        const profile = await getUserProfile(walletAddress);
        if (profile) {
          setProfileData(profile);
        } else {
          // If no profile data, create a default one
          setProfileData({
            address: walletAddress,
            username: shortenAddress(walletAddress),
            bio: '',
            solBalance: 0,
            creatorFees: 0,
            createdTokensCount: 0,
            followers: 0,
            following: 0
          });
        }
        
        // Fetch tokens created by the user
        const tokens = await getUserCreatedTokens(walletAddress);
        setCreatedTokens(tokens);
        
        // Fetch token balances if it's the user's own profile
        if (isOwnProfile) {
          const balances = await getUserTokenBalances(walletAddress);
          setTokenBalances(balances);
        }
        
        // Fetch SOL balance
        const solBalance = await getUserSolBalance(walletAddress);
        if (solBalance > 0) {
          setProfileData(prev => prev ? { ...prev, solBalance } : null);
        }
        
        // Fetch creator fees if it's the user's own profile
        if (isOwnProfile) {
          const creatorFees = await getUserCreatorFees(walletAddress);
          if (creatorFees > 0) {
            setProfileData(prev => prev ? { ...prev, creatorFees } : null);
          }
        }
      } catch (error) {
        console.error('Error fetching profile data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProfileData();
  }, [walletAddress, connected, isOwnProfile]);
  
  const handleCollectFees = async () => {
    if (!isOwnProfile || !profileData || profileData.creatorFees <= 0) return;
    
    setIsCollectingFees(true);
    const loadingToast = toast.loading('Collecting creator fees...');
    
    try {
      const result = await collectCreatorFees(walletAddress);
      
      toast.dismiss(loadingToast);
      
      if (result.success) {
        toast.success('Creator fees collected successfully!');
        // Update profile data
        setProfileData(prev => prev ? { ...prev, creatorFees: 0 } : null);
      } else {
        toast.error(result.error || 'Failed to collect creator fees');
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error(error.message || 'An error occurred while collecting fees');
    } finally {
      setIsCollectingFees(false);
    }
  };
  
  const formatAgo = (date: Date) => {
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
    return `${diffInDays}d ago`;
  };
  
  if (isLoading) {
    return (
      <PageLayout>
        <div className="max-w-5xl mx-auto flex justify-center items-center py-20">
          <div className="loading loading-spinner loading-lg"></div>
        </div>
      </PageLayout>
    );
  }
  
  if (!profileData) {
    return (
      <PageLayout>
        <div className="max-w-5xl mx-auto">
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold mb-4">Profile not found</h1>
            <p className="mb-6">The profile you are looking for does not exist.</p>
            <Link href="/" className="btn btn-primary">
              Go Home
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }
  
  return (
    <PageLayout>
      <div className="max-w-5xl mx-auto">
        {/* Back button */}
        <div className="mb-6">
          <Link href="/" className="flex items-center text-base-content/70 hover:text-base-content">
            <ArrowLeftIcon className="w-5 h-5 mr-2" />
            <span>Back</span>
          </Link>
        </div>
        
        {/* Profile header */}
        <div className="flex items-center mb-8">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-green-600 flex items-center justify-center mr-6">
            {profileData.profileImage ? (
              <Image 
                src={profileData.profileImage} 
                alt={profileData.username || shortenAddress(walletAddress)} 
                width={80} 
                height={80} 
                className="object-cover"
              />
            ) : (
              <span className="text-3xl text-white">
                {(profileData.username || shortenAddress(walletAddress)).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{profileData.username || shortenAddress(walletAddress)}</h1>
              <div className="text-xs bg-base-700 px-2 py-1 rounded-full">
                {shortenAddress(walletAddress)}
              </div>
              {isOwnProfile && (
                <Link href="/settings" className="btn btn-sm btn-outline">
                  Edit Profile
                </Link>
              )}
            </div>
            
            <div className="mt-1">
              <Link 
                href={`https://solscan.io/address/${walletAddress}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-base-content/70 hover:text-base-content flex items-center"
              >
                View on solscan
                <ArrowTopRightOnSquareIcon className="w-3 h-3 ml-1" />
              </Link>
            </div>
          </div>
          
          {!isOwnProfile && (
            <button className="btn btn-primary">
              Follow
            </button>
          )}
        </div>
        
        {/* Profile stats */}
        <div className="flex justify-center gap-12 mb-8">
          <div className="text-center">
            <div className="text-2xl font-bold">{profileData.followers}</div>
            <div className="text-sm text-base-content/70">Followers</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold">{profileData.following}</div>
            <div className="text-sm text-base-content/70">Following</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold">{profileData.createdTokensCount}</div>
            <div className="text-sm text-base-content/70">Created coins</div>
          </div>
        </div>
        
        {/* Bio */}
        {profileData.bio && (
          <div className="mb-8">
            <p className="text-center">{profileData.bio}</p>
          </div>
        )}
        
        {/* Tabs */}
        <div className="border-b border-base-700 mb-6">
          <div className="flex">
            <button 
              className={`px-6 py-3 ${activeTab === 'balances' ? 'border-b-2 border-primary' : ''}`}
              onClick={() => setActiveTab('balances')}
            >
              Balances
            </button>
            <button 
              className={`px-6 py-3 ${activeTab === 'coins' ? 'border-b-2 border-primary' : ''}`}
              onClick={() => setActiveTab('coins')}
            >
              Coins
            </button>
            <button 
              className={`px-6 py-3 ${activeTab === 'followers' ? 'border-b-2 border-primary' : ''}`}
              onClick={() => setActiveTab('followers')}
            >
              Followers
            </button>
          </div>
        </div>
        
        {/* Tab content */}
        {activeTab === 'balances' && (
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-bold mb-2">Balances</h2>
              
              <div className="bg-base-800 rounded-lg p-4 mb-4">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-primary mr-3 flex items-center justify-center">
                    <span className="text-white font-bold">S</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <div>
                        <div>Solana balance</div>
                        <div className="text-sm text-base-content/70">{profileData.solBalance.toFixed(4)} SOL</div>
                      </div>
                      <div className="text-right">
                        <div>Value</div>
                        <div>${(profileData.solBalance * 150).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {isOwnProfile && profileData.creatorFees > 0 && (
                <div className="bg-base-800 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-green-500 mr-3 flex items-center justify-center">
                      <span className="text-white font-bold">$</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <div>
                          <div>Creator Fees</div>
                          <div className="text-sm text-base-content/70">{profileData.creatorFees.toFixed(4)} SOL</div>
                        </div>
                        <div className="text-right">
                          <button 
                            className={`btn btn-sm btn-primary ${isCollectingFees ? 'loading' : ''}`}
                            onClick={handleCollectFees}
                            disabled={isCollectingFees}
                          >
                            {isCollectingFees ? 'Collecting...' : 'Collect'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Token balances (only for own profile) */}
              {isOwnProfile && tokenBalances.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-2">Token Balances</h3>
                  <div className="space-y-3">
                    {tokenBalances.map((token) => (
                      <div key={token.mint} className="bg-base-800 rounded-lg p-3">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-base-700 mr-3 flex items-center justify-center">
                            <div className="bg-primary w-10 h-10 flex items-center justify-center text-white font-bold rounded-full">
                              {token.symbol.substring(0, 2)}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-medium">{token.name}</div>
                                <div className="text-xs text-base-content/70">{token.symbol}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-medium">{token.balance.toLocaleString()}</div>
                                <div className="text-xs text-base-content/70">${token.value.toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Created coins */}
            {createdTokens.length > 0 && (
              <div>
                <h2 className="text-xl font-bold mb-2">Created coins ({createdTokens.length})</h2>
                
                <div className="space-y-4">
                  {createdTokens.map((token) => (
                    <div key={token.mint} className="bg-base-800 rounded-lg p-4">
                      <div className="flex items-center">
                        <div className="w-12 h-12 rounded-full bg-base-700 mr-4 flex items-center justify-center overflow-hidden">
                          <div className="bg-primary w-12 h-12 flex items-center justify-center text-white font-bold">
                            {token.symbol.substring(0, 2)}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="font-bold">{token.name}</div>
                              <div className="text-sm text-base-content/70">{token.symbol}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold">${(token.marketCap / 1000).toFixed(1)}K</div>
                              <div className="text-sm text-base-content/70">{formatAgo(token.createdAt)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Link href={`/trade/${token.mint}`} className="btn btn-sm btn-primary">
                          Trade
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* No created coins message */}
            {createdTokens.length === 0 && (
              <div className="text-center py-6">
                <p className="text-base-content/70">No created coins found</p>
                {isOwnProfile && (
                  <Link href="/create" className="btn btn-primary mt-4">
                    Create a Token
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'coins' && (
          <div>
            <h2 className="text-xl font-bold mb-4">Coins</h2>
            {tokenBalances.length > 0 ? (
              <div className="space-y-3">
                {tokenBalances.map((token) => (
                  <div key={token.mint} className="bg-base-800 rounded-lg p-3">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-base-700 mr-3 flex items-center justify-center">
                        <div className="bg-primary w-10 h-10 flex items-center justify-center text-white font-bold rounded-full">
                          {token.symbol.substring(0, 2)}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-medium">{token.name}</div>
                            <div className="text-xs text-base-content/70">{token.symbol}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{token.balance.toLocaleString()}</div>
                            <div className="text-xs text-base-content/70">${token.value.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <Link href={`/trade/${token.mint}`} className="btn btn-sm btn-primary">
                        Trade
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-base-content/70">No coins found</p>
            )}
          </div>
        )}
        
        {activeTab === 'followers' && (
          <div>
            <h2 className="text-xl font-bold mb-4">Followers</h2>
            <p className="text-center py-8 text-base-content/70">No followers found</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}