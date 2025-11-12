# Quick Start: Testing API with Postman

## Step 1: Get Your Private Key

### Option A: From Phantom Wallet (Recommended)
1. Open Phantom wallet
2. Click the menu (☰) → Settings
3. Security & Privacy → Export Private Key
4. Enter your password
5. Copy the private key (it's base58 format, starts with letters/numbers)

### Option B: From Solana CLI
```bash
# If you have a keypair file
cat ~/.config/solana/id.json
# Output: [123,45,67,...] (JSON array format)
```

### Option C: Generate a Test Keypair (Testing Only)
```bash
# Just run the script without a private key
yarn generate-signature
# Press Enter when prompted
```

## Step 2: Generate Signature Header

### Method 1: Using Environment Variable (Recommended)
```bash
# Set your private key (base58 format from Phantom)
export SOLANA_PRIVATE_KEY="your_base58_private_key_here"

# Generate signature
yarn generate-signature
```

### Method 2: Pass Private Key Directly
```bash
# Base58 format (from Phantom)
yarn generate-signature --private-key "5Kd3N7vT3..."

# JSON array format (from Solana CLI)
yarn generate-signature --private-key "[123,45,67,...]"

# With action specified
yarn generate-signature --private-key "5Kd3N..." --action buy
```

### Method 3: Interactive Mode
```bash
yarn generate-signature
# When prompted, paste your private key
```

## Step 3: Copy the Signature

The script will output something like:
```
✅ Generated x-request-signature header:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{"wallet":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU","signature":"...","message":"..."}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Copy the entire JSON object** (everything between the lines).

## Step 4: Setup Postman

### Create New Request
1. Open Postman
2. Create new request: `POST http://localhost:3000/api/tokens/buy`

### Add Headers
Go to **Headers** tab and add:

| Key | Value |
|-----|-------|
| `Content-Type` | `application/json` |
| `x-request-signature` | `{paste the JSON you copied}` |

### Add Body
Go to **Body** tab → Select **raw** → Choose **JSON**:

```json
{
  "tokenMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "solAmount": 0.1
}
```

### Send Request
Click **Send**!

## Example: Complete Workflow

```bash
# 1. Set your private key
export SOLANA_PRIVATE_KEY="5Kd3N7vT3mK8..."

# 2. Generate signature
yarn generate-signature --action buy

# 3. Copy the output JSON

# 4. In Postman:
#    - URL: POST http://localhost:3000/api/tokens/buy
#    - Header: x-request-signature = {pasted JSON}
#    - Body: {"tokenMint":"...","solAmount":0.1}
#    - Send!
```

## Troubleshooting

### Error: "Invalid private key format"
Your private key might be in a different format. The script supports:
- ✅ Base58: `"5Kd3N7vT3..."` (from Phantom)
- ✅ JSON array: `"[123,45,67,...]"` (from Solana CLI)
- ✅ Hex: `"0x1234abcd..."` or `"1234abcd..."`
- ✅ Comma-separated: `"123,45,67,..."`

### Error: "Signature expired"
Signatures are valid for 1 hour. Just run `yarn generate-signature` again.

### Error: "Missing x-request-signature header"
Make sure you:
1. Added the header in Postman
2. Used the exact name: `x-request-signature` (case-sensitive)
3. Pasted the entire JSON object (including curly braces)

## Quick Test Without Real Wallet

If you just want to test the API structure:

```bash
# Generate a test keypair (no real wallet needed)
yarn generate-signature
# Press Enter when prompted
# Use the generated signature in Postman
```

**Note:** This test keypair won't work for actual transactions, but you can test the API authentication flow.

## Next Steps

Once you've tested in Postman:
1. See `WALLET_AUTH_GUIDE.md` for frontend integration
2. The transaction response contains a serialized transaction
3. In production, users will sign this transaction with their wallet
4. See `POSTMAN_TESTING_GUIDE.md` for more detailed examples

