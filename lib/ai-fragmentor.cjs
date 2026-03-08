/**
 * AI-Powered Smart Fragmentor
 * Uses Ollama AI to intelligently determine optimal fragmentation strategy
 * Instead of hardcoded rules, the AI reasons about: network conditions, 
 * privacy needs, cost constraints, and amount significance
 */

const { Ollama } = require('@langchain/ollama');
const fragmentor = require('./fragmentor.cjs'); // Fallback to rule-based

// Initialize Ollama
let ollama = null;
let ollamaAvailable = false;

async function initializeOllama() {
  if (ollama) return ollama;
  
  try {
    ollama = new Ollama({
      model: 'llama3.2',
      baseUrl: 'http://localhost:11434',
      temperature: 0.3, // Lower temp = faster, more focused responses
      numPredict: 100,  // Limit response length for speed
    });
    
    // Test if Ollama is running
    const testResponse = await ollama.invoke('test');
    ollamaAvailable = true;
    console.log('🧠 AI-Powered Fragmentor initialized (Ollama + Llama 3.2)');
    return ollama;
  } catch (error) {
    console.warn('⚠️  Ollama not available, falling back to rule-based fragmentor');
    ollamaAvailable = false;
    return null;
  }
}

/**
 * AI-Powered Fragmentation Strategy
 * The AI analyzes the context and reasons about optimal strategy
 */
async function analyzeFragmentationStrategy(amount, context = {}) {
  await initializeOllama();
  
  // If Ollama not available, fall back to rules
  if (!ollamaAvailable) {
    console.log('📊 Using rule-based fragmentor (Ollama unavailable)');
    return fragmentor.createFragmentationPlan(amount);
  }
  
  // Build context for AI reasoning
  const currentTime = new Date();
  const timeOfDay = currentTime.getHours();
  const dayOfWeek = currentTime.toLocaleString('en-US', { weekday: 'long' });
  
  // OPTIMIZED: Shorter prompt for faster inference
  const prompt = `Blockchain privacy strategist: Recommend optimal fragmentation for ${amount} HBAR shield.

Rules: 1-15 fragments, each=$0.001, more=better privacy, fewer=cheaper
Amount ranges: <10=small, 10-100=medium, 100-300=large, >300=whale

Recommend fragment count (1-15) balancing cost vs privacy for ${amount} HBAR.

Return ONLY JSON (no markdown):
{"fragments": <number>, "reasoning": "<1-2 sentences>", "strategy": "<minimal|balanced|aggressive|maximum>"}`;

  try {
    console.log('🧠 AI analyzing...');
    
    const response = await ollama.invoke(prompt);
    
    // Fast JSON extraction
    let jsonStr = response.trim();
    const jsonMatch = jsonStr.match(/\{[^}]+\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const aiDecision = JSON.parse(jsonStr);
    
    // Validate AI output
    let numFragments = Math.max(1, Math.min(15, aiDecision.fragments || 4));
    
    // Display concise AI reasoning
    console.log(`💭 AI: ${aiDecision.reasoning || 'Optimized for balance'}\n`);
    
    // Generate the actual fragmentation plan using AI's fragment count
    const plan = {
      ...fragmentor.createFragmentationPlan(amount, numFragments),
      aiReasoning: aiDecision.reasoning,
      aiStrategy: aiDecision.strategy || 'balanced',
      costJustification: aiDecision.costJustification || 'Balanced cost vs privacy',
      privacyBenefit: aiDecision.privacyBenefit || `Acts as ${numFragments} users`,
      aiPowered: true,
    };
    
    return plan;
    
  } catch (error) {
    console.error('⚠️  AI analysis failed, using rule-based fallback:', error.message);
    return {
      ...fragmentor.createFragmentationPlan(amount),
      aiPowered: false,
    };
  }
}

/**
 * AI-Powered Fragment Amounts Generation
 * AI decides the distribution pattern (equal, random, weighted, etc.)
 */
async function generateSmartFragmentAmounts(totalAmount, numFragments) {
  await initializeOllama();
  
  if (!ollamaAvailable) {
    return fragmentor.generateFragmentAmounts(totalAmount, numFragments);
  }
  
  const prompt = `You are distributing ${totalAmount} HBAR into ${numFragments} fragments.

GOAL: Distribute amounts to AVOID PATTERN RECOGNITION while maintaining exact total.

REQUIREMENTS:
- Total MUST equal exactly ${totalAmount}
- Each fragment: minimum 0.1 HBAR
- Vary amounts (don't make them equal or obvious pattern)
- Natural-looking distribution

GOOD EXAMPLES:
- ${numFragments} fragments of 100: [23.5, 18.2, 26.8, 31.5] (varied, natural)
- ${numFragments} fragments of 50: [12.1, 15.8, 9.3, 12.8] (irregular, unpredictable)

BAD EXAMPLES:
- 25, 25, 25, 25 (equal = obvious pattern)
- 10, 20, 30, 40 (arithmetic progression = obvious)

Respond ONLY with JSON array of ${numFragments} numbers (no extra text):
[amount1, amount2, amount3, ...]`;

  try {
    const response = await ollama.invoke(prompt);
    
    // Extract JSON array
    let jsonStr = response.trim();
    if (jsonStr.includes('[')) {
      jsonStr = jsonStr.substring(jsonStr.indexOf('['), jsonStr.lastIndexOf(']') + 1);
    }
    
    const amounts = JSON.parse(jsonStr);
    
    // Validate and normalize to exact total
    if (amounts.length !== numFragments) {
      throw new Error('Wrong number of fragments');
    }
    
    const sum = amounts.reduce((a, b) => a + b, 0);
    const normalized = amounts.map(a => (a / sum) * totalAmount);
    
    // Adjust last fragment to ensure exact total
    const sumNormalized = normalized.slice(0, -1).reduce((a, b) => a + b, 0);
    normalized[numFragments - 1] = totalAmount - sumNormalized;
    
    return normalized;
    
  } catch (error) {
    console.warn('⚠️  AI amount distribution failed, using random variation');
    return fragmentor.generateFragmentAmounts(totalAmount, numFragments);
  }
}

/**
 * Interactive AI Consultation
 * User can ask the AI for advice before executing
 */
async function consultAI(amount, userQuestion = null) {
  await initializeOllama();
  
  if (!ollamaAvailable) {
    return 'AI unavailable. Use "plan" for rule-based analysis.';
  }
  
  // OPTIMIZED: Shorter prompt
  const prompt = `Advisor: ${amount} HBAR shield - recommend fragmentation? Answer in 2 sentences max.`;

  try {
    console.log('💭 AI consulting...');
    const response = await ollama.invoke(prompt);
    return response.trim();
  } catch (error) {
    return 'AI consultation failed. Use "plan" for analysis.';
  }
}

/**
 * Adaptive Learning (Future Enhancement)
 * AI learns from previous fragmentation results
 */
async function learnFromResult(plan, actualResult) {
  // Future: Store results and use them to improve recommendations
  // For now, just log
  console.log('📚 Learning from result:', {
    planned: plan.numFragments,
    success: actualResult.success,
    cost: actualResult.cost,
  });
}

module.exports = {
  analyzeFragmentationStrategy,
  generateSmartFragmentAmounts,
  consultAI,
  learnFromResult,
  initializeOllama,
};
