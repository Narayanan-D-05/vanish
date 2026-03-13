/**
 * Vanish Pool Manager - Autonomous Privacy Coordinator (2026)
 * 
 * RESPONSIBILITIES:
 * 1. Collect ZK-proofs from User Agents via HCS
 * 2. Implement hybrid batching: Min 5 proofs OR 30 minutes
 * 3. Add random 5-15 minute delay to prevent timing attacks
 * 4. Verify proofs and submit batch to Hedera
 * 5. Log anonymized commitments to HCS for audit trail
 * 
 * SECURITY MODEL:
 * - Does NOT have access to user secrets
 * - Only verifies mathematical correctness of proofs
 * - Uses HIP-1340 delegation to execute swaps on behalf of pool contract
 */

require('dotenv').config();
const { Client, PrivateKey, AccountId, TopicMessageSubmitTransaction, TopicMessageQuery } = require('@hashgraph/sdk');
const snarkjs = require('snarkjs');
const fs = require('fs').promises;
const path = require('path');
const { keccak256 } = require('ethers');
const DelegationManager = require('../../lib/delegation.cjs');
const hip1334 = require('../../lib/hip1334.cjs');

class PoolManager {
  constructor() {
    // Hedera client setup
    this.accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    this.privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    this.client = Client.forTestnet();
    this.client.setOperator(this.accountId, this.privateKey);
    
    // HCS topic for receiving proof submissions
    this.privateTopic = process.env.PRIVATE_TOPIC_ID;
    this.publicTopic = process.env.PUBLIC_ANNOUNCEMENT_TOPIC_ID;
    
    // Batching configuration (DEMO MODE - reduced delays)
    this.proofQueue = [];
    this.MIN_BATCH_SIZE = 2;          // Minimum anonymity set (reduced for demo)
    this.MAX_WAIT_TIME = 2 * 60 * 1000;  // 2 minutes in ms (reduced for demo)
    this.MIN_RANDOM_DELAY = 10 * 1000;  // 10 seconds (reduced for demo)
    this.MAX_RANDOM_DELAY = 30 * 1000;  // 30 seconds (reduced for demo)
    
    // Timing tracking
    this.firstProofTimestamp = null;
    this.batchScheduled = false;
    
    // Load verification keys
    this.loadVerificationKeys();
    
    console.log('🔒 Pool Manager initialized (DEMO MODE)');
    console.log(`   Account: ${this.accountId}`);
    console.log(`   Batching: Min ${this.MIN_BATCH_SIZE} proofs OR ${this.MAX_WAIT_TIME / 60000} minutes`);
    console.log(`   Random delay: ${this.MIN_RANDOM_DELAY / 1000}-${this.MAX_RANDOM_DELAY / 1000} seconds`);
  }
  
  async loadVerificationKeys() {
    try {
      const shieldVkJson = await fs.readFile(
        path.join(__dirname, '../../circuits/shield_verification_key.json'),
        'utf8'
      );
      this.shieldVK = JSON.parse(shieldVkJson);
      
      const withdrawVkJson = await fs.readFile(
        path.join(__dirname, '../../circuits/withdraw_verification_key.json'),
        'utf8'
      );
      this.withdrawVK = JSON.parse(withdrawVkJson);
      
      console.log('✅ Verification keys loaded');
    } catch (error) {
      console.error('❌ Failed to load verification keys:', error.message);
      process.exit(1);
    }
  }
  
  /**
   * Verify ZK-SNARK proof mathematically
   */
  async verifyProof(proof, publicSignals, proofType) {
    try {
      const vKey = proofType === 'shield' ? this.shieldVK : this.withdrawVK;
      
      const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
      
      if (isValid) {
        console.log(`✓ ${proofType} proof is mathematically valid`);
      } else {
        console.log(`✗ ${proofType} proof verification FAILED`);
      }
      
      return isValid;
      
    } catch (error) {
      console.error(`❌ Proof verification error: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Add proof to queue and trigger batching logic
   */
  async addProofToQueue(proofData) {
    // Verify proof before adding to queue
    const isValid = await this.verifyProof(
      proofData.proof,
      proofData.publicSignals,
      proofData.proofType
    );
    
    if (!isValid) {
      console.log('❌ Rejected invalid proof');
      return false;
    }
    
    // HIP-1340: Pull funds from submitter's account to pool contract
    if (proofData.submitter && process.env.POOL_CONTRACT_ID) {
      try {
        const delegation = new DelegationManager(this.client);
        const receipt = await delegation.executeDelegatedTransfer(
          proofData.submitter,
          process.env.POOL_CONTRACT_ID,
          proofData.amount
        );
        console.log(`   💸 HIP-1340 pull: ${proofData.amount} HBAR from ${proofData.submitter} → Pool Contract`);
        console.log(`   Tx: ${receipt.transactionId}`);
      } catch (err) {
        console.error(`   ⚠️  Fund pull failed: ${err.message}`);
        // Still queue the proof — don't block if transfer fails in demo
      }
    }
    
    // Add to queue
    this.proofQueue.push({
      ...proofData,
      timestamp: Date.now(),
      submissionId: proofData.submissionId || Math.random().toString(36).slice(2)
    });
    
    console.log(`📥 Proof added to queue (${this.proofQueue.length}/${this.MIN_BATCH_SIZE})`);
    
    // Track first proof timestamp
    if (this.proofQueue.length === 1) {
      this.firstProofTimestamp = Date.now();
    }
    
    // Check if we should schedule a batch
    await this.evaluateBatchTrigger();
    
    return true;
  }
  
  /**
   * Hybrid Batching Logic: Size-based + Time-based
   */
  async evaluateBatchTrigger() {
    const queueSize = this.proofQueue.length;
    const waitTime = Date.now() - this.firstProofTimestamp;
    
    // Condition 1: Minimum batch size reached
    const sizeCondition = queueSize >= this.MIN_BATCH_SIZE;
    
    // Condition 2: Maximum wait time exceeded (with at least 1 proof)
    const timeCondition = queueSize > 0 && waitTime >= this.MAX_WAIT_TIME;
    
    if ((sizeCondition || timeCondition) && !this.batchScheduled) {
      console.log('🎯 Batch trigger condition met');
      console.log(`   Queue size: ${queueSize}, Wait time: ${Math.floor(waitTime / 60000)} minutes`);
      
      // Schedule batch with random delay (anti-timing attack)
      const randomDelay = Math.floor(
        Math.random() * (this.MAX_RANDOM_DELAY - this.MIN_RANDOM_DELAY) + this.MIN_RANDOM_DELAY
      );
      
      console.log(`⏱️  Scheduling batch execution in ${Math.floor(randomDelay / 60000)} minutes (random delay for privacy)`);
      
      this.batchScheduled = true;
      
      setTimeout(() => {
        this.executeBatch();
      }, randomDelay);
    }
  }
  
  /**
   * Execute batch of proofs and log to HCS
   */
  async executeBatch() {
    console.log('🚀 Executing privacy batch...');
    
    const batchSize = this.proofQueue.length;
    const batch = [...this.proofQueue];
    
    // Clear queue for next batch
    this.proofQueue = [];
    this.firstProofTimestamp = null;
    this.batchScheduled = false;
    
    try {
      // 1. Aggregate proof data (anonymized)
      const anonymizedBatch = batch.map(p => ({
        nullifierHash: p.publicSignals[0], // Only public data
        commitment: p.publicSignals[1],     // No user identity
        proofType: p.proofType
      }));
      
      // 2. Compute new Merkle root (after adding all commitments)
      const newMerkleRoot = this.computeNewMerkleRoot(batch);
      
      // 3. Log to HCS (public audit trail)
      await this.logBatchToHCS({
        batchId: Math.random().toString(36).slice(2),
        timestamp: Date.now(),
        batchSize,
        newMerkleRoot,
        anonymizedProofs: anonymizedBatch.map(p => ({
          nullifierHash: p.nullifierHash,
          type: p.proofType
        }))
      });
      
      // 4. Execute transactions on Hedera (pool contract)
      // In production, this would call the VanishPool.sol contract
      console.log(`✅ Batch executed: ${batchSize} proofs processed`);
      console.log(`   New Merkle Root: ${newMerkleRoot}`);
      
      // 5. Monitor for next batch
      console.log('👂 Listening for next batch...');
      
    } catch (error) {
      console.error('❌ Batch execution failed:', error.message);
      // In production: implement retry logic or alert admin
    }
  }
  
  /**
   * Log anonymized batch data to HCS for audit trail
   */
  async logBatchToHCS(batchData) {
    try {
      const message = JSON.stringify({
        type: 'PRIVACY_BATCH',
        version: '2026.1',
        batchId: batchData.batchId,
        timestamp: batchData.timestamp,
        batchSize: batchData.batchSize,
        newMerkleRoot: batchData.newMerkleRoot,
        proofs: batchData.anonymizedProofs // No user identities
      });
      
      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(this.publicTopic)
        .setMessage(message);
      
      const txResponse = await transaction.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);
      
      console.log('📜 Batch logged to HCS (immutable audit trail)');
      console.log(`   Topic: ${this.publicTopic}`);
      console.log(`   Sequence: ${receipt.topicSequenceNumber}`);
      
    } catch (error) {
      console.error('❌ HCS logging failed:', error.message);
    }
  }
  
  /**
   * Compute new Merkle root after adding commitments
   * (Simplified for boilerplate - in production, use actual Merkle tree)
   */
  computeNewMerkleRoot(batch) {
    const commitments = batch.map(p => p.publicSignals[1]);
    const concatenated = commitments.join('');
    return keccak256(Buffer.from(concatenated, 'utf8'));
  }
  
  /**
   * Initialize HIP-1334 inbox on first start, or load persisted keys.
   */
  async initializeHIP1334() {
    const keysFile = path.join(__dirname, '.hip1334-keys.json');
    try {
      const saved = JSON.parse(await fs.readFile(keysFile, 'utf8'));
      this.hip1334TopicId = saved.topicId;
      this.hip1334EncPrivKey = saved.encPrivateKey;
      console.log(`📬 HIP-1334 inbox loaded: ${this.hip1334TopicId}`);
    } catch {
      console.log('📬 Creating new HIP-1334 inbox (first run)...');
      const { topicId, encPrivateKey } = await hip1334.createInbox(
        this.client,
        this.accountId.toString(),
        this.privateKey
      );
      this.hip1334TopicId = topicId;
      this.hip1334EncPrivKey = encPrivateKey;
      await fs.writeFile(keysFile, JSON.stringify({ topicId, encPrivateKey }, null, 2));
    }
  }

  /**
   * Process a decrypted proof submission payload.
   */
  async handleMessage(payload) {
    if (payload.type !== 'PROOF_SUBMISSION') return;
    console.log(`📩 [HIP-1334] Proof received: ${payload.submissionId}`);
    if (!payload.proofType) {
      console.log('   ⚠️  Missing proofType, skipping');
      return;
    }
    await this.addProofToQueue(payload);
  }

  /**
   * Start listening via HIP-1334 encrypted inbox.
   * Falls back to raw HCS private topic if HIP-1334 init fails.
   */
  async startListening() {
    try {
      await this.initializeHIP1334();
      console.log('👂 Pool Manager listening via HIP-1334 (encrypted inbox)');
      console.log(`   Inbox topic: ${this.hip1334TopicId}`);
      hip1334.listenToInbox(
        this.client,
        this.hip1334TopicId,
        this.hip1334EncPrivKey,
        (payload) => this.handleMessage(payload)
      );
    } catch (err) {
      console.error('⚠️  HIP-1334 init failed, falling back to raw HCS:', err.message);
      console.log(`👂 Fallback: raw HCS topic ${this.privateTopic}`);
      new TopicMessageQuery()
        .setTopicId(this.privateTopic)
        .setStartTime(Math.floor(Date.now() / 1000))
        .subscribe(this.client, null, async (message) => {
          try {
            let raw = Buffer.from(message.contents).toString('utf8');
            if (raw.startsWith('eyJ')) raw = Buffer.from(raw, 'base64').toString('utf8');
            await this.handleMessage(JSON.parse(raw));
          } catch (e) {
            console.error('Error processing HCS message:', e.message);
          }
        });
    }
  }


// Start Pool Manager
async function main() {
  const manager = new PoolManager();
  await manager.startListening();
  
  // Status monitoring (every 5 minutes)
  setInterval(() => {
    const status = manager.getStatus();
    console.log('📊 Pool Status:', status);
  }, 5 * 60 * 1000);
}

main().catch(console.error);

module.exports = { PoolManager };
