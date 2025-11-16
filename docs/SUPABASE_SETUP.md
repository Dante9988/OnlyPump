# Supabase Setup Guide

## Overview

This guide will walk you through setting up Supabase for the OnlyPump backend to store transactions, tokens, and creator data.

---

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Create a new organization (if you don't have one)
4. Click "New project"
5. Fill in project details:
   - **Name**: `onlypump` (or your preferred name)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Start with Free tier

6. Wait 2-3 minutes for project to be provisioned

---

## 2. Get Your API Keys

Once your project is ready:

1. Go to **Project Settings** → **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGc...` (for frontend)
   - **service_role key**: `eyJhbGc...` (for backend - keep this secret!)

---

## 3. Run Database Migrations

### Option A: Using Supabase SQL Editor (Easiest)

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New query"
3. Copy the contents of `/supabase/migrations/001_initial_schema.sql`
4. Paste into the editor
5. Click "Run" (or press Cmd/Ctrl + Enter)
6. Wait for "Success. No rows returned"

7. Repeat for `002_creator_platform.sql`:
   - Click "New query"
   - Copy contents of `/supabase/migrations/002_creator_platform.sql`
   - Paste and run

### Option B: Using Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref xxxxx

# Run migrations
supabase db push
```

---

## 4. Configure Backend Environment Variables

Add these to your `.env` file (or Railway environment variables):

```bash
# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Important:**
- Use `SUPABASE_SERVICE_KEY` in backend (bypasses RLS)
- Use `SUPABASE_ANON_KEY` in frontend (respects RLS)
- Never commit these keys to git!

---

## 5. Verify Setup

### Test Database Connection

Create a test endpoint in your backend:

```typescript
// src/api/controllers/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { SupabaseService } from '../../services/supabase.service';

@Controller('api/health')
export class HealthController {
  constructor(private supabase: SupabaseService) {}

  @Get('db')
  async checkDatabase() {
    try {
      const { data, error } = await this.supabase.db
        .from('transactions')
        .select('count');
      
      return {
        status: 'connected',
        tables: ['transactions', 'tokens', 'user_positions'],
        error: null
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}
```

Test it:
```bash
curl http://localhost:3000/api/health/db
```

---

## 6. Database Schema Overview

### Core Tables (Phase 1)

**`transactions`**
- Stores all buy/sell/create transactions
- Indexed by wallet_address for fast queries
- Status: pending → submitted → confirmed/failed

**`tokens`**
- Metadata for tokens created on platform
- Cached price/market data
- Links to creator profiles

**`user_positions`**
- Tracks user's entry prices for P&L calculation
- Updated on each buy/sell
- Used for portfolio endpoint

### Creator Platform (Phase 2)

**`creators`**
- Creator profiles with social links
- Token association
- Verification status

**`creator_posts`**
- Token-gated content
- Access tiers (fan, supporter, vip, diamond)

**`live_streams`**
- Scheduled/live streaming sessions
- Viewer tracking

**`clubs`**
- Token-holder communities

**`waitlist`**
- Pre-launch signups

---

## 7. Row Level Security (RLS)

The schema includes RLS policies:

- **Public read** for tokens, creators, streams
- **User-specific** for transactions, positions
- **Service role** (backend) can do everything

This means:
- Backend uses `service_role` key → full access
- Frontend uses `anon` key → restricted by RLS policies

---

## 8. Testing Your Setup

### Test Transaction Creation

```typescript
// In your service
const tx = await this.supabaseService.createTransaction({
  pending_id: 'test-123',
  wallet_address: 'YourWalletAddress',
  token_mint: 'TokenMintAddress',
  type: 'buy',
  sol_amount: 0.1,
});

console.log('Created transaction:', tx);
```

### Test Transaction Query

```typescript
const transactions = await this.supabaseService.getTransactions(
  'YourWalletAddress',
  10 // limit
);

console.log('User transactions:', transactions);
```

---

## 9. Common Issues & Solutions

### Issue: "relation does not exist"
**Solution:** Run the migrations in SQL Editor

### Issue: "permission denied for table"
**Solution:** 
- Make sure you're using `service_role` key in backend
- Check RLS policies in Supabase dashboard

### Issue: "Failed to fetch"
**Solution:**
- Check SUPABASE_URL is correct
- Verify network connectivity
- Check Railway/server can reach Supabase

### Issue: Slow queries
**Solution:**
- Check indexes are created (they should be from migrations)
- Use `EXPLAIN ANALYZE` in SQL Editor
- Consider adding more indexes for specific queries

---

## 10. Monitoring & Maintenance

### View Database in Supabase Dashboard

1. Go to **Table Editor** → See all your data
2. Go to **Database** → **Roles** → Check RLS policies
3. Go to **Database** → **Extensions** → Enable additional features
4. Go to **Database** → **Replication** → Set up backups

### Enable Real-time (Optional)

For live updates (e.g., transaction status changes):

```typescript
// Subscribe to transaction updates
const channel = supabase
  .channel('transactions')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'transactions'
  }, (payload) => {
    console.log('Transaction updated:', payload);
  })
  .subscribe();
```

### Backups

Supabase automatically backs up your database daily (on paid plans).

For manual backups:
1. Go to **Database** → **Backups**
2. Click "Create backup"

---

## 11. Next Steps

Once Supabase is set up:

1. **Integrate with existing endpoints**:
   - Update `TransactionHistoryService` to use Supabase
   - Store transactions in DB when created
   - Update status when confirmed

2. **Add token tracking**:
   - Store token metadata on creation
   - Update price data periodically
   - Cache for fast lookups

3. **Build creator features**:
   - Implement creator profile endpoints
   - Add content posting
   - Set up streaming

---

## 12. Production Checklist

Before going live:

- [ ] Migrations run successfully
- [ ] Environment variables set in Railway
- [ ] RLS policies tested
- [ ] Indexes created (check with `\d+ table_name` in SQL)
- [ ] Backups enabled
- [ ] Connection pooling configured (Supabase handles this)
- [ ] Rate limits understood (Supabase free tier limits)

---

## 13. Useful SQL Queries

### Check table sizes
```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### View recent transactions
```sql
SELECT 
  t.*,
  tk.symbol,
  tk.name
FROM transactions t
LEFT JOIN tokens tk ON t.token_mint = tk.mint
ORDER BY t.created_at DESC
LIMIT 10;
```

### Count transactions by type
```sql
SELECT 
  type,
  status,
  COUNT(*) as count
FROM transactions
GROUP BY type, status
ORDER BY count DESC;
```

---

## Support

If you encounter issues:
1. Check Supabase logs in dashboard
2. Check Railway logs for connection errors
3. Verify environment variables are set correctly
4. Test with direct SQL queries in Supabase SQL Editor

