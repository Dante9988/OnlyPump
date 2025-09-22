export enum TransactionSpeed {
  FAST = 'fast',
  TURBO = 'turbo',
  ULTRA = 'ultra'
}

export interface PumpFunSettings {
  speed?: TransactionSpeed;
  slippageBps?: number;
  useJito?: boolean;
  jitoTipLamports?: number;
}

export interface BuySettings extends PumpFunSettings {}
export interface SellSettings extends PumpFunSettings {}

export interface PumpFunResult {
  success: boolean;
  txId?: string;
  error?: string;
  tokenAmount?: number;
  solAmount?: number;
  tokenMint?: string;
}

export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  supply: bigint;
  bondingCurveAddress: string;
  isComplete: boolean;
  price?: number;
  marketCap?: number;
  liquidity?: number;
}

export interface CreateTokenParams {
  name: string;
  symbol: string;
  uri: string;
  description?: string;
  socials?: { [key: string]: string };
  speed?: TransactionSpeed;
  slippageBps?: number;
  useJito?: boolean;
  jitoTipLamports?: number;
}

export interface BuyTokenParams {
  tokenMint: string;
  solAmount: number;
  speed?: TransactionSpeed;
  slippageBps?: number;
  useJito?: boolean;
  jitoTipLamports?: number;
}

export interface SellTokenParams {
  tokenMint: string;
  percentage: number;
  speed?: TransactionSpeed;
  slippageBps?: number;
  useJito?: boolean;
  jitoTipLamports?: number;
}

export interface TrendingToken {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  image?: string;
  price: number;
  priceChange: number;
  marketCap: number;
  volume: number;
  creator: string;
  createdAt: Date;
  isPositive: boolean;
  isNew?: boolean;
}

export interface RecentToken {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  image?: string;
  price?: number;
  creator: string;
  createdAt: Date;
  isNew?: boolean;
}

export interface GraduatingToken {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  image?: string;
  price: number;
  marketCap: number;
  graduationProgress: number; // 0-100
  estimatedTimeToGraduation: number; // in seconds
  creator: string;
  createdAt: Date;
  isNew?: boolean;
}

export interface UserProfile {
  address: string;
  username?: string;
  bio?: string;
  profileImage?: string;
  solBalance: number;
  creatorFees: number;
  createdTokensCount: number;
  followers: number;
  following: number;
}

export interface CreatedToken {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  image?: string;
  marketCap: number;
  price: number;
  createdAt: Date;
}

export interface TokenBalance {
  mint: string;
  name: string;
  symbol: string;
  image?: string;
  balance: number;
  price: number;
  value: number;
}