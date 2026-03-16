#!/usr/bin/env node
/**
 * Simple Ollama Test - Verify local AI is working
 */

require('dotenv').config();

async function testOllama() {
  try {
    console.log('🧪 Testing Ollama Integration...\n');
    
    // Test 1: Load ChatOllama
    console.log('1️⃣ Loading @langchain/ollama...');
    const { ChatOllama } = require('@langchain/ollama');
    console.log('✅ Module loaded!\n');
    
    // Test 2: Create LLM instance
    console.log('2️⃣ Creating Ollama client (llama3.2)...');
    const llm = new ChatOllama({
      model: 'llama3.2',
      baseUrl: 'http://localhost:11434',
      temperature: 0.1,
    });
    console.log('✅ Client created!\n');
    
    // Test 3: Ask a simple question
    console.log('3️⃣ Asking: "What is 2+2? Answer in one word."\n');
    const response = await llm.invoke('What is 2+2? Answer in one word.');
    const answer = typeof response === 'string' ? response : response.content;
    console.log('🤖 Ollama response:', answer, '\n');
    
    // Test 4: Privacy question
    console.log('4️⃣ Asking about zero-knowledge proofs...\n');
    const response2 = await llm.invoke('What is a zero-knowledge proof? Answer in one sentence.');
    const answer2 = typeof response2 === 'string' ? response2 : response2.content;
    console.log('🤖 Ollama response:', answer2, '\n');
    
    console.log('✅ All tests passed! Ollama is working correctly.\n');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\nMake sure:');
    console.error('  1. Ollama is running: ollama serve');
    console.error('  2. Model is pulled: ollama pull llama3.2');
    console.error('  3. Service is accessible: curl http://localhost:11434');
    process.exit(1);
  }
}

testOllama();
