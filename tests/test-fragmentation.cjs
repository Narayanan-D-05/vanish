#!/usr/bin/env node
/**
 * Test Smart Fragmentation System
 */

require('dotenv').config();
const { UserAgent } = require('./agents/user-agent/index.cjs');

async function testFragmentation() {
  console.log('🧪 Testing Smart Fragmentation System\n');
  console.log('═'.repeat(60) + '\n');
  
  const agent = new UserAgent(false);
  
  // Test 1: Small amount (no fragmentation)
  console.log('══ Test 1: Small Amount (5 HBAR) ══\n');
  const plan1 = await agent.executeDirectCommand('plan 5');
  console.log(plan1);
  
  await sleep(2000);
  
  // Test 2: Medium amount (25 HBAR)
  console.log('\n' + '═'.repeat(60));
  console.log('══ Test 2: Medium Amount (25 HBAR) ══\n');
  const plan2 = await agent.executeDirectCommand('plan 25');
  console.log(plan2);
  
  await sleep(2000);
  
  // Test 3: Large amount (150 HBAR)
  console.log('\n' + '═'.repeat(60));
  console.log('══ Test 3: Large Amount (150 HBAR) ══\n');
  const plan3 = await agent.executeDirectCommand('plan 150');
  console.log(plan3);
  
  await sleep(2000);
  
  // Test 4: Very large amount (500 HBAR)
  console.log('\n' + '═'.repeat(60));
  console.log('══ Test 4: Very Large Amount (500 HBAR) ══\n');
  const plan4 = await agent.executeDirectCommand('plan 500');
  console.log(plan4);
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('✅ All tests completed!\n');
  console.log('💡 To execute actual fragmented shield:');
  console.log('   npm run start:user');
  console.log('   > shield-smart 100\n');
  
  console.log('📚 Key Features:');
  console.log('   • Dynamic fragmentation based on amount');
  console.log('   • Cost-optimized (minimal transactions)');
  console.log('   • Privacy-maximized (each fragment = separate user)');
  console.log('   • Instant processing (no waiting for batch)');
  console.log('   • ZK-SNARK proofs for mathematical privacy\n');
  
  process.exit(0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testFragmentation().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
