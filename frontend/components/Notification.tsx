'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface NotificationProps {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  txId?: string;
  tokenMint?: string;
  autoClose?: boolean;
  autoCloseTime?: number;
  onClose?: (id: string) => void;
}

export default function Notification({
  id,
  type,
  title,
  message,
  txId,
  tokenMint,
  autoClose = true,
  autoCloseTime = 5000,
  onClose
}: NotificationProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(() => {
        handleClose();
      }, autoCloseTime);
      
      return () => clearTimeout(timer);
    }
  }, [autoClose, autoCloseTime]);

  const handleClose = () => {
    setVisible(false);
    if (onClose) {
      onClose(id);
    }
  };

  if (!visible) return null;

  const bgColor = type === 'success' ? 'bg-success' : 
                  type === 'error' ? 'bg-error' : 
                  'bg-info';

  return (
    <div className={`${bgColor} text-white px-4 py-3 rounded-md shadow-lg flex items-center justify-between`}>
      <div className="flex-1">
        <h3 className="font-bold">{title}</h3>
        {message && <p className="text-sm">{message}</p>}
      </div>
      
      <div className="flex items-center gap-2">
        {txId && (
          <Link 
            href={`https://solscan.io/tx/${txId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-outline border-white text-white hover:bg-white hover:text-black"
          >
            View Tx
          </Link>
        )}
        
        {tokenMint && (
          <Link 
            href={`/trade?token=${tokenMint}`}
            className="btn btn-sm btn-outline border-white text-white hover:bg-white hover:text-black"
          >
            View Coin
          </Link>
        )}
        
        <button 
          onClick={handleClose}
          className="btn btn-sm btn-ghost text-white"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
