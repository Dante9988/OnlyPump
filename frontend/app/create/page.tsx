'use client';

import { useState, FormEvent, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import PageLayout from '@/components/PageLayout';
import toast from 'react-hot-toast';
import { TransactionSpeed } from '@/lib/types';
import { getTokenInfo } from '@/lib/api';
import { useBlockchain } from '@/lib/blockchain';
import { uploadImageToStorage, createAndUploadMetadata } from '@/lib/utils/storage';
import Link from 'next/link';
import { showNotification } from '@/components/NotificationContainer';
import { shortenAddress } from '@/lib/utils/address';

export default function CreateToken() {
  const { connected, publicKey } = useWallet();
  const { createToken, buyToken } = useBlockchain();
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBuyLoading, setIsBuyLoading] = useState(false);
  const [vanityAddressProgress, setVanityAddressProgress] = useState(0);
  const [isGeneratingVanityAddress, setIsGeneratingVanityAddress] = useState(false);
  
  // Initial buy state
  const [initialBuyAmount, setInitialBuyAmount] = useState('0.1');
  const [showBuyInput, setShowBuyInput] = useState(true);
  
  // Form state
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [twitter, setTwitter] = useState('');
  const [telegram, setTelegram] = useState('');
  const [website, setWebsite] = useState('');
  const [speed, setSpeed] = useState<TransactionSpeed>(TransactionSpeed.FAST);
  const [slippageBps, setSlippageBps] = useState(100); // 1%
  const [jitoTipLamports, setJitoTipLamports] = useState(0); // No Jito tip for token creation
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (!name || !symbol) {
      toast.error('Name and symbol are required');
      return;
    }
    
    // Validate buy amount if enabled
    let buyAmountValue: number | undefined;
    if (showBuyInput) {
      buyAmountValue = parseFloat(initialBuyAmount);
      if (isNaN(buyAmountValue)) {
        toast.error('Please enter a valid SOL amount');
        return;
      }
    }
    
    // Prepare socials object
    const socials: Record<string, string> = {};
    if (twitter) socials.twitter = `https://twitter.com/${twitter}`;
    if (telegram) socials.telegram = `https://t.me/${telegram}`;
    if (website) socials.website = website;
    
    setIsLoading(true);
    setIsGeneratingVanityAddress(true);
    const loadingToast = toast.loading(buyAmountValue ? 'Creating and buying token...' : 'Creating token...');
    
    // We'll let the token creator service update the progress directly
    
    try {
      // Step 1: Upload the image if provided
      let imageUri = 'https://arweave.net/default-token-image';
      if (imageFile) {
        imageUri = await uploadImageToStorage(imageFile);
      }
      
      // Step 2: Create and upload metadata
      const uri = await createAndUploadMetadata(
        name,
        symbol,
        description,
        imageUri,
        Object.keys(socials).length > 0 ? socials : undefined
      );
      
      // Step 3: Call the blockchain service to create the token (and buy if amount provided)
      const result = await createToken(
        name,
        symbol,
        uri,
        showBuyInput ? parseFloat(initialBuyAmount) || undefined : undefined,
        description || undefined,
        Object.keys(socials).length > 0 ? socials : undefined,
        {
          speed,
          slippageBps,
          useJito: jitoTipLamports > 0,
          jitoTipLamports
        }
      );
      
      toast.dismiss(loadingToast);
      
      if (result.success && result.txId && result.tokenMint) {
        // Show notification
        showNotification({
          type: 'success',
          title: showBuyInput && parseFloat(initialBuyAmount) > 0 ?
            `${symbol} token created and bought successfully!` :
            `${symbol} token created successfully!`,
          txId: result.txId,
          tokenMint: result.tokenMint,
          autoClose: false
        });
        
        // Reset form
        resetForm();
      } else {
        showNotification({
          type: 'error',
          title: 'Failed to create token',
          message: result.error || 'An unexpected error occurred'
        });
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error('Error creating token:', error);
      
      showNotification({
        type: 'error',
        title: 'Failed to create token',
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    } finally {
      setIsLoading(false);
      setIsGeneratingVanityAddress(false);
      setVanityAddressProgress(0);
    }
  };

  // Reset form and state
  const resetForm = () => {
    setName('');
    setSymbol('');
    setDescription('');
    setImageFile(null);
    setImagePreview(null);
    setTwitter('');
    setTelegram('');
    setWebsite('');
  };

  return (
    <PageLayout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Create new coin</h1>
        
        {isClient && !connected ? (
          <div className="text-center p-8 bg-base-200 rounded-xl mb-8">
            <h2 className="text-2xl font-semibold mb-4">Connect Your Wallet</h2>
            <p className="mb-6">You need to connect your wallet to create a token.</p>
            <button 
              className="btn btn-primary btn-lg"
              onClick={() => document.getElementById('wallet-modal')?.click()}
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="card bg-base-200 shadow-lg">
                  <div className="card-body">
                    <h2 className="card-title text-xl">Coin details</h2>
                    <p className="text-sm opacity-70 mb-2">Choose carefully, these can't be changed once the coin is created</p>
                    <div className="alert alert-info mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      <span>Your token will have a vanity address ending with "pump"</span>
                    </div>
                    
                    {isGeneratingVanityAddress && (
                      <div className="mb-4">
                        <p className="text-sm mb-2">Generating vanity address ending with "pump"...</p>
                        <progress className="progress progress-primary w-full" value={vanityAddressProgress % 100} max="100"></progress>
                        <p className="text-xs text-right mt-1">{vanityAddressProgress.toLocaleString()} attempts</p>
                      </div>
                    )}
                
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text font-medium">Coin name</span>
                        </label>
                        <input 
                          type="text" 
                          className="input input-bordered w-full" 
                          placeholder="Name your coin"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                        />
                      </div>
                      
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text font-medium">Ticker</span>
                        </label>
                        <input 
                          type="text" 
                          className="input input-bordered w-full" 
                          placeholder="Add a coin ticker (e.g. DOGE)"
                          value={symbol}
                          onChange={(e) => setSymbol(e.target.value)}
                          required
                          maxLength={10}
                        />
                      </div>
                    </div>
                
                    <div className="form-control mt-4">
                      <label className="label">
                        <span className="label-text font-medium">Description</span>
                        <span className="label-text-alt">(Optional)</span>
                      </label>
                      <textarea 
                        className="textarea textarea-bordered h-24" 
                        placeholder="Write a short description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      ></textarea>
                    </div>
                
                    <div className="mt-6">
                      <div className="flex flex-col p-6 border-2 border-dashed rounded-lg border-base-300 bg-base-100">
                        <div className="text-center">
                          <div className="mb-4">
                            {imagePreview ? (
                              <div className="relative w-32 h-32 mx-auto">
                                <img 
                                  src={imagePreview} 
                                  alt="Token preview" 
                                  className="w-full h-full object-cover rounded-lg"
                                />
                                <button 
                                  type="button"
                                  className="btn btn-circle btn-xs absolute top-0 right-0 bg-base-300"
                                  onClick={() => {
                                    setImageFile(null);
                                    setImagePreview(null);
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="text-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto mb-2 text-base-content opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="text-center">
                            <h3 className="font-medium mb-2">Select video or image to upload</h3>
                            <p className="text-sm opacity-70 mb-4">or drag and drop it here</p>
                            <input
                              type="file"
                              accept="image/*"
                              className="file-input file-input-bordered w-full max-w-xs"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setImageFile(file);
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setImagePreview(reader.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-6">
                            <div>
                              <h4 className="font-medium mb-1">File size and type</h4>
                              <ul className="text-xs opacity-70">
                                <li>• Image - max 5MB, .jpg/.gif or .png recommended</li>
                                <li>• Video - max 30MB, .mp4 recommended</li>
                              </ul>
                            </div>
                            <div>
                              <h4 className="font-medium mb-1">Resolution and aspect ratio</h4>
                              <ul className="text-xs opacity-70">
                                <li>• Image - min. 1000x1000px, 1:1 square recommended</li>
                                <li>• Video - 16:9 or 9:16, 1080p+ recommended</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="card bg-base-200 shadow-lg mt-6">
                  <div className="card-body">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <h2 className="card-title text-xl">Add social links</h2>
                      <span className="text-sm opacity-70 ml-2">(Optional)</span>
                    </div>
                    
                    <div className="form-control mt-2">
                      <label className="label">
                        <span className="label-text font-medium">Twitter</span>
                      </label>
                      <div className="input-group">
                        <span>https://twitter.com/</span>
                        <input 
                          type="text" 
                          className="input input-bordered w-full" 
                          placeholder="username"
                          value={twitter}
                          onChange={(e) => setTwitter(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="form-control mt-2">
                      <label className="label">
                        <span className="label-text font-medium">Telegram</span>
                      </label>
                      <div className="input-group">
                        <span>https://t.me/</span>
                        <input 
                          type="text" 
                          className="input input-bordered w-full" 
                          placeholder="username"
                          value={telegram}
                          onChange={(e) => setTelegram(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="form-control mt-2">
                      <label className="label">
                        <span className="label-text font-medium">Website</span>
                      </label>
                      <input 
                        type="url" 
                        className="input input-bordered w-full" 
                        placeholder="https://mytoken.com"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                      />
                    </div>
                    
                    <p className="text-xs opacity-70 mt-4">Coin data (social links, banner, etc) can only be added now, and can't be changed or edited after creation</p>
                  </div>
                </div>
              </div>
              
              <div className="lg:col-span-1">
                <div className="card bg-base-200 shadow-lg sticky top-24">
                  <div className="card-body">
                    <h2 className="card-title text-xl">Preview</h2>
                    <div className="bg-base-100 rounded-lg p-4 mt-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-base-300">
                          {imagePreview ? (
                            <img 
                              src={imagePreview} 
                              alt="Token preview" 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-lg font-bold">
                              {symbol ? symbol.substring(0, 2) : '??'}
                            </div>
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold">{name || 'Token Name'}</h3>
                          <p className="text-sm opacity-70">{symbol || 'TICKER'}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="divider">Transaction Settings</div>
                    
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text font-medium">Transaction Speed</span>
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
                    
                    <div className="form-control mt-2">
                      <label className="label">
                        <span className="label-text font-medium">Slippage ({slippageBps / 100}%)</span>
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
                    
                    <div className="form-control mt-2">
                      <label className="label">
                        <span className="label-text font-medium">Initial Buy Amount (SOL)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer label justify-start gap-2">
                          <input 
                            type="checkbox" 
                            className="checkbox checkbox-primary" 
                            checked={showBuyInput}
                            onChange={(e) => setShowBuyInput(e.target.checked)}
                          />
                          <span>Buy my own token</span>
                        </label>
                      </div>
                      {showBuyInput && (
                        <div className="mt-2">
                          <div className="input-group">
                            <input 
                              type="number" 
                              className="input input-bordered w-full" 
                              placeholder="0.1"
                              value={initialBuyAmount}
                              onChange={(e) => setInitialBuyAmount(e.target.value)}
                              step="0.01"
                              disabled={!showBuyInput}
                            />
                            <span>SOL</span>
                          </div>
                          <label className="label">
                            <span className="label-text-alt">Amount of SOL to spend on your own token</span>
                          </label>
                        </div>
                      )}
                    </div>
                    
                    <div className="form-control mt-2">
                      <label className="label">
                        <span className="label-text font-medium">Jito Tip (Lamports)</span>
                      </label>
                      <input 
                        type="number" 
                        className="input input-bordered w-full" 
                        placeholder="0 (no tip needed for creation)"
                        value={jitoTipLamports}
                        onChange={(e) => setJitoTipLamports(Number(e.target.value))}
                        min="0"
                      />
                      <label className="label">
                        <span className="label-text-alt">Not needed for token creation</span>
                      </label>
                    </div>
            
                    <div className="mt-6">
                      <button 
                        type="submit" 
                        className={`btn btn-primary btn-lg w-full ${isLoading ? 'loading' : ''}`}
                        disabled={isLoading || !connected}
                      >
                        {isLoading ? 'Creating coin...' : 'Create coin'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </PageLayout>
  );
}