# OnlyPump Presale - Deployment & Testing Guide

## Prerequisites

1. **Install Anchor** (if not already installed):
```bash
# Install Anchor framework
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

2. **Install Solana CLI** (if not already installed):
```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
```

3. **Install Node.js dependencies**:
```bash
cd onlypump-presale
yarn install
# or
npm install
```

## Local Development & Testing

### 1. Build the Program

```bash
cd onlypump-presale
anchor build
```

This will:
- Compile the Rust program
- Generate the IDL (Interface Definition Language)
- Generate TypeScript types in `target/types/`

### 2. Run Tests (Local Validator)

**Anchor automatically spins up a local Solana validator** (similar to Hardhat node) when you run tests. You don't need to manually start a node!

```bash
anchor test
```

This command:
1. **Starts a local Solana validator** automatically
2. Builds and deploys your program to the local validator
3. Runs your test suite (`tests/presale.test.ts`)
4. Shuts down the validator when done

**Note**: The first test run may take longer as it compiles everything.

### 3. Run Tests with Verbose Output

```bash
anchor test --skip-local-validator=false
```

### 4. Run Tests Against Existing Validator

If you want to run a persistent local validator (useful for debugging):

```bash
# Terminal 1: Start validator manually
solana-test-validator

# Terminal 2: Run tests against it
anchor test --skip-local-validator
```

## Testing Workflow

The test file (`tests/presale.test.ts`) already includes:
- Platform initialization
- Presale creation
- Token funding
- User whitelisting
- Public contributions
- Presale finalization
- Migration
- Token claiming

### Run Specific Tests

You can modify the test file to run specific tests or add more:

```typescript
// In tests/presale.test.ts, you can use .only() to run a single test
it.only("Initializes the platform", async () => {
  // ... test code
});
```

## Deployment

### 1. Deploy to Devnet (Recommended First Step)

**Step 1: Configure Solana CLI for devnet**
```bash
solana config set --url devnet
```

**Step 2: Get devnet SOL for deployment**
```bash
solana airdrop 2 $(solana address)
```

**Step 3: Update Program ID (if needed)**

The program ID is already set in `lib.rs`:
```rust
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
```

If you need a new program ID:
```bash
anchor keys list
# Copy the program ID and update lib.rs
```

**Step 4: Build for devnet**
```bash
anchor build
```

**Step 5: Deploy to devnet**
```bash
anchor deploy --provider.cluster devnet
```

**Step 6: Verify deployment**
```bash
solana program show Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS
```

### 2. Deploy to Mainnet

**⚠️ WARNING: Mainnet deployment is permanent and costs real SOL**

**Step 1: Switch to mainnet**
```bash
solana config set --url mainnet-beta
```

**Step 2: Ensure you have enough SOL**
```bash
solana balance
# You'll need ~2-3 SOL for deployment
```

**Step 3: Build for mainnet**
```bash
anchor build
```

**Step 4: Deploy to mainnet**
```bash
anchor deploy --provider.cluster mainnet
```

## Testing on Devnet/Mainnet

### Update Anchor.toml

Make sure your `Anchor.toml` has the correct cluster:

```toml
[provider]
cluster = "Devnet"  # or "Mainnet" for mainnet
wallet = "~/.config/solana/id.json"
```

### Run Tests Against Devnet

```bash
anchor test --provider.cluster devnet
```

**Note**: This will use real devnet SOL, so make sure you have some:
```bash
solana airdrop 2 $(solana address) --url devnet
```

## Common Commands

### Build
```bash
anchor build
```

### Test
```bash
anchor test                    # Local validator (automatic)
anchor test --skip-local-validator  # Use existing validator
anchor test --provider.cluster devnet  # Test on devnet
```

### Deploy
```bash
anchor deploy                  # Deploy to configured cluster
anchor deploy --provider.cluster devnet
anchor deploy --provider.cluster mainnet
```

### Clean Build Artifacts
```bash
anchor clean
```

### Generate IDL
```bash
anchor idl parse -f programs/onlypump_presale/src/lib.rs -o target/idl/onlypump_presale.json
```

## Troubleshooting

### Issue: "Program account does not exist"
- Make sure you've deployed the program first
- Check that the program ID matches in `lib.rs` and `Anchor.toml`

### Issue: "Insufficient funds"
- Get more SOL: `solana airdrop 2 $(solana address)`
- For devnet: `solana airdrop 2 $(solana address) --url devnet`

### Issue: "Account not found"
- Ensure accounts are initialized in the correct order
- Check PDA derivations match between Rust and TypeScript

### Issue: Tests failing
- Check that the local validator is running (or let Anchor start it)
- Verify all dependencies are installed
- Check the test logs for specific error messages

## Development Workflow

1. **Make changes** to Rust code
2. **Build**: `anchor build`
3. **Test**: `anchor test` (automatically uses local validator)
4. **Fix issues** and repeat
5. **Deploy to devnet** when ready
6. **Test on devnet** with real transactions
7. **Deploy to mainnet** after thorough testing

## Next Steps After Deployment

1. **Update your backend** to use the deployed program ID
2. **Update frontend** with the new program ID and IDL
3. **Set up monitoring** for on-chain events
4. **Configure admin wallets** (owner/operator)
5. **Test end-to-end** with real transactions

## Useful Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)

