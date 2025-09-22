'use client';

import { FC } from 'react';
import { TokenInfo } from '@/lib/types';
import { formatNumber, shortenAddress } from '@/lib/utils/format';

interface TokenCardProps {
  token: TokenInfo;
  onBuy: () => void;
}

const TokenCard: FC<TokenCardProps> = ({ token, onBuy }) => {
  // Calculate price change (mock data for now)
  const priceChangePercent = (Math.random() * 200 - 100).toFixed(2);
  const isPriceUp = parseFloat(priceChangePercent) >= 0;
  
  // Format market cap for display
  const formattedMarketCap = formatNumber(token.marketCap || 0);
  
  // Generate a random holder count for UI demonstration
  const holderCount = Math.floor(Math.random() * 1000);
  
  return (
    <div className="card bg-base-200 shadow-lg overflow-hidden">
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center">
            <div className="avatar mr-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <span className="text-base-100 font-bold">{token.symbol.substring(0, 2)}</span>
              </div>
            </div>
            <div>
              <h3 className="font-bold">{token.name}</h3>
              <p className="text-sm opacity-70">{token.symbol}</p>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-sm ${isPriceUp ? 'text-success' : 'text-error'}`}>
              MC ${formattedMarketCap}
            </div>
            <div className="text-xs opacity-70">
              TX {Math.floor(Math.random() * 100)}
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-5 gap-1 text-xs mb-3">
          <div className="flex items-center justify-center">
            <span className={`inline-block w-2 h-2 rounded-full ${Math.random() > 0.5 ? 'bg-success' : 'bg-error'} mr-1`}></span>
            <span>{Math.floor(Math.random() * 10)}</span>
          </div>
          <div className="flex items-center justify-center">
            <span className={`inline-block w-2 h-2 rounded-full ${Math.random() > 0.5 ? 'bg-success' : 'bg-error'} mr-1`}></span>
            <span>{Math.floor(Math.random() * 20)}</span>
          </div>
          <div className="flex items-center justify-center">
            <span className={`inline-block w-2 h-2 rounded-full ${Math.random() > 0.5 ? 'bg-success' : 'bg-error'} mr-1`}></span>
            <span>{Math.floor(Math.random() * 30)}</span>
          </div>
          <div className="flex items-center justify-center">
            <span className={`inline-block w-2 h-2 rounded-full ${Math.random() > 0.5 ? 'bg-success' : 'bg-error'} mr-1`}></span>
            <span>{Math.floor(Math.random() * 40)}</span>
          </div>
          <div className="flex items-center justify-center">
            <span className={`inline-block w-2 h-2 rounded-full ${Math.random() > 0.5 ? 'bg-success' : 'bg-error'} mr-1`}></span>
            <span>{Math.floor(Math.random() * 50)}</span>
          </div>
        </div>
        
        <div className="flex justify-between text-xs mb-2">
          <div>
            <span className="opacity-70">Holders:</span> {holderCount}
          </div>
          <div>
            <span className="opacity-70">Liquidity:</span> ${formatNumber(token.liquidity || 0)}
          </div>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="text-xs opacity-70">
            {shortenAddress(token.mint)}
          </div>
          <button 
            className="btn btn-xs btn-primary"
            onClick={onBuy}
          >
            +0.01
          </button>
        </div>
      </div>
    </div>
  );
};

export default TokenCard;
