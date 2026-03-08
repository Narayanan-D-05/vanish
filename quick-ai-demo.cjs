#!/usr/bin/env node
/**
 * Quick AI Demo - Single Question Test
 */

require('dotenv').config();

async function quickDemo() {
  console.log('⚡ Quick AI Demo (Single Question)\n');
  
  const { AIUserAgent } = require('./agents/user-agent/ai-mode.cjs');
  
  // Initialize
  console.log('🔧 Initializing...');
  const agent = new AIUserAgent();
  await agent.initialize();
  
  // Single test question
  console.log('\n📊 Asking: "What is the pool status?"\n');
  const result = await agent.processMessage('What is the pool status?');
  
  console.log('\n✅ Demo complete!\n');
  console.log('💡 Try interactive mode: npm run start:user:ai\n');
  
  process.exit(0);
}

quickDemo().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
