#!/usr/bin/env node
/**
 * Demo: AI Chat Conversation with Vanish Privacy Agent
 */

require('dotenv').config();

async function demoConversation() {
  console.log('🎬 Vanish AI Chat Demo\n');
  console.log('=' .repeat(60) + '\n');
  
  const { AIUserAgent } = require('./agents/user-agent/ai-mode.cjs');
  
  // Initialize agent
  const agent = new AIUserAgent();
  await agent.initialize();
  
  // Demo conversation
  const questions = [
    'What is the current pool status?',
    'Generate a stealth address for receiving funds',
    'Explain how zero-knowledge proofs protect my privacy',
  ];
  
  for (let i = 0; i < questions.length; i++) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`💬 Demo Question ${i + 1}: "${questions[i]}"`);
    console.log('='.repeat(60));
    
    await agent.processMessage(questions[i]);
    
    // Add delay between questions
    if (i < questions.length - 1) {
      console.log('\n⏱️  Waiting 2 seconds before next question...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Demo Complete!');
  console.log('='.repeat(60) + '\n');
  
  console.log('💡 To try it yourself:');
  console.log('   npm run start:user:ai\n');
  
  process.exit(0);
}

demoConversation().catch(err => {
  console.error('Demo failed:', err.message);
  process.exit(1);
});
