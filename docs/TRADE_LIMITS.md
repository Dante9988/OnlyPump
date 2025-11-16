# Pump.fun Trade Limits Implementation

## Overview

This document explains the implementation of trade size validation to prevent **NotAuthorized** errors when buying or selling tokens on Pump.fun's bonding curve.

## The Problem

Pump.fun enforces on-chain limits to prevent price manipulation:
- Trades cannot exceed ~10-15% of the bonding curve's virtual reserves
- First buys with 0.1 SOL work because the curve is fresh
- Subsequent 0.1 SOL buys fail because liquidity is consumed
- The error: `NotAuthorized: The given account is not authorized to execute this instruction`

## The Solution

The backend now:
1. **Validates trade sizes** before building transactions
2. **Calculates max safe amounts** based on current liquidity
3. **Provides clear error messages** when limits are exceeded
4. **Exposes an API endpoint** for frontends to query limits

---

## Backend Implementation

### 1. Trade Limit Calculation (`src/utils/bonding-curve.utils.ts`)

```typescript
// Calculate maximum safe trade sizes
const limits = calculateTradeLimits(bondingCurve);

console.log(limits);
// {
//   maxBuySOL: 0.12,             // Absolute maximum (12% of liquidity)
//   recommendedMaxBuySOL: 0.108,  // Safe limit (90% of max)
//   maxSellTokens: 1000000,
//   liquiditySOL: 1.0,
//   priceImpactPercentage: 5.2
// }
```

**Key Functions:**

- `calculateTradeLimits(bondingCurve)` - Returns max buy/sell amounts
- `validateBuyAmount(solAmount, bondingCurve)` - Validates if buy is safe
- `validateSellAmount(tokenAmount, bondingCurve)` - Validates if sell is safe
- `calculateRecommendedSlippage(priceImpact)` - Adjusts slippage dynamically

### 2. Automatic Validation in Buy/Sell

The `TokenManagementService` now validates all trades automatically:

**For Buys:**
```typescript
// In buyToken() method
const { bondingCurve: bc } = await this.onlinePumpSdk.fetchBuyState(tokenMint, walletPubkey);

// VALIDATE before building transaction
const validation = validateBuyAmount(request.solAmount, bc);
if (!validation.valid) {
  throw new Error(validation.error);
  // Error: "Buy amount 0.1 SOL exceeds maximum of 0.095 SOL at current liquidity"
}
```

**For Sells:**
```typescript
// In sellToken() method
const validation = validateSellAmount(sellAmount, bc);
if (!validation.valid) {
  throw new Error(validation.error);
  // Error: "Sell amount 50000 tokens exceeds maximum of 45000 tokens at current liquidity"
}
```

### 3. Dynamic Slippage Adjustment

The backend automatically increases slippage for large trades:

```typescript
if (priceImpact > 5%) {
  // Automatically increase slippage from 5% to 15%
  this.logger.log(`High price impact, increasing slippage`);
}
```

---

## API Endpoints

### New Endpoint: Get Trade Limits

**`GET /api/tokens/:tokenMint/trade-limits`**

Returns current max trade sizes based on bonding curve liquidity.

**Example Request:**
```bash
curl https://your-backend.railway.app/api/tokens/zpTNP3Hj1dmhJPCySoYmNwY2iuwRJDAsxJuurHmheKb/trade-limits
```

**Response:**
```json
{
  "tokenMint": "zpTNP3Hj1dmhJPCySoYmNwY2iuwRJDAsxJuurHmheKb",
  "maxBuySOL": 0.12,
  "recommendedMaxBuySOL": 0.108,
  "maxSellTokens": 1000000,
  "recommendedMaxSellTokens": 900000,
  "liquiditySOL": 1.0,
  "isMigrated": false
}
```

---

## Frontend Integration

### 1. Query Trade Limits Before Trading

```typescript
// Fetch limits before showing trade form
const limits = await axios.get(`/api/tokens/${tokenMint}/trade-limits`);

// Show max in UI
<input 
  type="number" 
  max={limits.recommendedMaxBuySOL}
  placeholder={`Max: ${limits.recommendedMaxBuySOL.toFixed(4)} SOL`}
/>
```

### 2. Handle Validation Errors

```typescript
try {
  await axios.post('/api/tokens/buy', {
    tokenMint,
    solAmount: 0.1,
    walletAddress: wallet.publicKey.toBase58()
  });
} catch (error) {
  if (error.response?.data?.error?.includes('exceeds maximum')) {
    // Show user: "Amount too large. Max: 0.095 SOL at current liquidity."
    showError(error.response.data.error);
  }
}
```

### 3. Real-Time Limit Updates

```typescript
// Refresh limits periodically during active trading
useEffect(() => {
  const interval = setInterval(async () => {
    const limits = await fetchTradeLimits(tokenMint);
    setMaxBuyAmount(limits.recommendedMaxBuySOL);
  }, 10000); // Update every 10 seconds

  return () => clearInterval(interval);
}, [tokenMint]);
```

---

## Understanding the Limits

### Why 12% of Liquidity?

Pump.fun's bonding curve typically allows:
- **Max trade size**: ~10-15% of virtual SOL reserves
- **Our implementation**: 12% max, 10.8% recommended (with 10% safety margin)

### Virtual vs Real Reserves

```typescript
{
  virtualSolReserves: 30 SOL,    // Used for price calculation
  realSolReserves: 1 SOL,        // Actual SOL in curve
  
  maxBuy: 30 * 0.12 = 3.6 SOL   // Based on virtual
}
```

The virtual reserves are higher than real reserves, so max buy amounts may exceed the actual SOL in the curve.

### Price Impact

```typescript
priceImpact = (buyAmount / virtualSolReserves) * 100

// Example:
buyAmount = 0.1 SOL
virtualSolReserves = 30 SOL
priceImpact = (0.1 / 30) * 100 = 0.33%  // Low impact ✅

buyAmount = 5 SOL
priceImpact = (5 / 30) * 100 = 16.67%   // Too high ❌
```

---

## Error Messages

### Clear User-Facing Errors

**Before:**
```
Error: NotAuthorized: The given account is not authorized to execute this instruction
```

**Now:**
```
Error: Buy amount 0.1 SOL exceeds maximum of 0.095 SOL at current liquidity (1.2 SOL). Price impact: 8.33%.
```

### Logging for Debugging

Backend logs now include:
```
[TokenManagementService] Trade limits: max=0.0950 SOL, liquidity=1.20 SOL, impact=7.50%
[TokenManagementService] Increasing slippage from 500 to 1500 bps due to 7.50% price impact
```

---

## Testing

### Test Scenarios

1. **Small buy (should work):**
```bash
POST /api/tokens/buy
{
  "tokenMint": "xxx",
  "solAmount": 0.01,
  "walletAddress": "xxx"
}
# ✅ Should succeed
```

2. **Large buy (should fail with clear error):**
```bash
POST /api/tokens/buy
{
  "tokenMint": "xxx",
  "solAmount": 0.5,
  "walletAddress": "xxx"
}
# ❌ Error: "Buy amount 0.5 SOL exceeds maximum of 0.095 SOL..."
```

3. **Query limits:**
```bash
GET /api/tokens/xxx/trade-limits
# Returns: { maxBuySOL: 0.12, recommendedMaxBuySOL: 0.108, ... }
```

---

## Configuration

### Adjusting Limits

To change the trade size limits, edit `src/utils/bonding-curve.utils.ts`:

```typescript
// Current: 12% of virtual reserves
const MAX_TRADE_PERCENTAGE = 0.12;

// To allow larger trades (risky):
const MAX_TRADE_PERCENTAGE = 0.15;  // 15%

// To be more conservative:
const MAX_TRADE_PERCENTAGE = 0.10;  // 10%
```

### Safety Margin

```typescript
// Current: Recommend 90% of theoretical max
const SAFETY_MARGIN = 0.9;

// More conservative (recommend 80% of max):
const SAFETY_MARGIN = 0.8;
```

---

## Migration to PumpSwap

When a token migrates to PumpSwap (bonding curve completes):
- Trade limits become **much higher** (AMM liquidity pool)
- `isMigrated: true` in trade limits response
- Backend automatically switches to PumpSwap SDK

---

## Benefits

1. **Better UX**: Clear error messages instead of cryptic blockchain errors
2. **Faster Feedback**: Frontend can show limits before user submits
3. **Dynamic Slippage**: Automatically adjusts for large trades
4. **Prevents Failed Transactions**: Validates before building tx, saving gas

---

## Future Enhancements

1. **Real-time WebSocket updates** for trade limits during high volatility
2. **Multi-transaction splitting** for amounts exceeding limits
3. **Historical limit tracking** to show liquidity trends
4. **Per-token custom limits** based on community settings

---

## Support

For issues or questions:
- Check Railway logs for detailed validation errors
- Use `/trade-limits` endpoint to debug max amounts
- Ensure Pump.fun SDK is up to date (`@pump-fun/pump-sdk` >= 1.21.0)

