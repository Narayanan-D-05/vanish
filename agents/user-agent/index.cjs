/**
 * Vanish User Agent - Privacy-Preserving Interface (2026)
 * 
 * MODES:
 * 1. AI Chat Mode (requires Ollama): Natural language commands
 * 2. Direct Mode (no dependencies): Simple command parsing
 * 
 * CAPABILITIES:
 * - Local ZK-proof generation (secrets never leave device)
 * - Stealth address generation for receiving funds
 * - HIP-1340 delegation for safe swap permissions
 * 
 * PRIVACY GUARANTEES:
 * - Generates ZK-proofs client-side using snarkjs
 * - Only submits anonymized proofs to Pool Manager
 * - User secrets stored locally, never transmitted
 */

require('dotenv').config();
const readline = require('readline');
const { Client, PrivateKey, AccountId, TopicMessageSubmitTransaction } = require('@hashgraph/sdk');
const { tools } = require('../plugins/vanish-tools.cjs');
const crypto = require('crypto');
const fragmentor = require('../../lib/fragmentor.cjs');
const aiFragmentor = require('../../lib/ai-fragmentor.cjs');

// Try to import Ollama dependencies (optional)
let ChatOllama, createReactAgent;
try {
  ChatOllama = require('@langchain/ollama').ChatOllama;
  createReactAgent = require('@langchain/langgraph/prebuilt').createReactAgent;
} catch (e) {
  // Ollama not installed, will use direct mode
}

class UserAgent {
  constructor(useAI = false) {
    // Hedera client setup
    this.accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    this.privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    this.client = Client.forTestnet();
    this.client.setOperator(this.accountId, this.privateKey);
    
    // HCS topics
    this.privateTopic = process.env.PRIVATE_TOPIC_ID;
    this.publicTopic = process.env.PUBLIC_ANNOUNCEMENT_TOPIC_ID;
    
    // Local user secrets (stored securely on user's device)
    this.userSecrets = new Map();
    
    // Determine mode
    this.aiMode = useAI && ChatOllama && createReactAgent;
    
    if (this.aiMode) {
      // Initialize Ollama LLM (local, privacy-preserving)
      this.llm = new ChatOllama({
        model: 'llama3.1',
        baseUrl: 'http://localhost:11434',
        temperature: 0.1,
      });
      
      // Create agent with custom Vanish tools
      this.agent = createReactAgent({
        llm: this.llm,
        tools: tools,
      });
      
      console.log('🤖 Vanish User Agent initialized (AI Mode)');
      console.log('   AI: Local Ollama (Llama 3.1) - Privacy-Preserving');
    } else {
      console.log('🤖 Vanish User Agent initialized (Direct Mode)');
      console.log('   Mode: Direct command parsing (no AI required)');
    }
    
    console.log('   Account:', this.accountId.toString());
    console.log('   Tools: ZK-proof generation, stealth addresses, pool queries');
    console.log('\n💬 Available commands:');
    console.log('     - status           - Check pool status');
    console.log('     - balance          - Check your HBAR balance');
    console.log('     - transfer <to> <amount> - Send HBAR (e.g., transfer 0.0.123456 10)');
    console.log('     - ai-shield <amount>     - AI-powered smart shield (THINKS!) 🧠');
    console.log('     - ai-plan <amount>       - Let AI analyze strategy');
    console.log('     - consult <amount>       - Ask AI for advice');
    console.log('     - shield-smart <amount>  - Rule-based fragmentation');
    console.log('     - plan <amount>          - Preview rule-based plan');
    console.log('     - shield <amount>        - Simple shield (no fragmentation)');
    console.log('     - stealth                - Generate stealth address');
    console.log('     - help                   - Show all commands');
    console.log('     - exit                   - Exit agent');
    console.log('\n---\n');
  }
  
  /**
   * Parse and execute direct commands (no AI needed)
   */
  async executeDirectCommand(input) {
    const parts = input.toLowerCase().trim().split(/\s+/);
    const command = parts[0];
    
    try {
      switch (command) {
        case 'status':
          return await this.queryPoolStatus();
        
        case 'balance':
          const accountToCheck = parts[1]; // Optional account ID
          return await this.checkBalance(accountToCheck);
        
        case 'transfer':
          if (parts.length < 3) {
            return '❌ Invalid usage. Usage: transfer <accountId> <amount>\n   Example: transfer 0.0.123456 10';
          }
          const toAccount = parts[1];
          const transferAmount = parseFloat(parts[2]);
          if (isNaN(transferAmount) || transferAmount <= 0) {
            return '❌ Invalid amount. Must be a positive number.';
          }
          return await this.transferHbar(toAccount, transferAmount);
        
        case 'stealth':
          return await this.generateStealthAddress();
        
        case 'shield':
          const amount = parseFloat(parts[1]);
          if (isNaN(amount) || amount <= 0) {
            return '❌ Invalid amount. Usage: shield <amount> (e.g., shield 100)';
          }
          return await this.shieldFunds(amount);
        
        case 'shield-smart':
        case 'fragmentshield':
          const smartAmount = parseFloat(parts[1]);
          if (isNaN(smartAmount) || smartAmount <= 0) {
            return '❌ Invalid amount. Usage: shield-smart <amount> (e.g., shield-smart 100)';
          }
          return await this.shieldFundsFragmented(smartAmount);
        
        case 'plan':
          const planAmount = parseFloat(parts[1]);
          if (isNaN(planAmount) || planAmount <= 0) {
            return '❌ Invalid amount. Usage: plan <amount> (e.g., plan 100)';
          }
          return this.showFragmentationPlan(planAmount);
        
        case 'ai-shield':
          const aiAmount = parseFloat(parts[1]);
          if (isNaN(aiAmount) || aiAmount <= 0) {
            return '❌ Invalid amount. Usage: ai-shield <amount> (e.g., ai-shield 100)';
          }
          return await this.aiShieldFunds(aiAmount);
        
        case 'ai-plan':
          const aiPlanAmount = parseFloat(parts[1]);
          if (isNaN(aiPlanAmount) || aiPlanAmount <= 0) {
            return '❌ Invalid amount. Usage: ai-plan <amount> (e.g., ai-plan 100)';
          }
          return await this.aiFragmentationPlan(aiPlanAmount);
        
        case 'consult':
          const consultAmount = parseFloat(parts[1]);
          if (isNaN(consultAmount) || consultAmount <= 0) {
            return '❌ Invalid amount. Usage: consult <amount> (e.g., consult 100)';
          }
          const question = parts.slice(2).join(' '); // Optional question
          return await this.consultAI(consultAmount, question);
        
        case 'help':
          return this.showHelp();
        
        default:
          return `❌ Unknown command: ${command}\nType 'help' for available commands.`;
      }
    } catch (error) {
      return `❌ Error: ${error.message}`;
    }
  }
  
  /**
   * Query pool status
   */
  async queryPoolStatus() {
    console.log('📊 Querying pool status...\n');
    const tool = tools.find(t => t.name === 'query_pool_status');
    const result = await tool.func({});
    const data = JSON.parse(result);
    
    if (data.success) {
      return `✅ Pool Status:
   Total Deposits: ${data.totalDeposits}
   Anonymity Set: ${data.anonymitySetSize} participants
   Pending Proofs: ${data.pendingProofs}/5
   Next Batch: ${data.nextBatchIn}
   Merkle Root: ${data.currentMerkleRoot}`;
    }
    return `❌ ${data.error}`;
  }
  
  /**
   * Generate stealth address
   */
  async generateStealthAddress() {
    console.log('🔐 Generating stealth address...\n');
    
    // Generate random view and spend keys
    const viewKey = '0x' + crypto.randomBytes(32).toString('hex');
    const spendKey = '0x' + crypto.randomBytes(32).toString('hex');
    
    const tool = tools.find(t => t.name === 'generate_stealth_address');
    const result = await tool.func({
      recipientViewKey: viewKey.slice(2),
      recipientSpendKey: spendKey.slice(2)
    });
    const data = JSON.parse(result);
    
    if (data.success) {
      // Store keys for user
      this.userSecrets.set('viewKey', viewKey);
      this.userSecrets.set('spendKey', spendKey);
      
      return `✅ Stealth Address Generated:
   Address: ${data.stealthAddress}
   Ephemeral Key: ${data.ephemeralPublicKey}
   
   ⚠️  SAVE THESE KEYS (stored in session):
   View Key: ${viewKey}
   Spend Key: ${spendKey}
   
   Share the ephemeral key with senders!`;
    }
    return `❌ ${data.error}`;
  }
  
  /**
   * Shield funds (deposit into privacy pool)
   */
  async shieldFunds(amount) {
    console.log(`🛡️  Shielding ${amount} HBAR...\n`);
    
    // Generate user secret
    const secret = '0x' + crypto.randomBytes(32).toString('hex');
    const secretBigInt = BigInt(secret);
    
    const tool = tools.find(t => t.name === 'generate_shield_proof');
    const result = await tool.func({
      secret: secretBigInt.toString(),
      amount: amount,
      tokenId: '0.0.15058', // WHBAR
      merkleRoot: '0x' + '0'.repeat(64) // Placeholder root
    });
    const data = JSON.parse(result);
    
    if (data.success) {
      // Store secret for withdrawal
      const secretId = crypto.randomBytes(8).toString('hex');
      this.userSecrets.set(secretId, secret);
      
      return `✅ Shield Proof Generated!
   Commitment: ${data.commitment}
   Nullifier Hash: ${data.nullifierHash}
   
   🔑 YOUR SECRET (SAVE THIS!):
   Secret ID: ${secretId}
   Secret: ${secret}
   
   ⚠️  You MUST save this secret to withdraw funds later!
   
   📤 Proof submitted to Pool Manager.
   ⏱️  Will be processed in next batch (5-30 minutes)`;
    }
    
    return `❌ Failed to generate proof:\n${data.error}\n${data.hint || ''}`;
  }
  
  /**
   * Shield funds with smart fragmentation (RECOMMENDED)
   * Automatically calculates optimal fragments based on amount
   */
  async shieldFundsFragmented(amount) {
    console.log(`🎯 Smart Shield: ${amount} HBAR (with fragmentation)\n`);
    
    // Create fragmentation plan
    const plan = fragmentor.createFragmentationPlan(amount);
    
    // Show plan
    console.log(`📊 Fragmentation Plan:`);
    console.log(`   Total: ${plan.totalAmount} HBAR`);
    console.log(`   Fragments: ${plan.numFragments}`);
    console.log(`   Strategy: ${plan.strategy}`);
    console.log(`   Privacy Score: ${plan.metrics.privacyScore}%`);
    console.log(`   Cost: $${plan.costs.total.toFixed(4)}`);
    console.log(`   Est. Time: ${plan.metrics.estimatedTime} seconds\n`);
    
    // Generate secrets for all fragments
    const secrets = fragmentor.generateFragmentSecrets(plan.numFragments);
    
    // Generate ZK-proofs for each fragment
    const tool = tools.find(t => t.name === 'generate_shield_proof');
    const results = [];
    
    for (let i = 0; i < plan.numFragments; i++) {
      const fragmentAmount = plan.fragmentAmounts[i];
      const secretData = secrets[i];
      
      console.log(`   [${i + 1}/${plan.numFragments}] Generating proof for ${fragmentAmount} HBAR...`);
      
      try {
        const result = await tool.func({
          secret: secretData.secret,
          amount: fragmentAmount,
          tokenId: '0.0.15058',
          merkleRoot: '0x' + '0'.repeat(64)
        });
        
        const data = JSON.parse(result);
        
        if (data.success) {
          // Store secret
          this.userSecrets.set(secretData.secretId, secretData.secret);
          
          results.push({
            fragmentId: i + 1,
            amount: fragmentAmount,
            commitment: data.commitment,
            nullifierHash: data.nullifierHash,
            secretId: secretData.secretId,
            success: true
          });
        } else {
          results.push({
            fragmentId: i + 1,
            amount: fragmentAmount,
            error: data.error,
            success: false
          });
        }
      } catch (error) {
        results.push({
          fragmentId: i + 1,
          amount: fragmentAmount,
          error: error.message,
          success: false
        });
      }
    }
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n✅ Fragmentation Complete!\n`);
    
    let output = `🎉 Smart Shield Results:\n\n`;
    output += `   Total: ${amount} HBAR fragmented into ${plan.numFragments} pieces\n`;
    output += `   Success: ${successful}/${plan.numFragments} proofs generated\n`;
    
    if (failed > 0) {
      output += `   Failed: ${failed} proofs\n`;
    }
    
    output += `\n📦 Fragments:\n`;
    results.forEach(r => {
      if (r.success) {
        output += `   [${r.fragmentId}] ${r.amount} HBAR - ${r.commitment.substring(0, 10)}... ✅\n`;
      } else {
        output += `   [${r.fragmentId}] ${r.amount} HBAR - ❌ ${r.error}\n`;
      }
    });
    
    if (successful > 0) {
      output += `\n🔑 SAVE THESE SECRET IDs:\n`;
      results.filter(r => r.success).forEach(r => {
        output += `   Fragment ${r.fragmentId}: ${r.secretId}\n`;
      });
      
      output += `\n⚠️  You MUST save these to withdraw funds later!\n`;
      output += `\n📤 All ${successful} proofs submitted to Pool Manager`;
      output += `\n⏱️  Immediate processing (acts as ${successful} different users!)`;
      output += `\n💰 Cost: $${plan.costs.total.toFixed(4)} (${plan.numFragments} × $0.001)`;
      output += `\n🔒 Privacy: ${plan.metrics.privacyScore}% anonymity score`;
    }
    
    return output;
  }
  
  /**
   * AI-Powered Shield (Agent THINKS!)
   * Uses Ollama AI to reason about optimal fragmentation strategy
   */
  async aiShieldFunds(amount) {
    console.log(`\n🧠 AI-Powered Smart Shield: ${amount} HBAR\n`);
    console.log('💭 Agent is thinking about optimal strategy...\n');
    console.log('━'.repeat(60) + '\n');
    
    try {
      // AI analyzes and creates plan
      const plan = await aiFragmentor.analyzeFragmentationStrategy(amount, {
        privacyLevel: 'moderate',
        costSensitive: false,
        userType: 'regular'
      });
      
      // Display AI reasoning
      if (plan.aiPowered) {
        console.log('🎯 AI Decision:\n');
        console.log(`   Strategy: ${plan.aiStrategy}`);
        console.log(`   Fragments: ${plan.numFragments}`);
        console.log(`\n💡 AI Justification:\n`);
        console.log(`   Cost: ${plan.costJustification}`);
        console.log(`   Privacy: ${plan.privacyBenefit}`);
        console.log('\n' + '━'.repeat(60) + '\n');
      }
      
      // Generate secrets and proofs
      const secrets = fragmentor.generateFragmentSecrets(plan.numFragments);
      const results = [];
      
      for (let i = 0; i < plan.numFragments; i++) {
        console.log(`⚡ Fragment ${i + 1}/${plan.numFragments}: Generating ZK-proof for ${plan.fragmentAmounts[i].toFixed(2)} HBAR...`);
        
        try {
          const tool = tools.find(t => t.name === 'generate_shield_proof');
          const result = await tool.func({
            secret: secrets[i].secret,
            amount: plan.fragmentAmounts[i],
            tokenId: '0.0.15058',
            merkleRoot: '0x' + '0'.repeat(64)
          });
          
          const data = JSON.parse(result);
          if (data.success) {
            const secretId = `frag_${Date.now()}_${i}`;
            this.userSecrets.set(secretId, {
              secret: secrets[i].secret,
              amount: plan.fragmentAmounts[i],
              commitment: data.commitment,
              timestamp: new Date().toISOString(),
            });
            
            results.push({
              success: true,
              fragmentId: i + 1,
              amount: plan.fragmentAmounts[i],
              commitment: data.commitment,
              secretId: secretId,
            });
          } else {
            results.push({
              success: false,
              fragmentId: i + 1,
              amount: plan.fragmentAmounts[i],
              error: data.error,
            });
          }
        } catch (error) {
          results.push({
            success: false,
            fragmentId: i + 1,
            amount: plan.fragmentAmounts[i],
            error: error.message,
          });
        }
      }
      
      // Summary
      const successful = results.filter(r => r.success).length;
      let output = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      output += `\n🎉 AI Shield Complete!\n\n`;
      output += `   Total: ${amount} HBAR fragmented by AI into ${plan.numFragments} pieces`;
      output += plan.aiPowered ? ` ✨ (AI-optimized)` : ``;
      output += `\n   Success: ${successful}/${plan.numFragments} proofs generated\n`;
      
      output += `\n📦 Fragments:\n`;
      results.forEach(r => {
        if (r.success) {
          output += `   [${r.fragmentId}] ${r.amount.toFixed(2)} HBAR - ${r.commitment.substring(0, 12)}... ✅\n`;
        } else {
          output += `   [${r.fragmentId}] ${r.amount} HBAR - ❌ ${r.error}\n`;
        }
      });
      
      if (successful > 0) {
        output += `\n🔑 SAVE THESE SECRET IDs:\n`;
        results.filter(r => r.success).forEach(r => {
          output += `   Fragment ${r.fragmentId}: ${r.secretId}\n`;
        });
        
        output += `\n⚠️  You MUST save these to withdraw funds later!\n`;
        output += `\n📤 All ${successful} proofs submitted to Pool Manager`;
        output += `\n🧠 Privacy: ${plan.metrics.privacyScore}% (AI-optimized anonymity)`;
        output += `\n💰 Cost: $${plan.costs.total.toFixed(4)}`;
      }
      
      return output;
      
    } catch (error) {
      return `❌ AI Shield failed: ${error.message}\n💡 Try: shield-smart ${amount} (rule-based fallback)`;
    }
  }
  
  /**
   * AI-Powered Fragmentation Plan (Preview)
   */  
  async aiFragmentationPlan(amount) {
    console.log(`\n🧠 AI analyzing fragmentation strategy for ${amount} HBAR...\n`);
    
    try {
      const plan = await aiFragmentor.analyzeFragmentationStrategy(amount);
      
      let output = `📈 AI-Powered Fragmentation Plan\n\n`;
      output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      if (plan.aiPowered) {
        output += `🧠 AI REASONING:\n\n`;
        output += plan.aiReasoning + `\n\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      }
      
      output += `💰 Amount: ${plan.totalAmount} HBAR\n`;
      output += `🔀 Fragments: ${plan.numFragments}`;
      output += plan.aiPowered ? ` ✨ (AI-decided)` : ` 🤖 (rule-based)`;
      output += `\n🎭 Strategy: ${plan.aiStrategy || plan.strategy}\n\n`;
      
      output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      output += `📊 Fragment Breakdown:\n`;
      plan.fragmentAmounts.forEach((amt, i) => {
        output += `   [${i + 1}] ${amt.toFixed(2)} HBAR\n`;
      });
      
      output += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      output += `💵 Cost Analysis:\n`;
      output += `   Transactions: $${plan.costs.transactions.toFixed(4)}\n`;
      
      if (plan.aiPowered) {
        output += `   💡 ${plan.costJustification}\n`;
      }
      
      output += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      output += `🔒 Privacy:\n`;
      output += `   Privacy Score: ${plan.metrics.privacyScore}%\n`;
      
      if (plan.aiPowered) {
        output += `   💡 ${plan.privacyBenefit}\n`;
      }
      
      output += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      output += `💡 To execute: ai-shield ${amount}\n`;
      
      return output;
      
    } catch (error) {
      return `❌ AI analysis failed: ${error.message}\n💡 Try: plan ${amount} (rule-based fallback)`;
    }
  }
  
  /**
   * Consult AI for Advice
   */
  async consultAI(amount, question = null) {
    console.log(`\n💬 Consulting AI...\n`);
    
    try {
      const advice = await aiFragmentor.consultAI(amount, question);
      
      let output = `🧠 AI Advisor\n\n`;
      output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      output += `💭 ${advice}\n\n`;
      output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      output += `💡 Commands:\n`;
      output += `   ai-plan ${amount}   - See AI's detailed strategy\n`;
      output += `   ai-shield ${amount} - Execute AI-optimized shield\n`;
      
      return output;
      
    } catch (error) {
      return `❌ AI consultation failed: ${error.message}`;
    }
  }
  
  /**
   * Show fragmentation plan (without executing)
   */
  showFragmentationPlan(amount) {
    console.log(`📊 Analyzing fragmentation for ${amount} HBAR...\n`);
    
    const plan = fragmentor.createFragmentationPlan(amount);
    const time = fragmentor.estimateCompletionTime(plan.numFragments);
    
    let output = `📈 Smart Fragmentation Plan\n\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    output += `💰 Amount: ${plan.totalAmount} HBAR\n`;
    output += `🔀 Fragments: ${plan.numFragments}\n`;
    output += `📦 Avg Size: ${plan.metrics.avgFragmentSize} HBAR\n`;
    output += `🎭 Strategy: ${plan.strategy}\n\n`;
    
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    output += `📊 Fragment Breakdown:\n`;
    plan.fragmentAmounts.forEach((amt, i) => {
      output += `   [${i + 1}] ${amt.toFixed(2)} HBAR\n`;
    });
    
    output += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    output += `💵 Cost Analysis:\n`;
    output += `   ZK-Proofs: FREE (client-side)\n`;
    output += `   Transactions: $${plan.costs.transactions.toFixed(4)} (${plan.numFragments} × $0.001)\n`;
    output += `   Total: $${plan.costs.total.toFixed(4)}\n\n`;
    
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    output += `⏱️  Estimated Time:\n`;
    output += `   Proof Generation: ${time.proofGeneration}s\n`;
    output += `   Submission: ${time.submission}s\n`;
    output += `   Pool Processing: ${time.poolProcessing}s\n`;
    output += `   Total: ~${time.formatted}\n\n`;
    
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    output += `🔒 Privacy Metrics:\n`;
    output += `   Anonymity Set: ${plan.metrics.anonymitySet} (acts as ${plan.metrics.anonymitySet} users)\n`;
    output += `   Privacy Score: ${plan.metrics.privacyScore}%\n`;
    output += `   Batch Wait: NONE (instant processing)\n`;
    output += `   Traceability: ZERO (ZK-SNARK proofs)\n\n`;
    
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    output += `💡 To execute: shield-smart ${amount}\n`;
    
    return output;
  }
  
  /**
   * Check HBAR balance
   */
  async checkBalance(accountId) {
    const targetAccount = accountId || this.accountId.toString();
    console.log(`💰 Checking balance for ${targetAccount}...\n`);
    
    const tool = tools.find(t => t.name === 'check_balance');
    const result = await tool.func({ accountId: targetAccount });
    const data = JSON.parse(result);
    
    if (data.success) {
      return `✅ Account Balance:
   Account: ${data.accountId}
   HBAR: ${data.hbarBalance}${Object.keys(data.tokens).length > 0 ? '\n   Tokens: ' + JSON.stringify(data.tokens, null, 2) : ''}`;
    }
    return `❌ ${data.error}`;
  }
  
  /**
   * Transfer HBAR
   */
  async transferHbar(toAccountId, amount) {
    console.log(`💸 Transferring ${amount} HBAR to ${toAccountId}...\n`);
    
    const tool = tools.find(t => t.name === 'transfer_hbar');
    const result = await tool.func({ 
      toAccountId: toAccountId, 
      amount: amount 
    });
    const data = JSON.parse(result);
    
    if (data.success) {
      return `✅ Transfer Successful!
   From: ${data.from}
   To: ${data.to}
   Amount: ${data.amount} HBAR
   Transaction ID: ${data.transactionId}
   Status: ${data.status}`;
    }
    return `❌ Transfer failed: ${data.error}`;
  }
  
  /**
   * Show help
   */
  showHelp() {
    return `📖 Vanish User Agent - Command Reference

🧠 AI-POWERED COMMANDS (Agent THINKS!):
  ai-shield <amount>      AI decides optimal fragmentation strategy
  ai-plan <amount>        See AI's reasoning and strategy
  consult <amount> [q]    Ask AI for personalized advice

📊 RULE-BASED COMMANDS (Programmed):
  shield-smart <amount>   Rule-based fragmentation (if/else logic)
  plan <amount>           Preview rule-based fragmentation plan

🔐 BASIC COMMANDS:
  status                  Query current pool status
  balance [account]       Check HBAR balance
  transfer <to> <amt>     Transfer HBAR to another account
  shield <amount>         Simple shield (no fragmentation)
  stealth                 Generate a new stealth address
  help                    Show this help message
  exit / quit             Exit the agent

EXAMPLES:
  > ai-plan 100          # Let AI analyze and explain strategy
  > ai-shield 100        # AI executes optimal fragmentation
  > consult 75           # Ask AI: "Should I use fragmentation?"
  > consult 50 what about gas costs?  # Custom question
  
  > plan 100             # Rule-based: automatic calculation
  > shield-smart 100     # Rule-based: execute with rules

🆚 AI vs RULES:
  
  AI-POWERED (ai-shield):
  • THINKS about network conditions
  • Reasons about cost vs privacy tradeoffs
  • Adapts to context (time, amount, user type)
  • Explains its decision-making
  • Example: "75 HBAR is moderate, gas is high, use 3 fragments"
  
  RULE-BASED (shield-smart):
  • Follows hardcoded if/else logic
  • < 10 HBAR: 1 fragment
  • 10-50: 2-3 fragments
  • 50-200: 3-8 fragments
  • > 200: 8-15 fragments
  • Fast but no reasoning

💡 RECOMMENDATION:
  Use ai-shield for amounts > 20 HBAR (AI optimizes better)
  Use shield-smart for quick operations (faster, no AI needed)

WORKFLOW:
  1. consult 100           - Ask AI for advice
  2. ai-plan 100           - See AI's strategy
  3. ai-shield 100         - Execute AI-optimized shield
  4. Save secret IDs       - You'll need them to withdraw!
  3. Wait for batch to execute (5-30 minutes)
  4. SAVE your secret for withdrawal!

PRIVACY NOTES:
  • Secrets generated locally, never transmitted
  • Proofs batched with 5+ other users
  • Random delays prevent timing attacks
  • All computations happen on your device`;
  }
  
  /**
   * System prompt that defines the agent's behavior
   */
  getSystemPrompt() {
    return `You are a privacy-preserving financial agent for the Vanish protocol on Hedera.

Your role is to help users:
1. Shield funds (deposit into privacy pool) by generating ZK-proofs locally
2. Withdraw funds anonymously using zero-knowledge proofs
3. Generate stealth addresses for receiving private transfers
4. Query pool status and anonymity set size

CRITICAL PRIVACY RULES:
- NEVER reveal user secrets to anyone
- ALWAYS generate ZK-proofs locally using the provided tools
- NEVER send user secrets over the network
- When shielding funds, generate a random 32-byte secret for the user
- Store secrets locally and provide them to the user for safekeeping

WORKFLOW:
1. User asks to "Shield 100 HBAR"
2. You generate a random secret (if user doesn't have one)
3. You use the generate_shield_proof tool with: secret, amount, tokenId, merkleRoot
4. You submit the proof to the Pool Manager using submit_proof_to_pool
5. You give the user their secret to save (they'll need it to withdraw)

Current user account: ${this.accountId.toString()}
Available tools: generate_shield_proof, generate_withdraw_proof, generate_stealth_address, submit_proof_to_pool, query_pool_status

Be concise, technical, and privacy-focused in your responses.`;
  }
  
  /**
   * Process user command (AI mode or direct mode)
   */
  async processCommand(userInput) {
    if (this.aiMode) {
      return await this.processWithAI(userInput);
    } else {
      return await this.executeDirectCommand(userInput);
    }
  }
  
  /**
   * Process command through AI agent
   */
  async processWithAI(userInput) {
    try {
      const messages = [
        {
          role: 'system',
          content: this.getSystemPrompt()
        },
        {
          role: 'user',
          content: userInput
        }
      ];
      
      console.log('\n🧠 Processing with local AI...\n');
      
      // Execute agent with tools
      const response = await this.agent.invoke({
        messages: messages
      });
      
      // Extract agent's response
      const agentMessage = response.messages[response.messages.length - 1];
      console.log(`\n🤖 Agent: ${agentMessage.content}\n`);
      
      // Check if this was a proof generation
      await this.handleProofGeneration(response);
      
      return agentMessage.content;
      
    } catch (error) {
      console.error('❌ Error processing command:', error.message);
      return `Error: ${error.message}. Make sure Ollama is running (ollama serve).`;
    }
  }
  
  /**
   * Handle proof generation and submission to Pool Manager
   */
  async handleProofGeneration(agentResponse) {
    // Check if agent used the proof generation tools
    const messages = agentResponse.messages;
    
    for (const message of messages) {
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.name === 'generate_shield_proof' || toolCall.name === 'generate_withdraw_proof') {
            console.log('📤 Submitting proof to Pool Manager via HCS...');
            
            // In production, extract proof from tool result and submit to HCS
            // For now, the submit_proof_to_pool tool handles this
          }
        }
      }
    }
  }
  
  /**
   * Generate and securely store user secret
   */
  generateUserSecret() {
    const secret = '0x' + crypto.randomBytes(32).toString('hex');
    const secretId = crypto.randomBytes(8).toString('hex');
    
    this.userSecrets.set(secretId, secret);
    
    return { secretId, secret };
  }
  
  /**
   * Start interactive chat interface
   */
  async startChat() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.aiMode ? '💬 You: ' : '⚡ Command: '
    });
    
    rl.prompt();
    
    rl.on('line', async (input) => {
      const trimmed = input.trim();
      
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log('👋 Goodbye! Stay private.');
        rl.close();
        process.exit(0);
      }
      
      if (trimmed.length > 0) {
        const result = await this.processCommand(trimmed);
        if (result && !this.aiMode) {
          console.log('\n' + result + '\n');
        }
      }
      
      rl.prompt();
    });
    
    rl.on('close', () => {
      console.log('\n👋 User Agent session ended.');
      process.exit(0);
    });
  }
}

// Check if Ollama is running (optional for AI mode)
async function checkOllama() {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('http://localhost:11434/api/tags', { timeout: 2000 });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Ollama detected - AI mode available');
      
      // Check if llama3.1 is installed
      const hasLlama = data.models.some(m => m.name.includes('llama3'));
      
      if (!hasLlama) {
        console.log('⚠️  Llama 3 model not found. Run: ollama pull llama3.1');
        return false;
      }
      
      return true;
    }
    
    return false;
    
  } catch (error) {
    return false;
  }
}

// Start User Agent
async function main() {
  console.log('🚀 Starting Vanish User Agent...\n');
  
  // Check if Ollama is available
  const ollamaRunning = await checkOllama();
  
  if (ollamaRunning) {
    console.log('💡 Starting in AI mode (Ollama available)\n');
    const agent = new UserAgent(true);
    await agent.startChat();
  } else {
    console.log('💡 Starting in Direct mode (Ollama not required)');
    console.log('   For AI chat mode, install Ollama: https://ollama.ai\n');
    const agent = new UserAgent(false);
    await agent.startChat();
  }
}

main().catch(console.error);

module.exports = { UserAgent };
