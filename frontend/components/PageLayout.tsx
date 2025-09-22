import React, { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Footer from './Footer';
import Navbar from './Navbar';
import { useWallet } from '@solana/wallet-adapter-react';

interface PageLayoutProps {
  children: ReactNode;
}

export default function PageLayout({ children }: PageLayoutProps) {
  const { connected, publicKey } = useWallet();

  return (
    <div className="flex min-h-screen bg-base-900">
      <Sidebar />
      
      <div className="flex flex-col flex-grow">
        <Navbar />
        <main className="flex-grow px-6 py-6">
          <div className="max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>
        <Footer />
      </div>
      
      {/* Mobile app banner */}
      <div className="fixed bottom-0 left-0 right-0 bg-primary text-white py-2 px-4 flex justify-between items-center">
        <div className="flex items-center">
          <span className="mr-2">🚀</span>
          <span>OnlyPump is better on mobile. faster trades, chat, and more.</span>
        </div>
        <button className="bg-white text-primary px-3 py-1 rounded-md text-sm flex items-center">
          Download now <span className="ml-1">→</span>
        </button>
      </div>
    </div>
  );
}