# OnlyPump Presale Flow Documentation

## Two Token Creation Paths

### Path 1: Normal Token (No Presale)
Simple token creation for regular users who don't want a presale.

**Flow:**
1. Creator calls `/api/tokens/create-and-buy`
   - Creates Pump.fun token with vanity address
   - Buys initial tokens
2. Token trades on Pump.fun/PumpSwap
3. Creator claims rewards (50% platform fee)

**No presale voting or community involvement**

---

### Path 2: Presale Token (With Community Funding)
Advanced flow with community funding, voting, and verified launch.

**Flow:**

#### Phase 1: Presale Creation & Funding
1. Creator reserves vanity address for their token
2. Creator calls `/api/presale` (POST)
   - Reserves vanity address for token mint
   - Creates presale PDA with:
     - Token info (name, symbol, description)
     - Pricing (price per token)
     - Timeline (start, end)
     - Hard cap
   - **Token doesn't exist yet!**
3. Users contribute SOL via `contribute_public` instruction
   - SOL goes into `public_sol_vault`
   - Users get token allocation tracked in `UserPosition`
4. Optional: Admin whitelists VIP users via `whitelist_user`

#### Phase 2: Voting
5. When presale ends, admin triggers `start_vote`
6. Community votes LAUNCH or REFUND via `cast_vote` (weighted by stake)
7. Admin calls `finalize_vote` to lock in outcome

#### Phase 3A: Launch (if vote = LAUNCH)
8. Creator calls `/api/presale/:mint/launch` (POST)
   - Backend verifies:
     - Presale exists
     - Creator is authority
     - Vote outcome = LAUNCH
   - Returns `withdrawForLaunch` transaction
9. Creator signs and sends withdraw transaction
   - Transfers all SOL from `public_sol_vault` to creator wallet
10. Creator calls `/api/tokens/create-and-buy`
    - Creates Pump.fun token with reserved vanity address
    - Uses withdrawn presale SOL to buy initial tokens
    - **Token now exists!**
11. Creator calls `/api/presale/:mint/initialize-vaults` (POST)
    - Creates `token_vault` and `ecosystem_vault`
    - Now presale can receive tokens
12. Creator calls `/api/presale/:mint/fund` (POST)
    - Transfers tokens to presale vaults
    - Presale contributors can now claim
13. Users call `claim_tokens` to receive their allocated tokens

#### Phase 3B: Refund (if vote = REFUND)
8. Admin enables refunds via `enable_refunds`
9. Users call `claim_refund` to get their SOL back

---

## Key Design Decisions

### Why Token Doesn't Exist at Presale Creation?
- **Problem:** Creators don't have capital to create Pump.fun token upfront
- **Solution:** Collect SOL from community first, then use those funds to create token
- **Benefit:** Community-funded token launch with voting mechanism

### Why Separate initialize_vaults?
- **Problem:** Token vaults need the SPL mint to exist
- **Solution:** Create presale first (no vaults), create token, then initialize vaults
- **Benefit:** Flexible flow that doesn't require token to exist upfront

### Why 50% Creator Reward Fee?
- Platform monetization on creator rewards (applies to both presale and non-presale tokens)

---

## API Endpoints

### Presale Endpoints
- `POST /api/presale` - Create presale (returns unsigned tx)
- `POST /api/presale/:mint/launch` - Prepare to launch token from presale funds
- `POST /api/presale/:mint/initialize-vaults` - Initialize token vaults after token created
- `POST /api/presale/:mint/fund` - Fund presale with tokens
- `POST /api/presale/pricing/preview` - Calculate pricing

### Token Endpoints  
- `POST /api/tokens/create` - Create token (no presale)
- `POST /api/tokens/create-and-buy` - Create and buy token (no presale)
- Both work independently of presale system

---

## Security

- ✅ Only presale authority can withdraw funds
- ✅ Only presale authority can initialize vaults
- ✅ Community votes on whether to launch or refund
- ✅ All transactions are client-signed (backend doesn't hold creator keys)
- ✅ Whitelist system for VIP/controlled access

---

## Database Schema

### `presales` table
Stores presale metadata for frontend display:
- `presale_pda` - On-chain presale account address
- `mint` - Reserved token mint address
- `name`, `symbol`, `description` - Token info
- `creator_wallet` - Presale authority
- `status` - active, finalized, cancelled

### Token/Transaction/Position tables
Same as non-presale tokens

