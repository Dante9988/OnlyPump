# Troubleshooting Signature Generation

## Issue: "Invalid private key format"

If you're getting this error, your private key might be in an unexpected format. Here's how to fix it:

### Check Your Private Key Format

The script supports these formats:

1. **Base58** (from Phantom wallet) - Most common
   - Format: `5Kd3N7vT3mK8...` (starts with letters/numbers)
   - Length: Usually 87-88 characters
   - Example: `5Kd3N7vT3mK8vT3mK8vT3mK8vT3mK8vT3mK8vT3mK8vT3mK8vT3mK8vT3mK8`

2. **JSON Array** (from Solana CLI)
   - Format: `[123,45,67,...]` (array of numbers)
   - Length: 64 numbers (or 32 for secret key only)
   - Example: `[123,45,67,89,12,34,56,78,...]`

3. **Hex** (less common)
   - Format: `0x1234abcd...` or `1234abcd...`
   - Length: 64+ hex characters (32+ bytes)

4. **Comma-separated** (alternative)
   - Format: `123,45,67,89,...`
   - Length: 32+ numbers

### Common Issues

#### Issue 1: Private Key Has Newlines
```bash
# If your key has \n or actual newlines, the script will try to clean them
# But you can also clean it manually:
export SOLANA_PRIVATE_KEY=$(echo "$SOLANA_PRIVATE_KEY" | tr -d '\n')
```

#### Issue 2: Private Key Has Quotes
```bash
# Remove quotes if present
export SOLANA_PRIVATE_KEY="${SOLANA_PRIVATE_KEY//\"/}"
export SOLANA_PRIVATE_KEY="${SOLANA_PRIVATE_KEY//\'/}"
```

#### Issue 3: Wrong Key Type
- Make sure you're using the **private key**, not the public key
- Phantom exports the private key when you click "Export Private Key"
- Solana CLI keypairs are in `~/.config/solana/id.json`

#### Issue 4: Keypair vs Secret Key
- Solana keypairs are 64 bytes (secret key + public key)
- The script handles this automatically
- If you have a 64-byte array, it will use the first 32 bytes

### Quick Test Without Real Wallet

If you just want to test the API:

```bash
# Generate a test signature (no real wallet needed)
yarn test-signature
```

This will:
- Generate a test keypair
- Create a valid signature
- Show you the exact format to use in Postman

### Debug Your Private Key

To see what format your key is in:

```bash
# Check the first few characters
echo $SOLANA_PRIVATE_KEY | head -c 20

# Check if it's JSON array
echo $SOLANA_PRIVATE_KEY | grep -q '^\[' && echo "Looks like JSON array"

# Check if it's base58 (starts with alphanumeric, no brackets)
echo $SOLANA_PRIVATE_KEY | grep -q '^[A-Za-z0-9]' && echo "Looks like base58"
```

### Manual Format Conversion

If you have a keypair file from Solana CLI:

```bash
# Read the keypair file
cat ~/.config/solana/id.json

# It will be a JSON array like: [123,45,67,...]
# Copy the entire array including brackets
export SOLANA_PRIVATE_KEY="[123,45,67,...]"
```

If you have a Phantom export:
```bash
# Phantom exports base58, just copy it directly
export SOLANA_PRIVATE_KEY="5Kd3N7vT3mK8..."
```

### Still Having Issues?

1. **Try the test mode first:**
   ```bash
   yarn test-signature
   ```
   This will show you the exact format expected.

2. **Check the error message:**
   - It shows a preview of your key
   - Verify it matches one of the supported formats

3. **Use interactive mode:**
   ```bash
   yarn generate-signature
   # Press Enter to skip, or paste your key when prompted
   ```

4. **Verify your key is valid:**
   ```bash
   # Try to create a keypair from it manually
   node -e "
   const { Keypair } = require('@solana/web3.js');
   const bs58 = require('bs58');
   try {
     const key = bs58.decode(process.env.SOLANA_PRIVATE_KEY);
     const kp = Keypair.fromSecretKey(key);
     console.log('✅ Valid! Public key:', kp.publicKey.toString());
   } catch(e) {
     console.log('❌ Invalid:', e.message);
   }
   "
   ```

### Alternative: Use Test Mode

If you just need to test the API structure:

```bash
yarn test-signature
```

This generates a test keypair and signature that will work for API authentication testing (but not real transactions).

