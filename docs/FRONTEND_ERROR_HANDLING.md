# Frontend Error Handling Guide

## 🚨 Updated Error Responses (Backend v2.0)

The backend now returns **proper HTTP status codes** for validation errors:

- ✅ **400 Bad Request** - User input validation errors (trade size, slippage, etc.)
- ❌ **500 Internal Server Error** - Unexpected backend errors

---

## 📋 Error Response Format

All errors follow this structure:

```json
{
  "statusCode": 400,
  "timestamp": "2025-11-16T05:47:37.000Z",
  "path": "/api/tokens/buy",
  "method": "POST",
  "message": "Detailed error message explaining what went wrong",
  "error": "Trade Validation Failed"
}
```

---

## 🎯 Buy Endpoint Errors

### Error 1: Trade Size Too Large

**Status:** `400 Bad Request`

**Error Response:**
```json
{
  "statusCode": 400,
  "message": "Buy amount 1 SOL exceeds maximum of 0.8747 SOL at current liquidity (0.10 SOL). Price impact: 12.35%.",
  "error": "Trade Validation Failed"
}
```

**Frontend Handling:**
```typescript
catch (error) {
  if (error.response?.status === 400 && 
      error.response?.data?.message?.includes('exceeds maximum')) {
    
    // Extract max amount from error message
    const match = error.response.data.message.match(/([\d.]+) SOL at current liquidity/);
    const maxAmount = match ? parseFloat(match[1]) : null;
    
    showError({
      title: "Trade Size Too Large",
      message: `Maximum buy amount is ${maxAmount} SOL at current liquidity.`,
      actions: [
        { label: `Buy ${maxAmount} SOL instead`, onClick: () => buyWithAmount(maxAmount) },
        { label: "Cancel", onClick: closeModal }
      ]
    });
  }
}
```

---

### Error 2: Slippage Too Low

**Status:** `400 Bad Request`

**Error Response:**
```json
{
  "statusCode": 400,
  "message": "Slippage tolerance too low. Your slippage: 500 bps (5.0%). Required: 1500 bps (15.0%) due to 8.50% price impact. Please increase slippage or reduce trade size to 0.0700 SOL.",
  "error": "Trade Validation Failed"
}
```

**Frontend Handling:**
```typescript
catch (error) {
  if (error.response?.status === 400 && 
      error.response?.data?.message?.includes('Slippage tolerance too low')) {
    
    // Extract required slippage from error message
    const match = error.response.data.message.match(/Required: (\d+) bps/);
    const requiredSlippage = match ? parseInt(match[1]) : null;
    
    showError({
      title: "Slippage Too Low",
      message: `This trade requires ${requiredSlippage / 100}% slippage due to high price impact.`,
      actions: [
        { 
          label: `Retry with ${requiredSlippage / 100}% slippage`, 
          onClick: () => retryBuy({ ...params, slippageBps: requiredSlippage })
        },
        { label: "Reduce trade size", onClick: () => setTradeAmount(amount * 0.7) },
        { label: "Cancel", onClick: closeModal }
      ]
    });
  }
}
```

---

## 💰 Sell Endpoint Errors

### Error 3: Insufficient Balance

**Status:** `400 Bad Request`

**Error Response:**
```json
{
  "statusCode": 400,
  "message": "No tokens found in wallet ABC...XYZ for token DEF...GHI",
  "error": "Trade Validation Failed"
}
```

**Frontend Handling:**
```typescript
catch (error) {
  if (error.response?.status === 400 && 
      error.response?.data?.message?.includes('No tokens found')) {
    
    showError({
      title: "Insufficient Balance",
      message: "You don't have any tokens to sell.",
      actions: [
        { label: "OK", onClick: closeModal }
      ]
    });
  }
}
```

---

### Error 4: Sell Amount Too Large

**Status:** `400 Bad Request`

**Error Response:**
```json
{
  "statusCode": 400,
  "message": "Sell amount 50000 tokens exceeds maximum of 45000 tokens at current liquidity. Price impact: 15.25%.",
  "error": "Trade Validation Failed"
}
```

**Frontend Handling:**
```typescript
catch (error) {
  if (error.response?.status === 400 && 
      error.response?.data?.message?.includes('Sell amount') &&
      error.response?.data?.message?.includes('exceeds maximum')) {
    
    // Extract max tokens from error message
    const match = error.response.data.message.match(/maximum of ([\d,]+) tokens/);
    const maxTokens = match ? parseInt(match[1].replace(/,/g, '')) : null;
    
    // Calculate what percentage that is of user's balance
    const maxPercentage = Math.floor((maxTokens / userBalance) * 100);
    
    showError({
      title: "Sell Amount Too Large",
      message: `Maximum sell is ${maxPercentage}% of your balance at current liquidity.`,
      actions: [
        { 
          label: `Sell ${maxPercentage}% instead`, 
          onClick: () => sellWithPercentage(maxPercentage) 
        },
        { label: "Cancel", onClick: closeModal }
      ]
    });
  }
}
```

---

### Error 5: Sell Slippage Too Low

**Status:** `400 Bad Request`

**Error Response:**
```json
{
  "statusCode": 400,
  "message": "Slippage tolerance too low. Your slippage: 1000 bps (10.0%). Required: 2000 bps (20.0%) due to 12.35% price impact. Please increase slippage or reduce sell percentage to 70%.",
  "error": "Trade Validation Failed"
}
```

**Frontend Handling:**
```typescript
catch (error) {
  if (error.response?.status === 400 && 
      error.response?.data?.message?.includes('Slippage tolerance too low')) {
    
    const match = error.response.data.message.match(/Required: (\d+) bps/);
    const requiredSlippage = match ? parseInt(match[1]) : null;
    
    showError({
      title: "Slippage Too Low",
      message: `This trade requires ${requiredSlippage / 100}% slippage.`,
      actions: [
        { 
          label: `Retry with ${requiredSlippage / 100}% slippage`, 
          onClick: () => retrySell({ ...params, slippageBps: requiredSlippage })
        },
        { label: "Cancel", onClick: closeModal }
      ]
    });
  }
}
```

---

## 🛠️ Generic Error Handler

Use this generic handler to catch all validation errors:

```typescript
async function handleTradeError(error: any, tradeType: 'buy' | 'sell') {
  // Not an HTTP error
  if (!error.response) {
    showGenericError("Network error. Please try again.");
    return;
  }

  const status = error.response.status;
  const data = error.response.data;
  const message = data?.message || error.message;

  // 400 = User validation error (actionable)
  if (status === 400) {
    // Trade size too large
    if (message.includes('exceeds maximum')) {
      const match = message.match(/([\d.]+) (?:SOL|tokens) at current liquidity/);
      const maxAmount = match ? match[1] : null;
      
      showActionableError({
        title: "Trade Size Too Large",
        message: `Maximum ${tradeType} is ${maxAmount} at current liquidity.`,
        suggestion: `Try ${tradeType === 'buy' ? maxAmount + ' SOL' : '70% of balance'}`
      });
      return;
    }
    
    // Slippage too low
    if (message.includes('Slippage tolerance too low')) {
      const match = message.match(/Required: (\d+) bps/);
      const requiredSlippage = match ? parseInt(match[1]) : null;
      
      showActionableError({
        title: "Slippage Too Low",
        message: `This trade requires ${requiredSlippage / 100}% slippage.`,
        suggestion: `Increase slippage to ${requiredSlippage / 100}%`
      });
      return;
    }
    
    // Insufficient balance (sell only)
    if (message.includes('No tokens found')) {
      showError({
        title: "Insufficient Balance",
        message: "You don't have tokens to sell."
      });
      return;
    }
    
    // Generic validation error
    showError({
      title: "Trade Validation Failed",
      message: message
    });
    return;
  }

  // 500 = Backend error (not actionable by user)
  if (status === 500) {
    console.error('Backend error:', message);
    showError({
      title: "Transaction Failed",
      message: "An unexpected error occurred. Please try again later.",
      details: message // Show in console or advanced mode
    });
    return;
  }

  // Other errors
  showGenericError(message);
}

// Usage:
try {
  await buyToken(params);
} catch (error) {
  handleTradeError(error, 'buy');
}

try {
  await sellToken(params);
} catch (error) {
  handleTradeError(error, 'sell');
}
```

---

## 📊 Error Message Patterns

Use regex to extract specific values from error messages:

```typescript
// Extract max SOL amount for buy
const maxSolMatch = message.match(/maximum of ([\d.]+) SOL/);
const maxSol = maxSolMatch ? parseFloat(maxSolMatch[1]) : null;

// Extract max tokens for sell
const maxTokensMatch = message.match(/maximum of ([\d,]+) tokens/);
const maxTokens = maxTokensMatch ? parseInt(maxTokensMatch[1].replace(/,/g, '')) : null;

// Extract required slippage
const slippageMatch = message.match(/Required: (\d+) bps/);
const requiredSlippage = slippageMatch ? parseInt(slippageMatch[1]) : null;

// Extract price impact
const impactMatch = message.match(/Price impact: ([\d.]+)%/);
const priceImpact = impactMatch ? parseFloat(impactMatch[1]) : null;

// Extract suggested reduced amount
const reduceSolMatch = message.match(/reduce trade size to ([\d.]+) SOL/);
const suggestedSol = reduceSolMatch ? parseFloat(reduceSolMatch[1]) : null;

// Extract suggested reduced percentage
const reducePercentMatch = message.match(/reduce sell percentage to (\d+)%/);
const suggestedPercent = reducePercentMatch ? parseInt(reducePercentMatch[1]) : null;
```

---

## 🎯 Quick Reference

| Error Type | Status | Message Contains | Action |
|------------|--------|------------------|--------|
| Trade size too large | 400 | "exceeds maximum" | Show max amount, offer to reduce |
| Slippage too low | 400 | "Slippage tolerance too low" | Show required slippage, offer to increase |
| No balance | 400 | "No tokens found" | Show error, suggest buying tokens |
| Invalid amount | 400 | "Invalid sell amount" | Show error |
| Backend error | 500 | Any | Show generic error, log details |

---

## ✅ Testing Checklist

Test these scenarios in your frontend:

- [ ] **Small buy (< 10% liquidity)** → Should work
- [ ] **Large buy (> max limit)** → Should show "Trade Size Too Large" with max amount
- [ ] **Buy with low slippage** → Should show "Slippage Too Low" with required %
- [ ] **Sell with no balance** → Should show "Insufficient Balance"
- [ ] **Large sell (> max limit)** → Should show "Sell Amount Too Large" with max %
- [ ] **Sell with low slippage** → Should show "Slippage Too Low" with required %
- [ ] **Parse error messages correctly** → Extract values with regex
- [ ] **Show actionable suggestions** → "Try X instead" buttons
- [ ] **Log 500 errors for debugging** → Send to error tracking service

---

## 💡 Best Practices

1. **Always show actionable errors** - Give users a way forward, not just "error"
2. **Extract specific values** - Parse error messages to show exact limits
3. **Provide retry buttons** - Let users fix the issue with one click
4. **Log validation errors** - Track which limits users hit most often
5. **Test with real transactions** - Use devnet to test all error scenarios

---

## 🆘 Need Help?

If you encounter unexpected errors:

1. Check the error `statusCode`:
   - `400` = User can fix it
   - `500` = Backend issue (report to backend team)

2. Check Railway logs for full error details

3. Use `/trade-limits` endpoint to debug max amounts:
   ```bash
   GET /api/tokens/:tokenMint/trade-limits
   ```

4. Test with small amounts first (< 0.05 SOL)

