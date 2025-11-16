-- OnlyPump Creator Platform Schema
-- Phase 2: Creators, content, streaming, clubs

-- ============================================
-- CREATORS TABLE
-- Creator profiles with social links
-- ============================================
CREATE TABLE creators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identity
  wallet_address VARCHAR(44) NOT NULL UNIQUE,
  handle VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  bio TEXT,
  
  -- Categorization
  category VARCHAR(50), -- 'music', 'art', 'fitness', 'acting', etc.
  tags TEXT[], -- Array of tags
  
  -- Media
  avatar_url TEXT,
  banner_url TEXT,
  
  -- Verification
  verified BOOLEAN DEFAULT false,
  verification_date TIMESTAMP WITH TIME ZONE,
  
  -- Social links
  socials JSONB, -- { instagram, youtube, tiktok, twitter, website }
  followers JSONB, -- { total, instagram, youtube, tiktok }
  
  -- Token association
  token_mint VARCHAR(44), -- Primary token mint
  token_ticker VARCHAR(20), -- Token symbol (e.g., "$ACTOR")
  
  -- Stats (cached)
  total_raised DECIMAL(20, 9) DEFAULT 0,
  token_holders INT DEFAULT 0,
  content_posts_count INT DEFAULT 0,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_handle CHECK (handle ~ '^[a-z0-9_]{3,50}$')
);

-- Indexes
CREATE INDEX idx_creators_wallet ON creators(wallet_address);
CREATE INDEX idx_creators_handle ON creators(handle);
CREATE INDEX idx_creators_token ON creators(token_mint);
CREATE INDEX idx_creators_category ON creators(category);
CREATE INDEX idx_creators_verified ON creators(verified);
CREATE INDEX idx_creators_created_at ON creators(created_at DESC);

-- Full text search
CREATE INDEX idx_creators_search ON creators USING gin(to_tsvector('english', name || ' ' || bio || ' ' || handle));

-- ============================================
-- CREATOR_POSTS TABLE
-- Token-gated content
-- ============================================
CREATE TABLE creator_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  
  -- Content
  title VARCHAR(200) NOT NULL,
  description TEXT,
  content_type VARCHAR(20) NOT NULL, -- 'video', 'image', 'text', 'audio'
  content_url TEXT, -- S3/CDN URL
  thumbnail_url TEXT,
  
  -- Access control
  required_tier VARCHAR(20) NOT NULL, -- 'fan', 'supporter', 'vip', 'diamond'
  required_tokens BIGINT NOT NULL, -- Minimum token balance
  
  -- Stats
  views_count INT DEFAULT 0,
  likes_count INT DEFAULT 0,
  
  -- Publishing
  published_at TIMESTAMP WITH TIME ZONE,
  is_draft BOOLEAN DEFAULT true,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_content_type CHECK (content_type IN ('video', 'image', 'text', 'audio', 'gallery')),
  CONSTRAINT valid_tier CHECK (required_tier IN ('fan', 'supporter', 'vip', 'diamond'))
);

-- Indexes
CREATE INDEX idx_posts_creator ON creator_posts(creator_id);
CREATE INDEX idx_posts_published ON creator_posts(published_at DESC) WHERE is_draft = false;
CREATE INDEX idx_posts_tier ON creator_posts(required_tier);
CREATE INDEX idx_posts_created_at ON creator_posts(created_at DESC);

-- ============================================
-- LIVE_STREAMS TABLE
-- Scheduled/live streaming sessions
-- ============================================
CREATE TABLE live_streams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  
  -- Stream info
  title VARCHAR(200) NOT NULL,
  description TEXT,
  
  -- Scheduling
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'upcoming', -- 'upcoming', 'live', 'ended', 'cancelled'
  
  -- Streaming
  stream_url TEXT, -- RTMP/HLS URL (generated when live)
  stream_key VARCHAR(100), -- Private streaming key
  
  -- Access control
  required_tier VARCHAR(20) NOT NULL,
  required_tokens BIGINT NOT NULL,
  
  -- Stats
  viewer_count INT DEFAULT 0,
  peak_viewers INT DEFAULT 0,
  total_views INT DEFAULT 0,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_stream_status CHECK (status IN ('upcoming', 'live', 'ended', 'cancelled')),
  CONSTRAINT valid_stream_tier CHECK (required_tier IN ('fan', 'supporter', 'vip', 'diamond'))
);

-- Indexes
CREATE INDEX idx_streams_creator ON live_streams(creator_id);
CREATE INDEX idx_streams_status ON live_streams(status);
CREATE INDEX idx_streams_scheduled ON live_streams(scheduled_at DESC);
CREATE INDEX idx_streams_started ON live_streams(started_at DESC);

-- ============================================
-- CLUBS TABLE
-- Token-holder communities
-- ============================================
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  
  -- Club info
  name VARCHAR(100) NOT NULL,
  description TEXT,
  banner_url TEXT,
  
  -- Access requirements
  required_token_mint VARCHAR(44) NOT NULL,
  required_token_amount BIGINT NOT NULL,
  
  -- Stats
  member_count INT DEFAULT 0,
  message_count INT DEFAULT 0,
  
  -- Settings
  is_active BOOLEAN DEFAULT true,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_clubs_creator ON clubs(creator_id);
CREATE INDEX idx_clubs_token ON clubs(required_token_mint);
CREATE INDEX idx_clubs_active ON clubs(is_active);

-- ============================================
-- WAITLIST TABLE
-- Pre-launch waitlist
-- ============================================
CREATE TABLE waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Contact
  email VARCHAR(255) UNIQUE NOT NULL,
  wallet_address VARCHAR(44), -- Optional
  
  -- Role
  role VARCHAR(20) NOT NULL, -- 'creator', 'fan'
  
  -- Creator info (if role = 'creator')
  socials JSONB, -- Social media handles
  follower_count INT, -- Total followers across platforms
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'invited'
  invited_at TIMESTAMP WITH TIME ZONE,
  joined_at TIMESTAMP WITH TIME ZONE,
  
  -- Tracking
  referral_code VARCHAR(20),
  referred_by VARCHAR(255), -- Email of referrer
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_role CHECK (role IN ('creator', 'fan')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'invited'))
);

-- Indexes
CREATE INDEX idx_waitlist_email ON waitlist(email);
CREATE INDEX idx_waitlist_role ON waitlist(role);
CREATE INDEX idx_waitlist_status ON waitlist(status);
CREATE INDEX idx_waitlist_created_at ON waitlist(created_at DESC);

-- ============================================
-- NOTIFICATIONS TABLE
-- User notifications
-- ============================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Recipient
  wallet_address VARCHAR(44) NOT NULL,
  
  -- Notification details
  type VARCHAR(50) NOT NULL, -- 'new_post', 'stream_starting', 'token_milestone', etc.
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  
  -- Links
  action_url TEXT, -- Link to relevant page
  
  -- Related entities
  creator_id UUID REFERENCES creators(id) ON DELETE SET NULL,
  post_id UUID REFERENCES creator_posts(id) ON DELETE SET NULL,
  stream_id UUID REFERENCES live_streams(id) ON DELETE SET NULL,
  
  -- Status
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_wallet ON notifications(wallet_address);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_wallet_unread ON notifications(wallet_address, created_at DESC) WHERE read = false;

-- ============================================
-- ANALYTICS TABLES (Optional but useful)
-- ============================================

-- Token price history (for charts)
CREATE TABLE token_price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  token_mint VARCHAR(44) NOT NULL,
  
  -- Price data
  price_sol DECIMAL(20, 12) NOT NULL,
  market_cap_sol DECIMAL(20, 9),
  volume_24h DECIMAL(20, 9),
  holders_count INT,
  
  -- Virtual reserves (for bonding curve)
  virtual_sol_reserves BIGINT,
  virtual_token_reserves BIGINT,
  
  -- Timestamp
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Interval type
  interval_type VARCHAR(10) -- '1m', '5m', '1h', '1d'
);

-- Indexes for time-series queries
CREATE INDEX idx_price_history_token ON token_price_history(token_mint);
CREATE INDEX idx_price_history_timestamp ON token_price_history(timestamp DESC);
CREATE INDEX idx_price_history_token_time ON token_price_history(token_mint, timestamp DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at for creators
CREATE TRIGGER update_creators_updated_at
  BEFORE UPDATE ON creators
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for posts
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON creator_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for streams
CREATE TRIGGER update_streams_updated_at
  BEFORE UPDATE ON live_streams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for clubs
CREATE TRIGGER update_clubs_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update token_mint in tokens table when creator links token
CREATE OR REPLACE FUNCTION link_creator_to_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.token_mint IS NOT NULL AND (OLD.token_mint IS NULL OR OLD.token_mint != NEW.token_mint) THEN
    UPDATE tokens
    SET creator_id = NEW.id
    WHERE mint = NEW.token_mint;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_creator_token_link
  AFTER INSERT OR UPDATE OF token_mint ON creators
  FOR EACH ROW
  EXECUTE FUNCTION link_creator_to_token();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Creators
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators are publicly readable"
  ON creators FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage creators"
  ON creators FOR ALL
  USING (auth.role() = 'service_role');

-- Posts
ALTER TABLE creator_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published posts are publicly readable"
  ON creator_posts FOR SELECT
  USING (is_draft = false OR auth.role() = 'service_role');

CREATE POLICY "Service role can manage posts"
  ON creator_posts FOR ALL
  USING (auth.role() = 'service_role');

-- Streams
ALTER TABLE live_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streams are publicly readable"
  ON live_streams FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage streams"
  ON live_streams FOR ALL
  USING (auth.role() = 'service_role');

-- Clubs
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clubs are publicly readable"
  ON clubs FOR SELECT
  USING (is_active = true);

CREATE POLICY "Service role can manage clubs"
  ON clubs FOR ALL
  USING (auth.role() = 'service_role');

-- Waitlist
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage waitlist"
  ON waitlist FOR ALL
  USING (auth.role() = 'service_role');

-- Notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (true); -- Tighten with wallet verification if needed

CREATE POLICY "Service role can manage notifications"
  ON notifications FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- USEFUL VIEWS
-- ============================================

-- Creator leaderboard
CREATE VIEW creator_leaderboard AS
SELECT 
  c.id,
  c.handle,
  c.name,
  c.avatar_url,
  c.token_mint,
  c.token_ticker,
  c.total_raised,
  c.token_holders,
  c.content_posts_count,
  c.verified,
  c.created_at,
  t.market_cap_sol,
  t.volume_24h_sol
FROM creators c
LEFT JOIN tokens t ON c.token_mint = t.mint
ORDER BY c.total_raised DESC;

-- Upcoming streams
CREATE VIEW upcoming_streams_view AS
SELECT 
  ls.id,
  ls.title,
  ls.description,
  ls.scheduled_at,
  ls.status,
  ls.required_tier,
  ls.required_tokens,
  c.id as creator_id,
  c.handle as creator_handle,
  c.name as creator_name,
  c.avatar_url as creator_avatar,
  c.token_mint as creator_token_mint
FROM live_streams ls
JOIN creators c ON ls.creator_id = c.id
WHERE ls.status IN ('upcoming', 'live')
ORDER BY ls.scheduled_at ASC;

