# Testing Trade Limits Implementation

## Quick Start

The backend now **validates trade sizes** before building transactions to prevent the `NotAuthorized` error.

---

## What Was Fixed

### ❌ Before:
```
User tries to buy 0.1 SOL → Transaction built → User signs → Submit fails
Error: "NotAuthorized: The given account is not authorized..."
```

### ✅ After:
```
User tries to buy 0.1 SOL → Backend validates → Rejects immediately
Error: "Buy amount 0.1 SOL exceeds maximum of 0.095 SOL at current liquidity"
```

---

## Testing Steps

### 1. Deploy the Updated Backend

```bash
# Make sure your changes are pushed to Railway
git add .
git commit -m "Add trade limit validation for Pump.fun"
git push

# Railway will auto-deploy
```

### 2. Test the New Endpoint

Query current trade limits for a token:

```bash
curl https://your-backend.railway.app/api/tokens/zpTNP3Hj1dmhJPCySoYmNwY2iuwRJDAsxJuurHmheKb/trade-limits
```

**Expected Response:**
```json
{
  "tokenMint": "zpTNP3Hj1dmhJPCySoYmNwY2iuwRJDAsxJuurHmheKb",
  "maxBuySOL": 0.12,
  "recommendedMaxBuySOL": 0.108,
  "maxSellTokens": 1000000,
  "recommendedMaxSellTokens": 900000,
  "liquiditySOL": 1.5,
  "isMigrated": false
}
```

### 3. Test Buy Validation

**A. Try a small buy (should work):**
```bash
curl -X POST https://your-backend.railway.app/api/tokens/buy \
  -H "Content-Type: application/json" \
  -H "x-request-signature: YOUR_SIG" \
  -d '{
    "tokenMint": "zpTNP3Hj1dmhJPCySoYmNwY2iuwRJDAsxJuurHmheKb",
    "solAmount": 0.05,
    "walletAddress": "YOUR_WALLET"
  }'
```

Expected: Transaction returned successfully ✅

**B. Try a large buy (should fail with clear error):**
```bash
curl -X POST https://your-backend.railway.app/api/tokens/buy \
  -H "Content-Type: application/json" \
  -H "x-request-signature: YOUR_SIG" \
  -d '{
    "tokenMint": "zpTNP3Hj1dmhJPCySoYmNwY2iuwRJDAsxJuurHmheKb",
    "solAmount": 0.5,
    "walletAddress": "YOUR_WALLET"
  }'
```

Expected: Clear error message ✅
```json
{
  "statusCode": 400,
  "error": "Buy amount 0.5 SOL exceeds maximum of 0.095 SOL at current liquidity (1.2 SOL). Price impact: 41.67%."
}
```

### 4. Test on Netlify Frontend

1. **Open your Netlify site**
2. **Connect wallet**
3. **Try to buy a token with 0.1 SOL**
4. **Check the error message**

**Before the fix:**
```
NotAuthorized: The given account is not authorized to execute this instruction
```

**After the fix:**
```
Buy amount 0.1 SOL exceeds maximum of 0.095 SOL at current liquidity.
Please reduce your amount to 0.095 SOL or less.
```

---

## Frontend Integration (Optional)

Update your frontend to **query limits before trading**:

```typescript
// Add this to your buy form component
useEffect(() => {
  async function fetchLimits() {
    try {
      const response = await axios.get(
        `${API_URL}/api/tokens/${tokenMint}/trade-limits`
      );
      setMaxBuyAmount(response.data.recommendedMaxBuySOL);
    } catch (error) {
      console.error('Failed to fetch trade limits:', error);
    }
  }
  
  if (tokenMint) {
    fetchLimits();
  }
}, [tokenMint]);

// Show max in UI
<input 
  type="number" 
  max={maxBuyAmount}
  placeholder={`Max: ${maxBuyAmount?.toFixed(4) || '...'} SOL`}
/>
```

---

## Railway Logs

Check your Railway logs to see the validation in action:

```
[TokenManagementService] Buying token: zpTNP3Hj1dmhJPCySoYmNwY2iuwRJDAsxJuurHmheKb
[TokenManagementService] Token is on bonding curve, using Pump.fun
[TokenManagementService] Trade limits: max=0.0950 SOL, liquidity=1.20 SOL, impact=8.33%
[TokenManagementService] Increasing slippage from 500 to 1500 bps due to 8.33% price impact
```

Or for failed validation:
```
[TokenManagementService] Buy validation failed: Buy amount 0.1 SOL exceeds maximum of 0.095 SOL at current liquidity
```

---

## Common Issues

### Issue: "Buy amount exceeds maximum" but it worked before
**Cause:** Liquidity in the bonding curve has decreased since your last trade.  
**Solution:** Reduce your buy amount to the recommended max.

### Issue: Frontend still shows old "NotAuthorized" error
**Cause:** Frontend is still hitting old backend or cached.  
**Solution:** 
1. Verify Railway backend is updated
2. Clear browser cache
3. Check Netlify environment variables point to Railway backend

### Issue: Max buy amount seems too small
**Cause:** Token has very low liquidity (newly created or mostly migrated).  
**Solution:** Wait for more liquidity or split your buy into multiple smaller transactions.

---

## Troubleshooting

1. **Check backend is deployed:**
   ```bash
   curl https://your-backend.railway.app/health
   ```

2. **Check trade limits endpoint:**
   ```bash
   curl https://your-backend.railway.app/api/tokens/YOUR_TOKEN/trade-limits
   ```

3. **Check Railway logs for errors:**
   - Go to Railway dashboard
   - Click on your service
   - View logs

4. **Verify SDK version:**
   ```json
   // In package.json
   "@pump-fun/pump-sdk": "1.21.0"
   ```

---

## Success Criteria

✅ Buy transactions with amounts under the limit succeed  
✅ Buy transactions over the limit fail with clear error message  
✅ `/trade-limits` endpoint returns valid data  
✅ Railway logs show trade validation messages  
✅ No more "NotAuthorized" errors on valid trades  
✅ Frontend shows helpful error messages

---

## Next Steps

After testing, consider:
1. Update frontend to query `/trade-limits` before showing buy form
2. Show max buy amount dynamically in UI
3. Add tooltip explaining why there's a limit
4. Implement transaction splitting for large amounts

---

## Support

If you encounter issues:
1. Check Railway logs for detailed errors
2. Verify token mint address is correct
3. Ensure bonding curve exists (token not migrated)
4. Test with different tokens to isolate the issue

