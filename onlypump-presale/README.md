# OnlyPump Presale - Anchor Program

Anchor (Solana) program backing the OnlyPump presale flow (VIP + public contributions → vote → launch → fund vaults → claim).

### What we validated on devnet (so far)

- **Program ID (devnet/localnet)**: `5zqdoDng2LnQ7JbiemiRwzTaPnnEU4eMXMfCCF3P4xQQ`
- **End-to-end flow working (devnet integration tests via NestJS)**:
  - Create presale (mint does **not** need to exist yet)
  - VIP whitelist + VIP contribution
  - Public (non-whitelisted) contribution
  - Finalize presale
  - Start vote → cast vote → resolve vote (LAUNCH)
  - Withdraw presale SOL to creator
  - Create+buy Pump.fun token using reserved mint
  - Initialize presale vaults
  - Fund presale token vault with **50%** of creator’s bought tokens

### Devnet token we’re using for continued work

- **Mint**: `4EQqXuvGNnnnwNaeqtFZjcGWpepifFUL9UwK7LqPBfan`
- **Pump.fun bonding curve (devnet)**:
  - `complete = false` (not migratable yet)
  - **Estimated SOL to complete curve** at current state: **~22.18 SOL**
  - Current devnet wallet has **~11.39 SOL**, so we plan to airdrop ~10 SOL tomorrow and finish the “complete curve → migrate to PumpSwap” test then.

## Prerequisites

### 1. Install Solana CLI

**Important:** This install script fixes Cargo lockfile version issues:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
```

After installation, add Solana to your PATH:
```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

### 2. Install Anchor

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

### 3. Install Node.js Dependencies

```bash
yarn install
```

## Quick Start

### Build the Program

```bash
anchor build
```

This compiles the Rust program and generates TypeScript types in `target/types/`.

## Testing (Hardhat-Style)

**Just like Hardhat, running tests automatically:**
- ✅ Starts a local Solana validator
- ✅ Deploys your program to localnet
- ✅ Runs all tests
- ✅ Cleans up when done

### Run Tests

```bash
anchor test
```

That's it! No manual validator setup needed. The test command will:
1. Start a fresh local validator on port 8899
2. Deploy the program automatically
3. Run all tests in `tests/**/*.ts`
4. Shut down the validator when complete

### Run Specific Tests

You can modify test files to run specific tests using `.only()`:

```typescript
// In tests/onlypump-presale.ts
it.only("My specific test", async () => {
  // test code
});
```

## Manual Validator (Optional)

If you want to run a persistent local validator for debugging:

### Terminal 1: Start Validator

```bash
solana-test-validator --reset
```

This starts a validator on:
- RPC: `http://localhost:8899`
- WebSocket: `ws://localhost:8900`

### Terminal 2: Run Tests Against Existing Validator

```bash
anchor test --skip-local-validator
```

This will:
- Skip starting a new validator
- Deploy to your existing validator
- Run tests
- Keep the validator running for inspection

### Stop the Validator

Press `Ctrl+C` in the validator terminal, or:

```bash
pkill -f solana-test-validator
```

## Deployment

### Deploy to Localnet

```bash
# Ensure validator is running (or use anchor test which does this automatically)
anchor deploy --provider.cluster localnet
```

### Deploy to Devnet

```bash
# Switch to devnet
solana config set --url devnet

# Get devnet SOL (run a couple of times if needed)
solana airdrop 2 $(solana address)

# Deploy (explicitly specify devnet wallet if different from default)
anchor deploy --provider.cluster devnet --provider.wallet ~/.config/solana/devnet.json
```

### Deploy to Mainnet

⚠️ **WARNING: Mainnet deployment is permanent and costs real SOL**

```bash
# Switch to mainnet
solana config set --url mainnet-beta

# Ensure you have enough SOL (2-3 SOL recommended)
solana balance

# Deploy
anchor deploy --provider.cluster mainnet
```

## Project Structure

```
onlypump-presale/
├── programs/
│   └── onlypump-presale/
│       └── src/
│           └── lib.rs          # Main program logic
├── tests/
│   └── onlypump-presale.ts     # Test suite
├── migrations/
│   └── deploy.ts               # Deployment script
├── Anchor.toml                  # Anchor configuration
└── Cargo.toml                   # Rust workspace config
```

## Configuration

### Anchor.toml

The `Anchor.toml` file contains:
- Program IDs for different clusters
- Test configuration
- Provider settings (wallet, cluster)

### Program ID

The program ID is defined in:
- `programs/onlypump-presale/src/lib.rs`: `declare_id!("...")`
- `Anchor.toml`: `[programs.localnet]` / `[programs.devnet]` sections

## Presale & LP Flow Overview

### Key principle

- **Presale creation does not require the SPL mint to exist**. We reserve a mint address (vanity) and create presale state + SOL vault.

### Lifecycle (high-level)

- **Create presale** (`create_presale`)
  - Creates the **presale PDA** and **public SOL vault PDA**
  - Stores pricing/caps and sets phase to `PUBLIC_ACTIVE`
  - Does **not** create SPL token vault accounts
- **Contribute** (`contribute_public`)
  - Transfers SOL into `public_sol_vault`
  - Tracks allocation in `UserPosition.tokens_allocated`
  - Whitelist is *optional* (VIP flow uses it; public flow does not)
- **Finalize + vote**
  - `finalize_presale` then `start_vote` → `cast_vote` → `resolve_vote`
  - If LAUNCH wins, presale becomes `LAUNCHABLE`
- **Launch prep**
  - `withdraw_for_launch` lets the **presale authority** withdraw SOL from `public_sol_vault` (creator uses it to buy on Pump.fun)
  - `initialize_vaults` creates SPL token vault accounts after the mint exists
- **Fund vault**
  - After creator buys tokens on Pump.fun, the backend transfers **50%** into the presale `token_vault` so presale participants can claim.

### Claim + refund (next steps)

- **Claim**: today `claim_tokens` is gated by `presale.is_migrated` in the original design. In our product flow we want **public users to claim only after the token is migrated to PumpSwap AMM** (bonding curve complete + migrate).
- **Refund**: if the token fails to migrate (stuck) users should be able to request refunds; refunds should unlock **48 hours after “now”** and become claimable via an on-chain instruction.

We’ll implement/refine these gates in the program as the next step.

## Pump.fun / PumpSwap Integration Notes

- **Pump.fun tokens**:
  - Your NestJS backend calls Pump.fun to create a token and returns the SPL mint address.
  - That mint is passed into `create_presale` as the `mint` argument.
  - In our devnet tests, we create+buy on Pump.fun and then transfer **50% of bought tokens** into the presale vault.
- **Pump.fun → PumpSwap migration**:
  - Migration is performed by Pump.fun’s `migrate` instruction (to `pump_amm` / PumpSwap).
  - A key UX metric is “SOL needed to complete bonding curve”. We now expose this in the backend API so the presale UI can show progress.

## Common Commands

```bash
# Build
anchor build

# Test (auto-starts validator)
anchor test

# Test against existing validator
anchor test --skip-local-validator

# Deploy
anchor deploy --provider.cluster localnet
anchor deploy --provider.cluster devnet
anchor deploy --provider.cluster mainnet

# Clean build artifacts
anchor clean

# Generate new program keypair
anchor keys list
```

## Troubleshooting

### "Cargo.lock version 4 requires `-Znext-lockfile-bump`"

Run the Solana install script (see Prerequisites):
```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
```

### "Program is not deployed"

The test script automatically deploys the program. If you see this error:
- Ensure the validator is running
- Check that port 8899 is available
- Try running `anchor test` again (it will restart the validator)

### "Port 8899 is already in use"

Kill any existing validators:
```bash
pkill -f solana-test-validator
```

### "Insufficient funds"

Get SOL for your wallet:
```bash
# Localnet (automatic with test validator)
solana airdrop 10 $(solana address)

# Devnet
solana airdrop 2 $(solana address) --url devnet
```

### "Websocket error"

This usually means the validator isn't ready yet. The test script includes a wait time, but if issues persist:
- Increase `startup_wait` in `Anchor.toml` `[test]` section
- Manually start validator and use `--skip-local-validator`

## Development Workflow

1. **Make changes** to Rust code in `programs/onlypump-presale/src/lib.rs`
2. **Build**: `anchor build`
3. **Test**: `anchor test` (automatically handles validator + deployment)
4. **Fix issues** and repeat
5. **Deploy to devnet** when ready: `anchor deploy --provider.cluster devnet`
6. **Test on devnet** with real transactions
7. **Deploy to mainnet** after thorough testing

## Next Steps: Backend API Integration

Once the on-chain presale logic is stable and deployed, the next phase is exposing it through your backend (e.g. NestJS) so the frontend can drive the full flow.

- **Wrap write instructions as API endpoints** (using `ONLYPUMP_PRESALE_PROGRAM_ID` and `ONLYPUMP_PRESALE_IDL` from `src/common/constants.ts` in the root project):
  - **Platform setup**:
    - `POST /presale/platform/initialize` → calls `initialize_platform`.
  - **Presale lifecycle**:
    - `POST /presale` → calls `create_presale` for a given SPL mint (eventually a Pump.fun token mint).
    - `POST /presale/:presaleMint/fund` → calls `fund_presale_tokens`.
    - `POST /presale/:presaleMint/whitelist` → calls `whitelist_user`.
    - `POST /presale/:presaleMint/contribute` → calls `contribute_public`.
    - `POST /presale/:presaleMint/finalize` → calls `finalize_presale`.
    - `POST /presale/:presaleMint/migrate` → calls `migrate_and_create_lp`.
    - `POST /presale/:presaleMint/claim` → calls `claim_tokens`.

- **Expose read-only views as APIs**:
  - `GET /presale/platform` → fetches `PlatformConfig`.
  - `GET /presale/:presaleMint` → fetches `Presale` state.
  - `GET /presale/:presaleMint/position/:user` → fetches `UserPosition`.
  - `GET /presale/:presaleMint/whitelist/:user` → fetches `WhitelistEntry` (if any).

- **Upcoming: Pump.fun token integration (high level plan)**:
  - Backend creates or fetches a **Pump.fun token** via existing APIs and obtains its SPL mint address.
  - That mint address is passed into the `create_presale` endpoint as the `mint` argument.
  - Backend ensures the funding authority wallet holds enough of that mint (via Pump.fun flows) before calling `fund_presale_tokens`.
  - Later, `migrate_and_create_lp` can be extended or complemented with a PumpSwap/Raydium CPI or off-chain worker to actually create the LP using the prepared `lp_token_account` and `lp_sol_account`.

## Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)
