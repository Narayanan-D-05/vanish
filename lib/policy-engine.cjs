const fs = require('fs');

/**
 * Deterministic policy guard for AI-driven protocol actions.
 * The AI can propose decisions, but this engine is the final authority.
 */
class PolicyEngine {
  constructor(policyPath) {
    this.policyPath = policyPath;
    this.policy = this.loadPolicy(policyPath);
  }

  loadPolicy(policyPath) {
    const raw = fs.readFileSync(policyPath, 'utf8');
    return JSON.parse(raw);
  }

  /**
   * Enforce amount denomination constraints for incoming proofs.
   */
  validateProofSubmission(proofData) {
    const errors = [];
    const amount = Number(proofData.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push('amount must be a positive number');
    }

    const allowed = this.policy.allowedDenominations || [];
    if (allowed.length > 0) {
      const precision = this.policy.denominationPrecision || 2;
      const rounded = Number(amount.toFixed(precision));
      const match = allowed.some((d) => Number(d.toFixed(precision)) === rounded);
      if (!match) {
        errors.push(`amount ${amount} not in allowedDenominations`);
      }
    }

    return {
      approved: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate AI decision envelope for batch execution.
   */
  validateBatchDecision(decision, context) {
    const errors = [];

    if (!decision || decision.type !== 'AI_DECISION') {
      errors.push('missing or invalid decision envelope');
    }

    if (decision && decision.decisionType !== 'BATCH_EXECUTION') {
      errors.push('decisionType must be BATCH_EXECUTION');
    }

    const payload = decision && decision.payload ? decision.payload : {};
    const minBatch = Number(this.policy.minBatchSize);
    const maxBatch = Number(this.policy.maxBatchSize);
    const minDelayMs = Number(this.policy.minDelaySeconds) * 1000;
    const maxDelayMs = Number(this.policy.maxDelayMinutes) * 60 * 1000;

    if (!Number.isFinite(payload.batchSize)) {
      errors.push('payload.batchSize must be numeric');
    } else {
      if (payload.batchSize < minBatch) errors.push(`payload.batchSize < minBatchSize (${minBatch})`);
      if (payload.batchSize > maxBatch) errors.push(`payload.batchSize > maxBatchSize (${maxBatch})`);
    }

    if (!Number.isFinite(payload.delayMs)) {
      errors.push('payload.delayMs must be numeric');
    } else {
      if (payload.delayMs < minDelayMs) errors.push(`payload.delayMs < minDelaySeconds (${this.policy.minDelaySeconds})`);
      if (payload.delayMs > maxDelayMs) errors.push(`payload.delayMs > maxDelayMinutes (${this.policy.maxDelayMinutes})`);
    }

    if (typeof payload.execute !== 'boolean') {
      errors.push('payload.execute must be boolean');
    }

    if (payload.execute === true) {
      const sizeCondition = context.queueSize >= minBatch;
      const timeCondition = context.waitTimeMs >= context.maxWaitTimeMs && context.queueSize > 0;
      if (!sizeCondition && !timeCondition) {
        errors.push('execute=true but neither size nor time condition met');
      }
    }

    return {
      approved: errors.length === 0,
      errors,
      bounds: {
        minBatch,
        maxBatch,
        minDelayMs,
        maxDelayMs,
      },
    };
  }
}

module.exports = PolicyEngine;
