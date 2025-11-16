# Frontend Integration Guide: Slippage Validation

## 🎯 What Changed

The backend now **validates user-provided slippage** against the actual requirements based on bonding curve price impact.

### Before:
```
User: "I want 5% slippage"
Backend: "OK, I'll use 5%"
Transaction: FAILS with NotAuthorized ❌
```

### After:
```
User: "I want 5% slippage"
Backend: "This trade needs 15% minimum due to 8% price impact"
Returns: Clear error message immediately ❌
User: Adjusts to 15% slippage
Transaction: SUCCEEDS ✅
```

---

## 📋 How It Works

### 1. **Backend Calculates Required Slippage**

Based on the trade's price impact:

| Price Impact | Required Slippage (Buy) | Required Slippage (Sell) |
|--------------|------------------------|-------------------------|
| < 1%         | 5% (500 bps)           | 10% (1000 bps)          |
| 1-5%         | 10% (1000 bps)         | 20% (2000 bps)          |
| 5-10%        | 15% (1500 bps)         | 30% (3000 bps)          |
| > 10%        | 20% (2000 bps)         | 40% (4000 bps)          |

### 2. **Backend Validates User's Slippage**

```typescript
if (userSlippage < requiredSlippage) {
  throw Error("Slippage too low");
}
```

### 3. **Frontend Handles the Error**

Parse the error message and show user-friendly UI.

---

## 🔌 API Behavior

### Request Format (Unchanged)

**Buy:**
```json
POST /api/tokens/buy
{
  "tokenMint": "zpTNP3Hj1dmhJPCySoYmNwY2iuwRJDAsxJuurHmheKb",
  "solAmount": 0.1,
  "walletAddress": "YourWallet...",
  "slippageBps": 500  // ← Optional: 500 = 5%
}
```

**Sell:**
```json
POST /api/tokens/sell
{
  "tokenMint": "zpTNP3Hj1dmhJPCySoYmNwY2iuwRJDAsxJuurHmheKb",
  "percentage": 100,
  "walletAddress": "YourWallet...",
  "slippageBps": 1000  // ← Optional: 1000 = 10%
}
```

### Response Scenarios

#### ✅ Scenario 1: User's Slippage is Sufficient

**Request:**
```json
{
  "solAmount": 0.05,
  "slippageBps": 1000  // 10%
}
```

**Response (200 OK):**
```json
{
  "transaction": "base64_tx_data...",
  "pendingTransactionId": "pending-xxx",
  "tokenMint": "zpTNP3...",
  "type": "BUY",
  "solAmount": 0.05
}
```

**What happened:** Trade has 3% price impact, needs 10% slippage, user provided 10% → ✅ Approved

---

#### ❌ Scenario 2: User's Slippage is Too Low

**Request:**
```json
{
  "solAmount": 0.1,
  "slippageBps": 500  // 5%
}
```

**Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "timestamp": "2025-11-16T10:30:00.000Z",
  "path": "/api/tokens/buy",
  "method": "POST",
  "error": "Slippage tolerance too low. Your slippage: 500 bps (5.0%). Required: 1500 bps (15.0%) due to 7.50% price impact. Please increase slippage or reduce trade size to 0.0700 SOL.",
  "errorType": "Bad Request"
}
```

**What happened:** Trade has 7.5% price impact, needs 15% slippage, user provided 5% → ❌ Rejected

---

#### ✅ Scenario 3: User Doesn't Provide Slippage

**Request:**
```json
{
  "solAmount": 0.08
  // ← No slippageBps provided
}
```

**Response (200 OK):**
```json
{
  "transaction": "base64_tx_data...",
  "pendingTransactionId": "pending-xxx",
  "tokenMint": "zpTNP3...",
  "type": "BUY"
}
```

**What happened:** Backend calculates required slippage automatically (e.g., 10%) and uses it → ✅ Approved

---

#### ❌ Scenario 4: Trade Size Too Large (Separate Error)

**Request:**
```json
{
  "solAmount": 0.5,
  "slippageBps": 2000  // 20%
}
```

**Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "error": "Buy amount 0.5 SOL exceeds maximum of 0.095 SOL at current liquidity (1.2 SOL). Price impact: 41.67%."
}
```

**What happened:** Trade size exceeds bonding curve limits → ❌ Rejected (even with high slippage)

---

## 🎨 Frontend Implementation

### Option 1: Let Backend Handle Slippage (Simplest)

**Don't send `slippageBps` at all**, backend will calculate optimal slippage:

```typescript
// Buy
await axios.post('/api/tokens/buy', {
  tokenMint,
  solAmount: 0.1,
  walletAddress: wallet.publicKey.toBase58()
  // ← No slippageBps
});

// Backend auto-calculates and uses correct slippage ✅
```

**Pros:** 
- Simplest for frontend
- Backend always uses optimal slippage
- No user errors

**Cons:**
- Users can't customize slippage

---

### Option 2: Advanced Slippage UI with Validation

Allow users to customize, but handle validation errors:

```typescript
async function buyToken(tokenMint: string, solAmount: number, userSlippage?: number) {
  try {
    const response = await axios.post('/api/tokens/buy', {
      tokenMint,
      solAmount,
      walletAddress: wallet.publicKey.toBase58(),
      slippageBps: userSlippage, // User's custom slippage
    });
    
    return response.data;
    
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message;
    
    // Check if it's a slippage validation error
    if (errorMsg.includes('Slippage tolerance too low')) {
      // Parse the required slippage from error message
      const match = errorMsg.match(/Required: (\d+) bps/);
      const requiredSlippage = match ? parseInt(match[1]) : null;
      
      // Show user-friendly error with action buttons
      showSlippageError({
        userSlippage,
        requiredSlippage,
        errorMsg,
        onRetryWithRecommended: () => {
          // Retry with backend-recommended slippage
          buyToken(tokenMint, solAmount, requiredSlippage);
        },
        onReduceAmount: () => {
          // Let user reduce trade size instead
          const suggestedAmount = solAmount * 0.7;
          setTradeAmount(suggestedAmount);
        }
      });
      
      return;
    }
    
    // Handle other errors (trade size limits, etc.)
    showError(errorMsg);
  }
}
```

---

### Option 3: Pre-validate Using Trade Limits Endpoint (Most UX-friendly)

Query limits **before** user submits:

```typescript
// Step 1: Fetch trade limits when user selects token
const { data: limits } = await axios.get(
  `/api/tokens/${tokenMint}/trade-limits`
);

// Response:
// {
//   "recommendedMaxBuySOL": 0.108,
//   "liquiditySOL": 1.5,
//   "priceImpactPercentage": 5.2
// }

// Step 2: Calculate required slippage based on user's amount
function calculateRequiredSlippage(solAmount: number, limits: TradeLimits): number {
  const priceImpact = (solAmount / limits.liquiditySOL) * 100;
  
  if (priceImpact < 1) return 500;   // 5%
  if (priceImpact < 5) return 1000;  // 10%
  if (priceImpact < 10) return 1500; // 15%
  return 2000; // 20%
}

// Step 3: Show recommended slippage in UI
const requiredSlippage = calculateRequiredSlippage(userAmount, limits);

<SlippageInput 
  value={slippage}
  onChange={setSlippage}
  recommended={requiredSlippage}
  warning={slippage < requiredSlippage ? 
    `⚠️ Minimum ${requiredSlippage} bps recommended for this trade` : 
    null
  }
/>
```

---

## 💡 Recommended Frontend UX

### Slippage Settings UI

```tsx
<div className="slippage-settings">
  <label>Slippage Tolerance</label>
  
  {/* Quick presets */}
  <div className="slippage-presets">
    <button onClick={() => setSlippage(500)}>5%</button>
    <button onClick={() => setSlippage(1000)}>10%</button>
    <button onClick={() => setSlippage(1500)}>15%</button>
    <button onClick={() => setSlippage(2000)}>20%</button>
  </div>
  
  {/* Custom input */}
  <input 
    type="number" 
    value={slippage / 100} 
    onChange={(e) => setSlippage(e.target.value * 100)}
    placeholder="Custom %"
  />
  
  {/* Warning if too low */}
  {slippage < recommendedSlippage && (
    <div className="warning">
      ⚠️ Your trade may fail. Recommended: {recommendedSlippage / 100}%
    </div>
  )}
  
  {/* Auto-calculate button */}
  <button onClick={() => setSlippage(null)}>
    Let backend calculate (recommended)
  </button>
</div>
```

### Error Handling UI

```tsx
// When slippage is too low
<ErrorModal>
  <h3>⚠️ Slippage Too Low</h3>
  <p>
    Your slippage ({userSlippage / 100}%) is too low for this trade.
    This trade has {priceImpact}% price impact and requires 
    at least {requiredSlippage / 100}% slippage.
  </p>
  
  <div className="actions">
    <button onClick={() => retryWithSlippage(requiredSlippage)}>
      Retry with {requiredSlippage / 100}% slippage
    </button>
    
    <button onClick={() => reduceTradeSize()}>
      Reduce trade size instead
    </button>
    
    <button onClick={close}>
      Cancel
    </button>
  </div>
</ErrorModal>
```

---

## 📊 Error Message Parsing

If you want to extract details from error messages:

```typescript
interface SlippageError {
  userSlippage: number;
  requiredSlippage: number;
  priceImpact: number;
  suggestedAmount?: number;
}

function parseSlippageError(errorMsg: string): SlippageError | null {
  if (!errorMsg.includes('Slippage tolerance too low')) {
    return null;
  }
  
  // Extract values using regex
  const userMatch = errorMsg.match(/Your slippage: (\d+) bps/);
  const requiredMatch = errorMsg.match(/Required: (\d+) bps/);
  const impactMatch = errorMsg.match(/due to ([\d.]+)% price impact/);
  const amountMatch = errorMsg.match(/reduce trade size to ([\d.]+)/);
  
  return {
    userSlippage: userMatch ? parseInt(userMatch[1]) : 0,
    requiredSlippage: requiredMatch ? parseInt(requiredMatch[1]) : 0,
    priceImpact: impactMatch ? parseFloat(impactMatch[1]) : 0,
    suggestedAmount: amountMatch ? parseFloat(amountMatch[1]) : undefined
  };
}

// Usage:
catch (error) {
  const slippageError = parseSlippageError(error.response?.data?.error);
  
  if (slippageError) {
    // Show slippage-specific UI
    showSlippageModal(slippageError);
  } else {
    // Show generic error
    showError(error.response?.data?.error);
  }
}
```

---

## 🎯 Key Points for Frontend Team

### 1. **Slippage is Optional**
- If frontend **doesn't send** `slippageBps`, backend calculates it automatically ✅
- If frontend **sends** `slippageBps`, backend validates it's sufficient ✅

### 2. **Two Types of Errors**
- **Trade size too large**: Amount exceeds bonding curve limits
- **Slippage too low**: User's slippage insufficient for price impact

### 3. **Error Format is Consistent**
```json
{
  "statusCode": 400,
  "error": "Descriptive error message with specific values",
  "timestamp": "2025-11-16T...",
  "path": "/api/tokens/buy",
  "method": "POST"
}
```

### 4. **Slippage Units**
- **Backend expects:** `slippageBps` (basis points: 500 = 5%, 1000 = 10%)
- **User sees:** Percentage (5%, 10%, 15%)
- **Conversion:** `slippageBps = percentage * 100`

### 5. **Recommended Defaults**
- **Buy without user input:** Backend uses 5% base, adjusts up if needed
- **Sell without user input:** Backend uses 10% base, adjusts up if needed
- **User customization:** Any value is accepted, but validated

---

## 📝 Testing Checklist

### Test Cases for Frontend:

- [ ] **Small buy without slippage** → Should work (backend auto-calculates)
- [ ] **Small buy with 5% slippage** → Should work
- [ ] **Large buy with 5% slippage** → Should fail with slippage error
- [ ] **Large buy with 20% slippage** → Should work
- [ ] **Huge buy (any slippage)** → Should fail with size limit error
- [ ] **Sell 100% without slippage** → Should work (backend auto-calculates)
- [ ] **Sell 100% with 10% slippage** → May fail if price impact high
- [ ] **Parse error message correctly** → Extract required slippage value
- [ ] **Retry with higher slippage** → Should work

---

## 🚀 Quick Start for Frontend

**Simplest implementation (let backend handle everything):**

```typescript
// Buy - no slippage parameter
const { data } = await axios.post('/api/tokens/buy', {
  tokenMint: 'xxx',
  solAmount: 0.1,
  walletAddress: wallet.publicKey.toBase58()
});

// Sell - no slippage parameter
const { data } = await axios.post('/api/tokens/sell', {
  tokenMint: 'xxx',
  percentage: 100,
  walletAddress: wallet.publicKey.toBase58()
});
```

**That's it!** Backend handles all validation and slippage calculation. ✅

---

## 🆘 Support

If you encounter issues:

1. **Check error message** - it includes exact required slippage
2. **Check Railway logs** - shows validation details
3. **Use `/trade-limits` endpoint** - get current limits for debugging
4. **Test with small amounts first** - easier to debug

**Example debug request:**
```bash
# Get trade limits
curl https://your-backend.railway.app/api/tokens/YOUR_MINT/trade-limits

# Try small buy
curl -X POST https://your-backend.railway.app/api/tokens/buy \
  -H "Content-Type: application/json" \
  -d '{"tokenMint":"xxx","solAmount":0.01,"walletAddress":"xxx"}'
```

