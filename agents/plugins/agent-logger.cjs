/**
 * Agent Logger - Reasoning Observability (2026)
 *
 * Provides structured logging for AI agent thought processes.
 * Supports "verbose" mode for deep observability in demos.
 */

class AgentLogger {
  constructor(options = {}) {
    this.verbose = options.verbose || process.env.AGENT_VERBOSE === 'true';
    this.enableColors = options.enableColors !== false;
    this.prefix = options.prefix || 'AGENT';
  }

  /**
   * Log a "Thought" event - reflects internal state evaluation
   */
  thought(message, metadata = {}) {
    const logEntry = {
      type: 'THOUGHT',
      timestamp: Date.now(),
      message,
      metadata
    };

    if (this.enableColors) {
      console.log(`\n💭 [THOUGHT] ${message}`);
      if (this.verbose && Object.keys(metadata).length > 0) {
        console.log(`   Metadata: ${JSON.stringify(metadata, null, 2)}`);
      }
    } else {
      console.log(`[THOUGHT] ${message}`);
      if (this.verbose && Object.keys(metadata).length > 0) {
        console.log(`   Metadata: ${JSON.stringify(metadata)}`);
      }
    }

    return logEntry;
  }

  /**
   * Log a "Logic" event - reasoning chain or decision logic
   */
  logic(message, metadata = {}) {
    const logEntry = {
      type: 'LOGIC',
      timestamp: Date.now(),
      message,
      metadata
    };

    if (this.enableColors) {
      console.log(`🔹 [LOGIC] ${message}`);
      if (this.verbose && Object.keys(metadata).length > 0) {
        console.log(`   Metadata: ${JSON.stringify(metadata, null, 2)}`);
      }
    } else {
      console.log(`[LOGIC] ${message}`);
      if (this.verbose && Object.keys(metadata).length > 0) {
        console.log(`   Metadata: ${JSON.stringify(metadata)}`);
      }
    }

    return logEntry;
  }

  /**
   * Log a safety check event
   */
  safetyCheck(checkName, passed, details = {}) {
    const logEntry = {
      type: 'SAFETY_CHECK',
      timestamp: Date.now(),
      checkName,
      passed,
      details
    };

    if (this.enableColors) {
      if (passed) {
        console.log(`\n🛡️ [SAFETY_CHECK: PASSED] ${checkName}`);
      } else {
        console.log(`\n🚨 [SAFETY_CHECK: BLOCKED] ${checkName}`);
      }
      if (this.verbose && Object.keys(details).length > 0) {
        console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
      }
    } else {
      console.log(`[SAFETY_CHECK: ${passed ? 'PASSED' : 'BLOCKED'}] ${checkName}`);
      if (this.verbose && Object.keys(details).length > 0) {
        console.log(`   Details: ${JSON.stringify(details)}`);
      }
    }

    return logEntry;
  }

  /**
   * Log a decision with rationale
   */
  decision(decision, rationale, metadata = {}) {
    const logEntry = {
      type: 'DECISION',
      timestamp: Date.now(),
      decision,
      rationale,
      metadata
    };

    if (this.enableColors) {
      console.log(`\n🎯 [DECISION] ${decision}`);
      console.log(`   💡 Rationale: ${rationale}`);
      if (this.verbose && Object.keys(metadata).length > 0) {
        console.log(`   Metadata: ${JSON.stringify(metadata, null, 2)}`);
      }
    } else {
      console.log(`[DECISION] ${decision} | Rationale: ${rationale}`);
      if (this.verbose && Object.keys(metadata).length > 0) {
        console.log(`   Metadata: ${JSON.stringify(metadata)}`);
      }
    }

    return logEntry;
  }

  /**
   * Log fragmentation reasoning
   */
  fragmentationReasoning(amount, fragments, poolDensity, strategy) {
    const message = `Current pool density is ${poolDensity}; fragmenting ${amount} HBAR into ${fragments}x${Math.round(amount / fragments)} to maximize overlap with existing ${Math.round(amount / fragments)} HBAR deposits.`;

    return this.thought(message, {
      amount,
      fragments,
      fragmentSize: Math.round(amount / fragments),
      poolDensity,
      strategy,
      privacyConsideration: 'Fragment sizes match existing deposit patterns to maximize anonymity set overlap'
    });
  }

  /**
   * Calculate and log privacy score
   */
  logPrivacyScore(amount, fragments, poolMetrics = {}) {
    // Calculate dynamic privacy score based on various factors
    const baseScore = Math.min(100, fragments * 15); // More fragments = better privacy
    const amountFactor = amount > 100 ? 10 : amount > 50 ? 5 : 0; // Larger amounts get bonus
    const poolOverlapBonus = Math.min(20, fragments * 2); // Bonus for matching pool patterns

    const privacyScore = Math.min(100, baseScore + amountFactor + poolOverlapBonus);

    const rationale = privacyScore > 80
      ? 'High fragmentation provides strong anonymity'
      : privacyScore > 50
        ? 'Moderate fragmentation balances privacy and cost'
        : 'Low fragmentation may limit privacy';

    this.thought(`Privacy Score Calculation: ${privacyScore}%`, {
      amount,
      fragments,
      baseScore,
      amountFactor,
      poolOverlapBonus,
      finalScore: privacyScore,
      rationale
    });

    return privacyScore;
  }

  /**
   * Get structured log entry for external use
   */
  getLogEntry(type, message, metadata = {}) {
    return {
      type,
      timestamp: Date.now(),
      message,
      metadata,
      prefix: this.prefix
    };
  }

  /**
   * Enable/disable verbose mode
   */
  setVerbose(enabled) {
    this.verbose = enabled;
    console.log(`[${this.prefix}] Verbose mode: ${enabled ? 'enabled' : 'disabled'}`);
  }
}

// Export for use in agents
module.exports = { AgentLogger };

// Also export a default instance for convenience
const defaultLogger = new AgentLogger();
module.exports.defaultLogger = defaultLogger;