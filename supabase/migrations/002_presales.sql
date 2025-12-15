-- ============================================
-- PRESALES TABLE
-- Link each on-chain presale PDA to its intended SPL token metadata
-- ============================================

CREATE TABLE presales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- On-chain presale PDA (presale account address)
  presale_pda VARCHAR(44) UNIQUE NOT NULL,

  -- SPL mint that this presale is for (may be null until Pump.fun token is created)
  mint VARCHAR(44),

  -- Human metadata entered by creator when configuring presale
  name VARCHAR(100) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  description TEXT,

  -- Creator wallet (from x-request-signature)
  creator_wallet VARCHAR(44) NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_presales_pda ON presales(presale_pda);
CREATE INDEX idx_presales_creator ON presales(creator_wallet);

-- RLS: presales are public read, backend-only write (same pattern as tokens)
ALTER TABLE presales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Presales are publicly readable"
  ON presales FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage presales"
  ON presales FOR ALL
  USING (auth.role() = 'service_role');


