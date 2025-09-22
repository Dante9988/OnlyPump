'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useBlockchain } from '@/lib/blockchain';
import { TransactionSpeed } from '@/lib/types';
import toast from 'react-hot-toast';

interface TokenTradePanelProps {
  tokenMint: string;
  tokenName?: string;
  tokenSymbol?: string;
  currentPrice?: number;
  isMigrated?: boolean;
}

export default function TokenTradePanel({ 
  tokenMint, 
  tokenName = 'Unknown', 
  tokenSymbol = 'TOKEN',
  currentPrice = 0,
  isMigrated = false
}: TokenTradePanelProps) {
  const { connected, publicKey } = useWallet();
  const { buyToken, sellToken } = useBlockchain();
  
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [isLoading, setIsLoading] = useState(false);
  
  // Form state
  const [solAmount, setSolAmount] = useState('0.1');
  const [percentage, setPercentage] = useState('50');
  const [speed, setSpeed] = useState<TransactionSpeed>(TransactionSpeed.FAST);
  const [slippageBps, setSlippageBps] = useState(100); // 1%
  const [jitoTipLamports, setJitoTipLamports] = useState(10000000); // 0.01 SOL
  
  const handleBuy = async () => {
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    const solAmountNum = parseFloat(solAmount);
    if (isNaN(solAmountNum) || solAmountNum <= 0) {
      toast.error('Please enter a valid SOL amount');
      return;
    }
    
    setIsLoading(true);
    const loadingToast = toast.loading('Buying tokens...');
    
    try {
      console.log('🔵 Buying token:', {
        tokenMint,
        tokenName,
        tokenSymbol,
        solAmount: solAmountNum,
        settings: {
          speed,
          slippageBps,
          useJito: jitoTipLamports > 0,
          jitoTipLamports
        },
        isMigrated
      });
      
      // Call the blockchain service to buy tokens with proper settings
      // We're always using PumpFun (not PumpSwap) for now
      const result = await buyToken(
        tokenMint,
        solAmountNum,
        {
          speed,
          slippageBps,
          useJito: jitoTipLamports > 0,
          jitoTipLamports
        }
      );
      
      toast.dismiss(loadingToast);
      
      console.log('🟢 Buy result:', result);
      
      if (result.success && result.txId) {
        toast.success(`${tokenSymbol} purchased successfully!`);
        // Add link to Solana Explorer
        const explorerUrl = `https://solscan.io/tx/${result.txId}`;
        console.log(`🔗 Transaction link: ${explorerUrl}`);
        
        toast.success(
          <div>
            <p>Transaction successful!</p>
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-400">
              View on Solscan
            </a>
          </div>,
          { duration: 10000 }
        );
      } else {
        console.error('❌ Buy failed:', result.error);
        toast.error(result.error || 'Failed to buy token');
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error('❌ Error buying token:', error);
      toast.error(`Error: ${error.message || 'An unexpected error occurred'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSell = async () => {
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    const percentageNum = parseInt(percentage);
    if (isNaN(percentageNum) || percentageNum <= 0 || percentageNum > 100) {
      toast.error('Please enter a valid percentage (1-100)');
      return;
    }
    
    setIsLoading(true);
    const loadingToast = toast.loading('Selling tokens...');
    
    try {
      console.log('🔵 Selling token:', {
        tokenMint,
        tokenName,
        tokenSymbol,
        percentage: percentageNum,
        settings: {
          speed,
          slippageBps,
          useJito: jitoTipLamports > 0,
          jitoTipLamports
        },
        isMigrated
      });
      
      // Call the blockchain service to sell tokens with proper settings
      // We're always using PumpFun (not PumpSwap) for now
      const result = await sellToken(
        tokenMint,
        percentageNum,
        {
          speed,
          slippageBps,
          useJito: jitoTipLamports > 0,
          jitoTipLamports
        }
      );
      
      toast.dismiss(loadingToast);
      
      console.log('🟢 Sell result:', result);
      
      if (result.success && result.txId) {
        toast.success(`${tokenSymbol} sold successfully!`);
        // Add link to Solana Explorer
        const explorerUrl = `https://solscan.io/tx/${result.txId}`;
        console.log(`🔗 Transaction link: ${explorerUrl}`);
        
        toast.success(
          <div>
            <p>Transaction successful!</p>
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-400">
              View on Solscan
            </a>
          </div>,
          { duration: 10000 }
        );
      } else {
        console.error('❌ Sell failed:', result.error);
        toast.error(result.error || 'Failed to sell token');
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error('❌ Error selling token:', error);
      toast.error(`Error: ${error.message || 'An unexpected error occurred'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body">
        <h2 className="card-title flex justify-between">
          <span>{tokenName} ({tokenSymbol})</span>
          {isMigrated && <span className="badge badge-secondary">Migrated</span>}
        </h2>
        
        <div className="text-2xl font-bold mb-4">
          {currentPrice.toFixed(6)} SOL
        </div>
        
        <div className="tabs tabs-boxed mb-6">
          <a 
            className={`tab ${activeTab === 'buy' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('buy')}
          >
            Buy
          </a>
          <a 
            className={`tab ${activeTab === 'sell' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('sell')}
          >
            Sell
          </a>
        </div>
        
        {activeTab === 'buy' ? (
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">SOL Amount*</span>
            </label>
            <div className="input-group">
              <input 
                type="number" 
                className="input input-bordered w-full" 
                placeholder="0.1"
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value)}
                min="0.000001"
                step="0.01"
                required
              />
              <span>SOL</span>
            </div>
            {currentPrice > 0 && (
              <label className="label">
                <span className="label-text-alt">
                  Estimated tokens: {(parseFloat(solAmount) / currentPrice).toFixed(6)}
                </span>
              </label>
            )}
          </div>
        ) : (
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">Percentage to Sell*</span>
            </label>
            <div className="input-group">
              <input 
                type="number" 
                className="input input-bordered w-full" 
                placeholder="50"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                min="1"
                max="100"
                required
              />
              <span>%</span>
            </div>
          </div>
        )}
        
        <div className="divider">Transaction Settings</div>
        
        <div className="form-control mb-4">
          <label className="label">
            <span className="label-text">Transaction Speed</span>
          </label>
          <select 
            className="select select-bordered w-full"
            value={speed}
            onChange={(e) => setSpeed(e.target.value as TransactionSpeed)}
          >
            <option value={TransactionSpeed.FAST}>Fast</option>
            <option value={TransactionSpeed.TURBO}>Turbo</option>
            <option value={TransactionSpeed.ULTRA}>Ultra</option>
          </select>
        </div>
        
        <div className="form-control mb-4">
          <label className="label">
            <span className="label-text">Slippage ({slippageBps / 100}%)</span>
          </label>
          <input 
            type="range" 
            min="10" 
            max="1000" 
            value={slippageBps}
            onChange={(e) => setSlippageBps(parseInt(e.target.value))}
            className="range range-primary" 
          />
          <div className="flex justify-between text-xs px-2 mt-1">
            <span>0.1%</span>
            <span>5%</span>
            <span>10%</span>
          </div>
        </div>
        
        <div className="form-control mb-6">
          <label className="label">
            <span className="label-text">Jito Tip (Lamports)</span>
          </label>
          <input 
            type="number" 
            className="input input-bordered w-full" 
            placeholder="10000000 (0.01 SOL)"
            value={jitoTipLamports}
            onChange={(e) => setJitoTipLamports(Number(e.target.value))}
            min="0"
          />
          <label className="label">
            <span className="label-text-alt">Optional Jito tip for faster transactions (0 to disable). 1 SOL = 1,000,000,000 Lamports</span>
          </label>
        </div>
        
        <div className="card-actions justify-center">
          <button 
            className={`btn ${activeTab === 'buy' ? 'btn-primary' : 'btn-secondary'} btn-lg w-full ${isLoading ? 'loading' : ''}`}
            onClick={activeTab === 'buy' ? handleBuy : handleSell}
            disabled={isLoading || !connected}
          >
            {isLoading ? 'Processing...' : activeTab === 'buy' ? `Buy ${tokenSymbol}` : `Sell ${tokenSymbol}`}
          </button>
        </div>
      </div>
    </div>
  );
}
