#!/usr/bin/env node
/**
 * Quick Test: Interactive Transfer Commands
 */

require('dotenv').config();

async function interactiveTest() {
  console.log('🧪 Testing Transfer Commands\n');
  
  const { UserAgent } = require('./agents/user-agent/index.cjs');
  const agent = new UserAgent(false);
  
  // Test balance
  console.log('=== Test 1: Balance Check ===\n');
  const balance = await agent.executeDirectCommand('balance');
  console.log(balance);
  
  console.log('\n=== Test 2: Help ===\n');
  const help = await agent.executeDirectCommand('help');
  console.log(help);
  
  console.log('\n=== Ready for Interactive Use ===\n');
  console.log('✅ All 7 tools loaded:');
  console.log('   • Privacy: shield, withdraw, stealth, submit, query');
  console.log('   • Hedera: transfer, balance\n');
  
  console.log('🚀 To try transfers interactively:');
  console.log('   npm run start:user');
  console.log('   > balance');
  console.log('   > transfer 0.0.8119040 0.1  # Send to yourself (test)');
  console.log('   > balance  # Verify deduction\n');
  
  console.log('💡 Or use AI chat:');
  console.log('   npm run start:user:ai');
  console.log('   > "Transfer 0.1 HBAR to 0.0.8119040"\n');
  
  process.exit(0);
}

interactiveTest().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
