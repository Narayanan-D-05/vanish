const { AIUserAgent } = require('./agents/user-agent/ai-mode.cjs');

async function test() {
  const agent = new AIUserAgent();
  await agent.initialize();
  
  console.log('\n=== Testing AI Chat ===\n');
  
  // Test 1: Pool status
  console.log('Test 1: Asking about pool status...');
  await agent.processMessage('what is the current pool status?');
  
  console.log('\n✅ AI Chat Test Complete!\n');
  process.exit(0);
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
