# Presale (Devnet) – Next Plan of Attack

This doc tracks the current presale devnet state and the immediate next steps (migration, claims, refunds).

## Current state (devnet)

- **OnlyPump presale program**: `5zqdoDng2LnQ7JbiemiRwzTaPnnEU4eMXMfCCF3P4xQQ`
- **Live Pump.fun mint we’re continuing with**: `4EQqXuvGNnnnwNaeqtFZjcGWpepifFUL9UwK7LqPBfan`
- **Presale flow**: presale reached **LAUNCH**, creator withdrew SOL, created+buy token on Pump.fun, initialized vaults, and funded presale vault with **50% of bought tokens**.

## Migration target (tomorrow)

### What “migration” means here

We mean **Pump.fun → PumpSwap (Pump AMM)** migration: completing the Pump.fun bonding curve for the mint, then running Pump’s `migrate` instruction.

### Why we’re waiting

- Current devnet wallet balance: **~11.39 SOL**
- The current mint’s bonding curve estimate indicates we need **~22.18 SOL** total buys (at current curve state) to complete it.
- Plan: airdrop another **~10 SOL** tomorrow and execute the remaining buys from the creator wallet to push the curve to completion.

### API support

- `GET /api/presale/:mint/bonding-curve`
  - Returns bonding curve reserves and **`solToCompleteLamports`** (“SOL needed to complete curve”).

## Claims (public presale user)

### Desired product behavior

- Public presale users who contributed SOL (e.g., 0.1 SOL) should claim **their allocated portion** **after migration** (after Pump.fun bonding curve completes and the mint migrates to PumpSwap).

### Notes

- Allocation for public presale contributions is deterministic on-chain:
  - \(tokensAllocated = \lfloor amountLamports \cdot 10^9 / publicPriceLamportsPerToken \\rfloor\)
  - Claimable = `tokens_allocated - tokens_claimed`

## Refunds (fallback if migration is stuck)

### Desired product behavior

- If a token is stuck and not migrating, users can request a refund.
- Refunds should unlock **48 hours** after “now” (request time / failure window) and become claimable via an on-chain instruction.

### Work needed

- Add/refine presale program instructions and state to support:
  - refund request time tracking
  - 48-hour unlock window
  - `claim_refund` guarded by that unlock time (and by refund-enabled conditions)
- Add e2e coverage for:
  - “stuck migration” path
  - refund unlock waiting logic
  - refund claim and position state updates


