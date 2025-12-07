# Troubleshooting Guide

## Error: `no such command: build-sbf`

This error occurs when Solana's platform tools are not installed. The `build-sbf` command is part of Solana's build tools.

### Solution 1: Use the Alternative Installation Script (For SSL Issues)

If you're getting SSL connection errors, use the provided script:

```bash
cd onlypump-presale
bash install-solana-tools.sh
```

This script:
- Downloads Solana tools directly from GitHub releases (bypasses SSL issues)
- Uses `wget` or `curl -k` (insecure flag) as fallback
- Adds tools to your PATH automatically

After running, **restart your terminal** or run:
```bash
export PATH="/tmp/solana-release/bin:$PATH"
```

### Solution 2: Install Solana Platform Tools (Standard Method)

According to [Solana's Anchor CLI documentation](https://solana.com/docs/intro/installation/anchor-cli-basics), you need Solana CLI installed.

**If you get SSL errors**, try these alternatives:

#### Option A: Install via package manager (if available)
```bash
# For Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y solana
```

#### Option B: Manual download (bypass SSL)
```bash
# Download Solana release directly
wget https://github.com/solana-labs/solana/releases/download/v1.18.0/solana-release-x86_64-unknown-linux-gnu.tar.bz2
tar jxf solana-release-x86_64-unknown-linux-gnu.tar.bz2
export PATH=$PWD/solana-release/bin:$PATH
```

#### Option C: Use Anchor's bundled tools
Some Anchor versions bundle the necessary tools. Try:
```bash
# Force Anchor to use bundled tools
anchor build --arch sbf
```

### Solution 2: Update Anchor Version

The project is now updated to use Anchor 0.32.1 (matching your installed version).

**Update dependencies:**
```bash
cd onlypump-presale
yarn upgrade @coral-xyz/anchor@0.32.1
```

### Solution 3: Use Docker (If network issues persist)

If SSL/network issues continue, use Docker:

```bash
# Use Anchor's Docker image
docker run -it --rm -v $(pwd):/workspace -w /workspace projectserum/build:v0.30.1 anchor build
```

## Common Build Errors

### Error: "lock file version 4 requires `-Znext-lockfile-bump`"

Update Rust:
```bash
rustup update stable
```

### Error: "not a directory"

Clean and rebuild:
```bash
anchor clean
anchor build
```

### Error: Version mismatch

Make sure Anchor CLI version matches package.json:
```bash
# Check installed version
anchor --version

# Update package.json to match
yarn upgrade @coral-xyz/anchor@<version>
```

## Next Steps

1. **Try installing Solana tools** using one of the methods above
2. **Update yarn dependencies**: `yarn upgrade @coral-xyz/anchor@0.32.1`
3. **Clean and rebuild**: `anchor clean && anchor build`

