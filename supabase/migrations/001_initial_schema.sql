-- OnlyPump Database Schema
-- Phase 1: Core transaction and token tracking

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TRANSACTIONS TABLE
-- Fast serving of transaction history
-- ============================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Transaction identifiers
  signature VARCHAR(88), -- Solana transaction signature/hash (base58) - filled after confirmation
  pending_id VARCHAR(100) UNIQUE, -- Temporary ID before tx is signed/submitted
  
  -- User & Token
  wallet_address VARCHAR(44) NOT NULL, -- User's wallet address
  token_mint VARCHAR(44) NOT NULL, -- Token mint address
  
  -- Transaction details
  type VARCHAR(20) NOT NULL, -- 'create', 'buy', 'sell', 'create_and_buy'
  sol_amount DECIMAL(20, 9), -- SOL amount (for buy/sell)
  token_amount BIGINT, -- Token amount (estimated for buys, actual for sells)
  
  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'submitted', 'confirmed', 'failed'
  block_time BIGINT, -- Unix timestamp from blockchain
  slot BIGINT, -- Solana slot number
  
  -- Metadata
  error_message TEXT, -- If failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_type CHECK (type IN ('create', 'buy', 'sell', 'create_and_buy')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed'))
);

-- Indexes for fast lookups
CREATE INDEX idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX idx_transactions_token ON transactions(token_mint);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE UNIQUE INDEX idx_transactions_signature ON transactions(signature) WHERE signature IS NOT NULL;
CREATE INDEX idx_transactions_pending_id ON transactions(pending_id);

-- Composite index for user's transaction history (most common query)
CREATE INDEX idx_transactions_wallet_created ON transactions(wallet_address, created_at DESC);

-- Index for recent transactions by token
CREATE INDEX idx_transactions_token_created ON transactions(token_mint, created_at DESC);

-- ============================================
-- TOKENS TABLE
-- Metadata for tokens created through platform
-- ============================================
CREATE TABLE tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Token identifiers
  mint VARCHAR(44) UNIQUE NOT NULL, -- Token mint address
  
  -- Token metadata
  name VARCHAR(100) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  uri TEXT NOT NULL, -- Metadata JSON URI
  description TEXT,
  image_url TEXT,
  
  -- Creator info
  creator_wallet VARCHAR(44) NOT NULL,
  creator_id UUID, -- Will link to creators table later
  
  -- Pump.fun specific
  bonding_curve VARCHAR(44), -- Bonding curve address
  is_migrated BOOLEAN DEFAULT false, -- Migrated to PumpSwap
  migration_signature VARCHAR(88), -- Migration tx signature
  
  -- Market data (cached)
  price_sol DECIMAL(20, 12), -- Current price in SOL
  market_cap_sol DECIMAL(20, 9), -- Market cap in SOL
  volume_24h_sol DECIMAL(20, 9), -- 24h volume
  holders_count INT DEFAULT 0,
  
  -- Vanity address info
  is_vanity BOOLEAN DEFAULT false,
  vanity_suffix VARCHAR(10),
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_price_update TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_tokens_mint ON tokens(mint);
CREATE INDEX idx_tokens_creator ON tokens(creator_wallet);
CREATE INDEX idx_tokens_created_at ON tokens(created_at DESC);
CREATE INDEX idx_tokens_symbol ON tokens(symbol);
CREATE INDEX idx_tokens_migrated ON tokens(is_migrated);

-- Full text search on name and symbol
CREATE INDEX idx_tokens_search ON tokens USING gin(to_tsvector('english', name || ' ' || symbol));

-- ============================================
-- USER POSITIONS TABLE
-- Track entry prices for P&L calculation
-- ============================================
CREATE TABLE user_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  wallet_address VARCHAR(44) NOT NULL,
  token_mint VARCHAR(44) NOT NULL,
  
  -- Entry data
  initial_sol_amount DECIMAL(20, 9) NOT NULL,
  initial_token_amount BIGINT NOT NULL,
  entry_price DECIMAL(20, 12) NOT NULL, -- SOL per token
  
  -- Current position (updated on buy/sell)
  current_token_amount BIGINT NOT NULL,
  total_sol_invested DECIMAL(20, 9) NOT NULL,
  total_sol_withdrawn DECIMAL(20, 9) DEFAULT 0,
  
  -- Tracking
  first_buy_signature VARCHAR(88),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(wallet_address, token_mint)
);

-- Indexes
CREATE INDEX idx_user_positions_wallet ON user_positions(wallet_address);
CREATE INDEX idx_user_positions_token ON user_positions(token_mint);
CREATE INDEX idx_user_positions_wallet_token ON user_positions(wallet_address, token_mint);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to transactions
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply to tokens
CREATE TRIGGER update_tokens_updated_at
  BEFORE UPDATE ON tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own transactions
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (true); -- Public read for now, tighten later if needed

-- Only backend can insert/update
CREATE POLICY "Service role can manage transactions"
  ON transactions FOR ALL
  USING (auth.role() = 'service_role');

-- Enable RLS on tokens
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;

-- Everyone can read tokens (public data)
CREATE POLICY "Tokens are publicly readable"
  ON tokens FOR SELECT
  USING (true);

-- Only backend can insert/update
CREATE POLICY "Service role can manage tokens"
  ON tokens FOR ALL
  USING (auth.role() = 'service_role');

-- Enable RLS on user_positions
ALTER TABLE user_positions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own positions
CREATE POLICY "Users can view own positions"
  ON user_positions FOR SELECT
  USING (true); -- Public for aggregated data, tighten if needed

-- Only backend can manage
CREATE POLICY "Service role can manage positions"
  ON user_positions FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- Recent transactions with token info
CREATE VIEW recent_transactions AS
SELECT 
  t.id,
  t.signature,
  t.wallet_address,
  t.token_mint,
  t.type,
  t.sol_amount,
  t.token_amount,
  t.status,
  t.block_time,
  t.created_at,
  tk.name as token_name,
  tk.symbol as token_symbol,
  tk.image_url as token_image
FROM transactions t
LEFT JOIN tokens tk ON t.token_mint = tk.mint
ORDER BY t.created_at DESC;

-- User portfolio summary
CREATE VIEW user_portfolio_summary AS
SELECT 
  up.wallet_address,
  COUNT(DISTINCT up.token_mint) as tokens_count,
  SUM(up.total_sol_invested) as total_invested,
  SUM(up.total_sol_withdrawn) as total_withdrawn
FROM user_positions up
WHERE up.current_token_amount > 0
GROUP BY up.wallet_address;

-- ============================================
-- INITIAL DATA / SEED (optional)
-- ============================================

-- You can add any initial data here if needed

