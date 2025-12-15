-- OnlyPump Database Migration
-- Run this in your Supabase SQL Editor

-- 1. Create transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
    id BIGSERIAL PRIMARY KEY,
    pending_id TEXT UNIQUE NOT NULL,
    signature TEXT UNIQUE,
    wallet_address TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'create')),
    sol_amount NUMERIC,
    token_amount NUMERIC,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
    block_time BIGINT,
    slot BIGINT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON public.transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_transactions_token ON public.transactions(token_mint);
CREATE INDEX IF NOT EXISTS idx_transactions_signature ON public.transactions(signature);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);

-- 2. Create tokens table
CREATE TABLE IF NOT EXISTS public.tokens (
    id BIGSERIAL PRIMARY KEY,
    mint TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    uri TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    creator_wallet TEXT NOT NULL,
    bonding_curve TEXT,
    is_vanity BOOLEAN DEFAULT FALSE,
    vanity_suffix TEXT,
    price_sol NUMERIC,
    price_usd NUMERIC,
    market_cap_sol NUMERIC,
    market_cap_usd NUMERIC,
    volume_24h_sol NUMERIC,
    volume_24h_usd NUMERIC,
    holders_count INTEGER DEFAULT 0,
    last_price_update TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for tokens
CREATE INDEX IF NOT EXISTS idx_tokens_mint ON public.tokens(mint);
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON public.tokens(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_tokens_is_vanity ON public.tokens(is_vanity);
CREATE INDEX IF NOT EXISTS idx_tokens_market_cap ON public.tokens(market_cap_usd DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tokens_volume ON public.tokens(volume_24h_usd DESC NULLS LAST);

-- 3. Create user_positions table
CREATE TABLE IF NOT EXISTS public.user_positions (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    initial_sol_amount NUMERIC NOT NULL,
    initial_token_amount NUMERIC NOT NULL,
    entry_price NUMERIC NOT NULL,
    current_token_amount NUMERIC NOT NULL,
    total_sol_invested NUMERIC NOT NULL,
    total_sol_withdrawn NUMERIC DEFAULT 0,
    first_buy_signature TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(wallet_address, token_mint)
);

-- Add indexes for user_positions
CREATE INDEX IF NOT EXISTS idx_user_positions_wallet ON public.user_positions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_positions_token ON public.user_positions(token_mint);
CREATE INDEX IF NOT EXISTS idx_user_positions_current_amount ON public.user_positions(current_token_amount) WHERE current_token_amount > 0;

-- 4. Create presales table
CREATE TABLE IF NOT EXISTS public.presales (
    id BIGSERIAL PRIMARY KEY,
    presale_pda TEXT UNIQUE NOT NULL,
    mint TEXT,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    description TEXT,
    creator_wallet TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'finalized', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for presales
CREATE INDEX IF NOT EXISTS idx_presales_pda ON public.presales(presale_pda);
CREATE INDEX IF NOT EXISTS idx_presales_mint ON public.presales(mint);
CREATE INDEX IF NOT EXISTS idx_presales_creator ON public.presales(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_presales_status ON public.presales(status);
CREATE INDEX IF NOT EXISTS idx_presales_created_at ON public.presales(created_at DESC);

-- 5. Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Add updated_at triggers to all tables
DROP TRIGGER IF EXISTS update_transactions_updated_at ON public.transactions;
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tokens_updated_at ON public.tokens;
CREATE TRIGGER update_tokens_updated_at
    BEFORE UPDATE ON public.tokens
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_positions_updated_at ON public.user_positions;
CREATE TRIGGER update_user_positions_updated_at
    BEFORE UPDATE ON public.user_positions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_presales_updated_at ON public.presales;
CREATE TRIGGER update_presales_updated_at
    BEFORE UPDATE ON public.presales
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Enable Row Level Security (RLS) - optional but recommended
-- Uncomment if you want to enable RLS
-- ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.user_positions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.presales ENABLE ROW LEVEL SECURITY;

-- 8. Create policies (if RLS is enabled)
-- Example: Allow read access to all authenticated users
-- CREATE POLICY "Allow read access to all" ON public.tokens FOR SELECT USING (true);
-- CREATE POLICY "Allow insert for authenticated users" ON public.tokens FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Migration complete!
-- You can now use these tables in your OnlyPump backend

