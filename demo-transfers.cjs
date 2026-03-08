#!/usr/bin/env node
/**
 * Demo: Fund Transfers with Vanish Agent
 * 
 * Shows how to:
 * 1. Check account balance
 * 2. Transfer HBAR between accounts
 * 3. Use both Direct Mode and AI Mode
 */

require('dotenv').config();
const { UserAgent } = require('./agents/user-agent/index.cjs');

async function demoTransfers() {
  console.log('🎬 Vanish Agent - Fund Transfer Demo\n');
  console.log('=' .repeat(60) + '\n');
  
  // Initialize agent in Direct Mode
  const agent = new UserAgent(false);
  
  // Test 1: Check balance
  console.log('═══ Test 1: Check Your Balance ═══\n');
  const balanceResult = await agent.executeDirectCommand('balance');
  console.log(balanceResult);
  
  await sleep(2000);
  
  // Test 2: Check another account's balance
  console.log('\n' + '═'.repeat(60));
  console.log('═══ Test 2: Check Another Account ═══\n');
  const otherBalanceResult = await agent.executeDirectCommand('balance 0.0.8119040');
  console.log(otherBalanceResult);
  
  await sleep(2000);
  
  // Test 3: Show transfer syntax (demo only - will ask for confirmation)
  console.log('\n' + '═'.repeat(60));
  console.log('═══ Test 3: Transfer Demo (Syntax) ═══\n');
  console.log('To transfer HBAR, use:');
  console.log('   Command: transfer <accountId> <amount>');
  console.log('   Example: transfer 0.0.123456 10\n');
  
  console.log('⚠️  This demo does NOT execute actual transfers.');
  console.log('   Run interactively to perform real transfers.\n');
  
  // Show interactive options
  console.log('═'.repeat(60));
  console.log('🚀 Try Interactive Mode:\n');
  console.log('   1. Direct Mode:');
  console.log('      npm run start:user');
  console.log('      > transfer 0.0.123456 10\n');
  console.log('   2. AI Chat Mode:');
  console.log('      npm run start:user:ai');
  console.log('      > "Transfer 10 HBAR to account 0.0.123456"\n');
  
  console.log('═'.repeat(60));
  console.log('✅ Demo Complete!\n');
  
  process.exit(0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

demoTransfers().catch(err => {
  console.error('❌ Demo failed:', err.message);
  process.exit(1);
});
