# Quick Summary for Frontend Team

## ✅ What Was Fixed

**Problem:** Backend was throwing 500 errors for validation failures like "trade size too large"

**Solution:** Backend now returns proper **400 Bad Request** for user validation errors

---

## 🚀 What Changed

### Before:
```json
{
  "statusCode": 500,
  "message": "Buy amount 1 SOL exceeds maximum of 0.8747 SOL..."
}
```

### After:
```json
{
  "statusCode": 400,
  "message": "Buy amount 1 SOL exceeds maximum of 0.8747 SOL at current liquidity (0.10 SOL). Price impact: 12.35%.",
  "error": "Trade Validation Failed"
}
```

---

## 📋 Error Types (All Return 400)

1. **Trade Size Too Large**
   - Message: `"Buy amount X SOL exceeds maximum of Y SOL..."`
   - Action: Show max amount, let user reduce

2. **Slippage Too Low**
   - Message: `"Slippage tolerance too low. Required: X bps..."`
   - Action: Show required slippage, let user increase

3. **Insufficient Balance** (Sell only)
   - Message: `"No tokens found in wallet..."`
   - Action: Show error

---

## 💻 Simple Frontend Handler

```typescript
try {
  const response = await axios.post('/api/tokens/buy', {
    tokenMint,
    solAmount: 0.1,
    walletAddress: wallet.publicKey.toBase58()
  });
  
  // Success - sign and submit transaction
  
} catch (error) {
  if (error.response?.status === 400) {
    // User validation error - show actionable message
    const message = error.response.data.message;
    
    if (message.includes('exceeds maximum')) {
      // Extract max: "exceeds maximum of 0.8747 SOL"
      const match = message.match(/maximum of ([\d.]+) SOL/);
      const maxAmount = match ? parseFloat(match[1]) : null;
      
      showError(`Trade too large. Max: ${maxAmount} SOL`);
      
    } else if (message.includes('Slippage tolerance too low')) {
      // Extract required: "Required: 1500 bps"
      const match = message.match(/Required: (\d+) bps/);
      const requiredSlippage = match ? parseInt(match[1]) : null;
      
      showError(`Slippage too low. Need: ${requiredSlippage / 100}%`);
      
    } else {
      // Generic validation error
      showError(message);
    }
    
  } else {
    // Backend error (500) or network error
    showError('Transaction failed. Please try again.');
  }
}
```

---

## 🎯 Key Points

1. **400 errors are user-fixable** - Show helpful messages with suggested fixes
2. **500 errors are backend issues** - Show generic "try again" message
3. **All error messages are descriptive** - Include specific values (max amount, required slippage, etc.)
4. **Extract values with regex** - Parse error messages to get exact numbers

---

## 📚 Full Docs

- **Detailed error handling:** See `FRONTEND_ERROR_HANDLING.md`
- **Slippage behavior:** See `FRONTEND_SLIPPAGE_GUIDE.md`
- **Testing guide:** See `TESTING_TRADE_LIMITS.md`

---

## ✨ Test It

1. Deploy updated backend to Railway
2. Try buying 1 SOL on a small token
3. Should get **400 error** with clear message (not 500)
4. Error message shows max amount you can buy

