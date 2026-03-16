#!/bin/bash
# Test User Agent - All Commands

echo "🧪 Testing Vanish User Agent"
echo "============================="
echo ""

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22 > /dev/null 2>&1

echo "Test 1: Help Command"
echo "--------------------"
(echo "help"; sleep 1; echo "exit") | npm run start:user 2>&1 | grep -A 30 "Command Reference"

echo ""
echo ""
echo "Test 2: Status Command"
echo "----------------------"
(echo "status"; sleep 1; echo "exit") | npm run start:user 2>&1 | grep -A 10 "Pool Status"

echo ""
echo ""
echo "Test 3: Stealth Address Generation"
echo "-----------------------------------"
node -e "
const { UserAgent } = require('./agents/user-agent/index.cjs');
async function test() {
  const agent = new UserAgent(false);
  console.log('Testing stealth address generation...\n');
  const result = await agent.executeDirectCommand('stealth');
  console.log(result);
}
test().catch(console.error);
" 2>&1 | tail -20

echo ""
echo ""
echo "Test 4: Shield Funds (50 HBAR)"
echo "-------------------------------"
node -e "
const { UserAgent } = require('./agents/user-agent/index.cjs');
async function test() {
  const agent = new UserAgent(false);
  console.log('Testing shield 50 HBAR...\n');
  const result = await agent.executeDirectCommand('shield 50');
  console.log(result);
}
test().catch(console.error);
" 2>&1 | tail -30

echo ""
echo ""
echo "✅ All User Agent tests completed!"
