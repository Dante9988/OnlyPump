# OnlyPump Presale Program - Implementation Notes

## Overview

This Anchor program implements a presale and liquidity system for tokens originally launched on pump.fun. The program manages:

- Public presale for 400M tokens
- Liquidity pool allocation of 300M tokens + SOL
- Ecosystem vault of 100M tokens
- Whitelisting system
- Dynamic hard caps based on SOL/USD (set off-chain)

## Account Structures

### PlatformConfig
- **PDA seeds**: `["platform"]`
- Stores platform owner, operator, treasury, and fee configuration
- Only initialized once per program deployment

### Presale
- **PDA seeds**: `["presale", mint_pubkey]`
- One per token mint
- Tracks presale timing, allocations, pricing, and state
- Token allocations:
  - `public_token_cap`: 400M tokens (400_000_000 * 10^6 = 400_000_000_000_000)
  - `lp_token_allocation`: 300M tokens
  - `ecosystem_allocation`: 100M tokens

### UserPosition
- **PDA seeds**: `["position", presale_pubkey, user_pubkey]`
- Tracks individual user contributions and token allocations
- Enables claim functionality after migration

### WhitelistEntry
- **PDA seeds**: `["whitelist", presale_pubkey, user_pubkey]`
- Set by backend after users complete social tasks
- Supports tier system (tier >= 1 for basic access)
- Optional per-user contribution caps

## Vault Accounts (PDAs)

### token_vault
- **PDA seeds**: `["token_vault", presale_pubkey]`
- Holds the 800M tokens for the presale
- Authority is the token_vault_authority PDA
- Funded via `fund_presale_tokens` instruction

### public_sol_vault
- **PDA seeds**: `["public_sol_vault", presale_pubkey]`
- Receives all public presale contributions in SOL
- SOL is later used for LP creation and treasury

### ecosystem_vault
- **PDA seeds**: `["ecosystem_vault", presale_pubkey]`
- Receives 100M tokens during migration
- Company-controlled for growth, rewards, incentives

## Instructions

### 1. initialize_platform
- Creates PlatformConfig PDA
- Sets owner, operator, treasury, fee_bps
- Only callable once

### 2. create_presale
- Admin-only (owner or operator)
- Creates Presale PDA and all vault PDAs
- Sets timing, pricing, and allocations
- Note: Token vault must be funded separately via `fund_presale_tokens`

### 3. fund_presale_tokens
- Admin-only
- Transfers tokens from authority's account to token_vault
- Assumption: Exactly 800M tokens should be transferred
- Can be called multiple times if needed (though typically once)

### 4. whitelist_user
- Admin-only
- Creates/updates WhitelistEntry for a user
- Sets tier and max_contribution_lamports
- User does NOT need to sign

### 5. contribute_public
- Called by users
- Validates:
  - Presale is active (within time window)
  - Not finalized
  - Hard cap not exceeded
  - Whitelist check (if whitelist account provided)
- Transfers SOL to public_sol_vault
- Calculates token allocation: `tokens = (amount_lamports * TOKEN_PRECISION) / public_price_lamports_per_token`
- Updates UserPosition
- **Token Math**: Uses `TOKEN_PRECISION = 1_000_000_000` (1e9) for calculations to match SOL precision

### 6. finalize_presale
- Admin-only
- Can only be called after `public_end_ts`
- Sets `is_finalized = true`
- Must be called before migration

### 7. migrate_and_create_lp
- Admin-only
- Preconditions: `is_finalized == true`, `is_migrated == false`
- Actions:
  - Transfers 300M tokens to LP token account
  - Transfers `lp_sol_amount` from public_sol_vault to LP SOL account
  - Transfers 100M tokens to ecosystem_vault
  - Sends remaining SOL to treasury
  - Sets `is_migrated = true`
- **Note**: Actual LP creation CPI is stubbed. In production, this would call Raydium or PumpSwap.

### 8. claim_tokens
- Called by users after migration
- Precondition: `presale.is_migrated == true`
- Transfers tokens from token_vault to user's ATA
- Updates `tokens_claimed` in UserPosition

## VIP Structures (Placeholders)

The following structures are defined but not yet implemented:

- `InfluencerConfig`: Creator share and VIP reward percentages
- `VipPool`: VIP contribution pool
- `VipPosition`: Individual VIP positions

These will be implemented in a future iteration for revenue sharing (10% from creator, 10% from platform).

## Assumptions and Design Decisions

### Token Decimals
- Assumes 6 decimals for tokens (standard for many Solana tokens)
- Token amounts stored as base units (e.g., 400M = 400_000_000_000_000)
- Can be adjusted if tokens use different decimals

### Token Math Precision
- Uses `TOKEN_PRECISION = 1_000_000_000` (1e9) for calculations
- This matches SOL's 9 decimal precision
- Formula: `tokens = (lamports * TOKEN_PRECISION) / price_per_token`
- Prevents precision loss in integer math

### Hard Cap Management
- Hard cap is set in lamports (SOL amount)
- Backend calculates this off-chain based on SOL/USD price
- Can be updated via `update_hard_cap` before presale starts
- On-chain only stores and enforces the lamport value

### Token Cap Enforcement
- Current implementation checks per-user position against `public_token_cap`
- In production, you'd want to track `total_allocated_tokens` in Presale account
- For MVP, we rely on `hard_cap_lamports` to limit total contributions
- The `public_price_lamports_per_token` should be set such that `hard_cap * TOKEN_PRECISION / price <= public_token_cap`

### LP Creation
- LP creation is stubbed in `migrate_and_create_lp`
- Tokens and SOL are transferred to temporary accounts
- In production, would call Raydium or PumpSwap CPI
- `lp_sol_amount` parameter determines how much SOL goes to LP (rest goes to treasury)

### Whitelisting
- Whitelist is optional - if no whitelist account is provided, contribution is allowed
- If whitelist exists, user must have `tier >= 1`
- Per-user `max_contribution_lamports` can be set (0 = no limit)

## Error Codes

- `Unauthorized`: Signer is not owner or operator
- `PresaleNotActive`: Presale not within time window
- `PresaleNotFinalized`: Cannot migrate before finalization
- `PresaleAlreadyFinalized`: Presale already finalized
- `PresaleAlreadyMigrated`: Presale already migrated
- `PresaleNotMigrated`: Cannot claim before migration
- `HardCapExceeded`: Contribution would exceed hard cap
- `TokenCapExceeded`: Token allocation would exceed cap
- `ContributionTooLarge`: Exceeds max contribution limit
- `NotWhitelisted`: User not whitelisted or tier too low
- `NothingToClaim`: No tokens available to claim
- `InsufficientFunds`: Not enough funds for operation

## Testing

The test suite (`tests/presale.test.ts`) covers:

1. Platform initialization
2. Presale creation
3. Token funding
4. User whitelisting
5. Public contribution
6. Presale finalization
7. Migration and LP creation (stub)
8. Token claiming

Run tests with: `anchor test`

## Future Enhancements

1. **Total Token Tracking**: Add `total_allocated_tokens` field to Presale to properly enforce cap
2. **LP Creation**: Implement actual Raydium/PumpSwap CPI calls
3. **VIP System**: Implement revenue sharing and VIP allocations
4. **Refund Logic**: Add refund capability if presale fails
5. **Multiple Contributions**: Better handling of multiple contributions per user
6. **Time Management**: Use Clockwork or similar for automatic finalization
7. **Fee Collection**: Implement platform fee collection during contributions

## Security Considerations

- All admin operations require owner or operator signature
- PDA derivations use deterministic seeds
- Token transfers use proper CPI contexts with signers
- Integer math uses checked operations to prevent overflow
- Time-based checks prevent premature operations
- Whitelist enforcement prevents unauthorized access

