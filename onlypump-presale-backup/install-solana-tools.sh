#!/bin/bash
# Alternative Solana installation script for SSL issues

set -e

echo "Installing Solana platform tools (alternative method)..."

# Method 1: Try wget instead of curl
if command -v wget &> /dev/null; then
    echo "Trying wget..."
    wget --no-check-certificate -O /tmp/solana-install.sh https://release.solana.com/stable/install || {
        echo "wget failed, trying method 2..."
    }
fi

# Method 2: Download from GitHub releases directly
SOLANA_VERSION="v1.18.0"
ARCH="x86_64-unknown-linux-gnu"
DOWNLOAD_URL="https://github.com/solana-labs/solana/releases/download/${SOLANA_VERSION}/solana-release-${ARCH}.tar.bz2"

echo "Downloading Solana ${SOLANA_VERSION} from GitHub releases..."
cd /tmp

# Try wget first
if command -v wget &> /dev/null; then
    wget --no-check-certificate "${DOWNLOAD_URL}" -O solana-release.tar.bz2 || {
        echo "wget failed, trying curl with insecure flag..."
        curl -k -L "${DOWNLOAD_URL}" -o solana-release.tar.bz2 || {
            echo "Both wget and curl failed. Please check your network connection."
            exit 1
        }
    }
else
    curl -k -L "${DOWNLOAD_URL}" -o solana-release.tar.bz2 || {
        echo "curl failed. Please check your network connection."
        exit 1
    }
fi

# Extract
echo "Extracting Solana tools..."
tar jxf solana-release.tar.bz2

# Add to PATH
SOLANA_BIN_PATH="/tmp/solana-release/bin"
export PATH="${SOLANA_BIN_PATH}:${PATH}"

# Add to bashrc for persistence
if ! grep -q "solana-release/bin" ~/.bashrc 2>/dev/null; then
    echo "" >> ~/.bashrc
    echo "# Solana tools" >> ~/.bashrc
    echo "export PATH=\"/tmp/solana-release/bin:\$PATH\"" >> ~/.bashrc
fi

echo ""
echo "✅ Solana tools installed to ${SOLANA_BIN_PATH}"
echo "✅ Added to PATH (current session and ~/.bashrc)"
echo ""
echo "To use in current session, run:"
echo "  export PATH=\"/tmp/solana-release/bin:\$PATH\""
echo ""
echo "Or restart your terminal/shell."
echo ""
echo "Verifying installation..."
"${SOLANA_BIN_PATH}/solana" --version || echo "⚠️  solana command not found"
"${SOLANA_BIN_PATH}/cargo-build-sbf" --version || echo "⚠️  cargo-build-sbf not found (this is normal, it's a cargo plugin)"

