'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import PageLayout from '@/components/PageLayout';

export default function ProfileRedirect() {
  const router = useRouter();
  const { connected, publicKey } = useWallet();
  
  useEffect(() => {
    if (connected && publicKey) {
      router.push(`/profile/${publicKey.toString()}`);
    }
  }, [connected, publicKey, router]);
  
  return (
    <PageLayout>
      <div className="max-w-5xl mx-auto py-12 text-center">
        <h1 className="text-2xl font-bold mb-6">Profile</h1>
        
        {!connected ? (
          <div className="bg-base-800 p-8 rounded-lg">
            <p className="mb-6">Please connect your wallet to view your profile</p>
            <button 
              className="btn btn-primary"
              onClick={() => document.getElementById('wallet-modal')?.click()}
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="bg-base-800 p-8 rounded-lg">
            <p>Redirecting to your profile...</p>
            <div className="mt-4">
              <div className="loading loading-spinner loading-lg"></div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
