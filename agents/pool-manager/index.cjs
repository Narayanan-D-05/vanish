/**
 * Vanish Pool Manager - AI + Policy-Guarded Privacy Coordinator (2026)
 *
 * Core pattern:
 * - AI proposes protocol decisions
 * - Deterministic policy engine validates decisions
 * - Decision + validation hashes are logged to HCS audit topic
 * - Execution proceeds only if policy approves
 */

require('dotenv').config();
const {
  Client,
  PrivateKey,
  AccountId,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
} = require('@hashgraph/sdk');
const snarkjs = require('snarkjs');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { keccak256 } = require('ethers');

const DelegationManager = require('../../lib/delegation.cjs');
const hip1334 = require('../../lib/hip1334.cjs');
const PolicyEngine = require('../../lib/policy-engine.cjs');

let Ollama = null;
try {
  Ollama = require('@langchain/ollama').Ollama;
} catch {
  // Optional dependency path; deterministic fallback is always available.
}

class PoolManager {
  constructor() {
    this.accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    this.privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    this.client = Client.forTestnet();
    this.client.setOperator(this.accountId, this.privateKey);

    this.privateTopic = process.env.PRIVATE_TOPIC_ID;
    this.publicTopic = process.env.PUBLIC_ANNOUNCEMENT_TOPIC_ID;

    this.policyPath = process.env.VANISH_POLICY_PATH || path.join(__dirname, '../../config/vanish-policy.json');
    this.policyEngine = new PolicyEngine(this.policyPath);
    this.policy = this.policyEngine.policy;

    this.proofQueue = [];
    this.MIN_BATCH_SIZE = Number(this.policy.minBatchSize || 2);
    this.MAX_WAIT_TIME = Number(this.policy.maxWaitMinutes || 2) * 60 * 1000;
    this.MIN_RANDOM_DELAY = Number(this.policy.minDelaySeconds || 10) * 1000;
    this.MAX_RANDOM_DELAY = Number(this.policy.maxDelayMinutes || 1) * 60 * 1000;

    this.firstProofTimestamp = null;
    this.batchScheduled = false;

    this.aiEnabled = process.env.ENABLE_AI_CORE !== 'false';
    this.aiDecisionTimeoutMs = Number(this.policy.aiDecisionTimeoutMs || 5000);

    this.loadVerificationKeys();

    console.log('🔒 Pool Manager initialized (AI + Policy Guard)');
    console.log(`   Account: ${this.accountId}`);
    console.log(`   Policy: ${this.policyPath}`);
    console.log(`   AI Core: ${this.aiEnabled ? 'enabled' : 'disabled'}`);
    console.log(`   Batching: Min ${this.MIN_BATCH_SIZE} proofs OR ${this.MAX_WAIT_TIME / 60000} minutes`);
    console.log(`   Delay bounds: ${this.MIN_RANDOM_DELAY / 1000}-${this.MAX_RANDOM_DELAY / 1000} seconds`);
  }

  async loadVerificationKeys() {
    try {
      const shieldVkJson = await fs.readFile(path.join(__dirname, '../../circuits/shield_verification_key.json'), 'utf8');
      this.shieldVK = JSON.parse(shieldVkJson);

      const withdrawVkJson = await fs.readFile(path.join(__dirname, '../../circuits/withdraw_verification_key.json'), 'utf8');
      this.withdrawVK = JSON.parse(withdrawVkJson);

      console.log('✅ Verification keys loaded');
    } catch (error) {
      console.error('❌ Failed to load verification keys:', error.message);
      process.exit(1);
    }
  }

  hashObject(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
  }

  async logDecisionAuditToHCS(envelope, validation, policyVersion, fallbackUsed) {
    try {
      const audit = {
        type: 'AI_DECISION_AUDIT',
        version: '2026.1',
        timestamp: Date.now(),
        policyVersion,
        decisionId: envelope.decisionId,
        decisionType: envelope.decisionType,
        model: envelope.model,
        approved: validation.approved,
        fallbackUsed,
        contextHash: this.hashObject(envelope.context),
        promptHash: this.hashObject({ prompt: envelope.prompt || '' }),
        outputHash: this.hashObject(envelope.payload),
        validationHash: this.hashObject(validation),
        errors: validation.errors,
      };

      await new TopicMessageSubmitTransaction()
        .setTopicId(this.publicTopic)
        .setMessage(JSON.stringify(audit))
        .execute(this.client);

      console.log(`🧾 AI decision audit logged (${audit.decisionId})`);
    } catch (err) {
      console.error('⚠️ Failed to log AI decision audit:', err.message);
    }
  }

  async verifyProof(proof, publicSignals, proofType) {
    try {
      const vKey = proofType === 'shield' ? this.shieldVK : this.withdrawVK;
      const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
      console.log(isValid ? `✓ ${proofType} proof is mathematically valid` : `✗ ${proofType} proof verification FAILED`);
      return isValid;
    } catch (error) {
      console.error(`❌ Proof verification error: ${error.message}`);
      return false;
    }
  }

  async addProofToQueue(proofData) {
    const proofPolicy = this.policyEngine.validateProofSubmission(proofData);
    if (!proofPolicy.approved) {
      console.log(`❌ Rejected by policy guard: ${proofPolicy.errors.join('; ')}`);
      return false;
    }

    const isValid = await this.verifyProof(proofData.proof, proofData.publicSignals, proofData.proofType);
    if (!isValid) {
      console.log('❌ Rejected invalid proof');
      return false;
    }

    if (proofData.submitter && process.env.POOL_CONTRACT_ID) {
      try {
        const delegation = new DelegationManager(this.client);
        const receipt = await delegation.executeDelegatedTransfer(
          proofData.submitter,
          process.env.POOL_CONTRACT_ID,
          proofData.amount
        );
        console.log(`💸 HIP-1340 pull: ${proofData.amount} HBAR from ${proofData.submitter} → ${process.env.POOL_CONTRACT_ID}`);
        console.log(`   Tx: ${receipt.transactionId}`);
      } catch (err) {
        console.error(`⚠️ Fund pull failed: ${err.message}`);
      }
    }

    this.proofQueue.push({
      ...proofData,
      timestamp: Date.now(),
      submissionId: proofData.submissionId || crypto.randomUUID(),
    });

    console.log(`📥 Proof added to queue (${this.proofQueue.length}/${this.MIN_BATCH_SIZE})`);

    if (this.proofQueue.length === 1) {
      this.firstProofTimestamp = Date.now();
    }

    await this.evaluateBatchTrigger();
    return true;
  }

  buildBatchContext() {
    const queueSize = this.proofQueue.length;
    const waitTimeMs = this.firstProofTimestamp ? Date.now() - this.firstProofTimestamp : 0;
    return {
      queueSize,
      waitTimeMs,
      minBatchSize: this.MIN_BATCH_SIZE,
      maxWaitTimeMs: this.MAX_WAIT_TIME,
      minDelayMs: this.MIN_RANDOM_DELAY,
      maxDelayMs: this.MAX_RANDOM_DELAY,
      now: Date.now(),
    };
  }

  deterministicDecision(context) {
    const sizeCondition = context.queueSize >= context.minBatchSize;
    const timeCondition = context.queueSize > 0 && context.waitTimeMs >= context.maxWaitTimeMs;
    const execute = sizeCondition || timeCondition;

    const delayMs = Math.floor(
      Math.random() * (context.maxDelayMs - context.minDelayMs) + context.minDelayMs
    );

    return {
      execute,
      batchSize: context.queueSize,
      delayMs,
      reason: execute
        ? (sizeCondition ? 'size_condition_met' : 'time_condition_met')
        : 'conditions_not_met',
      confidence: 1,
    };
  }

  async proposeBatchDecision(context) {
    const prompt = [
      'You are Vanish protocol AI proposer.',
      'Return strict JSON only.',
      'Schema: {"execute":boolean,"batchSize":number,"delayMs":number,"reason":string,"confidence":number}',
      `Context: ${JSON.stringify(context)}`,
      'Rules: execute can be true ONLY if queueSize >= minBatchSize OR waitTimeMs >= maxWaitTimeMs.',
      'delayMs must be between minDelayMs and maxDelayMs.',
    ].join('\n');

    if (!this.aiEnabled || !Ollama) {
      return {
        payload: this.deterministicDecision(context),
        prompt,
        model: { provider: 'deterministic', name: 'rule-fallback', version: '2026.1' },
        fallbackUsed: true,
      };
    }

    try {
      const llm = new Ollama({
        model: process.env.AI_MODEL || 'llama3.2',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        temperature: 0,
        numPredict: 120,
      });

      const invokePromise = llm.invoke(prompt);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI decision timeout')), this.aiDecisionTimeoutMs));
      const response = await Promise.race([invokePromise, timeoutPromise]);

      const raw = typeof response === 'string' ? response : String(response);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI returned non-JSON');

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        payload: parsed,
        prompt,
        model: { provider: 'ollama', name: process.env.AI_MODEL || 'llama3.2', version: '2026.1' },
        fallbackUsed: false,
      };
    } catch (err) {
      console.warn(`⚠️ AI proposer failed (${err.message}), using deterministic fallback`);
      return {
        payload: this.deterministicDecision(context),
        prompt,
        model: { provider: 'deterministic', name: 'rule-fallback', version: '2026.1' },
        fallbackUsed: true,
      };
    }
  }

  async evaluateBatchTrigger() {
    const context = this.buildBatchContext();

    if (context.queueSize === 0 || this.batchScheduled) return;

    const proposed = await this.proposeBatchDecision(context);
    const envelope = {
      type: 'AI_DECISION',
      decisionId: crypto.randomUUID(),
      decisionType: 'BATCH_EXECUTION',
      timestamp: Date.now(),
      model: proposed.model,
      prompt: proposed.prompt,
      context,
      payload: proposed.payload,
    };

    const validation = this.policyEngine.validateBatchDecision(envelope, context);
    await this.logDecisionAuditToHCS(envelope, validation, this.policy.version || 'unknown', proposed.fallbackUsed);

    if (!validation.approved) {
      console.log(`🛑 Policy guard rejected AI decision: ${validation.errors.join('; ')}`);
      return;
    }

    if (!envelope.payload.execute) {
      console.log('⏳ AI decision says wait; no batch scheduled yet');
      return;
    }

    const delayMs = envelope.payload.delayMs;
    console.log('🎯 Batch decision approved by policy guard');
    console.log(`   Queue size: ${context.queueSize}`);
    console.log(`   Delay: ${Math.round(delayMs / 1000)} seconds`);
    console.log(`   Reason: ${envelope.payload.reason}`);

    this.batchScheduled = true;
    setTimeout(() => {
      this.executeBatch().catch((err) => console.error('❌ executeBatch failed:', err.message));
    }, delayMs);
  }

  async executeBatch() {
    console.log('🚀 Executing privacy batch...');

    const batchSize = this.proofQueue.length;
    const batch = [...this.proofQueue];

    this.proofQueue = [];
    this.firstProofTimestamp = null;
    this.batchScheduled = false;

    try {
      const anonymizedBatch = batch.map((p) => ({
        nullifierHash: p.publicSignals[0],
        commitment: p.publicSignals[1],
        proofType: p.proofType,
      }));

      const newMerkleRoot = this.computeNewMerkleRoot(batch);

      await this.logBatchToHCS({
        batchId: Math.random().toString(36).slice(2),
        timestamp: Date.now(),
        batchSize,
        newMerkleRoot,
        anonymizedProofs: anonymizedBatch.map((p) => ({
          nullifierHash: p.nullifierHash,
          type: p.proofType,
        })),
      });

      console.log(`✅ Batch executed: ${batchSize} proofs processed`);
      console.log(`   New Merkle Root: ${newMerkleRoot}`);
      console.log('👂 Listening for next batch...');
    } catch (error) {
      console.error('❌ Batch execution failed:', error.message);
    }
  }

  async logBatchToHCS(batchData) {
    try {
      const message = JSON.stringify({
        type: 'PRIVACY_BATCH',
        version: '2026.1',
        batchId: batchData.batchId,
        timestamp: batchData.timestamp,
        batchSize: batchData.batchSize,
        newMerkleRoot: batchData.newMerkleRoot,
        proofs: batchData.anonymizedProofs,
      });

      const txResponse = await new TopicMessageSubmitTransaction()
        .setTopicId(this.publicTopic)
        .setMessage(message)
        .execute(this.client);

      const receipt = await txResponse.getReceipt(this.client);
      console.log('📜 Batch logged to HCS (immutable audit trail)');
      console.log(`   Topic: ${this.publicTopic}`);
      console.log(`   Sequence: ${receipt.topicSequenceNumber}`);
    } catch (error) {
      console.error('❌ HCS logging failed:', error.message);
    }
  }

  computeNewMerkleRoot(batch) {
    const commitments = batch.map((p) => p.publicSignals[1]);
    return keccak256(Buffer.from(commitments.join(''), 'utf8'));
  }

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

  async handleMessage(payload) {
    if (payload.type !== 'PROOF_SUBMISSION') return;
    console.log(`📩 [HIP-1334] Proof received: ${payload.submissionId}`);
    if (!payload.proofType) {
      console.log('⚠️ Missing proofType, skipping');
      return;
    }
    await this.addProofToQueue(payload);
  }

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
      console.error('⚠️ HIP-1334 init failed, falling back to raw HCS:', err.message);
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

  getStatus() {
    return {
      queueSize: this.proofQueue.length,
      batchScheduled: this.batchScheduled,
      waitTimeMinutes: this.firstProofTimestamp
        ? Math.floor((Date.now() - this.firstProofTimestamp) / 60000)
        : 0,
      policyVersion: this.policy.version,
      aiCoreEnabled: this.aiEnabled,
    };
  }
}

async function main() {
  const manager = new PoolManager();
  await manager.startListening();

  setInterval(() => {
    console.log('📊 Pool Status:', manager.getStatus());
  }, 5 * 60 * 1000);
}

main().catch(console.error);

module.exports = { PoolManager };
