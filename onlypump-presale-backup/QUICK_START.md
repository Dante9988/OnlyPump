# Quick Start Guide

## TL;DR - Testing (No Manual Node Needed!)

Anchor **automatically starts a local Solana validator** when you run tests - just like Hardhat does for Ethereum!

```bash
# 1. Install dependencies
yarn install

# 2. Build the program
anchor build

# 3. Run tests (local validator starts automatically!)
anchor test
```

That's it! No need to manually start a Solana node.

## Step-by-Step

### 1. Install Prerequisites

```bash
# Check if Anchor is installed
anchor --version

# If not installed:
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Check if Solana CLI is installed
solana --version

# If not installed:
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
```

### 2. Install Node Dependencies

```bash
cd onlypump-presale
yarn install
```

### 3. Build the Program

```bash
anchor build
```

This compiles your Rust program and generates TypeScript types.

### 4. Run Tests (Local Validator Auto-Starts)

```bash
anchor test
```

**What happens:**
1. ✅ Anchor automatically starts a local Solana validator (like `hardhat node`)
2. ✅ Builds and deploys your program to it
3. ✅ Runs all tests in `tests/presale.test.ts`
4. ✅ Shuts down the validator when done

**No manual node startup needed!**

### 5. Deploy to Devnet (Optional)

```bash
# Switch to devnet
solana config set --url devnet

# Get devnet SOL
solana airdrop 2 $(solana address)

# Deploy
anchor deploy --provider.cluster devnet
```

## Key Differences from Hardhat

| Hardhat (Ethereum) | Anchor (Solana) |
|-------------------|-----------------|
| `npx hardhat node` (manual) | `anchor test` (automatic) |
| Separate terminal for node | Everything in one command |
| `npx hardhat test` | `anchor test` (includes node) |

## Common Issues

### "Command not found: anchor"
```bash
# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

### "Insufficient funds"
```bash
# For local testing, Anchor handles this automatically
# For devnet:
solana airdrop 2 $(solana address) --url devnet
```

### Tests fail with "Program account does not exist"
```bash
# Make sure you built first
anchor build
anchor test
```

## Next Steps

1. ✅ Run `anchor test` to verify everything works
2. ✅ Review test output and fix any issues
3. ✅ Deploy to devnet for integration testing
4. ✅ Update your backend/frontend with the program ID
5. ✅ Deploy to mainnet when ready

See `DEPLOYMENT_GUIDE.md` for detailed deployment instructions.

