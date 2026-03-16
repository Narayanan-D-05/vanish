#!/bin/bash
#
# Vanish Circuit Build Script for WSL Linux
# Run this in WSL to compile zk-SNARK circuits
#
# Usage: bash wsl-build.sh
#

set -e  # Exit on error

echo "🚀 Vanish Circuit Build - WSL Linux"
echo "═══════════════════════════════════════════"
echo ""

# Check if running in WSL
if ! grep -qi microsoft /proc/version; then
    echo "⚠️  Warning: This doesn't appear to be WSL"
    echo "   Continuing anyway..."
fi

# Navigate to project directory
PROJECT_DIR="/mnt/c/Users/dnara/Desktop/Projects/hedera"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Error: Project directory not found: $PROJECT_DIR"
    echo "   Please check the path in wsl-build.sh"
    exit 1
fi

cd "$PROJECT_DIR"
echo "✅ Working directory: $(pwd)"
echo ""

# Check Node.js
echo "📋 Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js not installed"
    echo "   Install with: sudo apt install nodejs npm"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js: $NODE_VERSION"
echo ""

# Check npm
NPM_VERSION=$(npm --version)
echo "✅ npm: $NPM_VERSION"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Run circuit compilation
echo "🔧 Starting circuit compilation..."
echo "   This may take 5-15 minutes..."
echo ""

npm run compile:circuits

echo ""
echo "═══════════════════════════════════════════"
echo "🎉 Build Complete!"
echo ""
echo "✅ Next steps:"
echo "   1. Run: npm run verify:production"
echo "   2. Compile Solidity: npm run compile"
echo "   3. Test agents: npm run start:pool"
echo ""
