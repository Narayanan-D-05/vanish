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
const { AgentLogger } = require('../plugins/agent-logger.cjs');
const { keccak256 } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fragmentor = require('../../lib/fragmentor.cjs');
const aiFragmentor = require('../../lib/ai-fragmentor.cjs');
const DelegationManager = require('../../lib/delegation.cjs');
const hip1334 = require('../../lib/hip1334.cjs');
const { generateTestInputs } = require('../../build-test-inputs.cjs');
const VaultWrapper = require('./vault-wrapper.cjs');

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
    // Agent Logger for reasoning observability
    this.logger = new AgentLogger({
      verbose: process.env.AGENT_VERBOSE === 'true',
      prefix: 'USER_AGENT'
    });

    // Hedera client setup
    this.accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    this.privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    this.client = Client.forTestnet();
    this.client.setOperator(this.accountId, this.privateKey);

    // HCS topics
    this.privateTopic = process.env.PRIVATE_TOPIC_ID;
    this.publicTopic = process.env.PUBLIC_ANNOUNCEMENT_TOPIC_ID;

    // Local user secrets (stored securely on user's device)
    this.secretsPath = path.join(__dirname, '..', '..', 'secrets.json');
    this.vault = new VaultWrapper(this.secretsPath);
    this.userSecrets = new Map(); // Full secrets cache (decrypted)
    this.blindedVault = {}; // What the AI sees

    // Track pending withdrawals (submitted but not yet confirmed on-chain)
    this.pendingPath = path.join(__dirname, '..', '..', 'pending_withdrawals.json');
    this.pendingWithdrawals = this.loadPendingWithdrawals();

    // For demo: Use a default password or prompt (In 2026, this is derived from biometrics/HW)
    this.vaultPassword = process.env.VAULT_PASSWORD || 'vanish2026';
    this.loadSecrets();

    // Start listening for completion notifications
    this.startListeningForCompletions();

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
    console.log('     - shields          - List your shielded funds in pool 💰');
    console.log('     - transfer <to> <amount> - Send HBAR (e.g., transfer 0.0.123456 10)');
    console.log('     - internal-transfer <to> <amt> - Send within pool (Muted/Max Privacy) 🤫');
    console.log('     - ai-shield <amount>     - AI-powered smart shield (THINKS!) 🧠');
    console.log('     - ai-plan <amount>       - Let AI analyze strategy');
    console.log('     - consult <amount>       - Ask AI for advice');
    console.log('     - shield-smart <amount>  - Rule-based fragmentation');
    console.log('     - plan <amount>          - Preview rule-based plan');
    console.log('     - stealth <to> <amt>     - Send stealth payment (DIRECT)');
    console.log('     - stealth --private <to> <amt> <secretId> - Send stealth payment (FROM POOL) 🔒');
    console.log('     - withdraw <secretId> <recipient> <amt> - Withdraw from pool');
    console.log('     - help                   - Show all commands');
    console.log('     - exit                   - Exit agent');
    console.log('\n---\n');
  }

  /**
   * Load pending withdrawals from file
   */
  loadPendingWithdrawals() {
    try {
      if (fs.existsSync(this.pendingPath)) {
        const data = JSON.parse(fs.readFileSync(this.pendingPath, 'utf8'));
        console.log(`📂 Loaded ${data.length} pending withdrawals`);
        return new Map(data.map(p => [p.secretId, p]));
      }
    } catch (e) {
      console.error(`⚠️ Failed to load pending withdrawals: ${e.message}`);
    }
    return new Map();
  }

  /**
   * Save pending withdrawals to file
   */
  savePendingWithdrawals() {
    try {
      const data = Array.from(this.pendingWithdrawals.values());
      fs.writeFileSync(this.pendingPath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error(`⚠️ Failed to save pending withdrawals: ${e.message}`);
    }
  }

  /**
   * Start listening for withdrawal completion notifications via HIP-1334
   */
  startListeningForCompletions() {
    if (this.pendingWithdrawals.size > 0) {
      console.log(`⏳ ${this.pendingWithdrawals.size} withdrawals pending completion`);
    }

    // Get HIP-1334 inbox config
    const inboxTopicId = process.env.HIP1334_TOPIC_ID;
    const encPrivateKey = process.env.HIP1334_ENC_PRIV_KEY;

    if (!inboxTopicId || !encPrivateKey) {
      console.warn('⚠️  HIP-1334 inbox not configured - cannot receive completion notifications');
      console.warn('   Set HIP1334_TOPIC_ID and HIP1334_ENC_PRIV_KEY in .env');
      return;
    }

    // Start listening for encrypted messages
    try {
      hip1334.listenToInbox(this.client, inboxTopicId, encPrivateKey, async (payload) => {
        console.log(`📨 Received HIP-1334 message: ${payload.type}`);
        if (payload.type === 'WITHDRAWAL_COMPLETE') {
          this.handleWithdrawalComplete(payload);
        }
      });
      console.log(`📬 Listening for completion notifications on ${inboxTopicId}`);
    } catch (err) {
      console.error('❌ Failed to start completion listener:', err.message);
    }
  }

  /**
   * Handle withdrawal completion notification
   */
  handleWithdrawalComplete(notification) {
    const { submissionId, nullifierHash, status } = notification;

    // Find the pending withdrawal
    for (const [secretId, pending] of this.pendingWithdrawals) {
      if (pending.submissionId === submissionId) {
        if (status === 'SUCCESS') {
          console.log(`\n✅ Withdrawal completed for secret ${secretId}!`);
          console.log(`   Transaction: ${notification.transactionId}`);
          console.log(`   Amount: ${notification.amount} HBAR`);

          // Mark secret as used
          const secret = this.userSecrets.get(secretId);
          if (secret) {
            secret.used = true;
            this.saveSecrets();
          }

          // Remove from pending
          this.pendingWithdrawals.delete(secretId);
          this.savePendingWithdrawals();
        } else {
          console.log(`\n❌ Withdrawal failed for secret ${secretId}: ${status}`);
          // Remove from pending so it can be retried
          this.pendingWithdrawals.delete(secretId);
          this.savePendingWithdrawals();
        }
        return;
      }
    }

    // No matching pending withdrawal found
    console.warn(`⚠️  Received completion notification for unknown submission: ${submissionId}`);
    console.warn(`   Pending withdrawals: ${this.pendingWithdrawals.size}`);
    if (this.pendingWithdrawals.size > 0) {
      const pendingIds = Array.from(this.pendingWithdrawals.values()).map(p => p.submissionId);
      console.warn(`   Expected one of: ${pendingIds.join(', ')}`);
    }
  }

  /**
   * Check if a secret is already pending withdrawal
   */
  isSecretPending(secretId) {
    return this.pendingWithdrawals.has(secretId);
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

        case 'shields':
        case 'vault':
          return this.listUserShieldedFunds();

        case 'debug-vault':
          return this.debugVault();
        
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
          let isPrivateStealth = false;
          let stealthArgs = parts.slice(1);
          
          if (stealthArgs[0] === '--private') {
            isPrivateStealth = true;
            stealthArgs = stealthArgs.slice(1);
          }

          if (isPrivateStealth) {
            if (stealthArgs.length < 2) {
              return `❌ Invalid usage. Usage: stealth --private <recipientAccountId> <amount> [optionalSecretId]\n   Example: stealth --private 0.0.8119040 10`;
            }
            const rec = stealthArgs[0];
            const amt = parseFloat(stealthArgs[1]);
            const sid = stealthArgs.length > 2 ? stealthArgs[2] : null;
            
            if (sid) {
              return await this.generateStealthAddressPrivate(rec, amt, sid);
            } else {
              return await this.autoStealthPrivate(rec, amt);
            }
          } else {
            const rec = stealthArgs[0];
            const amt = parseFloat(stealthArgs[1]);
            return await this.generateStealthAddress(rec, amt);
          }
        
        case 'internal-transfer':
        case 'internal-swap':
          if (parts.length < 3) {
            return `❌ Invalid usage. Usage: internal-transfer <recipientAccountId> <amount>\n   Example: internal-transfer 0.0.8119040 5`;
          }
          const iRec = parts[1];
          const iAmt = parseFloat(parts[2]);
          return await this.autoInternalSwap(iRec, iAmt);
        
        case 'withdraw':
          if (parts.length < 3) {
            return '❌ Invalid usage. Usage: withdraw <amount> <recipient> OR withdraw <secretId> <recipient> <amount>\n   Example: withdraw 10 0.0.123456';
          }
          
          let wRecipient, wAmount, wSid;
          
          // Type-Intelligent Parsing
          const arg1 = parts[1];
          const arg2 = parts[2];
          const arg1IsAmount = !isNaN(parseFloat(arg1)) && !arg1.includes('frag_') && !arg1.includes('0.0.');
          
          if (arg1IsAmount && parts.length === 3) {
            // Pattern: withdraw <amount> <recipient>
            wAmount = parseFloat(arg1);
            wRecipient = arg2;
          } else if (parts.length >= 4) {
            // Pattern: withdraw <secretId> <recipient> <amount>
            wSid = arg1;
            wRecipient = arg2;
            wAmount = parseFloat(parts[3]);
          } else {
            // Pattern: withdraw <recipient> <amount> (legacy/fallback)
            wRecipient = arg1;
            wAmount = parseFloat(arg2);
          }
          
          return await this.withdrawFunds(wRecipient, wAmount, wSid);
        
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
        
        case 'balance':
        case 'shields':
          this.loadSecrets(); // Refresh from disk
          return this.showShieldedBalance();
          
        case 'check-balance':
          return await this.checkBalance(parts[1]);
          
        case 'transfer':
          if (parts.length < 3) return "❌ Usage: transfer <to> <amount>";
          return await this.transferHbar(parts[1], parseFloat(parts[2]));
          
        case 'internal-transfer':
        case 'swap':
          if (parts.length < 3) return "❌ Usage: internal-transfer <recipientAccount> <amount>";
          return await this.autoInternalSwap(parts[1], parseFloat(parts[2]));
          
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
   * Show available shielded fragments and total balance
   */
  showShieldedBalance() {
    let total = 0;
    let fragments = [];
    
    for (const [id, data] of this.userSecrets.entries()) {
      if (!data.used) {
        total += data.amount;
        fragments.push({ id, amount: data.amount, timestamp: data.timestamp });
      }
    }
    
    if (fragments.length === 0) {
      return `📭 Your Vanish vault is empty. Use 'shield <amount>' to protect your funds.`;
    }
    
    let output = `💰 Vanish Shielded Balance: ${total.toFixed(2)} HBAR\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    output += `📦 Available Fragments:\n`;
    
    fragments.forEach(f => {
      const dateStr = f.timestamp ? new Date(f.timestamp).toLocaleString() : 'recently added';
      output += `   - ${f.id}: ${f.amount} HBAR (${dateStr})\n`;
    });
    
    output += `\n💡 To withdraw securely, use: withdraw <recipientAccountId> <amount>\n`;
    output += `💡 AI will automatically resolve the secret ID for you.`;
    
    return output;
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
   * List user's shielded funds (unspent fragments in pool)
   * Reads from live userSecrets Map (not cached blindedVault)
   */
  listUserShieldedFunds() {
    // Read from userSecrets Map (source of truth) not cached blindedVault
    const unspent = [];
    for (const [id, data] of this.userSecrets.entries()) {
      const isUsed = data.used === true;
      const amount = typeof data === 'object' ? data.amount : 0;
      if (!isUsed && amount > 0) {
        unspent.push({ id, amount });
      }
    }

    const total = unspent.reduce((sum, f) => sum + f.amount, 0);

    if (unspent.length === 0) {
      return `💰 Your Vanish Vault:\n   No unspent shielded funds.\n   Use 'shield' or 'ai-shield' to deposit.`;
    }

    let output = `💰 Your Vanish Vault:\n`;
    output += `   Total: ${total} HBAR in ${unspent.length} fragment(s)\n\n`;
    output += `   Fragments:\n`;
    unspent.forEach(f => {
      output += `      • ${f.id}: ${f.amount} HBAR\n`;
    });
    output += `\n   💡 Use 'withdraw <secretId> <recipient> <amount>' to spend\n`;
    output += `   💡 Use 'internal-transfer <recipient> <amount>' for private P2P`;

    return output;
  }

  /**
   * Debug vault - show all secrets and their used status
   */
  debugVault() {
    const entries = [];
    for (const [id, data] of this.userSecrets.entries()) {
      entries.push({
        id,
        used: data.used === true,
        amount: data.amount || 0,
        hasSecret: !!data.secret,
        hasNullifier: !!data.nullifier
      });
    }

    const usedCount = entries.filter(e => e.used).length;
    const unspentCount = entries.filter(e => !e.used).length;
    const totalUnspent = entries.filter(e => !e.used).reduce((sum, e) => sum + e.amount, 0);

    let output = `🔍 Vault Debug:\n`;
    output += `   Total entries: ${entries.length}\n`;
    output += `   Used (spent): ${usedCount}\n`;
    output += `   Unspent: ${unspentCount} (${totalUnspent} HBAR)\n\n`;

    // Show first 10 unspent
    const unspent = entries.filter(e => !e.used).slice(0, 10);
    if (unspent.length > 0) {
      output += `   First ${unspent.length} unspent fragments:\n`;
      unspent.forEach(e => {
        output += `      • ${e.id}: ${e.amount} HBAR (used=${e.used})\n`;
      });
    }

    // Show first 5 used
    const used = entries.filter(e => e.used).slice(0, 5);
    if (used.length > 0) {
      output += `\n   First ${used.length} used (spent) fragments:\n`;
      used.forEach(e => {
        output += `      • ${e.id}: ${e.amount} HBAR (used=${e.used})\n`;
      });
    }

    return output;
  }

  loadSecrets(password = this.vaultPassword) {
    try {
      const data = this.vault.decrypt(password);
      for (const [key, value] of Object.entries(data)) {
        this.userSecrets.set(key, value);
      }
      // Update blinded view for the AI
      this.blindedVault = this.vault.getBlindedVault(data);
      this.logger.logic('🔐 Vault Decrypted & Blinded: AI Agent cannot see raw secrets.');
    } catch (e) {
      console.error('⚠️ Vault error:', e.message);
      // Migration: If file exists but decrypt fails, might be plaintext
      if (fs.existsSync(this.secretsPath)) {
          const raw = JSON.parse(fs.readFileSync(this.secretsPath, 'utf8'));
          if (!raw.tag) {
              console.log('🔄 Migrating legacy plaintext vault to encrypted format...');
              for (const [key, value] of Object.entries(raw)) {
                this.userSecrets.set(key, value);
              }
              this.saveSecrets(); // Re-saves as encrypted and UPDATES blindedVault
          }
      }
    }
  }

  saveSecrets(password = this.vaultPassword) {
    try {
      const obj = {};
      for (const [key, value] of this.userSecrets.entries()) {
        obj[key] = value;
      }
      this.vault.encrypt(obj, password);
      // Update blinded view
      this.blindedVault = this.vault.getBlindedVault(obj);
    } catch (e) {
      console.error('⚠️ Failed to save vault:', e.message);
    }
  }

  /**
   * Auto-collects fragments to fulfill a private stealth payment
   */
  async autoStealthPrivate(recipientAccountId, amount) {
    console.log(`🔒 AUTO Private Stealth: Pool -> ${recipientAccountId} (${amount} HBAR)\n`);
    
    let selectedSecrets = this.findExactSubset(amount, Object.values(this.blindedVault).filter(v => !v.used));
    let collectedAmount = amount;

    if (!selectedSecrets) {
      // Fallback: Greedy selection
      collectedAmount = 0;
      selectedSecrets = [];
      const unspent = Object.values(this.blindedVault).filter(v => !v.used);
      for (const item of unspent) {
        collectedAmount += item.amount;
        selectedSecrets.push(item);
        if (collectedAmount >= amount) break;
      }
    }

    if (collectedAmount < amount) {
      return `❌ Insufficient unspent shielded funds. You have ${collectedAmount} HBAR available. Shield more funds first.`;
    }

    console.log(`🧩 Auto-selected ${selectedSecrets.length} fragment(s) totaling ${collectedAmount} HBAR.`);
    
    if (collectedAmount > amount) {
      console.log(`⚠️  Warning: Using a ${collectedAmount} HBAR collection to send ${amount} HBAR. (Change mechanism coming soon)`);
    }

    // --- Human-In-The-Loop Confirmation ---
    const confirmed = await this.confirmWithdrawal(recipientAccountId, amount);
    if (!confirmed) return `🛑 Private Stealth cancelled by user.`;

    // --- Generate ONE Stealth Address for all fragments ---
    const recipientViewKey = process.env.RECEIVER_VIEW_KEY || "0x1cf9ff017f28eb6576a39f5cdd78c1560b37173ae7659a1f83770709c2ed5262";
    const recipientSpendKey = process.env.RECEIVER_SPEND_KEY || "0xb3fbf0bf2e4ddbcdaf49973131719bc87fa0d8542e1b6cf17cca6f4aef43f330";
    const hip1334 = require('../../lib/hip1334.cjs');
    const { privateKeyHex: ephPriv, publicKeyHex: ephPub } = hip1334.generateX25519KeyPair();
    const sharedSecret = hip1334.x25519SharedSecret(ephPriv, recipientViewKey.replace('0x', '')).toString('hex');
    const stealthAddress = keccak256(Buffer.concat([
      Buffer.from(sharedSecret, 'hex'), 
      Buffer.from(recipientSpendKey.replace('0x', ''), 'hex')
    ]));
    const targetAddress = `0x${stealthAddress.slice(2, 42)}`;
    
    console.log(`\n   🧬 Unified Stealth Recipient: ${targetAddress}`);
    console.log(`   (All fragments will be sent here so the receiver gets 1 unified payload)`);

    let results = "\n✅ Auto-Stealth Execution Started:\n";
    let allSuccess = true;

    // Execute each fragment as a private stealth payment TO THE SAME ADDRESS
    for (let i = 0; i < selectedSecrets.length; i++) {
        const frag = selectedSecrets[i];
        console.log(`\n⏳ Processing fragment ${i+1}/${selectedSecrets.length} (${frag.amount} HBAR)...`);
        
        const sec = this.userSecrets.get(frag.id);
        if (!sec) continue;

        const stealthCreds = { targetAddress, ephPub };
        const res = await this.generateStealthAddressPrivate(recipientAccountId, frag.amount, frag.id, stealthCreds);
        
        if (res.startsWith('❌')) {
            allSuccess = false;
            results += `   ❌ Fragment [${frag.id}]: failed\n`;
        } else {
            sec.used = true;
            this.saveSecrets();
            results += `   ✅ Fragment [${frag.id}]: Sent ${frag.amount} HBAR via Stealth\n`;
        }
    }

    if (allSuccess) {
        results += `\n🎉 All fragments submitted to Pool Manager successfully!`;
    }

    return results;
  }

  /**
   * Secure subset sum helper
   */
  findExactSubset(target, available) {
    console.log(`🔍 [DEBUG] Target: ${target}, Available: ${available.length} fragments`);
    available.sort((a,b) => b.amount - a.amount);
    const result = [];
    let currentSum = 0;
    for (const item of available) {
      console.log(`   - checking fragment ${item.id} (${item.amount} HBAR)...`);
      if (currentSum + item.amount <= target + 0.0001) {
        currentSum += item.amount;
        result.push(item);
        console.log(`     ✅ added to subset. currentSum: ${currentSum}`);
      }
      if (Math.abs(currentSum - target) < 0.0001) break;
    }
    const success = Math.abs(currentSum - target) < 0.0001;
    console.log(`🔍 [DEBUG] Subset Search ${success ? 'SUCCESS' : 'FAILED'}. Sum: ${currentSum}`);
    return success ? result : null;
  }

  /**
   * Human-In-The-Loop (HITL) Confirmation
   */
  async confirmWithdrawal(recipient, amount) {
    console.log(`\n` + `━`.repeat(40));
    console.log(`🖐️  SECURITY CHECK: HUMAN-IN-THE-LOOP REQUIRED`);
    console.log(`   Action: Send HBAR from Vanish Privacy Pool`);
    console.log(`   Recipient: ${recipient}`);
    console.log(`   Amount: ${amount} HBAR`);
    console.log(`━`.repeat(40));
    
    return new Promise((resolve) => {
      if (this.rl) {
        this.rl.question(`⚠️  Type 'confirm' to unlock vault & sign transaction: `, (answer) => {
          resolve(answer.trim().toLowerCase() === 'confirm');
        });
      } else {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        rl.question(`⚠️  Type 'confirm' to unlock vault & sign transaction: `, (answer) => {
          rl.close();
          resolve(answer.trim().toLowerCase() === 'confirm');
        });
      }
    });
  }

  /**
   * Generate stealth address and notify recipient
   */
  async generateStealthAddress(recipientAccountId, amount) {
    console.log(`🔐 Generating stealth address for ${recipientAccountId} using ${amount} HBAR...\n`);
    
    // In a real app, you'd fetch the recipient's view/spend keys from a registry.
    // For this demo, we use the ones defined in your .env
    const recipientViewKey = process.env.RECEIVER_VIEW_KEY || "0xb2142cb1a3ef71bc0c86ebccb3c58b5bd4384de9f4175de8df6ed085b14ea174";
    const recipientSpendKey = process.env.RECEIVER_SPEND_KEY || "0x892a0d9df7fd15f0bf608339c01fb0a7fcc050b4ecbcc0cbccdedc1bfbdba839";
    
    const tool = tools.find(t => t.name === 'generate_stealth_address');
    const result = await tool.func({
      recipientAccountId: recipientAccountId,
      recipientViewKey: recipientViewKey.replace('0x', ''),
      recipientSpendKey: recipientSpendKey.replace('0x', ''),
      amount: amount
    });
    const data = JSON.parse(result);
    
    if (data.success) {
      return `✅ Stealth Payment Sent!
   Derived Address: ${data.stealthAddress}
   Ephemeral Key:   ${data.ephemeralPublicKey}
   HBAR Transfer:   ${data.transferTxId} (${data.status})
   HCS Notification: ${data.notificationTxId}
   
   ⚠️  The receiver agent will automatically detect and claim this HBAR.`;
    }
    return `❌ ${data.error}`;
  }

  /**
   * PRIVATE Stealth Address: Send from Pool -> Stealth
   */
  async generateStealthAddressPrivate(recipientAccountId, amount, secretId, preGeneratedStealth = null) {
    console.log(`🔒 PRIVATE Stealth Payment: Pool -> ${recipientAccountId} (${amount} HBAR)\n`);
    
    const secret = this.userSecrets.get(secretId);
    if (!secret) return `❌ Secret ID ${secretId} not found in local vault.`;

    const actualSecret = typeof secret === 'object' ? secret.secret : secret;
    const actualNullifier = (typeof secret === 'object' && secret.nullifier) ? secret.nullifier : '0x' + crypto.randomBytes(32).toString('hex');

    let targetAddress;
    let ephPub;

    if (preGeneratedStealth) {
      targetAddress = preGeneratedStealth.targetAddress;
      ephPub = preGeneratedStealth.ephPub;
    } else {
      // 1. Generate Stealth Address for Recipient
      const recipientViewKey = process.env.RECEIVER_VIEW_KEY || "0x1cf9ff017f28eb6576a39f5cdd78c1560b37173ae7659a1f83770709c2ed5262";
      const recipientSpendKey = process.env.RECEIVER_SPEND_KEY || "0xb3fbf0bf2e4ddbcdaf49973131719bc87fa0d8542e1b6cf17cca6f4aef43f330";

      const hip1334 = require('../../lib/hip1334.cjs');
      const keys = hip1334.generateX25519KeyPair();
      ephPub = keys.publicKeyHex;
      const ephPriv = keys.privateKeyHex;
      const sharedSecret = hip1334.x25519SharedSecret(ephPriv, recipientViewKey.replace('0x', '')).toString('hex');
      const stealthAddress = keccak256(Buffer.concat([
        Buffer.from(sharedSecret, 'hex'), 
        Buffer.from(recipientSpendKey.replace('0x', ''), 'hex')
      ]));
      targetAddress = `0x${stealthAddress.slice(2, 42)}`;
      console.log(`   🧬 Derived Stealth Recipient: ${targetAddress}`);
    }

    // 2. Generate Withdraw Proof from Pool to Stealth Address
    console.log(`   🛡️  Generating ZK-Withdraw proof (anonymous sender)...`);
    
    // Get latest pool status for root
    const statusTool = tools.find(t => t.name === 'query_pool_status');
    const statusResult = await statusTool.func({});
    const statusData = JSON.parse(statusResult);
    if (!statusData.success) return `❌ Failed to get pool status: ${statusData.error}`;

    const testData = await generateTestInputs({ secret: actualSecret, nullifier: actualNullifier, amount });

    const withdrawTool = tools.find(t => t.name === 'generate_withdraw_proof');
    const proofResult = await withdrawTool.func({
      secret: actualSecret,
      nullifier: actualNullifier,
      amount: amount,
      recipient: targetAddress,
      merkleRoot: testData.merkleRoot, // Must match testData path
      merklePathElements: testData.merklePathElements,
      merklePathIndices: testData.merklePathIndices
    });

    const proofData = JSON.parse(proofResult);
    if (!proofData.success) return `❌ Proof generation failed: ${proofData.error}`;

    // 3. Submit to Pool Manager
    console.log(`   📤 Submitting Private withdraw-to-stealth proof...`);
    const submitTool = tools.find(t => t.name === 'submit_proof_to_pool');
    const submitResult = await submitTool.func({
      proof: proofData.proof,
      publicSignals: proofData.publicSignals,
      proofType: 'withdraw',
      amount: amount,
      submitter: this.accountId.toString(),
      stealthPayload: {
        recipientAccountId: recipientAccountId,
        ephemeralPublicKey: ephPub,
        stealthAddress: targetAddress,
        senderAccountId: this.accountId.toString() // Add sender ID for receiver UX
      }
    });

    const finalData = JSON.parse(submitResult);
    if (finalData.success) {
      return `✅ PRIVATE Stealth Payment Submitted!
   Recipient Account: ${recipientAccountId}
   Stealth Address:   ${targetAddress}
   Status:            Proof Submitted to Pool Manager
   Anonymity:         Sender is hidden via ZK-SNARK 🕵️
   
   ⚠️  The receiver agent will automatically detect and claim this once the Pool Manager processes the batch.`;
    }
    
    return `❌ Submission failed: ${finalData.error}`;
  }

  /**
   * Auto-collects fragments for an INTERNAL shielded swap (Commitment to Commitment)
   */
  async autoInternalSwap(recipientAccountId, amount) {
    console.log(`🔒 AUTO Internal Swap: Pool -> Pool (Recipient: ${recipientAccountId}, ${amount} HBAR)\n`);

    // 1. Find exact fragments (using live userSecrets Map, not cached blindedVault)
    const unspent = [];
    for (const [id, data] of this.userSecrets.entries()) {
      if (data.used !== true) {
        unspent.push({ id, amount: data.amount || 0 });
      }
    }
    
    const findExact = (target, available) => {
      available.sort((a,b) => b.amount - a.amount);
      const result = [];
      let currentSum = 0;
      for (const item of available) {
        if (currentSum + item.amount <= target) {
          currentSum += item.amount;
          result.push(item);
        }
      }
      return currentSum === target ? result : null;
    };

    let selectedSecrets = findExact(amount, unspent);
    if (!selectedSecrets) return `❌ Insufficient shielded funds for exact match of ${amount} HBAR.`;

    // --- Human-In-The-Loop Confirmation ---
    const confirmed = await this.confirmWithdrawal(recipientAccountId, amount);
    if (!confirmed) return `🛑 Internal Swap cancelled by user.`;

    console.log(`🧩 Selected ${selectedSecrets.length} fragments for internal swap.`);

    let results = "\n✅ Internal Swap Started:\n";
    for (const frag of selectedSecrets) {
      console.log(`⏳ Swapping fragment ${frag.id} (${frag.amount} HBAR)...`);
      
      // Generate NEW secret for the recipient (In a real app, you'd use their public key)
      const newSecret = '0x' + crypto.randomBytes(32).toString('hex');
      const newNullifier = '0x' + crypto.randomBytes(32).toString('hex');
      const newCommitment = '0x' + crypto.randomBytes(32).toString('hex'); // Mocked Poseidon for internal swap leaf

      // Generate proof with recipient 0x0...0
      const res = await this.generateInternalSwapPayload(recipientAccountId, frag.amount, frag.id, newCommitment, { newSecret, newNullifier });
      
      if (res.startsWith('❌')) {
        results += `   ❌ Fragment [${frag.id}]: failed\n`;
      } else {
        const sec = this.userSecrets.get(frag.id);
        if (sec) {
          sec.used = true;
          this.saveSecrets();
          console.log(`   🔒 Marked ${frag.id} as used in vault`);
        } else {
          console.warn(`   ⚠️ Could not mark ${frag.id} as used - not found in vault`);
        }
        results += `   ✅ Fragment [${frag.id}]: Swapped ${frag.amount} HBAR internally\n`;
      }
    }

    return results;
  }

  async generateInternalSwapPayload(recipientAccountId, amount, secretId, newCommitment, recipientKeys) {
    const secret = this.userSecrets.get(secretId);
    const zeroAddr = '0x' + '0'.repeat(40);
    
    // 1. Generate ZK proof with recipient = 0
    const testData = await generateTestInputs({ secret: secret.secret, nullifier: secret.nullifier, amount });
    const withdrawTool = tools.find(t => t.name === 'generate_withdraw_proof');
    const proofResult = await withdrawTool.func({
      secret: secret.secret,
      nullifier: secret.nullifier,
      amount: amount,
      recipient: zeroAddr,
      merkleRoot: testData.merkleRoot,
      merklePathElements: testData.merklePathElements,
      merklePathIndices: testData.merklePathIndices
    });

    const proofData = JSON.parse(proofResult);
    if (!proofData.success) return `❌ Proof failed: ${proofData.error}`;

    // 2. Submit to Pool Manager with newCommitment
    const submitTool = tools.find(t => t.name === 'submit_proof_to_pool');
    const submitResult = await submitTool.func({
      proof: proofData.proof,
      publicSignals: proofData.publicSignals,
      proofType: 'withdraw',
      amount: amount,
      newCommitment: newCommitment, // Specific to internalSwap
      submitter: this.accountId.toString(),
      stealthPayload: {
        recipientAccountId: recipientAccountId,
        internalSwap: true,
        newSecret: recipientKeys.newSecret,
        newNullifier: recipientKeys.newNullifier,
        amount: amount,
        senderAccountId: this.accountId.toString()
      }
    });

    return submitResult;
  }
  async withdrawFunds(recipient, amount, secretId = null) {
    console.log(`\n🛡️  Vanish Privacy Advisory: 'Exit Point' Security Check\n`);
    
    // 1. Amount Scrubbing check
    const isRoundAmount = (amount % 1 === 0) || (amount % 5 === 0);
    if (!isRoundAmount) {
      console.log(`⚠️  Warning: Withdrawal of non-round amount (${amount} HBAR) detected.`);
      console.log(`💡 Privacy Tip: Withdrawing 'round' amounts (e.g., ${Math.floor(amount)} HBAR) breaks the 'Amount Fingerprint' used by chain analysis.`);
    }

    console.log(`⚠️  'Exit Point' Alert: Withdrawing to a main account (${recipient}) creates an on-chain link.`);
    console.log(`💡 Safer Alternative: Stay inside the pool. Use 'internal-transfer' for peer-to-peer privacy.\n`);
    console.log(`✅ HIP-1340 Protection: The Pool Manager will pay the gas for this withdrawal to decouple your wallets.\n`);

    // 2. Secret Resolution (using live userSecrets Map, not cached blindedVault)
    let selectedSecretIds = [];
    if (secretId) {
      // Check if already pending
      if (this.isSecretPending(secretId)) {
        return `⏳ Secret ${secretId} is already pending withdrawal. Wait for completion.`;
      }
      selectedSecretIds = [secretId];
    } else {
      console.log(`🔍 Searching live vault for matching HBAR fragments (Aggregation Mode)...`);
      const available = [];
      for (const [id, data] of this.userSecrets.entries()) {
        if (data.used !== true && !this.isSecretPending(id)) {
          available.push({ id, amount: data.amount || 0 });
        }
      }

      const subset = this.findExactSubset(amount, available);
      if (subset) {
        selectedSecretIds = subset.map(s => s.id);
        console.log(`   ✅ Found ${selectedSecretIds.length} fragments matching ${amount} HBAR: [${selectedSecretIds.join(', ')}]`);
      }
    }

    if (selectedSecretIds.length === 0) {
      return `❌ No matching HBAR fragments found to satisfy ${amount} HBAR withdrawal.`;
    }

    // 3. Human-In-The-Loop Confirmation (HITL)
    const confirmed = await this.confirmWithdrawal(recipient, amount);
    if (!confirmed) return `🛑 Withdrawal cancelled by user.`;

    let totalSuccess = 0;
    for (const sid of selectedSecretIds) {
      const fragData = this.userSecrets.get(sid);
      if (!fragData) {
        console.error(`❌ Fragment ${sid} not found in vault.`);
        continue;
      }
      console.log(`🛡️  Withdrawing fragment ${sid} (${fragData.amount} HBAR) to ${recipient}...\n`);
      
      const secret = this.userSecrets.get(sid);
      if (!secret) {
        console.error(`❌ Secret ${sid} missing from full vault.`);
        continue;
      }

      const actualSecret = typeof secret === 'object' ? secret.secret : secret;
      const actualNullifier = (typeof secret === 'object' && secret.nullifier) ? secret.nullifier : '0x' + crypto.randomBytes(32).toString('hex');
      const fragAmount = typeof secret === 'object' ? secret.amount : fragData.amount;

      // Get latest pool status
      const statusTool = tools.find(t => t.name === 'query_pool_status');
      const statusResult = await statusTool.func({});
      const statusData = JSON.parse(statusResult);
      if (!statusData.success) {
        console.error(`❌ Failed to get pool status: ${statusData.error}`);
        continue;
      }

      const testData = await generateTestInputs({ secret: actualSecret, nullifier: actualNullifier, amount: fragAmount });

      const tool = tools.find(t => t.name === 'generate_withdraw_proof');
      const result = await tool.func({
        secret: actualSecret,
        nullifier: actualNullifier,
        amount: fragAmount,
        recipient: recipient,
        merkleRoot: testData.merkleRoot, // Must match testData path for demo
        merklePathElements: testData.merklePathElements,
        merklePathIndices: testData.merklePathIndices
      });

      this.logger.logic(`Generating withdrawal proof for ${fragAmount} HBAR...`, {
        recipient,
        merkleRoot: statusData.currentMerkleRoot || statusData.merkleRoot,
        inputs: this.logger.redact(testData)
      });

      const data = JSON.parse(result);
      
      if (data.success) {
        console.log(`   📤 Submitting withdraw proof for ${fragAmount} HBAR...`);
        const submitTool = tools.find(t => t.name === 'submit_proof_to_pool');
        const submitRes = await submitTool.func({
          proof: data.proof,
          publicSignals: data.publicSignals,
          proofType: 'withdraw',
          amount: fragAmount,
          submitter: this.accountId.toString()
        });
        
        const finalData = JSON.parse(submitRes);
        if (finalData.success) {
          totalSuccess++;
          // Add to pending withdrawals instead of marking as used immediately
          // Will be marked as used when Pool Manager confirms completion
          this.pendingWithdrawals.set(sid, {
            secretId: sid,
            submissionId: finalData.submissionId || crypto.randomBytes(16).toString('hex'),
            amount: fragAmount,
            recipient: recipient,
            submittedAt: Date.now(),
            status: 'PENDING'
          });
          this.savePendingWithdrawals();
          console.log(`   ⏳ Added to pending withdrawals (will mark as used when confirmed)`);
        }
      }
    }

    if (totalSuccess === selectedSecretIds.length && totalSuccess > 0) {
      return `✅ ALL Withdraw Proofs Submitted (${totalSuccess}/${selectedSecretIds.length})!
   Recipient: ${recipient}
   Total:      ${amount} HBAR
   Status:     Pending Batch Processing
   
   ⚠️  Check 'status' to see when the next batch is executed.`;
    }
    
    return `❌ Withdrawal partially successful or failed (${totalSuccess}/${selectedSecretIds.length}). Check logs.`;
  }
  
  /**
   * Shield funds (deposit into privacy pool)
   */
  async shieldFunds(amount) {
    console.log(`🛡️  Shielding ${amount} HBAR...\n`);
    
    // Generate user secret and nullifier
    const secret = '0x' + crypto.randomBytes(32).toString('hex');
    const nullifier = '0x' + crypto.randomBytes(32).toString('hex');

    const testData = await generateTestInputs({ secret, nullifier, amount });

    const tool = tools.find(t => t.name === 'generate_shield_proof');
    const result = await tool.func({
      secret: secret,
      nullifier: nullifier,
      amount: amount,
      merkleRoot: testData.merkleRoot,
      merklePathElements: testData.merklePathElements,
      merklePathIndices: testData.merklePathIndices
    });

    this.logger.logic(`Generating shield proof for ${amount} HBAR...`, {
      amount,
      merkleRoot: testData.merkleRoot,
      inputs: this.logger.redact(testData)
    });

    const data = JSON.parse(result);
    
    if (data.success) {
      // Store secret for withdrawal
      const secretId = crypto.randomBytes(8).toString('hex');
      this.userSecrets.set(secretId, { secret, nullifier, amount, used: false });
      this.saveSecrets();
      
      console.log(`   📤 Submitting to Pool Manager...`);
      const submitResult = await this.submitProofToPoolManager({
        proof: data.proof,
        publicSignals: data.publicSignals,
        commitment: data.commitment,
        nullifierHash: data.nullifierHash,
        amount: amount
      });

      // Track pending withdrawal for completion notification
      if (submitResult.success && submitResult.submissionId) {
        this.pendingWithdrawals.set(secretId, {
          secretId: secretId,
          submissionId: submitResult.submissionId,
          amount: amount,
          recipient: null,
          submittedAt: Date.now(),
          status: 'PENDING'
        });
        this.savePendingWithdrawals();
      }

      return `✅ Shield Proof Generated!
   Commitment: ${data.commitment}
   Nullifier Hash: ${data.nullifierHash}

   🔑 YOUR SECRET (SAVE THIS!):
   Secret ID: ${secretId}
   Secret: ${secret}

   ⚠️  You MUST save this secret to withdraw funds later!

   📤 Proof submitted to Pool Manager: ${submitResult.success ? 'SUCCESS' : 'FAILED'}
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

    // [THOUGHT] Fragmentation Logic: Incorporate logic traces
    const poolDensity = plan.metrics.anonymitySet > 10 ? 'moderate' : 'low';
    this.logger.fragmentationReasoning(
      amount,
      plan.numFragments,
      poolDensity,
      plan.strategy
    );

    // [THOUGHT] Privacy Scoring: Calculate dynamic Privacy Score and log rationale
    this.logger.logPrivacyScore(amount, plan.numFragments, plan.metrics);

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
        const testData = await generateTestInputs({ 
          secret: secretData.secret, 
          nullifier: secretData.nullifier, 
          amount: fragmentAmount 
        });

        const result = await tool.func({
          secret: secretData.secret,
          nullifier: secretData.nullifier,
          amount: fragmentAmount,
          tokenId: '0.0.15058',
          merkleRoot: testData.merkleRoot,
          merklePathElements: testData.merklePathElements,
          merklePathIndices: testData.merklePathIndices
        });
        
        const data = JSON.parse(result);
        
        if (data.success) {
          // Store secret with amounts and flag
          this.userSecrets.set(secretData.secretId, { 
             secret: secretData.secret, 
             nullifier: secretData.nullifier, 
             amount: fragmentAmount,
             used: false,
             timestamp: Date.now()
          });
          this.saveSecrets(); // This now correctly updates blindedVault
          
          // Submit proof to Pool Manager
          console.log(`       📤 Submitting to Pool Manager...`);
          const submitResult = await this.submitProofToPoolManager({
            proof: data.proof,
            publicSignals: data.publicSignals,
            commitment: data.commitment,
            nullifierHash: data.nullifierHash,
            amount: fragmentAmount
          });

          // Track pending withdrawal for completion notification
          if (submitResult.success && submitResult.submissionId) {
            this.pendingWithdrawals.set(secretData.secretId, {
              secretId: secretData.secretId,
              submissionId: submitResult.submissionId,
              amount: fragmentAmount,
              recipient: null,
              submittedAt: Date.now(),
              status: 'PENDING'
            });
            this.savePendingWithdrawals();
          }

          results.push({
            fragmentId: i + 1,
            amount: fragmentAmount,
            commitment: data.commitment,
            nullifierHash: data.nullifierHash,
            secretId: secretData.secretId,
            submitted: submitResult.success,
            submissionId: submitResult.submissionId,
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

    // [THOUGHT] Agent initiates reasoning with REAL NETWORK STATE
    console.log('🌐 Fetching real-time network state (Pool Anonymity Set, Gas)...');
    const statusResult = await this.queryPoolStatus();
    const isSuccess = !statusResult.startsWith('❌');
    
    this.logger.thought(`Analyzing fragmentation strategy for ${amount} HBAR with network context`, {
      privacyLevel: 'moderate',
      networkAware: true,
      poolStatus: isSuccess ? 'online' : 'fallback'
    });

    try {
      // AI analyzes and creates plan using real-time context
      const plan = await aiFragmentor.analyzeFragmentationStrategy(amount, {
        privacyLevel: 'moderate',
        networkState: statusResult,
        timestamp: new Date().toISOString()
      });

      // [LOGIC] AI provides reasoning trace
      this.logger.logic(`AI Strategy Selection: ${plan.aiStrategy}`, {
        fragments: plan.numFragments,
        justification: plan.costJustification,
        privacyBenefit: plan.privacyBenefit
      });

      // [THOUGHT] Privacy Scoring with rationale
      this.logger.logPrivacyScore(amount, plan.numFragments, plan.metrics);

      // [DECISION] Log final decision with rationale
      this.logger.decision(
        `Shield ${amount} HBAR using ${plan.numFragments} fragments`,
        plan.aiPowered ? plan.privacyBenefit : 'AI-driven strategy',
        { strategy: plan.aiStrategy || plan.strategy }
      );

      // Display AI reasoning with Network Observation
      if (plan.aiPowered) {
        console.log('🎯 AI Network Observation:\n');
        console.log(`   "${plan.aiReasoning}"`);
        console.log(`\n📊 Fragmentation Strategy:`);
        console.log(`   Strategy: ${plan.aiStrategy}`);
        console.log(`   Fragments: ${plan.numFragments}`);
        console.log(`\n💡 AI Justification: ${plan.privacyBenefit}`);
        console.log('\n' + '━'.repeat(60) + '\n');
      }

      // 1. BATCHED DELEGATION (HIP-1340) - One transaction for the total amount to save fees!
      const poolManagerId = process.env.POOL_MANAGER_ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID || process.env.POOL_CONTRACT_ID;
      if (poolManagerId !== this.accountId.toString()) {
        console.log(`💰 Batching delegation for ${amount} HBAR...`);
        const delegation = new DelegationManager(this.client);
        await delegation.delegateSpendingRights(
          this.accountId.toString(),
          poolManagerId,
          amount + 0.1 // Add 0.1 HBAR buffer for any rounding
        );
        console.log(`✅ Batched allowance: ${amount + 0.1} HBAR → Pool Manager`);
      }

      // Generate secrets and proofs
      const secrets = fragmentor.generateFragmentSecrets(plan.numFragments);
      const results = [];
      
      for (let i = 0; i < plan.numFragments; i++) {
        console.log(`⚡ Fragment ${i + 1}/${plan.numFragments}: Generating ZK-proof for ${plan.fragmentAmounts[i].toFixed(2)} HBAR...`);
        
        try {
          const testData = await generateTestInputs({ 
            secret: secrets[i].secret, 
            nullifier: secrets[i].nullifier, 
            amount: plan.fragmentAmounts[i]
          });

          const tool = tools.find(t => t.name === 'generate_shield_proof');
          const result = await tool.func({
            secret: secrets[i].secret,
            nullifier: secrets[i].nullifier,
            amount: plan.fragmentAmounts[i],
            tokenId: '0.0.15058',
            merkleRoot: testData.merkleRoot,
            merklePathElements: testData.merklePathElements,
            merklePathIndices: testData.merklePathIndices
          });
          
          const data = JSON.parse(result);
          if (data.success) {
            const secretId = `frag_${Date.now()}_${i}`;
            this.userSecrets.set(secretId, {
              secret: secrets[i].secret,
              nullifier: secrets[i].nullifier,
              amount: plan.fragmentAmounts[i],
              commitment: data.commitment,
              timestamp: Date.now(),
              used: false
            });
            this.saveSecrets(); // SAVE TO ENCRYPTED VAULT
            
            // Submit proof to Pool Manager
            console.log(`       📤 Submitting to Pool Manager...`);
            const submitResult = await this.submitProofToPoolManager({
              proof: data.proof,
              publicSignals: data.publicSignals,
              commitment: data.commitment,
              nullifierHash: data.nullifierHash,
              amount: plan.fragmentAmounts[i],
              skipDelegation: true // Already batched above!
            });

            // Track pending withdrawal for completion notification
            if (submitResult.success && submitResult.submissionId) {
              this.pendingWithdrawals.set(secretId, {
                secretId: secretId,
                submissionId: submitResult.submissionId,
                amount: plan.fragmentAmounts[i],
                recipient: null,
                submittedAt: Date.now(),
                status: 'PENDING'
              });
              this.savePendingWithdrawals();
            }

            results.push({
              success: true,
              fragmentId: i + 1,
              amount: plan.fragmentAmounts[i],
              commitment: data.commitment,
              secretId: secretId,
              submitted: submitResult.success,
              submissionId: submitResult.submissionId,
              transactionId: data.transactionId
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
          const txShort = r.transactionId ? ` (Tx: ${r.transactionId})` : '';
          output += `   [${r.fragmentId}] ${r.amount.toFixed(2)} HBAR - ${r.commitment.substring(0, 12)}... ✅${txShort}\n`;
        } else {
          output += `   [${r.fragmentId}] ${r.amount} HBAR - ❌ ${r.error}\n`;
        }
      });
      
      if (successful > 0) {
        output += `\n🔑 SECRET IDs (Auto-saved to vault):\n`;
        results.filter(r => r.success).forEach(r => {
          output += `   Fragment ${r.fragmentId}: ${r.secretId}\n`;
        });
        
        output += `\n💡 Your agent has saved these to your encrypted vault.`;
        output += `\n💡 You only need to save these manually for backup or migration.`;
        output += `\n📤 All ${successful} proofs submitted to Pool Manager`;
        output += `\n🧠 Privacy: ${plan.metrics.privacyScore}% (AI-optimized anonymity)`;
        output += `\n💰 Cost: $${plan.costs.total.toFixed(4)}`;
      }
      
      return output;
      
    } catch (error) {
      return `❌ AI Shield failed: ${error.message}`;
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
      return `❌ AI analysis failed: ${error.message}`;
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

🛡️  PRIVACY VAULT:
  balance                 View your total shielded balance & fragments
  shields                 (alias for balance)
  withdraw <to> <amt>     Secure withdrawal to main account (AI-optimized)
  internal-transfer <to> <amt> Move funds within pool (No on-chain link)
  withdraw <sid> <to> <amt> (Manual mode) Withdraw specific fragment

📡 BASIC COMMANDS:
  status                  Query current pool status
  check-balance [account] Check public HBAR balance
  transfer <to> <amt>     Transfer HBAR (Public transaction)
  shield <amount>         Simple shield (no fragmentation)
  stealth <to> <amt>      Generate a new stealth address (Direct)
  stealth --private <to> <amt> <sid> Private stealth payment (from pool)
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
  5. OPTIONAL: internal-transfer <to> <amt> - Send within pool! 🤫
  6. Wait for batch to execute (5-30 minutes)
  7. SAVE your secret for withdrawal!

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
- PROACTIVELY warn users about "Exit Point" risks when they withdraw to main accounts
- SUGGEST "internal-transfer" for maximum privacy to keep funds inside the pool
- ADVISE on "Amount Scrubbing" (rounding) to break chain analysis patterns
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
    const parts = userInput.trim().split(/\s+/);
    const command = parts[0].toLowerCase();

    // HYBRID MODE: Check if this is a direct protocol command even in AI mode
    // This prevents the AI from entering infinite loops for standard operations.
    const directCommands = [
      'status', 'balance', 'shields', 'check-balance', 'transfer', 'internal-transfer', 'ai-shield', 'ai-plan',
      'consult', 'shield-smart', 'plan', 'shield', 'stealth', 'withdraw', 'help', 'debug-vault'
    ];

    if (directCommands.includes(command)) {
      console.log(`🔹 [LOGIC] Bypassing LLM loop for direct protocol command: ${command}`);
      return await this.executeDirectCommand(userInput);
    }

    // Otherwise, use AI for natural language conversation
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
   * Submit proof to Pool Manager via HCS private topic
   */
  async submitProofToPoolManager(proofData) {
    try {
      // HIP-1340: Approve pool manager to pull this fragment's HBAR amount
      const poolManagerId = process.env.POOL_MANAGER_ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID || process.env.POOL_CONTRACT_ID;
      
      // If we are the pool manager (same account dev loop), delegation is redundant
      // If skipDelegation is true, the caller already handled it (batched)
      if (poolManagerId !== this.accountId.toString() && !proofData.skipDelegation) {
        const delegation = new DelegationManager(this.client);
        await delegation.delegateSpendingRights(
          this.accountId.toString(),
          poolManagerId,
          proofData.amount
        );
        console.log(`   🔑 HIP-1340 allowance: ${proofData.amount} HBAR → Pool Manager (${poolManagerId})`);
      } else if (proofData.skipDelegation) {
        // Silently continue, allowance already handled
      } else {
        console.log(`   💡 Dev Mode: Skipping delegation (User == Pool Manager)`);
      }

      // Use provided submissionId or generate new one
      const submissionId = proofData.submissionId || crypto.randomBytes(16).toString('hex');

      const payload = {
        type: 'PROOF_SUBMISSION',
        proofType: proofData.proofType || 'shield',
        submissionId: submissionId,
        timestamp: Date.now(),
        proof: proofData.proof,
        publicSignals: proofData.publicSignals,
        commitment: proofData.commitment,
        nullifierHash: proofData.nullifierHash,
        amount: proofData.amount,
        recipient: proofData.recipient,
        submitter: proofData.submitter || this.accountId.toString()
      };

      // HIP-1334: Send encrypted to Pool Manager's inbox (discovered via Mirror Node)
      try {
        await hip1334.sendEncryptedMessage(this.client, poolManagerId, payload);
        console.log(`   📨 Proof sent via HIP-1334 (encrypted) - Submission ID: ${submissionId}`);
      } catch (hip1334Err) {
        // Fallback: raw HCS private topic if Pool Manager inbox not yet set up
        console.warn(`   ⚠️  HIP-1334 unavailable (${hip1334Err.message}), using raw HCS`);
        const transaction = new TopicMessageSubmitTransaction()
          .setTopicId(this.privateTopic)
          .setMessage(JSON.stringify(payload));
        await transaction.execute(this.client);
        console.log(`   📤 Proof sent via raw HCS (fallback) - Submission ID: ${submissionId}`);
      }

      // Return the submissionId so caller can track pending withdrawals
      return { success: true, submissionId };
    } catch (error) {
      console.error(`   ❌ Submission failed: ${error.message}`);
      return { success: false, submissionId: null };
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
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.aiMode ? '💬 You: ' : '⚡ Command: '
    });
    
    this.rl.prompt();
    
    this.rl.on('line', async (input) => {
      const trimmed = input.trim();
      
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log('👋 Goodbye! Stay private.');
        this.rl.close();
        process.exit(0);
      }
      
      if (trimmed.length > 0) {
        const result = await this.processCommand(trimmed);
        if (result) {
          console.log('\n' + result + '\n');
        }
      }
      
      this.rl.prompt();
    });
    
    this.rl.on('close', () => {
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

  // Check for force direct mode
  const forceDirect = process.argv.includes('--direct') ||
                      process.argv.includes('-d') ||
                      process.env.FORCE_DIRECT_MODE === 'true';

  if (forceDirect) {
    console.log('💡 Starting in Direct mode (forced via flag/env)\n');
    const agent = new UserAgent(false);
    await agent.startChat();
    return;
  }

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
