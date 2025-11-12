# Postman Testing Guide - Wallet Signature Authentication

## Quick Start

### 1. Generate Signature Header

Run the signature generator script:

```bash
# Using npm script (recommended)
yarn generate-signature

# Or directly with node
node scripts/generate-signature.js

# With your private key
node scripts/generate-signature.js --private-key YOUR_PRIVATE_KEY_BASE58

# With action specified
node scripts/generate-signature.js --action buy
```

### 2. Using Environment Variable

You can set your private key as an environment variable:

```bash
export SOLANA_PRIVATE_KEY=your_private_key_base58
yarn generate-signature
```

### 3. Get Your Private Key

**From Phantom Wallet:**
1. Open Phantom wallet
2. Settings → Security & Privacy → Export Private Key
3. Copy the private key (base58 format)

**From Solana CLI:**
```bash
solana-keygen show ~/.config/solana/id.json
```

## Postman Setup

### Step 1: Create a New Request

1. Open Postman
2. Create a new request (e.g., `POST http://localhost:3000/api/tokens/buy`)

### Step 2: Add Headers

1. Go to the **Headers** tab
2. Add the following headers:

| Key | Value |
|-----|-------|
| `Content-Type` | `application/json` |
| `x-request-signature` | `{paste the generated signature JSON}` |

### Step 3: Add Request Body

For **Buy Token** request:
```json
{
  "tokenMint": "YourTokenMintAddress",
  "solAmount": 0.1
}
```

For **Sell Token** request:
```json
{
  "tokenMint": "YourTokenMintAddress",
  "percentage": 50
}
```

### Step 4: Send Request

Click **Send** and you should receive a response with a serialized transaction.

## Example: Complete Buy Token Request

### 1. Generate Signature

```bash
$ yarn generate-signature --action buy

✅ Generated x-request-signature header:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{"wallet":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU","signature":"...","message":"..."}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2. Postman Configuration

**URL:** `POST http://localhost:3000/api/tokens/buy`

**Headers:**
```
Content-Type: application/json
x-request-signature: {"wallet":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU","signature":"...","message":"..."}
```

**Body (raw JSON):**
```json
{
  "tokenMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "solAmount": 0.1
}
```

### 3. Expected Response

```json
{
  "transaction": "base64_encoded_transaction...",
  "pendingTransactionId": "pending-1234567890-abc123",
  "tokenMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "type": "buy",
  "solAmount": 0.1
}
```

## Using Postman Environment Variables

### Setup Environment

1. Click **Environments** in Postman
2. Create a new environment (e.g., "OnlyPump Local")
3. Add variables:
   - `base_url`: `http://localhost:3000`
   - `x_request_signature`: `{your generated signature}`

### Use in Requests

- URL: `{{base_url}}/api/tokens/buy`
- Header: `x-request-signature: {{x_request_signature}}`

## Signature Expiration

⚠️ **Important:** Signatures are valid for **1 hour** only. After expiration, you'll get:

```json
{
  "statusCode": 401,
  "message": "Signature expired. Please generate a new signature (valid for 1 hour)."
}
```

**Solution:** Run `yarn generate-signature` again to get a fresh signature.

## Testing Different Endpoints

### Buy Token
```
POST {{base_url}}/api/tokens/buy
```

### Sell Token
```
POST {{base_url}}/api/tokens/sell
```

### Get Transaction History
```
GET {{base_url}}/api/transactions?type=buy&limit=10
```

### Get Transaction Statistics
```
GET {{base_url}}/api/transactions/stats
```

### Get Specific Transaction
```
GET {{base_url}}/api/transactions/{signature}
```

## Troubleshooting

### Error: "Missing x-request-signature header"
- Make sure you added the header in Postman
- Check that the header name is exactly `x-request-signature` (case-sensitive)

### Error: "Invalid signature format"
- Make sure the signature is valid JSON
- Check that it contains `wallet`, `signature`, and `message` fields

### Error: "Invalid signature"
- The signature doesn't match the message
- Make sure you're using the correct private key
- Regenerate the signature

### Error: "Signature expired"
- Generate a new signature (valid for 1 hour)
- Run `yarn generate-signature` again

## Using cURL

You can also test with cURL:

```bash
# Generate signature first
SIGNATURE=$(node scripts/generate-signature.js --action buy | grep -A 1 "━━" | tail -1)

# Make request
curl -X POST http://localhost:3000/api/tokens/buy \
  -H "Content-Type: application/json" \
  -H "x-request-signature: $SIGNATURE" \
  -d '{
    "tokenMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "solAmount": 0.1
  }'
```

## Security Notes

1. **Never commit private keys** to version control
2. **Use environment variables** for private keys in production
3. **Signatures expire after 1 hour** for security
4. **Each signature is unique** (includes nonce and timestamp)
5. **Test with test wallets** that don't contain real funds

## Next Steps

After testing in Postman:
1. Integrate the signature generation into your frontend
2. See `WALLET_AUTH_GUIDE.md` for frontend integration examples
3. Use the transaction response to sign and send transactions from the frontend

