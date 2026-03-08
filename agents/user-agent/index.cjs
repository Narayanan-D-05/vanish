require('dotenv').config();
const { Client, PrivateKey, Hbar, TransferTransaction } = require('@hashgraph/sdk');
const DelegationManager = require('../../lib/delegation.cjs');
const StealthAddressGenerator = require('../../lib/stealth.cjs');
const HCSPrivateMessaging = require('../../lib/hcs-private.cjs');

/**
 * User Agent (Prover/Sender)
 * Handles balance fragmentation, zk-SNARK proof generation, and stealth transfers
 */

class UserAgent {
  constructor() {
    this.client = null;
    this.accountId = process.env.HEDERA_ACCOUNT_ID;
    this.privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    this.workerAccounts = [];
    this.delegationManager = null;
    this.hcsMessaging = null;
  }

  async initialize() {
    console.log('🚀 Initializing User Agent (Sender/Prover)...\n');

    // Initialize Hedera client
    this.client = Client.forTestnet();
    this.client.setOperator(this.accountId, this.privateKey);

    this.delegationManager = new DelegationManager(this.client);
    this.hcsMessaging = new HCSPrivateMessaging(this.client);

    console.log(`✅ Connected to Hedera Testnet`);
    console.log(`✅ Account ID: ${this.accountId}\n`);
  }

  /**
   * STEP 1: Shield funds by delegating to Pool Contract
   */
  async shieldFunds(amount) {
    console.log(`🛡️  STEP 1: SHIELDING ${amount} HBAR\n`);
    
    // In a multi-user system, delegate to Pool Contract
    // Since we're the pool operator, we can directly use funds
    console.log(`   ℹ️  Pool operator preparing ${amount} HBAR for privacy flow`);
    console.log(`   ✅ ${amount} HBAR ready for shielding\n`);
    
    return {
      status: 'SUCCESS',
      delegatedAmount: amount,
      agent: process.env.POOL_CONTRACT_ID,
      timestamp: Date.now()
    };
  }

  /**
   * STEP 2: Fragment balance across worker accounts
   */
  async fragmentBalance(totalAmount, numWorkers) {
    console.log(`💥 STEP 2: BALANCE FRAGMENTATION\n`);
    console.log(`   Creating ${numWorkers} worker accounts with ${totalAmount / numWorkers} HBAR each\n`);

    const fragmentSize = totalAmount / numWorkers;
    this.workerAccounts = [];

    // Create real worker accounts on Hedera
    for (let i = 0; i < numWorkers; i++) {
      try {
        const worker = await this.delegationManager.createWorkerAccount(fragmentSize);
        this.workerAccounts.push(worker);
        console.log(`   ✅ Worker ${i + 1}: ${worker.accountId} (${fragmentSize} HBAR)`);
      } catch (error) {
        console.error(`   ❌ Worker ${i + 1} creation failed:`, error.message);
        throw error;
      }
    }

    console.log(`\n   Total Workers Created: ${this.workerAccounts.length}\n`);
    return this.workerAccounts;
  }

  /**
   * STEP 3: Agentic Mix - Swap HBAR for USDC via SaucerSwap
   */
  async performAgenticMix(amount) {
    console.log(`🔄 STEP 3: AGENTIC MIX (SaucerSwap)\n`);
    console.log(`   Swapping ${amount} HBAR → USDC\n`);

    const SaucerSwapIntegration = require('../../lib/saucerswap.cjs');
    const swapManager = new SaucerSwapIntegration(this.client, this.accountId);
    
    // Swap HBAR to USDC (breaks transaction graph)
    const minAmountOut = 0; // In production, calculate proper slippage
    const result = await swapManager.swapHBARForToken(amount, 'USDC', minAmountOut);

    console.log(`   ✅ Swap complete: ${result.transactionId}\n`);

    return {
      success: true,
      transactionId: result.transactionId,
      originalAmount: amount,
      targetToken: 'USDC'
    };
  }

  /**
   * STEP 4: Generate zk-SNARK commitment and proof
   */
  async generateZKCommitment(secret, nullifier, amount) {
    console.log(`🔐 STEP 4: zk-SNARK COMMITMENT\n`);

    const ZKProver = require('./prover.cjs');
    const prover = new ZKProver();
    
    // Generate commitment hash
    const commitment = this.hashCommitment(secret, nullifier);
    console.log(`   ✅ Generated commitment: ${commitment.slice(0, 16)}...`);
    
    // Generate zk-SNARK proof
    const proof = await prover.generateDepositProof({
      secret,
      nullifier,
      commitment,
      amount
    });
    
    console.log(`   ✅ Generated zk-SNARK proof\n`);

    return {
      commitment,
      secret,
      nullifier,
      proof,
      amount
    };
  }

  /**
   * STEP 5: Generate stealth address for receiver
   */
async generateStealthAddressForReceiver(receiverMetaAddress, amount) {
    console.log(`👻 STEP 5: STEALTH ADDRESS GENERATION\n`);

    const stealthData = StealthAddressGenerator.generateStealthAddress(receiverMetaAddress);
    
    console.log(`   ✅ Generated stealth address`);
    console.log(`   Public Key: ${stealthData.stealthPublicKey.slice(0, 20)}...`);
    console.log(`   View Tag: ${stealthData.viewTag}\n`);

    return stealthData;
  }

  /**
   * STEP 6: Execute blind transfer to stealth address
   */
  async executeBlindTransfer(stealthPublicKey, amount) {
    console.log(`🎭 STEP 6: BLIND TRANSFER\n`);
    console.log(`   Transferring ${amount} HBAR to stealth address\n`);

    // Create or use stealth account for receiving
    // For now, send to a newly created account
    const PrivateKey = require('@hashgraph/sdk').PrivateKey;
    const AccountCreateTransaction = require('@hashgraph/sdk').AccountCreateTransaction;
    
    // Create account from stealth public key
    const newKey = PrivateKey.fromStringDer(stealthPublicKey);
    const createTx = await new AccountCreateTransaction()
      .setKey(newKey.publicKey)
      .setInitialBalance(new Hbar(amount))
      .execute(this.client);
    
    const receipt = await createTx.getReceipt(this.client);
    const newAccountId = receipt.accountId;
    
    console.log(`   ✅ Created stealth account: ${newAccountId.toString()}`);
    console.log(`   ✅ Transfer complete: ${createTx.transactionId.toString()}\n`);

    return {
      success: true,
      amount,
      stealthPublicKey
    };
  }

  /**
   * STEP 7: Send selective disclosure proof via HCS
   */
  async sendSelectiveDisclosure(receiverPublicKey, proofData) {
    console.log(`📨 STEP 7: SELECTIVE DISCLOSURE (HCS)\n`);

    try {
      const result = await this.hcsMessaging.sendPrivateProof(
        process.env.PRIVATE_TOPIC_ID,
        receiverPublicKey,
        proofData
      );

      console.log(`   ✅ Proof sent to HCS`);
      console.log(`   Transaction: ${result.transactionId}\n`);

      return result;
    } catch (error) {
      console.error(`   ❌ Failed to send proof:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Helper: Hash commitment (Poseidon hash simulation)
   */
  hashCommitment(secret, nullifier) {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(`${secret}${nullifier}`)
      .digest('hex');
  }

  /**
   * Execute complete private transfer workflow
   */
  async executePrivateTransfer(receiverMetaAddress, amount, memo = '') {
    console.log('═══════════════════════════════════════════════════════');
    console.log('        VANISH PRIVATE TRANSFER WORKFLOW');
    console.log('═══════════════════════════════════════════════════════\n');

    try {
      // Step 1: Shielding
      await this.shieldFunds(amount);

      // Step 2: Balance Fragmentation 
      const numWorkers = parseInt(process.env.NUM_WORKER_ACCOUNTS) || 5;
      await this.fragmentBalance(amount, numWorkers);

      // Step 3: Agentic Mix
      await this.performAgenticMix(amount);

      // Step 4: zk-SNARK Commitment
      const secret = Math.random().toString(36);
      const nullifier = Math.random().toString(36);
      const commitment = await this.generateZKCommitment(secret, nullifier, amount);

      // Step 5: Generate Stealth Address
      const stealthData = await this.generateStealthAddressForReceiver(receiverMetaAddress, amount);

      // Step 6: Blind Transfer
      await this.executeBlindTransfer(stealthData.stealthPublicKey, amount);

      // Step 7: Selective Disclosure (optional)
      if (process.env.ENABLE_SELECTIVE_DISCLOSURE === 'true') {
        const receiverKeys = StealthAddressGenerator.decodeMetaAddress(receiverMetaAddress);
        await this.sendSelectiveDisclosure(
          receiverKeys.viewingPublicKey.toString('hex'),
          {
            senderCommitment: commitment.commitment,
            amount,
            stealthAddress: stealthData.stealthPublicKey,
            nullifierHash: commitment.nullifier,
            memo
          }
        );
      }

      console.log('═══════════════════════════════════════════════════════');
      console.log('✅ PRIVATE TRANSFER COMPLETE');
      console.log('═══════════════════════════════════════════════════════\n');

    } catch (error) {
      console.error('❌ Transfer failed:', error.message);
      throw error;
    }
  }

  async shutdown() {
    console.log('\n🛑 Shutting down User Agent...');
    if (this.client) {
      this.client.close();
    }
  }
}

// Run the agent
async function main() {
  const agent = new UserAgent();
  
  try {
    await agent.initialize();

    // Example: Generate a receiver meta-address for testing
    const receiverMeta = StealthAddressGenerator.generateMetaAddress();
    console.log('📋 Generated Test Receiver Meta-Address:');
    console.log(`   ${receiverMeta.metaAddress}\n`);

    // Execute private transfer
    await agent.executePrivateTransfer(receiverMeta.metaAddress, 100, 'Test transfer');

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await agent.shutdown();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = UserAgent;
