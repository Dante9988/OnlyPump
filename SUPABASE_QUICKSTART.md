# Supabase Integration - Quick Reference

## ✅ What's Been Set Up

### 1. Installed
- `@supabase/supabase-js@2.81.1` ✅

### 2. Files Created

**Configuration:**
- `src/config/supabase.config.ts` - Configuration loader
- `src/services/supabase.service.ts` - Supabase service with helper methods
- `src/app.module.ts` - Updated to include Supabase

**Migrations:**
- `supabase/migrations/001_initial_schema.sql` - Core tables (transactions, tokens, positions)
- `supabase/migrations/002_creator_platform.sql` - Creator features (profiles, posts, streams, clubs)

**Documentation:**
- `docs/SUPABASE_SETUP.md` - Complete setup guide

---

## 🚀 Next Steps

### 1. Create Supabase Project

1. Go to https://supabase.com
2. Create a new project
3. Copy your credentials:
   - **URL**: `https://xxxxx.supabase.co`
   - **Service Key**: `eyJhbGciOi...`

### 2. Run Migrations

In Supabase SQL Editor:
1. Copy contents of `/supabase/migrations/001_initial_schema.sql`
2. Run in SQL Editor
3. Repeat for `002_creator_platform.sql`

### 3. Add Environment Variables

Add to your `.env` (or Railway):

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Test Connection

```bash
# Start your backend
yarn start:dev

# It should log: "Supabase client initialized"
```

---

## 📊 Database Schema

### Core Tables (Already Created)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `transactions` | All buy/sell/create transactions | signature, wallet_address, type, status |
| `tokens` | Token metadata & market data | mint, name, symbol, creator_wallet, price_sol |
| `user_positions` | User's entry prices for P&L | wallet_address, token_mint, entry_price |
| `creators` | Creator profiles | handle, wallet_address, token_mint |
| `creator_posts` | Token-gated content | creator_id, required_tier, content_url |
| `live_streams` | Streaming sessions | creator_id, scheduled_at, status |
| `clubs` | Token-holder communities | creator_id, required_token_mint |
| `waitlist` | Pre-launch signups | email, role, status |

---

## 💻 Using Supabase Service

The `SupabaseService` is now available for injection:

```typescript
import { SupabaseService } from '../services/supabase.service';

export class YourService {
  constructor(private supabase: SupabaseService) {}

  async example() {
    // Get transactions for a wallet
    const txs = await this.supabase.getTransactions('wallet_address');

    // Create a transaction
    const tx = await this.supabase.createTransaction({
      pending_id: 'pending-123',
      wallet_address: 'wallet_address',
      token_mint: 'token_mint',
      type: 'buy',
      sol_amount: 0.1,
    });

    // Update transaction with signature
    await this.supabase.updateTransaction('pending-123', {
      signature: 'tx_signature',
      status: 'confirmed',
      block_time: 1234567890,
    });

    // Get token info
    const token = await this.supabase.getToken('token_mint');

    // Create token
    const newToken = await this.supabase.createToken({
      mint: 'token_mint',
      name: 'My Token',
      symbol: 'MTK',
      uri: 'https://...',
      creator_wallet: 'wallet_address',
    });

    // Direct access to Supabase client
    const { data, error } = await this.supabase.db
      .from('any_table')
      .select('*');
  }
}
```

---

## 🎯 Transaction Flow

### Current (In-Memory)
```
1. User requests buy → Backend creates pending tx
2. Frontend signs → Backend submits to Solana
3. Confirmation → Backend tracks in memory
```

### With Supabase (To Implement)
```
1. User requests buy → Backend creates pending tx in DB
2. Frontend signs → Backend submits & updates DB (status: submitted)
3. Confirmation → Backend updates DB (status: confirmed, add signature)
4. GET /api/transactions/:wallet → Read from DB (fast!)
```

---

## 📈 What to Build Next

### Priority 1: Transaction Storage
- [ ] Update `TransactionHistoryService` to use Supabase
- [ ] Store transactions on creation
- [ ] Update status on confirmation
- [ ] Migrate existing in-memory logic

### Priority 2: Token Tracking
- [ ] Store token metadata on creation
- [ ] Implement `GET /api/tokens/:tokenMint`
- [ ] Add trending endpoint
- [ ] Cache price data

### Priority 3: Creator Platform
- [ ] Creator profile CRUD endpoints
- [ ] Token-gated content
- [ ] Portfolio with P&L

---

## 🔍 Useful Queries

### Check if Supabase is working

```typescript
// In any service
const test = await this.supabase.db
  .from('transactions')
  .select('count');

console.log('DB connection:', test);
```

### View tables in SQL Editor

```sql
-- List all tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Count records
SELECT 
  'transactions' as table, COUNT(*) as count FROM transactions
UNION ALL
SELECT 'tokens', COUNT(*) FROM tokens
UNION ALL
SELECT 'user_positions', COUNT(*) FROM user_positions;
```

---

## 🆘 Troubleshooting

**"Supabase client not initialized"**
→ Check environment variables are set

**"relation does not exist"**
→ Run the migrations in Supabase SQL Editor

**"permission denied"**
→ Use `service_role` key, not `anon` key

**Slow queries**
→ Indexes are already created in migrations

---

## 📚 Full Documentation

See `/docs/SUPABASE_SETUP.md` for complete setup instructions and advanced features.

