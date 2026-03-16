#!/bin/bash
# Interactive AI Chat Launcher

echo "🚀 Starting Vanish AI Privacy Agent"
echo "=================================="
echo ""
echo "💡 Tips:"
echo "   • First response may take 15-30 seconds (model loading)"
echo "   • After that, responses are much faster (2-5 seconds)"
echo "   • Type 'exit' to quit"
echo ""
echo "📝 Try these commands:"
echo "   • What is the pool status?"
echo "   • Generate a stealth address"
echo "   • Shield 50 HBAR into the privacy pool"
echo "   • How does zero-knowledge proof privacy work?"
echo ""
echo "=================================="
echo ""

# Ensure NVM is loaded
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

# Start AI chat
npm run start:user:ai
