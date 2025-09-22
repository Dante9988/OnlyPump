'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import PageLayout from '@/components/PageLayout';
import toast from 'react-hot-toast';
import { TransactionSpeed } from '@/lib/types';
import { useBlockchain } from '@/lib/blockchain';

export default function Trade() {
  const router = useRouter();
  const { connected, publicKey } = useWallet();
  const { buyToken, sellToken } = useBlockchain();
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Form state
  const [tokenMint, setTokenMint] = useState('');
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleViewToken = () => {
    if (!tokenMint) {
      toast.error('Please enter a token mint address');
      return;
    }
    
    router.push(`/trade/${tokenMint}`);
  };

  return (
    <PageLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">Trade Tokens</h1>
        
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Enter Token Address</h2>
            <p className="mb-4">Enter a Pump.fun token mint address to view its trading chart and buy/sell options.</p>
            
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">Token Mint Address*</span>
              </label>
              <div className="input-group">
                <input 
                  type="text" 
                  className="input input-bordered w-full" 
                  placeholder="Enter token mint address"
                  value={tokenMint}
                  onChange={(e) => setTokenMint(e.target.value)}
                  required
                />
                <button 
                  className="btn btn-primary" 
                  onClick={handleViewToken}
                >
                  View
                </button>
              </div>
            </div>
            
            <div className="divider">Popular Tokens</div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card bg-base-300 cursor-pointer hover:bg-base-100 transition-colors" onClick={() => router.push('/trade/pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn')}>
                <div className="card-body p-4">
                  <h3 className="font-bold">PUMP</h3>
                  <p className="text-xs opacity-70 truncate">pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn</p>
                </div>
              </div>
              
              {/* Add more popular tokens as needed */}
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}