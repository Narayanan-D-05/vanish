#!/usr/bin/env node
/**
 * Test Vanish AI Agent with Ollama
 */

require('dotenv').config();

async function testAIAgent() {
  try {
    console.log('🚀 Testing Vanish AI Agent with Ollama...\n');
    
    const { AIUserAgent } = require('./agents/user-agent/ai-mode.cjs');
    
    // Create and initialize agent
    const agent = new AIUserAgent();
    await agent.initialize();
    
    console.log('\n=== Test 1: Pool Status Query ===\n');
    await agent.processMessage('what is the current pool status?');
    
    console.log('\n=== Test 2: Stealth Address ===\n');
    await agent.processMessage('generate a stealth address for me');
    
    console.log('\n✅ All AI tests passed!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testAIAgent();
