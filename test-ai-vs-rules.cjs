#!/usr/bin/env node
/**
 * AI vs Rules Comparison Test
 * Demonstrates the difference between:
 * 1. Rule-based fragmentation (hardcoded if/else)
 * 2. AI-powered fragmentation (Ollama reasoning)
 */

require('dotenv').config();
const fragmentor = require('./lib/fragmentor.cjs');
const aiFragmentor = require('./lib/ai-fragmentor.cjs');

async function compareStrategies() {
  console.log('🧪 AI vs Rules: Fragmentation Strategy Comparison\n');
  console.log('═'.repeat(70) + '\n');
  
  const testAmounts = [25, 75, 150, 300];
  
  for (const amount of testAmounts) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`💰 TEST: ${amount} HBAR`);
    console.log(`${'═'.repeat(70)}\n`);
    
    // Rule-Based Strategy
    console.log('🤖 RULE-BASED APPROACH (Programmed Bot):\n');
    const rulePlan = fragmentor.createFragmentationPlan(amount);
    console.log(`   Logic: if (amount < 50) return 3; else if (amount < 200)...`);
    console.log(`   Fragments: ${rulePlan.numFragments}`);
    console.log(`   Strategy: ${rulePlan.strategy}`);
    console.log(`   Cost: $${rulePlan.costs.total.toFixed(4)}`);
    console.log(`   Privacy Score: ${rulePlan.metrics.privacyScore}%`);
    console.log(`   Reasoning: NONE (just follows hardcoded rules)\n`);
    
    await sleep(2000);
    
    // AI-Powered Strategy
    console.log('🧠 AI-POWERED APPROACH (Agent Thinks!):\n');
    console.log('   Analyzing context, reasoning about tradeoffs...\n');
    
    try {
      const aiPlan = await aiFragmentor.analyzeFragmentationStrategy(amount, {
        privacyLevel: 'moderate',
        costSensitive: false
      });
      
      if (aiPlan.aiPowered) {
        console.log(`   ✨ AI Decision: ${aiPlan.numFragments} fragments\n`);
        console.log(`   💭 AI Reasoning:`);
        console.log(`   ${'-'.repeat(65)}`);
        console.log(`   ${aiPlan.aiReasoning}`);
        console.log(`   ${'-'.repeat(65)}\n`);
        console.log(`   Cost Justification: ${aiPlan.costJustification}`);
        console.log(`   Privacy Benefit: ${aiPlan.privacyBenefit}\n`);
      } else {
        console.log(`   ⚠️  AI unavailable, fallback to rules\n`);
      }
      
      // Comparison
      if (aiPlan.aiPowered) {
        console.log(`\n📊 COMPARISON:\n`);
        console.log(`   Rule-based: ${rulePlan.numFragments} fragments (no reasoning)`);
        console.log(`   AI-powered: ${aiPlan.numFragments} fragments (reasoned decision)`);
        
        if (rulePlan.numFragments !== aiPlan.numFragments) {
          console.log(`   🎯 AI chose DIFFERENT strategy!`);
          console.log(`      Why? ${aiPlan.aiReasoning.split('.')[0]}`);
        } else {
          console.log(`   ✓ AI agreed with rule-based approach`);
        }
      }
      
    } catch (error) {
      console.log(`   ❌ AI Error: ${error.message}`);
      console.log(`   💡 Make sure Ollama is running: ollama serve\n`);
    }
    
    await sleep(3000);
  }
  
  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('📚 SUMMARY: AI vs Rules\n');
  console.log('═'.repeat(70) + '\n');
  
  console.log('🤖 RULE-BASED (Programmed Bot):');
  console.log('   ✓ Fast (no AI inference)');
  console.log('   ✓ Predictable (same input = same output)');
  console.log('   ✓ No dependencies (works offline)');
  console.log('   ✗ No reasoning (blind logic)');
  console.log('   ✗ No context awareness (ignores network conditions)');
  console.log('   ✗ Cannot adapt (fixed if/else rules)\n');
  
  console.log('🧠 AI-POWERED (Thinking Agent):');
  console.log('   ✓ Reasons about tradeoffs (cost vs privacy)');
  console.log('   ✓ Context-aware (time, network, amount significance)');
  console.log('   ✓ Adaptive (learns patterns, optimizes)');
  console.log('   ✓ Explainable (tells you WHY)');
  console.log('   ✗ Slower (~2-3 seconds for inference)');
  console.log('   ✗ Requires Ollama running\n');
  
  console.log('💡 RECOMMENDATION:');
  console.log('   • Small amounts (< 20 HBAR): Use shield-smart (rules are fine)');
  console.log('   • Medium-large (> 20 HBAR): Use ai-shield (AI optimizes better)');
  console.log('   • Need explanation: Use ai-plan (see AI reasoning)');
  console.log('   • Quick operations: Use shield-smart (faster)\n');
  
  console.log('🚀 TRY IT NOW:');
  console.log('   npm run start:user');
  console.log('   > consult 100           # Ask AI for advice');
  console.log('   > ai-plan 100           # See AI strategy');
  console.log('   > ai-shield 100         # Execute AI-optimized shield\n');
  
  process.exit(0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if Ollama is available
async function checkOllama() {
  try {
    await aiFragmentor.initializeOllama();
    console.log('✅ Ollama detected - AI comparisons will be live\n');
    return true;
  } catch (error) {
    console.log('⚠️  Ollama not running - AI comparisons will show fallback\n');
    console.log('💡 Start Ollama: ollama serve (in another terminal)\n');
    return false;
  }
}

(async () => {
  await checkOllama();
  await sleep(1000);
  await compareStrategies();
})().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
