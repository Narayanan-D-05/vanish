/**
 * AI-Powered Smart Fragmentor
 * Uses Ollama AI to intelligently determine optimal fragmentation strategy.
 *
 * STRICT MODE: No fallbacks, no simulations.
 * If AI is unavailable, this module throws. The caller must handle this.
 */

const { Ollama } = require('@langchain/ollama');

// Initialize Ollama
let ollama = null;
let ollamaAvailable = false;
const AI_TIMEOUT_MS = 60000; // 60-second timeout — accounts for model cold-start

/**
 * Race an ollama invocation against a timeout.
 */
async function invokeWithTimeout(prompt) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI timeout after 60s. Is Ollama running and the model pulled?\nRun: ollama serve && ollama pull llama3.1')), AI_TIMEOUT_MS)
  );
  return Promise.race([ollama.invoke(prompt), timeoutPromise]);
}

async function initializeOllama() {
  if (ollama && ollamaAvailable) return ollama;

  const fetch = (await import('node-fetch')).default;
  let response;
  try {
    response = await fetch('http://localhost:11434/api/tags', { timeout: 3000 });
  } catch (err) {
    throw new Error(`Ollama is not running. Start it with: ollama serve\nDetails: ${err.message}`);
  }
  if (!response.ok) throw new Error('Ollama API returned an error. Is it running?');

  const data = await response.json();
  
  // 1. Check for explicit model override in .env
  let modelName = process.env.AI_MODEL;
  
  // 2. If no override, auto-detect best available model
  if (!modelName) {
    // Prefer smaller/faster models first for stability on lower-RAM systems
    const preferredOrder = ['llama3.2', 'llama3.1', 'qwen2.5-coder', 'qwen', 'mistral'];
    const availableModels = data.models || [];
    
    for (const pref of preferredOrder) {
      const found = availableModels.find(m => m.name.toLowerCase().includes(pref));
      if (found) {
        modelName = found.name.split(':')[0];
        break;
      }
    }
    
    // Fallback to the first available model if none of the preferred are found
    if (!modelName && availableModels.length > 0) {
      modelName = availableModels[0].name.split(':')[0];
    }
  }

  if (!modelName) {
    throw new Error('No compatible models found in Ollama. Pull one e.g.: ollama pull llama3.2:1b');
  }

  ollama = new Ollama({
    model: modelName,
    baseUrl: 'http://localhost:11434',
    temperature: 0.3,
    numPredict: 150,
  });

  ollamaAvailable = true;
  console.log(`🧠 AI Fragmentor initialized (Ollama + ${modelName})`);
  return ollama;
}

/**
 * AI-Powered Fragmentation Strategy.
 * Throws if Ollama is unavailable or AI call fails — no silent degradation.
 */
async function analyzeFragmentationStrategy(amount, context = {}) {
  await initializeOllama();

  const policy = require('../config/vanish-policy.json');
  
  // Parse anonymity set size from context to enable safety override
  let anonymitySetSize = 10; // Default to healthy if unknown
  if (context.networkState && typeof context.networkState === 'string') {
    const match = context.networkState.match(/Anonymity Set: (\d+)/);
    if (match) anonymitySetSize = parseInt(match[1]);
  }

  const prompt = `You are a privacy blockchain strategist for the Vanish Protocol on Hedera.
  
A user wants to shield ${amount} HBAR into a zero-knowledge privacy pool.
Current network state: ${context.networkState || 'Unknown'}
Timestamp: ${context.timestamp || new Date().toISOString()}

INSTRUCTIONS:
1. Analyze the anonymity set size (participants) and pending proofs.
2. CRITICAL PRIVACY RULE: If participants < 10, the pool is QUIET. You MUST use at least 4 fragments to add noise.
3. If participants >= 10, you can use 1-4 fragments for efficiency.
4. EXPLICITLY state the network condition in your reasoning (e.g., "The pool is quiet, creating multiple fragments for noise").

RULES FOR FRAGMENTATION:
- The SUM of all fragments MUST equal EXACTLY ${amount} HBAR.
- Return ONLY valid JSON (no markdown, no extra text):
{
  "fragments": <number 1-15>, 
  "reasoning": "e.g., There are few transactions so we need to create more fragments for privacy.", 
  "strategy": "<minimal|balanced|aggressive|maximum>"
}
CRITICAL: The "fragments" count MUST be at least 4 if the pool is quiet (< 10 participants).`;

  console.log('🧠 AI analyzing... (first run may take 30-60s while model loads into RAM)');

  const response = await invokeWithTimeout(prompt);

  // Extract JSON from response
  const jsonMatch = response.trim().match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    throw new Error(`AI returned invalid JSON:\n${response.slice(0, 200)}`);
  }

  const aiDecision = JSON.parse(jsonMatch[0]);
  let numFragments = Math.max(1, Math.min(15, parseInt(aiDecision.fragments) || 4));

  // --- PROTOCOL SAFETY GUARD ---
  // If the pool is quiet, we override the AI's decision if it's too low.
  // This prevents LLM hallucinations from compromising user privacy.
  if (anonymitySetSize < 10 && numFragments < 4) {
    console.log(`🛡️ [SAFETY_GUARD] Overriding AI decision (${numFragments} fragments) to enforce 4-fragment privacy minimum for quiet pool.`);
    numFragments = 4;
  }

  // The StandardizationEngine ensures ALL fragments use on-chain allowed denominations.
  const fragmentAmounts = StandardizationEngine(amount, numFragments);
  const finalCount = fragmentAmounts.length;

  return {
    totalAmount: amount,
    numFragments: finalCount,
    fragmentAmounts,
    strategy: aiDecision.strategy || 'balanced',
    aiStrategy: aiDecision.strategy || 'balanced',
    aiReasoning: aiDecision.reasoning,
    costJustification: `${finalCount} × $0.001 = $${(finalCount * 0.001).toFixed(3)}`,
    privacyBenefit: `Appears as ${finalCount} independent user${finalCount === 1 ? '' : 's'} in the pool`,
    aiPowered: true,
    metrics: {
      privacyScore: Math.min(100, finalCount * 10 + (amount > 100 ? 10 : 0)),
      anonymitySet: finalCount
    },
    costs: {
      transactions: finalCount * 0.001,
      total: finalCount * 0.001
    }
  };
}

/**
 * StandardizationEngine: Ensures varied (non-obvious pattern) fragment amounts
 * using ONLY on-chain allowed denominations.
 */
function StandardizationEngine(total, n) {
  const policy = require('../config/vanish-policy.json');
  const allowedDenoms = [...(policy.allowedDenominations || [])].sort((a, b) => b - a);
  
  if (allowedDenoms.length === 0) {
    const share = total / n;
    return Array.from({ length: n }, () => parseFloat(share.toFixed(4)));
  }

  // 1. Initial Split: Try to obey the AI's requested fragment count 'n'
  // We divide the total by n to get a 'target' size for each fragment.
  const targetSize = total / n;
  let remaining = total;
  const amounts = [];

  for (let i = 0; i < n - 1; i++) {
    // Find largest denom that is <= targetSize AND leaves enough for remainders
    let denom = allowedDenoms.find(d => d <= targetSize && d <= (remaining - 0.1 * (n - 1 - i)));
    
    // If targetSize is too small for any denom, use the smallest available
    if (!denom) denom = allowedDenoms[allowedDenoms.length - 1];
    
    amounts.push(denom);
    remaining = parseFloat((remaining - denom).toFixed(4));
    
    if (remaining <= 0) break;
  }

  // 2. Final Sweep: Cleanup the remaining amount using Change-Making
  // This ensures the last fragment is ALSO a standard denomination.
  while (remaining > 0.0001) {
    const denom = allowedDenoms.find(d => d <= remaining + 0.0001);
    if (denom) {
      amounts.push(denom);
      remaining = parseFloat((remaining - denom).toFixed(4));
    } else {
      // Emergency: if remainder < 0.1, add it to the last fragment and round it up/down
      // But we prefer to just give the smallest denom if possible.
      if (amounts.length > 0) {
          // Add to last or split further. For now, strict protocol:
          amounts.push(allowedDenoms[allowedDenoms.length - 1]);
          remaining = 0;
      }
      break;
    }
  }
  
  return amounts;
}

/**
 * Generate secrets for n fragments.
 */
function generateFragmentSecrets(n) {
  const crypto = require('crypto');
  return Array.from({ length: n }, (_, i) => {
    const secret = '0x' + crypto.randomBytes(32).toString('hex');
    const nullifier = '0x' + crypto.randomBytes(32).toString('hex');
    return {
      fragmentId: i + 1,
      secret: secret,
      secretId: crypto.randomBytes(8).toString('hex'),
      nullifier: nullifier
    };
  });
}

/**
 * Interactive AI Consultation.
 * Throws if Ollama is unavailable.
 */
async function consultAI(amount, userQuestion = null) {
  await initializeOllama();

  const question = userQuestion
    ? userQuestion
    : `Should I use fragmentation to shield ${amount} HBAR?`;

  const prompt = `You are a privacy advisor for the Vanish Protocol on Hedera (ZK-SNARK privacy pool). Answer this question in 2-3 sentences max:

${question}

Context: Amount = ${amount} HBAR. Available strategies: shield-smart (rule-based), ai-shield (AI-optimized fragmentation).
Be direct and practical.`;

  console.log('💭 AI consulting... (first run may take 30-60s)');
  const response = await invokeWithTimeout(prompt);
  return response.trim();
}

module.exports = {
  analyzeFragmentationStrategy,
  StandardizationEngine: StandardizationEngine,
  generateFragmentSecrets,
  consultAI,
  initializeOllama,
};
