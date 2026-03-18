/**
 * Smart Fragmentor - Dynamic Balance Splitting
 * 
 * Automatically calculates optimal fragment count based on:
 * - Deposit amount
 * - Transaction cost optimization
 * - Privacy/anonymity goals
 * - Speed requirements
 */

const crypto = require('crypto');

/**
 * Calculate optimal number of fragments based on amount
 * 
 * Strategy:
 * - Small amounts (< 10 HBAR): 1 fragment (no split needed)
 * - Medium (10-50 HBAR): 2-3 fragments (minimal cost, good privacy)
 * - Large (50-200 HBAR): 3-8 fragments (balanced)
 * - Very large (> 200 HBAR): 8-15 fragments (maximum privacy)
 */
function calculateOptimalFragments(amount) {
  if (amount < 10) {
    return 1; // No fragmentation for small amounts
  } else if (amount < 50) {
    return Math.min(3, Math.ceil(amount / 15)); // 2-3 fragments
  } else if (amount < 200) {
    return Math.min(8, Math.ceil(amount / 25)); // 3-8 fragments
  } else {
    return Math.min(15, Math.ceil(amount / 30)); // 8-15 fragments
  }
}

/**
 * Split amount into fragments with random variation
 * 
 * Instead of equal splits (20, 20, 20), uses slightly random amounts
 * (18.5, 21.3, 19.2) to prevent pattern recognition
 */
function generateFragmentAmounts(totalAmount, numFragments) {
  const policy = require('../config/vanish-policy.json');
  const allowedDenoms = [...(policy.allowedDenominations || [])].sort((a, b) => b - a);

  if (numFragments === 1) {
    return [totalAmount];
  }

  const fragments = [];
  let remaining = totalAmount;

  if (allowedDenoms.length > 0) {
    // Standardization Logic: Greedy fit of denominations
    for (let i = 0; i < numFragments - 1; i++) {
        const denom = allowedDenoms.find(d => d <= remaining / (numFragments - i)) || allowedDenoms[allowedDenoms.length - 1];
        fragments.push(denom);
        remaining = parseFloat((remaining - denom).toFixed(4));
    }
    // Final fragment must also be a standard denom (or closest match)
    const finalDenom = allowedDenoms.find(d => Math.abs(d - remaining) < 0.0001) || remaining;
    fragments.push(finalDenom);
    return fragments;
  }

  // Fallback to random variation only if no policy exists
  for (let i = 0; i < numFragments - 1; i++) {
    const avgAmount = remaining / (numFragments - i);
    const variation = avgAmount * 0.15;
    const fragmentAmount = avgAmount + (Math.random() * 2 - 1) * variation;
    const amount = Math.max(0.1, Math.round(fragmentAmount * 100) / 100);
    fragments.push(amount);
    remaining -= amount;
  }
  fragments.push(Math.round(remaining * 100) / 100);
  return fragments;
}

/**
 * Main fragmentation function
 * 
 * @param {number} amount - Total amount to fragment
 * @param {number} customFragments - Optional: Override automatic calculation (for AI)
 * @returns {object} Fragmentation plan
 */
function createFragmentationPlan(amount, customFragments = null) {
  const numFragments = customFragments || calculateOptimalFragments(amount);
  const fragmentAmounts = generateFragmentAmounts(amount, numFragments);
  
  // Calculate costs
  const zkProofCost = 0; // Client-side, free
  const txCost = 0.001; // Per transaction
  const totalTxCost = numFragments * txCost;
  
  // Calculate efficiency metrics
  const avgFragmentSize = amount / numFragments;
  const privacyScore = Math.min(100, numFragments * 10); // Max 100%
  
  return {
    totalAmount: amount,
    numFragments: numFragments,
    fragmentAmounts: fragmentAmounts,
    costs: {
      zkProofs: zkProofCost,
      transactions: totalTxCost,
      total: totalTxCost
    },
    metrics: {
      avgFragmentSize: Math.round(avgFragmentSize * 100) / 100,
      privacyScore: privacyScore,
      estimatedTime: numFragments * 2, // ~2 seconds per proof
      anonymitySet: numFragments // Acts as N different users
    },
    strategy: getStrategyDescription(amount, numFragments)
  };
}

/**
 * Get human-readable strategy description
 */
function getStrategyDescription(amount, numFragments) {
  if (numFragments === 1) {
    return 'Single deposit (small amount, no fragmentation needed)';
  } else if (numFragments <= 3) {
    return 'Minimal fragmentation (cost-optimized)';
  } else if (numFragments <= 8) {
    return 'Balanced fragmentation (privacy + cost)';
  } else {
    return 'Maximum fragmentation (highest privacy)';
  }
}

/**
 * Generate secrets for all fragments
 * Each fragment gets unique secret for ZK-proof
 */
function generateFragmentSecrets(numFragments) {
  const secrets = [];

  for (let i = 0; i < numFragments; i++) {
    const secret = '0x' + crypto.randomBytes(32).toString('hex');
    const nullifier = '0x' + crypto.randomBytes(32).toString('hex');
    const secretId = crypto.randomBytes(8).toString('hex');

    secrets.push({
      fragmentId: i + 1,
      secret: secret,
      secretId: secretId,
      nullifier: nullifier
    });
  }

  return secrets;
}

/**
 * Estimate time for fragmented deposit
 */
function estimateCompletionTime(numFragments) {
  const proofGenTime = numFragments * 2; // 2 sec per proof
  const submissionTime = numFragments * 1; // 1 sec per submission
  const poolProcessing = 5; // Pool processes batch
  
  return {
    proofGeneration: proofGenTime,
    submission: submissionTime,
    poolProcessing: poolProcessing,
    total: proofGenTime + submissionTime + poolProcessing,
    formatted: `${Math.ceil((proofGenTime + submissionTime + poolProcessing) / 60)} minutes`
  };
}

/**
 * Validate fragmentation parameters
 */
function validateFragmentation(amount, customFragments = null) {
  const errors = [];
  
  if (amount <= 0) {
    errors.push('Amount must be positive');
  }
  
  if (amount < 0.1) {
    errors.push('Amount too small (minimum 0.1 HBAR)');
  }
  
  if (customFragments !== null) {
    if (customFragments < 1 || customFragments > 20) {
      errors.push('Fragment count must be between 1-20');
    }
    
    const minFragmentSize = amount / customFragments;
    if (minFragmentSize < 0.1) {
      errors.push(`Fragments too small (${minFragmentSize.toFixed(2)} HBAR each, minimum 0.1)`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Compare fragmentation strategies
 */
function compareStrategies(amount) {
  const strategies = {
    noFragmentation: createFragmentationPlan(0), // Force 1 fragment
    optimal: createFragmentationPlan(amount),
    maxPrivacy: {
      ...createFragmentationPlan(amount),
      numFragments: 15
    }
  };
  
  strategies.noFragmentation.numFragments = 1;
  strategies.noFragmentation.fragmentAmounts = [amount];
  
  return strategies;
}

module.exports = {
  calculateOptimalFragments,
  generateFragmentAmounts,
  createFragmentationPlan,
  generateFragmentSecrets,
  estimateCompletionTime,
  validateFragmentation,
  compareStrategies,
  getStrategyDescription
};
