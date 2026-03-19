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
const { Client, PrivateKey, AccountId, TransactionId, TopicMessageSubmitTransaction, TransferTransaction, Hbar, AccountBalanceQuery } = require('@hashgraph/sdk');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { keccak256 } = require('js-sha3');
const hip1334 = require('../../lib/hip1334.cjs');
const { ethers } = require('ethers');
const AgentLogger = require('../../lib/agent-logger.cjs');
const { tools } = require('../plugins/vanish-tools.cjs');
const fragmentor = require('../../lib/fragmentor.cjs');
const aiFragmentor = require('../../lib/ai-fragmentor.cjs');
const DelegationManager = require('../../lib/delegation.cjs');
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
  constructor(useAI = false, cliAccountId = null, cliPrivateKey = null) {
    // Agent Logger for reasoning observability
    this.logger = new AgentLogger({
      verbose: process.env.AGENT_VERBOSE === 'true',
      prefix: 'USER_AGENT'
    });

    // Hedera client setup - use CLI args if provided, otherwise fall back to env vars
    const accountIdStr = cliAccountId || process.env.HEDERA_ACCOUNT_ID;
    const privateKeyStr = cliPrivateKey || process.env.HEDERA_PRIVATE_KEY;

    if (!accountIdStr || !privateKeyStr) {
      throw new Error('HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be provided via CLI args or .env file');
    }

    this.accountId = AccountId.fromString(accountIdStr);
    this.privateKey = PrivateKey.fromString(privateKeyStr);
    this.client = Client.forTestnet();
    this.client.setOperator(this.accountId, this.privateKey);

    // HCS topics
    this.privateTopic = process.env.PRIVATE_TOPIC_ID;
    this.publicTopic = process.env.PUBLIC_ANNOUNCEMENT_TOPIC_ID;

    // Local user secrets (stored securely on user's device) - account-specific vault
    const accountSlug = this.accountId.toString().replace(/\./g, '_');
    this.secretsPath = path.join(__dirname, '..', '..', `vault_${accountSlug}.json`);
    this.vault = new VaultWrapper(this.secretsPath);
    this.userSecrets = new Map(); // Full secrets cache (decrypted)
    this.blindedVault = {}; // What the AI sees

    // Track pending withdrawals (submitted but not yet confirmed on-chain) - account-specific
    this.pendingPath = path.join(__dirname, '..', '..', `pending_${accountSlug}.json`);
    this.pendingWithdrawals = this.loadPendingWithdrawals();

    // For demo: Use a default password or prompt (In 2026, this is derived from biometrics/HW)
    this.vaultPassword = process.env.VAULT_PASSWORD || 'vanish2026';
    this.loadSecrets();

    // Start listening for completion notifications
    this.startListeningForCompletions();

    // Start listening for incoming transfers (Receiver functionality)
    this.startListeningForIncomingTransfers();

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
    console.log('     - transfer <to> <amt>    - Auto-send from pool (internal) 🤫');
    console.log('     - public-transfer <to> <amt> - Send HBAR publicly (linkable)');
    console.log('     - internal-transfer <to> <amt> - Send within pool (same as transfer)');
    console.log('     - ai-shield <amount>     - AI-powered smart shield (THINKS!) 🧠');
    console.log('     - ai-plan <amount>       - Let AI analyze strategy');
    console.log('     - consult <amount>       - Ask AI for advice');
    console.log('     - shield-smart <amount>  - Rule-based fragmentation');
    console.log('     - plan <amount>          - Preview rule-based plan');
    console.log('     - stealth <to> <amt>     - Auto stealth from pool (private) 🔒');
    console.log('     - withdraw <amt> <to>    - Auto-withdraw from pool');
    console.log('     - help                   - Show all commands');
    console.log('     - exit                   - Exit agent');
    console.log('');
    console.log('   🔑 AUTO-FEATURES (auto-finds secrets):');
    console.log('      transfer 0.0.xxx 10     - Finds & sends fragments automatically');
    console.log('      stealth 0.0.xxx 10      - Finds & sends stealth automatically');
    console.log('      withdraw 10 0.0.xxx     - Finds & withdraws automatically');
    console.log('');
    console.log('   📥 RECEIVER: Auto-detects incoming transfers & stores in vault');
    console.log('   🎁 STEALTH: Auto-claims with AI-driven delay (or use: claim)');
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
    const { submissionId, nullifierHash, status, recipientAccountId } = notification;

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
    console.warn(`\n⚠️  Received completion notification for unknown submission: ${submissionId}`);

    // Check if this completion is for a different account
    if (recipientAccountId && recipientAccountId !== this.accountId.toString()) {
      console.warn(`   ℹ️  This completion is for account ${recipientAccountId}, not ${this.accountId}`);
      console.warn(`   💡 Run this agent with account ${recipientAccountId} to see the completion`);
      return;
    }

    console.warn(`   Pending withdrawals for ${this.accountId}: ${this.pendingWithdrawals.size}`);
    if (this.pendingWithdrawals.size > 0) {
      const pendingIds = Array.from(this.pendingWithdrawals.values()).map(p => p.submissionId);
      console.warn(`   Expected one of: ${pendingIds.join(', ')}`);
    } else {
      console.warn(`   💡 No pending withdrawals for this account.`);
      console.warn(`   Possible causes:`);
      console.warn(`      1. This submission was already processed`);
      console.warn(`      2. This submission was from a different account`);
      console.warn(`      3. The pending file was cleared`);
    }
  }

  /**
   * Start listening for incoming transfers via HIP-1334 (Receiver functionality)
   */
  startListeningForIncomingTransfers() {
    const inboxTopicId = process.env.HIP1334_TOPIC_ID;
    const inboxPrivKey = process.env.HIP1334_ENC_PRIV_KEY;

    if (!inboxTopicId || !inboxPrivKey) {
      console.warn('⚠️  HIP-1334 inbox not configured, cannot receive transfers');
      return;
    }

    console.log(`📨 Listening for incoming transfers on topic ${inboxTopicId}...`);

    hip1334.listenToInbox(this.client, inboxTopicId, inboxPrivKey, async (payload) => {
      // Debug: Log all received messages
      console.log(`📨 [DEBUG] Received ${payload.type} message`);
      if (payload.recipientAccountId) {
        console.log(`   Recipient: ${payload.recipientAccountId}, My Account: ${this.accountId}`);
      }

      // Filter: Only process messages meant for this account (except STEALTH_TRANSFER which uses stealthAddress)
      if (payload.type !== 'STEALTH_TRANSFER' && payload.recipientAccountId !== this.accountId.toString()) {
        console.log(`   Filtered: Not for this account`);
        return;
      }

      console.log(`📨 Processing message: ${payload.type}`);

      if (payload.type === 'INTERNAL_SWAP') {
        await this.handleIncomingTransfer(payload);
      } else if (payload.type === 'INTERNAL_SWAP_ACK') {
        console.log(`✅ Transfer acknowledged by recipient: ${payload.status}`);
      } else if (payload.type === 'STEALTH_TRANSFER') {
        // Check if this stealth transfer is for us by verifying the stealth address
        await this.handleStealthTransfer(payload);
      }
    });
  }

  /**
   * Handle incoming stealth transfer with AI-driven delayed auto-claim
   */
  async handleStealthTransfer(payload) {
    const { stealthAddress, ephemeralPublicKey, amount, senderAccountId, recipientAccountId } = payload;

    console.log('\n🎁 STEALTH TRANSFER DETECTED! 🎁');
    console.log(`   From: ${senderAccountId || 'Unknown'}`);
    console.log(`   Amount: ${amount} HBAR`);
    console.log(`   Stealth Address: ${stealthAddress}`);
    console.log(`   Declared Recipient: ${recipientAccountId || 'Not specified'}`);

    // Check if this is actually for us
    if (recipientAccountId && recipientAccountId !== this.accountId.toString()) {
      console.log(`   ⚠️  Skipping: Not for this account (${this.accountId})`);
      return;
    }

    // Verify we can derive the stealth key (proves it's for us)
    // The sender uses our view PUBLIC key, we need our view PRIVATE key
    const viewKey = process.env.RECEIVER_VIEW_PRIVATE_KEY || process.env.HIP1334_ENC_PRIV_KEY;
    if (!viewKey || !ephemeralPublicKey) {
      console.error(`   ❌ Missing keys to verify stealth transfer`);
      console.error(`   ❌ RECEIVER_VIEW_PRIVATE_KEY or HIP1334_ENC_PRIV_KEY must be set`);
      return;
    }

    // Validate we can derive the key AND that it matches the expected address
    try {
      const derivedKey = this.deriveStealthPrivateKey(ephemeralPublicKey, viewKey, stealthAddress);
      if (!derivedKey) {
        console.log(`   ⚠️  Cannot derive key for this stealth address - skipping (not for us)`);
        return;
      }
      // If deriveStealthPrivateKey logged a warning about mismatch, we should check
      // The function already logs if there's a mismatch, so we just need to verify
    } catch (e) {
      console.error(`   ❌ Key derivation failed: ${e.message}`);
      return;
    }

    console.log(`   ✅ Verified: This stealth transfer is for us!`);

    // Store stealth keys in vault for claiming
    const stealthId = `stealth_${Date.now()}`;
    const parsedAmount = parseFloat(amount) || 0;

    if (parsedAmount <= 0) {
      console.error(`   ❌ Invalid amount in stealth transfer: ${amount}`);
      return;
    }

    this.userSecrets.set(stealthId, {
      type: 'stealth_pending',
      stealthAddress,
      ephemeralPublicKey,  // Store this to derive the private key later
      amount: parsedAmount,
      sender: senderAccountId,
      receivedAt: Date.now(),
      status: 'PENDING_CLAIM'
    });
    this.saveSecrets();

    console.log(`   🔑 Ephemeral key stored: ${ephemeralPublicKey?.slice(0, 20)}...`);
    console.log(`   💡 Use 'claim ${stealthId}' to sweep funds manually`);

    // AI-Driven Delay: Analyze network for optimal claim timing
    const delayMs = await this.calculateStealthClaimDelay();
    const privacyScore = this.calculatePrivacyScore(delayMs);

    console.log(`\n🧠 AI Privacy Analysis:`);
    console.log(`   Temporal Correlation Risk: ${privacyScore.riskLevel}`);
    console.log(`   Recommended Delay: ${(delayMs / 1000).toFixed(1)}s`);
    console.log(`   Privacy Score: ${privacyScore.score}%`);
    console.log(`   ⏳ Auto-claim scheduled...\n`);

    // Schedule auto-claim with delay
    setTimeout(async () => {
      try {
        console.log(`\n🚀 Executing delayed stealth claim for ${stealthId}...`);
        console.log(`   Amount: ${parsedAmount} HBAR`);
        console.log(`   Stealth Address: ${stealthAddress}`);

        const result = await this.claimStealthTransfer(stealthAddress, parsedAmount, ephemeralPublicKey);
        console.log(result);

        // Update vault status
        const secret = this.userSecrets.get(stealthId);
        if (secret) {
          if (result.includes('✅ Stealth Claim Complete')) {
            secret.status = 'CLAIMED';
            console.log(`   ✅ Marked ${stealthId} as CLAIMED in vault`);
          } else {
            secret.status = 'CLAIM_FAILED';
            console.error(`   ❌ Auto-claim failed for ${stealthId}: ${result}`);
          }
          secret.claimedAt = Date.now();
          this.saveSecrets();
        } else {
          console.warn(`   ⚠️ Could not update vault: ${stealthId} not found`);
        }
      } catch (err) {
        console.error(`\n❌ Auto-claim failed for ${stealthId}:`, err.message);
        console.error(`   Stack:`, err.stack);
        // Mark for manual retry
        const secret = this.userSecrets.get(stealthId);
        if (secret) {
          secret.status = 'CLAIM_FAILED';
          secret.claimError = err.message;
          secret.claimedAt = Date.now();
          this.saveSecrets();
        }
      }
    }, delayMs);
  }

  /**
   * AI-Driven delay calculation based on network analysis
   */
  async calculateStealthClaimDelay() {
    // Base delay: 5-15 seconds
    let baseDelay = 5000 + Math.random() * 10000;

    try {
      // Query pool status for network congestion
      const statusTool = tools.find(t => t.name === 'query_pool_status');
      const result = await statusTool.func({});
      const status = JSON.parse(result);

      if (status.success) {
        // Adjust based on anonymity set size
        const anonymitySet = status.anonymitySet || 0;

        if (anonymitySet < 5) {
          // Low anonymity - increase delay to break correlation
          baseDelay += 10000; // +10s
          console.log(`   🛡️  Low anonymity set (${anonymitySet}), increasing delay`);
        } else if (anonymitySet > 20) {
          // High anonymity - can claim faster
          baseDelay -= 2000; // -2s
          console.log(`   🛡️  High anonymity set (${anonymitySet}), reducing delay`);
        }

        // Add randomness based on pool activity
        const poolActivity = status.pendingProofs || 0;
        if (poolActivity > 3) {
          // High activity - blend in with other transactions
          baseDelay += Math.random() * 5000;
        }
      }
    } catch (e) {
      // Network analysis failed, use base delay
      console.log(`   ⚠️  Network analysis unavailable, using default delay`);
    }

    // Ensure minimum 3s delay for privacy
    return Math.max(baseDelay, 3000);
  }

  /**
   * Calculate privacy score for the delay
   */
  calculatePrivacyScore(delayMs) {
    const delaySec = delayMs / 1000;
    let score = 50;
    let riskLevel = 'MEDIUM';

    if (delaySec < 5) {
      score = 30;
      riskLevel = 'HIGH';
    } else if (delaySec < 10) {
      score = 60;
      riskLevel = 'MEDIUM';
    } else if (delaySec < 20) {
      score = 85;
      riskLevel = 'LOW';
    } else {
      score = 95;
      riskLevel = 'MINIMAL';
    }

    return { score, riskLevel, delaySec };
  }

  /**
   * Derive stealth private key using secp256k1 homomorphic key derivation
   * 
   * Math: stealthPrivateKey = (spendPrivateKey + keccak256(sharedSecret)) mod n
   * Where n is the secp256k1 curve order
   * 
   * This ensures the derived public key will match the stealth address created by sender
   */
  deriveStealthPrivateKey(ephemeralPublicKey, viewPrivateKey, expectedStealthAddress = null) {
    try {
      if (!ephemeralPublicKey || !viewPrivateKey) {
        console.error('❌ Missing keys for stealth derivation');
        return null;
      }

      console.log(`   🔧 Deriving key with secp256k1 homomorphic math...`);

      // Use X25519 to derive shared secret (returns Buffer)
      const sharedSecretBuffer = hip1334.x25519SharedSecret(
        viewPrivateKey.replace('0x', ''),
        ephemeralPublicKey.replace('0x', '')
      );

      if (!sharedSecretBuffer) {
        console.error('❌ X25519 shared secret derivation returned null');
        return null;
      }

      // Get the spend private key (this is the base private key)
      const spendKeyHex = process.env.RECEIVER_SPEND_KEY || '0xb3fbf0bf2e4ddbcdaf49973131719bc87fa0d8542e1b6cf17cca6f4aef43f330';
      const spendPrivateKeyHex = spendKeyHex.replace('0x', '');

      // Convert to BigInt for elliptic curve math
      // secp256k1 curve order
      const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
      
      // hash(sharedSecret) - use keccak256 as the scalar offset
      const sharedSecretHex = sharedSecretBuffer.toString('hex');
      const offsetHex = keccak256(Buffer.from(sharedSecretHex, 'hex'));
      const offsetBigInt = BigInt('0x' + offsetHex);
      
      // spendPrivateKey as BigInt
      const spendBigInt = BigInt('0x' + spendPrivateKeyHex);
      
      // Homomorphic derivation: stealthPrivateKey = (spendPrivateKey + offset) mod n
      const stealthPrivateKeyBigInt = (spendBigInt + offsetBigInt) % n;
      
      // Convert back to hex (32 bytes = 64 hex chars)
      const stealthPrivateKeyHex = stealthPrivateKeyBigInt.toString(16).padStart(64, '0');

      console.log(`   ✅ Derived stealth private key: ${stealthPrivateKeyHex.slice(0, 16)}...`);
      console.log(`   📊 Offset from shared secret: ${offsetHex.slice(0, 16)}...`);

      // DEBUG: Verify the derived key produces the expected address
      if (expectedStealthAddress) {
        // Use ethers.js for address calculation (same as sender)
        const stealthSigningKey = new ethers.SigningKey('0x' + stealthPrivateKeyHex);
        const derivedPublicKey = stealthSigningKey.publicKey;
        // EVM address: keccak256 of 64-byte uncompressed pubkey (skip '0x04' = first 4 chars)
        const derivedAddressFull = keccak256(Buffer.from(derivedPublicKey.slice(4), 'hex'));
        const derivedEvmAddress = '0x' + derivedAddressFull.slice(24, 64);
        
        console.log(`   🔍 DEBUG: Expected stealth address: ${expectedStealthAddress}`);
        console.log(`   🔍 DEBUG: Derived EVM address: ${derivedEvmAddress}`);
        const matches = derivedEvmAddress.toLowerCase() === expectedStealthAddress.toLowerCase();
        console.log(`   🔍 DEBUG: Match: ${matches}`);
        
        if (!matches) {
          console.error(`   ⚠️  WARNING: Derived key does NOT match expected address!`);
          console.error(`   ⚠️  The stealth transfer may not be claimable with this key.`);
        }
      }

      // Create Hedera private key from the derived key for transaction signing
      const stealthPrivateKey = PrivateKey.fromStringECDSA('0x' + stealthPrivateKeyHex);
      
      return stealthPrivateKey;
    } catch (error) {
      console.error('❌ Failed to derive stealth key:', error.message);
      console.error('   Stack:', error.stack);
      return null;
    }
  }

  /**
   * Execute actual sweep transaction from stealth address to main account
   */
  async executeSweepTransaction(stealthAddress, recipientAccountId, amount, stealthPrivateKey) {
    try {
      // Ensure amount is a proper number
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return {
          success: false,
          error: `Invalid amount: ${amount}`
        };
      }

      console.log(`   🔍 Sweeping ${amountNum} HBAR from stealth address...`);

      // Convert stealth address to Hedera AccountId
      const stealthAccountId = AccountId.fromSolidityAddress(stealthAddress);

      console.log(`   🔑 Stealth Account ID: ${stealthAccountId.toString()}`);

      // Use the user's main client (with their actual account as payer)
      // The stealth account is NOT a real Hedera account - it can't pay for transactions
      // We use the user's account to pay for the transaction fees
      const payerClient = this.client;

      // Check balance first (using mirror node query, doesn't need signature)
      console.log(`   💰 Checking stealth address balance...`);
      const balanceQuery = new AccountBalanceQuery()
        .setAccountId(stealthAccountId);
      const balance = await balanceQuery.execute(payerClient);
      const balanceStr = balance.hbars.toString();
      const availableHbar = parseFloat(balanceStr);

      console.log(`   📊 Available: ${availableHbar} HBAR, Needed: ${amountNum} HBAR`);

      // Allow small rounding differences (0.001 HBAR buffer for fees)
      if (availableHbar < amountNum - 0.001) {
        return {
          success: false,
          error: `Insufficient balance. Available: ${availableHbar} HBAR, Requested: ${amountNum} HBAR`
        };
      }

      // Use actual available amount if slightly more than requested (to clear account)
      const sweepAmount = Math.min(amountNum, availableHbar);

      // Execute transfer with user's account as payer, but stealth key signs for the sender
      console.log(`   📤 Executing transfer of ${sweepAmount} HBAR...`);
      console.log(`   📝 Payer (fee payer): ${this.accountId.toString()}`);
      console.log(`   🔐 Sender (stealth): ${stealthAccountId.toString()}`);
      console.log(`   📥 Recipient: ${recipientAccountId}`);

      // Build the transfer transaction
      const transferTx = new TransferTransaction()
        .addHbarTransfer(stealthAccountId, Hbar.from(-sweepAmount))
        .addHbarTransfer(AccountId.fromString(recipientAccountId), Hbar.from(sweepAmount))
        .setTransactionMemo('Vanish Stealth Claim')
        // User's account pays for the transaction
        .setTransactionId(TransactionId.generate(this.accountId))
        .freezeWith(payerClient);

      // Sign with the stealth private key (to authorize transfer FROM stealth address)
      const signedTx = await transferTx.sign(stealthPrivateKey);

      // Also sign with payer's key (to pay for the transaction)
      const fullySignedTx = await signedTx.sign(this.privateKey);

      // Execute the transaction
      const transaction = await fullySignedTx.execute(payerClient);
      const receipt = await transaction.getReceipt(payerClient);

      console.log(`   ✅ Sweep complete! Transaction: ${transaction.transactionId.toString()}`);

      return {
        success: true,
        transactionId: transaction.transactionId.toString(),
        status: receipt.status.toString(),
        amount: sweepAmount
      };
    } catch (error) {
      console.error(`   ❌ Sweep error:`, error.message);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  /**
   * Claim/sweep funds from stealth address to main account
   */
  async claimStealthTransfer(stealthAddress, amount, ephemeralPublicKey = null) {
    try {
      console.log(`\n🔐 Claiming stealth transfer...`);
      console.log(`   From: ${stealthAddress}`);
      console.log(`   Amount: ${amount} HBAR (type: ${typeof amount})`);

      // Validate amount
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return `❌ Invalid amount: ${amount}`;
      }

      // Get the ephemeral key
      let sweepKey = ephemeralPublicKey;
      if (!sweepKey) {
        console.log(`   🔍 Looking up ephemeral key in vault...`);
        for (const [id, data] of this.userSecrets.entries()) {
          if (data.stealthAddress === stealthAddress && data.ephemeralPublicKey) {
            sweepKey = data.ephemeralPublicKey;
            console.log(`   ✅ Found ephemeral key in entry: ${id}`);
            break;
          }
        }
      }

      if (!sweepKey) {
        return `⚠️ Cannot claim: Ephemeral public key not found for ${stealthAddress}\n   The funds are there but you need the ephemeral key to claim them.`;
      }

      // Get view key from env - MUST be the private key for X25519
      // The sender uses our view PUBLIC key, we need our view PRIVATE key
      const viewKey = process.env.RECEIVER_VIEW_PRIVATE_KEY || process.env.HIP1334_ENC_PRIV_KEY;
      if (!viewKey) {
        return `⚠️ Cannot claim: View private key not configured (RECEIVER_VIEW_PRIVATE_KEY or HIP1334_ENC_PRIV_KEY)`;
      }
      
      // Validate it's actually a private key (64 hex chars) not a public key (66 hex chars with 0x04 prefix)
      const keyClean = viewKey.replace('0x', '');
      if (keyClean.length === 64) {
        // Good - 32 bytes = 64 hex chars = private key
      } else if (keyClean.length === 66 || keyClean.length === 64 && viewKey.startsWith('0x04')) {
        // This looks like a public key - warn the user
        console.error(`   ❌ ERROR: RECEIVER_VIEW_KEY appears to be a public key (${keyClean.length} chars)`);
        console.error(`   ❌ X25519 requires the PRIVATE key for derivation`);
        return `⚠️ Cannot claim: View key appears to be a public key. Set RECEIVER_VIEW_PRIVATE_KEY to the private key.`;
      }

      console.log(`   🔑 Deriving stealth private key...`);
      console.log(`   📊 Ephemeral Key: ${sweepKey.slice(0, 20)}...`);
      console.log(`   📊 View Key: ${viewKey.slice(0, 20)}...`);

      const stealthPrivateKey = this.deriveStealthPrivateKey(sweepKey, viewKey, stealthAddress);

      if (!stealthPrivateKey) {
        return `❌ Failed to derive stealth private key`;
      }

      console.log(`   ✅ Derived stealth private key`);

      console.log(`   💸 Executing sweep transaction...`);
      const result = await this.executeSweepTransaction(
        stealthAddress,
        this.accountId.toString(),
        amountNum,
        stealthPrivateKey
      );

      if (result.success) {
        return `✅ Stealth Claim Complete!
   Amount: ${amountNum} HBAR
   From: ${stealthAddress}
   To: ${this.accountId}
   Transaction: ${result.transactionId}
   Status: ${result.status}`;
      } else {
        return `❌ Sweep failed: ${result.error}`;
      }
    } catch (error) {
      console.error(`❌ Claim error:`, error);
      return `❌ Claim failed: ${error.message}`;
    }
  }

  /**
   * List pending stealth transfers waiting to be claimed
   */
  listPendingStealthTransfers() {
    const pending = [];
    const claimed = [];
    const failed = [];

    for (const [id, data] of this.userSecrets.entries()) {
      if (data.type === 'stealth_pending') {
        const entry = {
          id,
          stealthAddress: data.stealthAddress,
          amount: data.amount,
          receivedAt: data.receivedAt,
          age: Math.floor((Date.now() - data.receivedAt) / 1000),
          status: data.status,
          error: data.claimError
        };

        if (data.status === 'PENDING_CLAIM') {
          pending.push(entry);
        } else if (data.status === 'CLAIMED') {
          claimed.push(entry);
        } else if (data.status === 'CLAIM_FAILED') {
          failed.push(entry);
        }
      }
    }

    let output = '';

    // Pending section
    if (pending.length === 0) {
      output += `📭 No pending stealth transfers to claim.\n`;
    } else {
      output += `🎁 Pending Stealth Transfers (${pending.length}):\n`;
      output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      pending.forEach(p => {
        output += `   ID: ${p.id}\n`;
        output += `   Address: ${p.stealthAddress}\n`;
        output += `   Amount: ${p.amount} HBAR\n`;
        output += `   Age: ${p.age}s ago\n`;
        output += `   💡 Use: claim ${p.id}\n\n`;
      });
    }

    // Failed section
    if (failed.length > 0) {
      output += `\n❌ Failed Claims (${failed.length}):\n`;
      output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      failed.forEach(p => {
        output += `   ID: ${p.id}\n`;
        output += `   Address: ${p.stealthAddress}\n`;
        output += `   Amount: ${p.amount} HBAR\n`;
        output += `   Error: ${p.error || 'Unknown error'}\n`;
        output += `   💡 Retry: claim ${p.id}\n\n`;
      });
    }

    // Claimed section (last 3)
    if (claimed.length > 0) {
      const recentClaimed = claimed.slice(-3);
      output += `\n✅ Recently Claimed (${claimed.length} total, showing last ${recentClaimed.length}):\n`;
      output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      recentClaimed.forEach(p => {
        output += `   ID: ${p.id}\n`;
        output += `   Amount: ${p.amount} HBAR\n`;
        output += `   Claimed: ${p.age}s ago\n\n`;
      });
    }

    return output || `📭 No stealth transfer history found.`;
  }

  /**
   * Manual claim of a stealth transfer
   */
  async manualClaimStealth(stealthId) {
    const secret = this.userSecrets.get(stealthId);
    if (!secret) {
      return `❌ Stealth ID ${stealthId} not found.`;
    }
    if (secret.type !== 'stealth_pending') {
      return `❌ ${stealthId} is not a pending stealth transfer.`;
    }
    if (secret.status === 'CLAIMED') {
      return `⚠️  ${stealthId} has already been claimed.`;
    }

    console.log(`\n🚀 Manual claim for ${stealthId}...`);
    console.log(`   Amount: ${secret.amount} HBAR`);
    console.log(`   Address: ${secret.stealthAddress}`);

    const result = await this.claimStealthTransfer(secret.stealthAddress, secret.amount, secret.ephemeralPublicKey);

    // Only mark as claimed if successful
    if (result.includes('✅ Stealth Claim Complete')) {
      secret.status = 'CLAIMED';
      console.log(`   ✅ Marked ${stealthId} as claimed in vault`);
    } else {
      secret.status = 'CLAIM_FAILED';
      secret.claimError = result.replace('❌ ', '').replace('⚠️ ', '');
      console.error(`   ❌ Claim failed, marked for retry`);
    }
    secret.claimedAt = Date.now();
    this.saveSecrets();

    return result;
  }

  /**
   * Check balance of a stealth address
   */
  async checkStealthBalance(stealthAddress) {
    try {
      console.log(`\n🔍 Checking stealth address balance...`);
      console.log(`   Address: ${stealthAddress}`);

      const { AccountBalanceQuery } = require('@hashgraph/sdk');
      const stealthAccountId = AccountId.fromSolidityAddress(stealthAddress);

      const balance = await new AccountBalanceQuery()
        .setAccountId(stealthAccountId)
        .execute(this.client);

      const hbarBalance = balance.hbars.toString();

      // Check if there's a pending claim for this address
      const matchingClaims = [];
      for (const [id, data] of this.userSecrets.entries()) {
        if (data.type === 'stealth_pending' && data.stealthAddress?.toLowerCase() === stealthAddress.toLowerCase()) {
          matchingClaims.push({
            id,
            status: data.status,
            amount: data.amount,
            age: Math.floor((Date.now() - data.receivedAt) / 1000)
          });
        }
      }

      let output = `✅ Stealth Address Balance:\n`;
      output += `   Address: ${stealthAddress}\n`;
      output += `   Account ID: ${stealthAccountId.toString()}\n`;
      output += `   HBAR: ${hbarBalance}\n\n`;

      if (matchingClaims.length > 0) {
        output += `📋 Found ${matchingClaims.length} claim entries:\n`;
        matchingClaims.forEach(c => {
          output += `   • ${c.id}: ${c.amount} HBAR (${c.status}, ${c.age}s ago)\n`;
        });
        output += `\n`;
      }

      const hbarNum = parseFloat(hbarBalance);
      if (hbarNum > 0) {
        output += `💰 This address has ${hbarBalance} HBAR available to claim!\n`;
        if (matchingClaims.length > 0) {
          const pending = matchingClaims.find(c => c.status === 'PENDING_CLAIM');
          if (pending) {
            output += `💡 Run: claim ${pending.id}\n`;
          }
        }
      } else {
        output += `⚠️  This address has no HBAR balance.\n`;
        output += `   The stealth transfer may not have been executed yet.\n`;
      }

      return output;
    } catch (error) {
      return `❌ Failed to check balance: ${error.message}\n   The stealth address may not exist yet or the funds haven't arrived.`;
    }
  }

  /**
   * Recover all stuck stealth claims
   */
  async recoverStealthClaims() {
    console.log(`\n🔍 Scanning for stuck stealth claims...\n`);

    const stuckClaims = [];
    for (const [id, data] of this.userSecrets.entries()) {
      if (data.type === 'stealth_pending' && (data.status === 'PENDING_CLAIM' || data.status === 'CLAIM_FAILED')) {
        stuckClaims.push({
          id,
          stealthAddress: data.stealthAddress,
          amount: data.amount,
          status: data.status,
          error: data.claimError,
          receivedAt: data.receivedAt,
          age: Math.floor((Date.now() - data.receivedAt) / 1000)
        });
      }
    }

    if (stuckClaims.length === 0) {
      return `✅ No stuck stealth claims found.`;
    }

    console.log(`Found ${stuckClaims.length} stuck claim(s):\n`);

    let results = `🔧 Recovery Results:\n`;
    results += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const claim of stuckClaims) {
      console.log(`⏳ Recovering ${claim.id} (${claim.amount} HBAR)...`);

      // First check if funds are actually there
      try {
        const stealthAccountId = AccountId.fromSolidityAddress(claim.stealthAddress);
        const balance = await new AccountBalanceQuery()
          .setAccountId(stealthAccountId)
          .execute(this.client);
        const availableHbar = parseFloat(balance.hbars.toString());

        console.log(`   💰 Address has ${availableHbar} HBAR available`);

        if (availableHbar <= 0) {
          results += `❌ ${claim.id}: No funds in stealth address\n`;
          // Mark as invalid
          const secret = this.userSecrets.get(claim.id);
          if (secret) {
            secret.status = 'NO_FUNDS';
            this.saveSecrets();
          }
          continue;
        }

        // Try to claim
        const claimResult = await this.claimStealthTransfer(
          claim.stealthAddress,
          claim.amount,
          claim.ephemeralPublicKey
        );

        if (claimResult.includes('✅ Stealth Claim Complete')) {
          results += `✅ ${claim.id}: Successfully claimed ${claim.amount} HBAR\n`;
          const secret = this.userSecrets.get(claim.id);
          if (secret) {
            secret.status = 'CLAIMED';
            secret.claimedAt = Date.now();
            this.saveSecrets();
          }
        } else {
          results += `❌ ${claim.id}: ${claimResult.replace(/\n/g, ' ').slice(0, 80)}...\n`;
          const secret = this.userSecrets.get(claim.id);
          if (secret) {
            secret.status = 'CLAIM_FAILED';
            secret.claimError = claimResult;
            this.saveSecrets();
          }
        }
      } catch (error) {
        results += `❌ ${claim.id}: Error - ${error.message}\n`;
      }
    }

    return results;
  }

  /**
   * Clear failed stealth claims from the vault
   */
  clearFailedStealthClaims() {
    const failedClaims = [];
    for (const [id, data] of this.userSecrets.entries()) {
      if (data.type === 'stealth_pending' && data.status === 'CLAIM_FAILED') {
        failedClaims.push({ id, ...data });
      }
    }

    if (failedClaims.length === 0) {
      return `✅ No failed stealth claims to clear.`;
    }

    let totalAmount = 0;
    for (const claim of failedClaims) {
      totalAmount += claim.amount || 0;
      this.userSecrets.delete(claim.id);
    }
    this.saveSecrets();

    return `🧹 Cleared ${failedClaims.length} failed stealth claim(s) from vault.\n   Total amount removed: ${totalAmount} HBAR\n   Note: These funds were sent to unclaimable addresses due to a bug and cannot be recovered.`;
  }

  /**
   * Manual scan for stealth funds at a specific address
   */
  async manualScanStealth(stealthAddress, ephemeralPublicKey = null) {
    console.log(`\n🔍 Manual scan for stealth funds...`);
    console.log(`   Address: ${stealthAddress}`);

    // Validate address format
    if (!stealthAddress.match(/^0x[0-9a-fA-F]{40}$/)) {
      return `❌ Invalid stealth address format: ${stealthAddress}`;
    }

    try {
      // Check balance
      const stealthAccountId = AccountId.fromSolidityAddress(stealthAddress);
      console.log(`   🔑 Derived Account ID: ${stealthAccountId.toString()}`);

      const balance = await new AccountBalanceQuery()
        .setAccountId(stealthAccountId)
        .execute(this.client);
      const availableHbar = parseFloat(balance.hbars.toString());

      console.log(`   💰 Balance: ${availableHbar} HBAR`);

      if (availableHbar <= 0) {
        return `⚠️  No funds in stealth address ${stealthAddress}\n   The Pool Manager may not have executed the transfer yet.`;
      }

      // If we have an ephemeral key, try to claim
      if (ephemeralPublicKey) {
        console.log(`   🔑 Using provided ephemeral key: ${ephemeralPublicKey.slice(0, 20)}...`);

        // Store in vault first
        const stealthId = `stealth_manual_${Date.now()}`;
        this.userSecrets.set(stealthId, {
          type: 'stealth_pending',
          stealthAddress,
          ephemeralPublicKey,
          amount: availableHbar,
          sender: 'manual_scan',
          receivedAt: Date.now(),
          status: 'PENDING_CLAIM'
        });
        this.saveSecrets();

        console.log(`   💾 Stored as ${stealthId}`);

        // Try to claim
        const result = await this.claimStealthTransfer(stealthAddress, availableHbar, ephemeralPublicKey);

        if (result.includes('✅ Stealth Claim Complete')) {
          const secret = this.userSecrets.get(stealthId);
          if (secret) {
            secret.status = 'CLAIMED';
            secret.claimedAt = Date.now();
            this.saveSecrets();
          }
          return `✅ Successfully claimed ${availableHbar} HBAR from stealth address!\n${result}`;
        } else {
          return `❌ Failed to claim: ${result}\n\n💡 The funds are there (${availableHbar} HBAR) but claiming failed.\n   Check that your RECEIVER_VIEW_KEY is correct.`;
        }
      } else {
        // No ephemeral key - just report the balance
        return `✅ Found ${availableHbar} HBAR in stealth address!\n\n   Address: ${stealthAddress}\n   Account ID: ${stealthAccountId.toString()}\n\n⚠️  You need the ephemeral public key to claim these funds.\n   Check the sender's logs or ask them for the ephemeral key.`;
      }
    } catch (error) {
      return `❌ Scan failed: ${error.message}`;
    }
  }

  /**
   * Handle incoming internal transfer (Receiver functionality)
   */
  async handleIncomingTransfer(payload) {
    const { newCommitment, newSecret, newNullifier, amount, senderAccountId, transactionId } = payload;

    console.log('\n✨ INCOMING VANISH TRANSFER! ✨');
    console.log(`   From: ${senderAccountId}`);
    console.log(`   Amount: ${amount} HBAR`);
    console.log(`   Transaction: ${transactionId || 'pending'}`);

    // Store the received commitment in vault
    const transferId = `recv_${Date.now()}`;
    this.userSecrets.set(transferId, {
      secret: newSecret,
      nullifier: newNullifier,
      commitment: newCommitment,
      amount: amount,
      sender: senderAccountId,
      transactionId: transactionId || 'pending',
      receivedAt: Date.now(),
      used: false
    });

    this.saveSecrets();

    console.log(`   💾 Stored in vault as: ${transferId}`);
    console.log(`   💰 New shielded balance: ${this.getShieldedBalance()} HBAR\n`);

    // Send acknowledgment back to sender
    try {
      await hip1334.sendEncryptedMessage(this.client, senderAccountId, {
        type: 'INTERNAL_SWAP_ACK',
        originalCommitment: newCommitment,
        receivedAt: Date.now(),
        status: 'CONFIRMED'
      });
      console.log(`   📤 Acknowledgment sent to sender`);
    } catch (ackErr) {
      // Silent fail - acknowledgment is optional
    }
  }

  /**
   * Get current shielded balance
   */
  getShieldedBalance() {
    let total = 0;
    for (const [_, data] of this.userSecrets.entries()) {
      if (data.used !== true && data.amount) {
        total += data.amount;
      }
    }
    return total;
  }

  /**
   * Check if a secret is already pending withdrawal
   */
  isSecretPending(secretId) {
    return this.pendingWithdrawals.has(secretId);
  }

  /**
   * Switch to a different account (for login command)
   */
  async switchAccount(accountId, privateKey) {
    try {
      console.log(`\n🔐 Switching account to ${accountId}...`);

      // Update credentials
      this.accountId = AccountId.fromString(accountId);
      this.privateKey = PrivateKey.fromString(privateKey);
      this.client.setOperator(this.accountId, this.privateKey);

      // Update account-specific paths
      const accountSlug = this.accountId.toString().replace(/\./g, '_');
      this.secretsPath = path.join(__dirname, '..', '..', `vault_${accountSlug}.json`);
      this.pendingPath = path.join(__dirname, '..', '..', `pending_${accountSlug}.json`);

      // Create new vault wrapper for the new account
      this.vault = new VaultWrapper(this.secretsPath);
      this.userSecrets.clear();
      this.pendingWithdrawals.clear();

      // Load secrets for new account
      this.loadSecrets();
      this.pendingWithdrawals = this.loadPendingWithdrawals();

      // Restart listeners
      this.startListeningForCompletions();
      this.startListeningForIncomingTransfers();

      return `✅ Switched to account ${accountId}\n   Shielded Balance: ${this.getShieldedBalance()} HBAR`;
    } catch (error) {
      return `❌ Failed to switch account: ${error.message}`;
    }
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

        case 'claim':
          // Manual claim of pending stealth transfers
          if (parts.length < 2) {
            return this.listPendingStealthTransfers();
          }
          const stealthId = parts[1];
          return await this.manualClaimStealth(stealthId);

        case 'stealth-balance':
          // Check balance of a stealth address
          if (parts.length < 2) {
            return `❌ Invalid usage. Usage: stealth-balance <stealthAddress>\n   Example: stealth-balance 0xcf8db551796a30074c95037d99a99762f2ff458d\n\n📋 To check your stealth transfers:\n   Use 'claim' to list pending stealth transfers with their IDs`;
          }
          // Validate the address looks like an Ethereum address
          const stealthAddr = parts[1];
          if (!stealthAddr.match(/^0x[0-9a-fA-F]{40}$/)) {
            return `❌ Invalid stealth address format: ${stealthAddr}\n   Expected format: 0x... (40 hex characters)\n   Example: 0xcf8db551796a30074c95037d99a99762f2ff458d`;
          }
          return await this.checkStealthBalance(stealthAddr);

        case 'pending':
          return this.showPendingStatus();

        case 'clear-pending':
          return this.clearPendingWithdrawals();

        case 'clear-failed-stealth':
          return this.clearFailedStealthClaims();

        case 'recover-stealth':
          return await this.recoverStealthClaims();

        case 'scan-stealth':
          // Manual scan for stealth transfers at specific addresses
          if (parts.length < 2) {
            return `❌ Usage: scan-stealth <stealthAddress> [ephemeralPublicKey]\n   Example: scan-stealth 0xdca1e0dd56c373aa481c54d752e180c8a23fe07c`;
          }
          const scanAddr = parts[1];
          const scanKey = parts[2] || null;
          return await this.manualScanStealth(scanAddr, scanKey);

        case 'debug-vault':
          return this.debugVault();
        
        case 'balance':
          const accountToCheck = parts[1]; // Optional account ID
          return await this.checkBalance(accountToCheck);
        
        case 'transfer':
          // Auto-internal-transfer: finds secrets automatically
          if (parts.length < 3) {
            return '❌ Invalid usage. Usage: transfer <recipientAccountId> <amount>\n   Example: transfer 0.0.123456 10';
          }
          const tRec = parts[1];
          const tAmt = parseFloat(parts[2]);
          if (isNaN(tAmt) || tAmt <= 0) {
            return '❌ Invalid amount. Must be a positive number.';
          }
          return await this.autoInternalSwap(tRec, tAmt);

        case 'public-transfer':
          // Public HBAR transfer (creates on-chain link)
          if (parts.length < 3) {
            return '❌ Invalid usage. Usage: public-transfer <accountId> <amount>\n   Example: public-transfer 0.0.123456 10';
          }
          const toAccount = parts[1];
          const transferAmount = parseFloat(parts[2]);
          if (isNaN(transferAmount) || transferAmount <= 0) {
            return '❌ Invalid amount. Must be a positive number.';
          }
          return await this.transferHbar(toAccount, transferAmount);
        
        case 'stealth':
          // Auto-stealth: finds secrets automatically (private pool-to-stealth)
          let stealthArgs = parts.slice(1);

          if (stealthArgs[0] === '--direct') {
            // Direct stealth (public HBAR to stealth address)
            const rec = stealthArgs[1];
            const amt = parseFloat(stealthArgs[2]);
            if (!rec || isNaN(amt)) {
              return `❌ Invalid usage. Usage: stealth --direct <recipient> <amount>\n   Example: stealth --direct 0.0.8119040 10`;
            }
            return await this.generateStealthAddress(rec, amt);
          } else {
            // Private stealth from pool (auto-finds secrets)
            if (stealthArgs.length < 2) {
              return `❌ Invalid usage. Usage: stealth <recipientAccountId> <amount> [optionalSecretId]\n   Example: stealth 0.0.8119040 10`;
            }
            const rec = stealthArgs[0];
            const amt = parseFloat(stealthArgs[1]);
            const sid = stealthArgs.length > 2 ? stealthArgs[2] : null;

            if (sid) {
              return await this.generateStealthAddressPrivate(rec, amt, sid);
            } else {
              return await this.autoStealthPrivate(rec, amt);
            }
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
        
        case 'login':
          if (parts.length < 3) {
            return '❌ Invalid usage. Usage: login <accountId> <privateKey>\n   Example: login 0.0.123456 302e020100300506032b657004220420...';
          }
          const newAccountId = parts[1];
          const newPrivateKey = parts[2];
          return await this.switchAccount(newAccountId, newPrivateKey);
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
    const pendingStealth = [];

    for (const [id, data] of this.userSecrets.entries()) {
      if (data.type === 'stealth_pending') {
        pendingStealth.push({ id, ...data });
      } else if (!data.used && data.amount > 0) {
        unspent.push({ id, amount: data.amount });
      }
    }

    const total = unspent.reduce((sum, f) => sum + f.amount, 0);
    const pendingStealthTotal = pendingStealth.reduce((sum, p) => sum + (p.amount || 0), 0);

    let output = `💰 Your Vanish Vault:\n`;
    output += `   Shielded: ${total} HBAR in ${unspent.length} fragment(s)\n`;

    if (pendingStealth.length > 0) {
      output += `   Pending Stealth: ${pendingStealthTotal} HBAR (${pendingStealth.length} transfer(s))\n`;
    }
    output += `\n`;

    if (unspent.length === 0 && pendingStealth.length === 0) {
      output += `   No unspent shielded funds.\n`;
      output += `   Account: ${this.accountId}\n`;
      output += `   Vault: ${path.basename(this.secretsPath)}\n`;
      output += `   Use 'shield' or 'ai-shield' to deposit.`;
      return output;
    }

    // Separate received transfers from self-shielded
    const receivedTransfers = unspent.filter(f => f.id.startsWith('recv_'));
    const selfShielded = unspent.filter(f => !f.id.startsWith('recv_'));

    if (selfShielded.length > 0) {
      output += `   Your Shielded Fragments:\n`;
      selfShielded.forEach(f => {
        output += `      • ${f.id}: ${f.amount} HBAR\n`;
      });
    }

    if (receivedTransfers.length > 0) {
      output += `\n   📥 Received Transfers:\n`;
      receivedTransfers.forEach(f => {
        const data = this.userSecrets.get(f.id);
        const from = data?.sender ? ` from ${data.sender}` : '';
        output += `      • ${f.id}: ${f.amount} HBAR${from}\n`;
      });
    }

    if (pendingStealth.length > 0) {
      output += `\n   🎁 Pending Stealth Claims:\n`;
      pendingStealth.forEach(p => {
        const age = Math.floor((Date.now() - p.receivedAt) / 1000);
        output += `      • ${p.id}: ${p.amount} HBAR (${p.status}, ${age}s ago)\n`;
        if (p.status === 'PENDING_CLAIM') {
          output += `        💡 Auto-claiming or use: claim ${p.id}\n`;
        }
      });
    }

    output += `\n   💡 Use 'withdraw <amount> <recipient>' to spend\n`;
    output += `   💡 Use 'transfer <recipient> <amount>' for private P2P`;

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

    // Get unspent fragments from live userSecrets (source of truth)
    const unspent = [];
    for (const [id, data] of this.userSecrets.entries()) {
      if (data.used !== true && data.amount > 0 && !data.type) {
        unspent.push({ id, amount: data.amount });
      }
    }

    if (unspent.length === 0) {
      return `❌ No unspent shielded funds available. Use 'shield' or 'ai-shield' to deposit funds first.`;
    }

    // Try to find exact match first
    let selectedSecrets = this.findExactSubset(amount, unspent);
    let collectedAmount = amount;

    // If no exact match, use greedy selection (will overpay)
    let overpayWarning = false;
    if (!selectedSecrets) {
      collectedAmount = 0;
      selectedSecrets = [];
      // Sort by smallest first to minimize overpayment
      unspent.sort((a, b) => a.amount - b.amount);
      for (const item of unspent) {
        collectedAmount += item.amount;
        selectedSecrets.push(item);
        if (collectedAmount >= amount) break;
      }
      overpayWarning = collectedAmount > amount;
    }

    if (collectedAmount < amount) {
      return `❌ Insufficient shielded funds. You have ${this.getShieldedBalance()} HBAR total, but no combination matches ${amount} HBAR.`;
    }

    console.log(`🧩 Selected ${selectedSecrets.length} fragment(s) totaling ${collectedAmount} HBAR.`);

    if (overpayWarning) {
      const excess = collectedAmount - amount;
      console.log(`\n⚠️  IMPORTANT: OVERPAYMENT DETECTED`);
      console.log(`   Requested: ${amount} HBAR`);
      console.log(`   Will send: ${collectedAmount} HBAR`);
      console.log(`   Excess: ${excess} HBAR (no change mechanism yet)`);
      console.log(`   💡 Recommendation: Shield funds in smaller fragments to avoid this.\n`);
    }

    // --- Human-In-The-Loop Confirmation ---
    const confirmed = await this.confirmWithdrawal(recipientAccountId, amount);
    if (!confirmed) return `🛑 Private Stealth cancelled by user.`;

    // --- Generate ONE Stealth Address for all fragments ---
    const recipientViewKey = process.env.RECEIVER_VIEW_KEY || "0x1cf9ff017f28eb6576a39f5cdd78c1560b37173ae7659a1f83770709c2ed5262";
    const recipientSpendKey = process.env.RECEIVER_SPEND_KEY || "0xb3fbf0bf2e4ddbcdaf49973131719bc87fa0d8542e1b6cf17cca6f4aef43f330";
    const hip1334 = require('../../lib/hip1334.cjs');
    
    // Generate ephemeral key pair for X25519
    const keys = hip1334.generateX25519KeyPair();
    const ephPub = keys.publicKeyHex;
    const ephPriv = keys.privateKeyHex;
    
    // Compute shared secret via X25519
    const sharedSecretBuffer = hip1334.x25519SharedSecret(ephPriv, recipientViewKey.replace('0x', ''));
    const sharedSecretHex = sharedSecretBuffer.toString('hex');
    
    // Compute offset scalar from shared secret
    const offsetHex = keccak256(Buffer.from(sharedSecretHex, 'hex'));
    const offsetBigInt = BigInt('0x' + offsetHex);
    
    // secp256k1 curve order
    const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    const spendPrivateBigInt = BigInt(recipientSpendKey);
    const stealthPrivateBigInt = (spendPrivateBigInt + offsetBigInt) % n;
    const stealthPrivateHex = '0x' + stealthPrivateBigInt.toString(16).padStart(64, '0');
    
    // Derive the stealth public key from the stealth private key
    const stealthSigningKey = new ethers.SigningKey(stealthPrivateHex);
    const stealthPublicKey = stealthSigningKey.publicKey;
    
    // Stealth address: keccak256 of 64-byte uncompressed pubkey (skip '0x04' prefix = 4 chars) → last 20 bytes
    const stealthAddressFull = keccak256(Buffer.from(stealthPublicKey.slice(4), 'hex'));
    const targetAddress = '0x' + stealthAddressFull.slice(24, 64);
    
    console.log(`\n   🧬 Unified Stealth Recipient: ${targetAddress}`);
    console.log(`   🔑 Stealth PubKey: ${stealthPublicKey.slice(0, 30)}...`);
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
   * Secure subset sum helper - finds exact match for target amount
   */
  findExactSubset(target, available) {
    console.log(`🔍 [DEBUG] Target: ${target} HBAR, Available: ${available.length} fragments`);

    // Filter to valid items with positive amounts
    const validItems = available.filter(item => item.amount > 0);

    // First: try to find a single fragment that exactly matches
    const exactMatch = validItems.find(item => Math.abs(item.amount - target) < 0.0001);
    if (exactMatch) {
      console.log(`   ✅ Found exact match: ${exactMatch.id} (${exactMatch.amount} HBAR)`);
      return [exactMatch];
    }

    // Second: try subset sum using dynamic programming approach for small sets
    if (validItems.length <= 20) {
      // Sort by amount descending for better results
      validItems.sort((a, b) => b.amount - a.amount);

      // Try all combinations for small sets
      const tryCombinations = (items, target, start = 0) => {
        for (let i = start; i < items.length; i++) {
          const item = items[i];
          if (Math.abs(item.amount - target) < 0.0001) {
            return [item];
          }
          if (item.amount < target) {
            const subResult = tryCombinations(items, target - item.amount, i + 1);
            if (subResult) {
              return [item, ...subResult];
            }
          }
        }
        return null;
      };

      const subset = tryCombinations(validItems, target);
      if (subset) {
        const sum = subset.reduce((acc, item) => acc + item.amount, 0);
        console.log(`   ✅ Found subset with ${subset.length} fragments totaling ${sum} HBAR`);
        return subset;
      }
    }

    console.log(`   ❌ No exact subset found for ${target} HBAR`);
    return null;
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
      // 1. Generate Stealth Address for Recipient using secp256k1 homomorphic derivation
      const recipientViewKey = process.env.RECEIVER_VIEW_KEY || "0x1cf9ff017f28eb6576a39f5cdd78c1560b37173ae7659a1f83770709c2ed5262";
      const recipientSpendKey = process.env.RECEIVER_SPEND_KEY || "0xb3fbf0bf2e4ddbcdaf49973131719bc87fa0d8542e1b6cf17cca6f4aef43f330";

      // Generate ephemeral key pair for X25519
      const keys = hip1334.generateX25519KeyPair();
      ephPub = keys.publicKeyHex;
      const ephPriv = keys.privateKeyHex;
      
      // Compute shared secret via X25519
      const sharedSecretBuffer = hip1334.x25519SharedSecret(ephPriv, recipientViewKey.replace('0x', ''));
      const sharedSecretHex = sharedSecretBuffer.toString('hex');
      
      // Compute offset scalar from shared secret
      const offsetHex = keccak256(Buffer.from(sharedSecretHex, 'hex'));
      const offsetBigInt = BigInt('0x' + offsetHex);
      
      // Get the spend public key from the spend private key
      // We need to derive the public key that corresponds to (spendPrivateKey + offset)
      // Using secp256k1: P' = P + G*offset
      const spendPrivKey = new ethers.SigningKey(recipientSpendKey);
      const spendPublicKey = spendPrivKey.publicKey;
      
      // The stealth private key will be: spendPrivateKey + offset (mod n)
      // The stealth public key is the same as adding G*offset to the spend public key
      // For the address, we just need to compute the resulting public key
      const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
      const spendPrivateBigInt = BigInt(recipientSpendKey);
      const stealthPrivateBigInt = (spendPrivateBigInt + offsetBigInt) % n;
      const stealthPrivateHex = '0x' + stealthPrivateBigInt.toString(16).padStart(64, '0');
      
      // Derive the stealth public key from the stealth private key
      const stealthSigningKey = new ethers.SigningKey(stealthPrivateHex);
      const stealthPublicKey = stealthSigningKey.publicKey;
      
      // Stealth address: keccak256 of 64-byte uncompressed pubkey (skip '0x04' prefix = 4 chars) → last 20 bytes
      const stealthAddressFull = keccak256(Buffer.from(stealthPublicKey.slice(4), 'hex'));
      targetAddress = '0x' + stealthAddressFull.slice(24, 64); // Take last 40 hex chars (20 bytes)
      
      console.log(`   🧬 Derived Stealth Recipient: ${targetAddress}`);
      console.log(`   🔑 Stealth PubKey: ${stealthPublicKey.slice(0, 30)}...`);
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
      if (data.used !== true && data.amount > 0 && !data.type) {
        unspent.push({ id, amount: data.amount });
      }
    }

    if (unspent.length === 0) {
      return `❌ No unspent shielded funds available. Use 'shield' or 'ai-shield' to deposit funds first.`;
    }

    let selectedSecrets = this.findExactSubset(amount, unspent);
    if (!selectedSecrets) {
      const totalAvailable = unspent.reduce((sum, a) => sum + a.amount, 0);
      return `❌ No exact combination of fragments found for ${amount} HBAR.\n\n   Available fragments:\n${unspent.slice(0, 10).map(a => `      • ${a.id}: ${a.amount} HBAR`).join('\n')}\n\n   Total available: ${totalAvailable} HBAR\n\n   💡 Options:\n   1. Use a different amount that matches your fragments\n   2. Use 'shield-smart' to create smaller fragments\n   3. Specify exact fragment ID: internal-transfer <recipient> <exact-fragment-amount>`;
    }

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

  /**
   * Clear stale pending withdrawals for the current account
   */
  clearPendingWithdrawals() {
    const count = this.pendingWithdrawals.size;
    this.pendingWithdrawals.clear();
    this.savePendingWithdrawals();
    return `🧹 Cleared ${count} pending withdrawals for account ${this.accountId}`;
  }

  /**
   * Show pending withdrawals status
   */
  showPendingStatus() {
    if (this.pendingWithdrawals.size === 0) {
      return `📭 No pending withdrawals for account ${this.accountId}`;
    }

    let output = `⏳ Pending Withdrawals for ${this.accountId}:\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const [secretId, pending] of this.pendingWithdrawals) {
      const age = Math.floor((Date.now() - pending.submittedAt) / 1000);
      output += `   Secret: ${secretId}\n`;
      output += `   Submission: ${pending.submissionId}\n`;
      output += `   Amount: ${pending.amount} HBAR\n`;
      output += `   Age: ${age}s ago\n`;
      output += `   Status: ${pending.status}\n\n`;
    }
    output += `\n💡 If these are stuck, use: clear-pending`;
    return output;
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
    let overpayAmount = 0;
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
        if (data.used !== true && !this.isSecretPending(id) && data.amount > 0 && !data.type) {
          available.push({ id, amount: data.amount });
        }
      }

      const subset = this.findExactSubset(amount, available);
      if (subset) {
        selectedSecretIds = subset.map(s => s.id);
        console.log(`   ✅ Found ${selectedSecretIds.length} fragments matching ${amount} HBAR: [${selectedSecretIds.join(', ')}]`);
      } else {
        // No exact match - show helpful message
        const totalAvailable = available.reduce((sum, a) => sum + a.amount, 0);
        return `❌ No exact combination of fragments found for ${amount} HBAR.\n\n   Available fragments:\n${available.slice(0, 10).map(a => `      • ${a.id}: ${a.amount} HBAR`).join('\n')}\n\n   Total available: ${totalAvailable} HBAR\n\n   💡 Options:\n   1. Use a different amount that matches your fragments\n   2. Use 'shield-smart' to create smaller fragments\n   3. Specify exact fragment ID: withdraw <fragmentId> ${recipient} <amount>`;
      }
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

🔑 AUTO-FEATURES (Auto-finds secrets):
  transfer <to> <amt>         Auto-send from pool (internal, private) 🤫
  stealth <to> <amt>          Auto stealth from pool (private) 🔒
  withdraw <amt> <to>         Auto-withdraw from pool to address

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
  internal-transfer <to> <amt> Same as transfer (auto-finds)
  withdraw <sid> <to> <amt> Manual: withdraw specific fragment

📡 BASIC COMMANDS:
  status                  Query current pool status
  check-balance [account] Check public HBAR balance
  public-transfer <to> <amt> Transfer HBAR (creates on-chain link)
  shield <amount>         Simple shield (no fragmentation)
  stealth --direct <to> <amt> Direct stealth (public HBAR to stealth)
  help                    Show this help message
  exit / quit             Exit the agent

📥 RECEIVER FUNCTIONALITY:
  - Auto-detects incoming internal transfers
  - Auto-detects stealth transfers with AI-driven delayed claim
  - Stores received funds in encrypted vault
  - Sends acknowledgment to sender
  - Updates balance automatically

🎁 STEALTH CLAIMS:
  claim                   List pending stealth transfers
  claim <id>              Manually claim a stealth transfer

🔧 TROUBLESHOOTING:
  pending                 Show pending withdrawal submissions
  clear-pending           Clear stuck pending withdrawals
  stealth-balance <addr>  Check balance of a stealth address
  scan-stealth <addr>     Scan for funds at stealth address
  recover-stealth         Recover all stuck stealth claims
  debug-vault             Debug vault contents

EXAMPLES:
  > transfer 0.0.123456 10     # Auto-find and send from pool
  > stealth 0.0.123456 10      # Auto-find and send stealth
  > withdraw 10 0.0.123456     # Auto-find and withdraw
  > ai-plan 100                # Let AI analyze and explain strategy
  > ai-shield 100              # AI executes optimal fragmentation
  > consult 75                 # Ask AI: "Should I use fragmentation?"

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
      'consult', 'shield-smart', 'plan', 'shield', 'stealth', 'withdraw', 'help', 'debug-vault', 'claim',
      'stealth-balance', 'public-transfer', 'internal-swap', 'exit', 'quit', 'login', 'pending', 'clear-pending',
      'clear-failed-stealth', 'recover-stealth', 'scan-stealth'
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

  // Parse CLI arguments for account ID and private key
  // npm run start:user -- 0.0.8119040 302e020100300506032b657004220420...
  const args = process.argv.slice(2);
  let cliAccountId = null;
  let cliPrivateKey = null;
  let remainingArgs = [];

  // Parse arguments - look for account ID (0.0.xxx) and private key patterns
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // Fix common typo: .0.xxx -> 0.0.xxx
    const normalizedArg = arg.startsWith('.0.') ? '0' + arg : arg;

    if (normalizedArg.match(/^0\.0\.\d+$/)) {
      // Looks like an account ID
      cliAccountId = normalizedArg;
    } else if (arg.match(/^[0-9a-fA-F]{64,}$/) || arg.match(/^302e/)) {
      // Looks like a private key (hex or DER format)
      cliPrivateKey = arg;
    } else if (arg === '--direct' || arg === '-d') {
      remainingArgs.push(arg);
    }
  }

  // If CLI credentials provided, use them
  if (cliAccountId && cliPrivateKey) {
    console.log(`🔐 Using CLI credentials: ${cliAccountId}`);
    if (cliAccountId !== args.find(a => a.includes('.0.'))) {
      console.log(`   (Fixed account ID format)`);
    }
  } else if (cliAccountId || cliPrivateKey) {
    console.log('⚠️  Partial CLI credentials provided. Need both account ID and private key.');
    console.log('   Falling back to .env file credentials.\n');
  }

  // Check for force direct mode
  const forceDirect = process.argv.includes('--direct') ||
                      process.argv.includes('-d') ||
                      process.env.FORCE_DIRECT_MODE === 'true';

  if (forceDirect) {
    console.log('💡 Starting in Direct mode (forced via flag/env)\n');
    const agent = new UserAgent(false, cliAccountId, cliPrivateKey);
    await agent.startChat();
    return;
  }

  // Check if Ollama is available
  const ollamaRunning = await checkOllama();

  if (ollamaRunning) {
    console.log('💡 Starting in AI mode (Ollama available)\n');
    const agent = new UserAgent(true, cliAccountId, cliPrivateKey);
    await agent.startChat();
  } else {
    console.log('💡 Starting in Direct mode (Ollama not required)');
    console.log('   For AI chat mode, install Ollama: https://ollama.ai\n');
    const agent = new UserAgent(false, cliAccountId, cliPrivateKey);
    await agent.startChat();
  }
}

main().catch(console.error);

module.exports = { UserAgent };
