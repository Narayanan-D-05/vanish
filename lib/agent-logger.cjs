/**
 * Vanish Agent Logger - Agentic Excellence Observability (2026)
 * 
 * Provides structured logging for "Inner Monologue" and "Thought Traces".
 * This gives judges and users visibility into the AI's autonomous reasoning.
 */

const chalk = require('chalk');

class AgentLogger {
  constructor(optionsOrName, verbose = true) {
    if (typeof optionsOrName === 'object' && optionsOrName !== null) {
      this.agentName = optionsOrName.prefix || optionsOrName.agentName || 'AGENT';
      this.verbose = optionsOrName.verbose !== undefined ? optionsOrName.verbose : true;
    } else {
      this.agentName = optionsOrName || 'AGENT';
      this.verbose = verbose;
    }
    this.thoughtHistory = [];
    this.sessionContext = null; // To be provided by the UserAgent
  }

  setSessionContext(context) {
    this.sessionContext = context;
  }

  /**
   * Log an internal reasoning step (The "Inner Monologue")
   */
  thought(message, metadata = null) {
    this.thoughtHistory.push({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
      type: 'thought',
      message,
      metadata,
      agent: this.agentName,
      evmAddress: this.sessionContext?.getStore(),
      timestamp: Date.now()
    });
    if (this.thoughtHistory.length > 50) this.thoughtHistory.shift();
    
    if (!this.verbose) return;
    const prefix = chalk.blueBright(`[🧠 ${this.agentName} THOUGHT]`);
    console.log(`${prefix} ${chalk.italic.whiteBright(message)}`);
    if (metadata && Object.keys(metadata).length > 0) {
      console.log(`   ${chalk.dim('Context:')} ${JSON.stringify(metadata)}`);
    }
  }

  /**
   * Log a protocol decision or logic branch
   */
  logic(message, metadata = null) {
    this.thoughtHistory.push({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
      type: 'logic',
      message,
      metadata,
      agent: this.agentName,
      evmAddress: this.sessionContext?.getStore(),
      timestamp: Date.now()
    });
    if (this.thoughtHistory.length > 50) this.thoughtHistory.shift();

    if (!this.verbose) return;
    const prefix = chalk.cyan(`[⚙️ ${this.agentName} LOGIC]`);
    console.log(`${prefix} ${message}`);
    if (metadata && Object.keys(metadata).length > 0) {
      console.log(`   ${chalk.dim('Details:')} ${JSON.stringify(metadata)}`);
    }
  }

  /**
   * Log a security or policy validation
   */
  safety(message, passed = true) {
    const icon = passed ? '🛡️' : '🚨';
    const status = passed ? chalk.green('PASSED') : chalk.red('BLOCKED');
    const prefix = chalk.yellow(`${icon} [${this.agentName} SAFETY ${status}]`);
    console.log(`${prefix} ${message}`);
  }

  /**
   * Log a verifiable transaction or record
   */
  verifiable(message, hash = '') {
    const prefix = chalk.magenta(`[📑 ${this.agentName} VERIFIABLE]`);
    const hashStr = hash ? ` (Hash: ${hash.slice(0, 12)}...)` : '';
    console.log(`${prefix} ${message}${chalk.dim(hashStr)}`);
  }

  /**
   * Standard info log
   */
  info(message) {
    console.log(`[${this.agentName}] ${message}`);
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
   * Log AI decision with rationale
   */
  decision(action, rationale, metadata = {}) {
    this.thoughtHistory.push({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
      type: 'decision',
      message: `${action} (Rationale: ${rationale})`,
      metadata,
      agent: this.agentName,
      evmAddress: this.sessionContext?.getStore(),
      timestamp: Date.now()
    });
    if (this.thoughtHistory.length > 50) this.thoughtHistory.shift();

    if (!this.verbose) return;
    const prefix = chalk.green(`[🎯 ${this.agentName} DECISION]`);
    console.log(`${prefix} ${chalk.bold(action)}`);
    console.log(`  ${chalk.dim('Rationale:')} ${chalk.italic(rationale)}`);
    if (Object.keys(metadata).length > 0) {
      console.log(`  ${chalk.dim('Metadata:')} ${JSON.stringify(metadata)}`);
    }
  }

  /**
   * Redact sensitive data for logging
   */
  redact(data) {
    if (!data || typeof data !== 'object') return data;
    
    const redacted = {};
    const sensitiveKeys = ['secret', 'nullifier', 'privateKey', 'password', 'key'];
    
    for (const [key, value] of Object.entries(data)) {
      const isSensitive = sensitiveKeys.some(sk => key.toLowerCase().includes(sk));
      if (isSensitive && typeof value === 'string' && value.length > 8) {
        redacted[key] = value.slice(0, 4) + '...' + value.slice(-4);
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redact(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  /**
   * Log fragmentation reasoning
   */
  fragmentationReasoning(amount, fragments, poolDensity, strategy) {
    if (!this.verbose) return;
    const prefix = chalk.blue(`[📊 ${this.agentName} FRAGMENTATION]`);
    console.log(`${prefix} ${amount} HBAR → ${fragments} fragments`);
    console.log(`  ${chalk.dim('Pool Density:')} ${poolDensity}`);
    console.log(`  ${chalk.dim('Strategy:')} ${strategy}`);
  }
}

module.exports = AgentLogger;
