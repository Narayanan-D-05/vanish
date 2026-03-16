/**
 * Vanish Agent Logger - Agentic Excellence Observability (2026)
 * 
 * Provides structured logging for "Inner Monologue" and "Thought Traces".
 * This gives judges and users visibility into the AI's autonomous reasoning.
 */

const chalk = require('chalk');

class AgentLogger {
  constructor(agentName, verbose = true) {
    this.agentName = agentName;
    this.verbose = verbose;
  }

  /**
   * Log an internal reasoning step (The "Inner Monologue")
   */
  thought(message) {
    if (!this.verbose) return;
    const prefix = chalk.blueBright(`[🧠 ${this.agentName} THOUGHT]`);
    console.log(`${prefix} ${chalk.italic.whiteBright(message)}`);
  }

  /**
   * Log a protocol decision or logic branch
   */
  logic(message) {
    if (!this.verbose) return;
    const prefix = chalk.cyan(`[⚙️ ${this.agentName} LOGIC]`);
    console.log(`${prefix} ${message}`);
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
}

module.exports = AgentLogger;
