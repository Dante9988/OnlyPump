import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn('Supabase credentials not configured. Database features will be disabled.');
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.logger.log('Supabase client initialized');
  }

  getClient(): SupabaseClient {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized. Check your environment variables.');
    }
    return this.supabase;
  }

  // Convenience methods for common operations
  get db() {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized. Check SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.');
    }
    return this.getClient();
  }

  // Check if Supabase is configured
  isConfigured(): boolean {
    return !!this.supabase;
  }

  // Transaction methods
  async getTransactions(walletAddress: string, limit = 50) {
    const { data, error } = await this.supabase
      .from('transactions')
      .select('*')
      .eq('wallet_address', walletAddress)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      this.logger.error('Error fetching transactions:', error);
      throw error;
    }

    return data;
  }

  async createTransaction(transaction: {
    pending_id: string;
    wallet_address: string;
    token_mint: string;
    type: string;
    sol_amount?: number;
    token_amount?: number;
  }) {
    const { data, error } = await this.supabase
      .from('transactions')
      .insert(transaction)
      .select()
      .single();

    if (error) {
      this.logger.error('Error creating transaction:', error);
      throw error;
    }

    return data;
  }

  async updateTransaction(
    pendingId: string,
    updates: {
      signature?: string;
      status?: string;
      block_time?: number;
      slot?: number;
      error_message?: string;
    }
  ) {
    const { data, error } = await this.supabase
      .from('transactions')
      .update(updates)
      .eq('pending_id', pendingId)
      .select()
      .single();

    if (error) {
      this.logger.error('Error updating transaction:', error);
      throw error;
    }

    return data;
  }

  async updateTransactionBySignature(
    signature: string,
    updates: {
      status?: string;
      block_time?: number;
      slot?: number;
      error_message?: string;
    }
  ) {
    const { data, error } = await this.supabase
      .from('transactions')
      .update(updates)
      .eq('signature', signature)
      .select()
      .single();

    if (error) {
      this.logger.error('Error updating transaction by signature:', error);
      throw error;
    }

    return data;
  }

  // Token methods
  async getToken(mint: string) {
    const { data, error } = await this.supabase
      .from('tokens')
      .select('*')
      .eq('mint', mint)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found
      this.logger.error('Error fetching token:', error);
      throw error;
    }

    return data;
  }

  async createToken(token: {
    mint: string;
    name: string;
    symbol: string;
    uri: string;
    description?: string;
    image_url?: string;
    creator_wallet: string;
    bonding_curve?: string;
    is_vanity?: boolean;
    vanity_suffix?: string;
  }) {
    const { data, error } = await this.supabase
      .from('tokens')
      .insert(token)
      .select()
      .single();

    if (error) {
      this.logger.error('Error creating token:', error);
      throw error;
    }

    return data;
  }

  async updateTokenPrice(
    mint: string,
    updates: {
      price_sol?: number;
      price_usd?: number;
      market_cap_sol?: number;
      market_cap_usd?: number;
      volume_24h_sol?: number;
      volume_24h_usd?: number;
      holders_count?: number;
    }
  ) {
    const { data, error } = await this.supabase
      .from('tokens')
      .update({
        ...updates,
        last_price_update: new Date().toISOString(),
      })
      .eq('mint', mint)
      .select()
      .single();

    if (error) {
      this.logger.error('Error updating token price:', error);
      throw error;
    }

    return data;
  }

  // User position methods
  async getUserPosition(walletAddress: string, tokenMint: string) {
    const { data, error } = await this.supabase
      .from('user_positions')
      .select('*')
      .eq('wallet_address', walletAddress)
      .eq('token_mint', tokenMint)
      .single();

    if (error && error.code !== 'PGRST116') {
      this.logger.error('Error fetching user position:', error);
      throw error;
    }

    return data;
  }

  async getUserPositions(walletAddress: string) {
    const { data, error } = await this.supabase
      .from('user_positions')
      .select('*')
      .eq('wallet_address', walletAddress)
      .gt('current_token_amount', 0);

    if (error) {
      this.logger.error('Error fetching user positions:', error);
      throw error;
    }

    return data;
  }

  async upsertUserPosition(position: {
    wallet_address: string;
    token_mint: string;
    initial_sol_amount: number;
    initial_token_amount: number;
    entry_price: number;
    current_token_amount: number;
    total_sol_invested: number;
    total_sol_withdrawn?: number;
    first_buy_signature?: string;
  }) {
    const { data, error } = await this.supabase
      .from('user_positions')
      .upsert(position, {
        onConflict: 'wallet_address,token_mint',
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Error upserting user position:', error);
      throw error;
    }

    return data;
  }
}

