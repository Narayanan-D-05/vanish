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
  ContractCallQuery,
  ContractId,
} = require('@hashgraph/sdk');
const snarkjs = require('snarkjs');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { keccak256, Wallet } = require('ethers');

const DelegationManager = require('../../lib/delegation.cjs');
const hip1334 = require('../../lib/hip1334.cjs');
const PolicyEngine = require('../../lib/policy-engine.cjs');
const IncrementalMerkleTree = require('../../lib/merkle-tree.cjs');

let Ollama = null;
try {
  Ollama = require('@langchain/ollama').Ollama;
} catch {
  // Optional dependency path; deterministic fallback is always available.
}

const normalizeHex = (hex, length = 64) => {
  if (!hex) return '0x' + '0'.repeat(length);
  let clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return '0x' + clean.toLowerCase().padStart(length, '0').slice(-length);
};

class PoolManager {
  constructor() {
    this.accountId = AccountId.fromString(process.env.POOL_MANAGER_ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID);
    this.privateKey = PrivateKey.fromString(process.env.POOL_MANAGER_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY);
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
    this.MIN_RANDOM_DELAY = Number(this.policy.minDelaySeconds || 1) * 1000; // Demo mode: 1s
    this.MAX_RANDOM_DELAY = Number(this.policy.maxDelaySeconds || 2) * 1000; // Demo mode: 2s

    this.treePath = path.join(__dirname, '../../config/merkle_tree.json');
    this.merkleTree = new IncrementalMerkleTree(this.treePath, 4);

    this.firstProofTimestamp = null;
    this.batchScheduled = false;
    this.lastApprovedDecision = null;

    this.aiEnabled = process.env.ENABLE_AI_CORE !== 'false';
    this.aiDecisionTimeoutMs = Number(this.policy.aiDecisionTimeoutMs || 5000);
    this.decisionInProgress = false;

    this.decisionSignerWallet = null;
    if (process.env.AI_DECISION_SIGNER_PRIVATE_KEY) {
      try {
        this.decisionSignerWallet = new Wallet(process.env.AI_DECISION_SIGNER_PRIVATE_KEY);
      } catch (e) {
        console.error(`⚠️ Invalid AI_DECISION_SIGNER_PRIVATE_KEY: ${e.message}`);
      }
    }

    this.loadVerificationKeys();

    console.log('🔒 Pool Manager initialized (AI + Policy Guard)');
    console.log(`   Account: ${this.accountId}`);
    console.log(`   Policy: ${this.policyPath}`);
    console.log(`   AI Core: ${this.aiEnabled ? 'enabled' : 'disabled'}`);
    console.log(`   Decision Signer: ${this.decisionSignerWallet ? this.decisionSignerWallet.address : 'ed25519 fallback (off-chain only)'}`);
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

  canonicalStringify(value) {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((v) => this.canonicalStringify(v)).join(',')}]`;
    }

    const keys = Object.keys(value).sort();
    const body = keys
      .map((k) => `${JSON.stringify(k)}:${this.canonicalStringify(value[k])}`)
      .join(',');
    return `{${body}}`;
  }

  /**
   * Sign an audit payload with this pool manager's Hedera ed25519 private key.
   * Uses deterministic canonical JSON (keys sorted alphabetically) so the
   * signature is reproducible. Anyone can verify it with the ed25519 public key
   * retrieved from the Mirror Node for this account.
   *
   * @param {object} obj - Plain object to sign
   * @returns {string} hex-encoded ed25519 signature
   */
  signAudit(obj) {
    try {
      const canonical = this.canonicalStringify(obj);
      const msgBytes = Buffer.from(canonical, 'utf8');
      const sigBytes = this.privateKey.sign(msgBytes);
      return Buffer.from(sigBytes).toString('hex');
    } catch (err) {
      console.error('⚠️ signAudit failed:', err.message);
      return '';
    }
  }

  signDecisionEnvelope(envelope) {
    const canonical = this.canonicalStringify(envelope);
    const envelopeHashHex = keccak256(Buffer.from(canonical, 'utf8')).replace('0x', '');

    // Preferred mode: ECDSA signer for on-chain ecrecover verification.
    if (this.decisionSignerWallet) {
      const sig = this.decisionSignerWallet.signingKey.sign(`0x${envelopeHashHex}`);
      return {
        canonical,
        signatureHex: sig.serialized.replace('0x', ''),
        envelopeHash: envelopeHashHex,
        signerAccountId: this.accountId.toString(),
        signerPublicKey: this.decisionSignerWallet.publicKey,
        signerAddress: this.decisionSignerWallet.address,
        signatureScheme: 'ecdsa-secp256k1',
      };
    }

    // Fallback mode: Hedera Ed25519 signature (cannot be ecrecover-verified on-chain).
    const signatureHex = this.signAudit(envelope);
    return {
      canonical,
      signatureHex,
      envelopeHash: envelopeHashHex,
      signerAccountId: this.accountId.toString(),
      signerPublicKey: this.privateKey.publicKey.toString(),
      signerAddress: '0x0000000000000000000000000000000000000000',
      signatureScheme: 'ed25519-hedera',
    };
  }

  async logDecisionAuditToHCS(envelope, validation, policyVersion, fallbackUsed, signedEnvelope) {
    try {
      // Core fields that are signed — deterministic, sorted keys
      const auditCore = {
        approved: validation.approved,
        contextHash: this.hashObject(envelope.context),
        decisionId: envelope.decisionId,
        decisionType: envelope.decisionType,
        errors: validation.errors,
        fallbackUsed,
        model: envelope.model,
        outputHash: this.hashObject(envelope.payload),
        policyVersion,
        promptHash: this.hashObject({ prompt: envelope.prompt || '' }),
        timestamp: Date.now(),
        type: 'AI_DECISION_AUDIT',
        validationHash: this.hashObject(validation),
        version: '2026.1',
      };

      // ed25519 signature over canonical JSON — non-repudiable, verifiable via Mirror Node
      const signature = this.signAudit(auditCore);

      const audit = {
        ...auditCore,
        signerAccountId: this.accountId.toString(),
        signatureScheme: 'ed25519-hedera',
        signature,
        decisionEnvelopeHash: signedEnvelope.envelopeHash,
        decisionEnvelopeSignature: signedEnvelope.signatureHex,
        decisionEnvelopeSigner: signedEnvelope.signerAccountId,
        decisionEnvelopeSignerPublicKey: signedEnvelope.signerPublicKey,
        decisionEnvelopeSignerAddress: signedEnvelope.signerAddress,
        decisionEnvelopeSignatureScheme: signedEnvelope.signatureScheme,
      };

      await new TopicMessageSubmitTransaction()
        .setTopicId(this.publicTopic)
        .setMessage(JSON.stringify(audit))
        .execute(this.client);

      console.log(`🧾 AI decision audit signed & logged (${audit.decisionId})`);
      console.log(`   Signer: ${audit.signerAccountId} | sig: ${signature.slice(0, 16)}...`);
    } catch (err) {
      console.error('⚠️ Failed to log AI decision audit:', err.message);
    }
  }

  /**
   * Anchor an approved batch to the VanishGuard smart contract on-chain.
   * The auditHash links this on-chain record to the HCS AI_DECISION_AUDIT entry.
   * Only called when VANISH_GUARD_CONTRACT_ID is set in the environment.
   */
  async submitBatchToGuard(batchSize, delayMs, queueAgeMs, newMerkleRoot, auditHash, decisionMeta) {
    const guardId = process.env.VANISH_GUARD_CONTRACT_ID;
    if (!guardId) return; // not deployed yet — skip silently

    try {
      const { ContractExecuteTransaction, ContractId } = require('@hashgraph/sdk');
      const { Interface } = require('ethers');

      // Detect if we have a contract-verifiable ECDSA signature.
      // Ed25519 signatures (standard for Hedera) cannot be verified via ecrecover on-chain.
      const hasEcdsa = decisionMeta && decisionMeta.signatureScheme === 'ecdsa-secp256k1';

      const abi = hasEcdsa
        ? ['function submitBatchWithDecision(uint32 batchSize, uint256 delayMs, uint256 queueAgeMs, bytes32 merkleRoot, bytes32 auditHash, bytes32 decisionEnvelopeHash, bytes decisionSignature)']
        : ['function submitBatch(uint32 batchSize, uint256 delayMs, uint256 queueAgeMs, bytes32 merkleRoot, bytes32 auditHash)'];

      const iface = new Interface(abi);
      
      const params = hasEcdsa
        ? [
            batchSize,
            BigInt(delayMs),
            BigInt(queueAgeMs),
            normalizeHex(newMerkleRoot),
            normalizeHex(auditHash),
            normalizeHex(decisionMeta.envelopeHash),
            normalizeHex(decisionMeta.signatureHex, 0), // Signatures are variable length, don't pad
          ]
        : [
            batchSize,
            BigInt(delayMs),
            BigInt(queueAgeMs),
            normalizeHex(newMerkleRoot),
            normalizeHex(auditHash),
          ];

      const calldata = iface.encodeFunctionData(hasEcdsa ? 'submitBatchWithDecision' : 'submitBatch', params);

      const txResponse = await new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(guardId))
        .setGas(300_000) 
        .setFunctionParameters(Buffer.from(calldata.replace('0x', ''), 'hex'))
        .execute(this.client);

      const receipt = await txResponse.getReceipt(this.client);
      
      if (receipt.status.toString() === 'SUCCESS') {
        console.log(`⛓️  Batch anchored on-chain → VanishGuard (${guardId})`);
      } else {
        console.error(`❌ VanishGuard anchor status: ${receipt.status.toString()}`);
      }
    } catch (err) {
      console.error(`⚠️ VanishGuard anchor failed: ${err.message}`);
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

  /**
   * AML Oracle Check — 3-Tier Strategy
   * 
   * Tier 1 (PRIMARY):   Chainalysis KYT API — rich 0-100 risk scores with exposure categories.
   *                     Requires CHAINALYSIS_API_KEY in .env. Used by major exchanges and banks.
   * Tier 2 (FALLBACK):  Chainalysis Sanctions Oracle (on-chain, free) — boolean OFAC sanctions check.
   * Tier 3 (SAFE EXIT): If both fail (e.g. testnet / unreachable), return 0 for clean addresses.
   */
  async performAmlOracleCheck(accountId) {
    if (accountId === "anonymous") return 0;
    if (accountId === "0.0.999999") return 100; // Hardcoded test-hacker wallet

    const axios = require('axios');

    // ─── TIER 1: Chainalysis Sanctions REST API ────────────────────────────────
    // Free API for OFAC SDN sanctions screening. 5,000 req / 5 min.
    // Auth: X-API-KEY header. Docs: https://docs.chainalysis.com/api/sanctions/
    const apiKey = process.env.CHAINALYSIS_API_KEY;
    if (apiKey) {
      try {
        // Resolve Hedera account to EVM address first
        const mirrorBase = process.env.MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com';
        const evmRes = await axios.get(`${mirrorBase}/api/v1/accounts/${accountId}`, { timeout: 5000 });
        const evmAddress = evmRes.data?.evm_address;

        if (evmAddress) {
          const sanctionsRes = await axios.get(
            `https://public.chainalysis.com/api/v1/address/${evmAddress}`,
            {
              headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' },
              timeout: 8000
            }
          );

          const identifications = sanctionsRes.data?.identifications || [];
          if (identifications.length > 0) {
            const category = identifications[0]?.category || 'unknown';
            const name = identifications[0]?.name || '';
            console.log(`🚨 [Chainalysis Sanctions API] ${accountId} is SANCTIONED.`);
            console.log(`   Category: ${category} | Program: ${name}`);
            return 100;
          }

          console.log(`✅ [Chainalysis Sanctions API] ${accountId} — Not on OFAC SDN list. Score: 0`);
          return 0;
        }

      } catch (sanctionsErr) {
        console.warn(`⚠️ [Sanctions API] Request failed (${sanctionsErr.response?.status || sanctionsErr.message}). Falling back to on-chain oracle.`);
      }
    }

    // ─── TIER 2: On-chain Chainalysis Sanctions Oracle (free) ─────────────────
    try {
      const { Interface } = require('ethers');
      const { ContractId } = require('@hashgraph/sdk');
      const mirrorBase = process.env.MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com';

      const evmRes = await axios.get(`${mirrorBase}/api/v1/accounts/${accountId}`, { timeout: 5000 });
      const evmAddress = evmRes.data?.evm_address;

      if (evmAddress) {
        const abi = ['function isSanctioned(address addr) view returns (bool)'];
        const iface = new Interface(abi);
        const calldata = iface.encodeFunctionData('isSanctioned', [evmAddress]);
        const CHAINALYSIS_ORACLE = '0x40C57923924B5c5c5455c48D93317139ADDaC8fb';

        const result = await new ContractCallQuery()
          .setContractId(ContractId.fromEvmAddress(0, 0, CHAINALYSIS_ORACLE))
          .setFunctionParameters(Buffer.from(calldata.replace('0x', ''), 'hex'))
          .setGas(50_000)
          .execute(this.client);

        const isSanctioned = iface.decodeFunctionResult('isSanctioned', result.bytes)[0];
        if (isSanctioned) {
          console.log(`🚨 [On-Chain Oracle] ${accountId} is SANCTIONED.`);
          return 100;
        }
        console.log(`✅ [On-Chain Oracle] ${accountId} is CLEAN.`);
        return 0;
      }
    } catch (onChainErr) {
      console.warn(`⚠️ [On-Chain Oracle] Failed (${onChainErr.message}).`);
    }

    // ─── TIER 3: Strict failure (No Fallbacks) ─────────────────────────────────
    console.warn(`⚠️ [AML] Both oracle tiers failed for ${accountId}. Rejecting to enforce strict compliance.`);
    throw new Error('Compliance oracles unreachable. Failsafe activated: rejected.');
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

    // --- COMPLIANCE LAYER: AML Oracle Check ---
    // Enforce "Proof of Innocence" architecture by keeping the pool mathematically clean.
    const maxAllowedRisk = this.policy.maxAmlRiskScore || 50;
    const riskScore = await this.performAmlOracleCheck(proofData.submitter || "anonymous");

    if (riskScore > maxAllowedRisk) {
      console.log(`🚨 AML COMPLIANCE ALERT: Rejected deposit from ${proofData.submitter || 'anonymous'}`);
      console.log(`   Risk Score: ${riskScore}/${maxAllowedRisk}. Source funds fail threshold.`);
      return false;
    }
    console.log(`✅ AML Check Passed: ${proofData.submitter || 'anonymous'} (Score: ${riskScore})`);
    // ------------------------------------------

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
        return false; // Stop! Do not add proof if money didn't move.
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

    // Early exits: nothing to do, or already working/scheduled.
    if (context.queueSize === 0 || this.batchScheduled || this.decisionInProgress) return;

    this.decisionInProgress = true;
    try {
      const proposed = await this.proposeBatchDecision(context);

      // Re-fetch LATEST context after the long AI wait:
      const latestContext = this.buildBatchContext();
      
      // If a batch was scheduled or queue changed while thinking, abort this thread.
      if (this.batchScheduled || latestContext.queueSize === 0) return;

      // STALE CHECK: If AI said wait but our queue grew significantly during the wait,
      // override with deterministic execution to prevent stalling.
      let finalPayload = proposed.payload;
      if (!finalPayload.execute) {
        const fallback = this.deterministicDecision(latestContext);
        if (fallback.execute) {
          console.log('🔄 AI suggested wait, but new proofs arrived. Overriding with deterministic execution.');
          finalPayload = fallback;
        } else {
          console.log(`⏳ AI/Policy decision is to WAIT (Queue: ${latestContext.queueSize}/${this.MIN_BATCH_SIZE})`);
        }
      }

      const envelope = {
        type: 'AI_DECISION',
        decisionId: crypto.randomUUID(),
        decisionType: 'BATCH_EXECUTION',
        timestamp: Date.now(),
        model: proposed.model,
        prompt: proposed.prompt,
        context: latestContext,
        payload: finalPayload,
      };

      const signedEnvelope = this.signDecisionEnvelope(envelope);
      const validation = this.policyEngine.validateBatchDecision(envelope, latestContext);

      if (!validation.approved) {
        console.log(`🛑 Policy guard rejected AI decision: ${validation.errors.join('; ')}`);
        return;
      }

      if (!finalPayload.execute) {
        this.lastApprovedDecision = null;
        return;
      }

      // LOCK IMMEDIATELY
      this.batchScheduled = true;

      const delayMs = finalPayload.delayMs;
      console.log('🎯 Batch decision approved by policy guard');
      console.log(`   Queue size: ${latestContext.queueSize}`);
      console.log(`   Delay: ${Math.round(delayMs / 1000)} seconds`);
      console.log(`   Reason: ${finalPayload.reason}`);

      this.lastApprovedDecision = {
        decisionId: envelope.decisionId,
        envelopeHash: signedEnvelope.envelopeHash,
        signatureHex: signedEnvelope.signatureHex,
        signerPublicKey: signedEnvelope.signerPublicKey,
        scheduledDelayMs: delayMs,
        approvedAt: Date.now(),
      };

      await this.logDecisionAuditToHCS(
        envelope,
        validation,
        this.policy.version || 'unknown',
        proposed.fallbackUsed,
        signedEnvelope
      );

      setTimeout(() => {
        this.executeBatch().catch((err) => console.error('❌ executeBatch failed:', err.message));
      }, delayMs);
    } finally {
      this.decisionInProgress = false;
      // Safety: If more proofs arrived while we were busy, re-evaluate one last time.
      if (this.proofQueue.length > 0 && !this.batchScheduled) {
        this.evaluateBatchTrigger().catch(() => {});
      }
    }
  }

  async executeBatch() {

    const batchSize = this.proofQueue.length;
    const batch = [...this.proofQueue];
    const firstProofTs = this.firstProofTimestamp;
    const decisionMeta = this.lastApprovedDecision;

    this.proofQueue = [];
    this.firstProofTimestamp = null;
    this.lastApprovedDecision = null;

    if (batch.length === 0) {
      console.log('⚠️ executeBatch called with empty queue, skipping');
      this.batchScheduled = false;
      return;
    }

    try {
      const shieldProofs = batch.filter(p => p.proofType === 'shield');
      const withdrawProofs = batch.filter(p => p.proofType === 'withdraw');

      console.log(`📦 Processing batch: ${shieldProofs.length} shields, ${withdrawProofs.length} withdrawals`);

      // 1. Handle Shields (Update Merkle Root)
      let newMerkleRoot = '0x' + '0'.repeat(64);
      if (shieldProofs.length > 0) {
        let lastIndex = 0;
        for (const p of shieldProofs) {
          lastIndex = this.merkleTree.insert(p.publicSignals[1]); // commitment
        }
        const treeState = this.merkleTree.getRootAndPath(lastIndex);
        newMerkleRoot = treeState.merkleRoot;
        const batchId = Math.random().toString(36).slice(2);
        const batchTimestamp = Date.now();

        await this.logBatchToHCS({
          batchId,
          timestamp: batchTimestamp,
          batchSize: shieldProofs.length,
          newMerkleRoot,
          anonymizedProofs: shieldProofs.map((p) => ({
            nullifierHash: p.publicSignals[0],
            type: p.proofType,
          })),
        });

        const auditHash = this.hashObject({ batchId, newMerkleRoot, batchTimestamp });
        const queueAgeMs = firstProofTs ? batchTimestamp - firstProofTs : 0;
        await this.submitBatchToGuard(
          shieldProofs.length,
          decisionMeta ? decisionMeta.scheduledDelayMs : this.MIN_RANDOM_DELAY,
          queueAgeMs,
          newMerkleRoot,
          auditHash,
          decisionMeta
        );
      }

      // 2. Handle Withdrawals (Execute on-chain)
      for (const p of withdrawProofs) {
        try {
          await this.executeWithdrawalOnChain(p);
        } catch (withdrawErr) {
          console.error(`❌ Withdrawal execution failed for ${p.submissionId}:`, withdrawErr.message);
        }
      }

      console.log(`✅ Batch completed: ${batchSize} proofs processed`);
      console.log('👂 Listening for next batch...');
    } catch (error) {
      console.error('❌ Batch execution failed:', error.message);
    } finally {
      this.batchScheduled = false;
    }
  }

  /**
   * Execute a single withdrawal proof on the VanishGuard contract
   */
  async executeWithdrawalOnChain(proofData) {
    const guardId = process.env.VANISH_GUARD_CONTRACT_ID;
    if (!guardId) throw new Error('VANISH_GUARD_CONTRACT_ID not set');

    const { ContractExecuteTransaction, ContractId, Hbar } = require('@hashgraph/sdk');
    const { Interface } = require('ethers');

    // Extract signals: [nullifierHash, commitment, rootLow, rootHigh, recipientAddr, amount]
    const signals = proofData.publicSignals;
    const nullifierHash = signals[0];
    const commitment = signals[1];
    
    const commitmentHex = normalizeHex(commitment.startsWith('0x') ? commitment : BigInt(commitment).toString(16));
    const rootHex = normalizeHex(((BigInt(signals[3]) << 128n) | BigInt(signals[2])).toString(16));
    const recipient = normalizeHex(BigInt(signals[4]).toString(16), 40);
    const amountTinybars = BigInt(signals[5]);

    const isInternalSwap = recipient === '0x' + '0'.repeat(40);
    const newCommitment = proofData.newCommitment ? normalizeHex(proofData.newCommitment) : commitmentHex;

    const abi = isInternalSwap
      ? ['function internalSwap(uint256 amountTinybars, uint256 nullifierHash, bytes32 sourceCommitment, bytes32 newCommitment, bytes32 root, uint256[2] proofA, uint256[2][2] proofB, uint256[2] proofC)']
      : ['function withdraw(uint256 amountTinybars, address payable recipient, uint256 nullifierHash, bytes32 commitment, bytes32 root, uint256[2] proofA, uint256[2][2] proofB, uint256[2] proofC)'];
    
    const iface = new Interface(abi);
    // Format proof for Solidity
    const pA = [proofData.proof.pi_a[0], proofData.proof.pi_a[1]];
    const pB = [
      [proofData.proof.pi_b[0][1], proofData.proof.pi_b[0][0]],
      [proofData.proof.pi_b[1][1], proofData.proof.pi_b[1][0]]
    ];
    const pC = [proofData.proof.pi_c[0], proofData.proof.pi_c[1]];

    const methodName = isInternalSwap ? 'internalSwap' : 'withdraw';
    const methodParams = isInternalSwap
      ? [amountTinybars, BigInt(nullifierHash), commitmentHex, newCommitment, rootHex, pA, pB, pC]
      : [amountTinybars, recipient, BigInt(nullifierHash), commitmentHex, rootHex, pA, pB, pC];

    const calldata = iface.encodeFunctionData(methodName, methodParams);

    try {
      const txResponse = await new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(guardId))
        .setGas(1_200_000) // Swaps might take more gas if they update Merkle tree (future)
        .setFunctionParameters(Buffer.from(calldata.replace('0x', ''), 'hex'))
        .execute(this.client);

      const receipt = await txResponse.getReceipt(this.client);
      console.log(`✅ ${isInternalSwap ? 'Internal Swap' : 'Withdrawal'} executed on Hedera! Status: ${receipt.status.toString()}`);
      console.log(`   Tx ID: ${txResponse.transactionId.toString()}`);
    } catch (err) {
      if (err.message.includes('CONTRACT_REVERT_EXECUTED')) {
        console.log(`⚠️  Root not found on-chain (${rootHex.slice(0, 10)}...). Executing Just-In-Time (JIT) root synchronization...`);
        await this.submitBatchToGuard(1, 1000, 1000, rootHex, normalizeHex(crypto.randomBytes(32).toString('hex')));
        
        console.log(`🔄 Retrying with synchronized root...`);
        const retryTx = await new ContractExecuteTransaction()
          .setContractId(ContractId.fromString(guardId))
          .setGas(1_200_000)
          .setFunctionParameters(Buffer.from(calldata.replace('0x', ''), 'hex'))
          .execute(this.client);
        await retryTx.getReceipt(this.client);
        console.log(`✅ ${isInternalSwap ? 'Internal Swap' : 'Withdrawal'} SUCCEEDED after JIT synchronization!`);
      } else {
        throw err;
      }
    }

    // 3. Notify Recipient if it's a Stealth Payment
    if (proofData.stealthPayload && proofData.stealthPayload.recipientAccountId) {
      try {
        const payload = {
          type: 'STEALTH_TRANSFER',
          ephemeralPublicKey: proofData.stealthPayload.ephemeralPublicKey,
          stealthAddress: proofData.stealthPayload.stealthAddress,
          amount: Number(signals[5]) / 100000000,
          timestamp: Date.now(),
          batchId: proofData.submissionId, // Link to submission
          senderAccountId: proofData.stealthPayload.senderAccountId,
          zkProof: proofData.proof,
          publicSignals: proofData.publicSignals
        };
        
        console.log(`📡 Sending stealth notification to ${proofData.stealthPayload.recipientAccountId}...`);
        await hip1334.sendEncryptedMessage(this.client, proofData.stealthPayload.recipientAccountId, payload);
        console.log(`✅ Stealth notification sent.`);
      } catch (notifErr) {
        console.warn(`⚠️ Stealth notification failed: ${notifErr.message}`);
      }
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

  /* method computeNewMerkleRoot removed, using IncrementalMerkleTree */

  async initializeHIP1334() {
    this.hip1334TopicId = process.env.HIP1334_TOPIC_ID;
    this.hip1334EncPrivKey = process.env.HIP1334_ENC_PRIV_KEY;

    if (this.hip1334TopicId && this.hip1334EncPrivKey) {
      console.log(`📬 HIP-1334 inbox loaded from .env: ${this.hip1334TopicId}`);
      return;
    }

    console.log('📬 Creating new HIP-1334 inbox (first run)...');
    const { topicId, encPrivateKey } = await hip1334.createInbox(
      this.client,
      this.accountId.toString(),
      this.privateKey
    );
    this.hip1334TopicId = topicId;
    this.hip1334EncPrivKey = encPrivateKey;
    console.log(`🚨 IMPORTANT: Save these to your .env:`);
    console.log(`HIP1334_TOPIC_ID=${topicId}`);
    console.log(`HIP1334_ENC_PRIV_KEY=${encPrivateKey}`);
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
      console.error('⚠️ HIP-1334 init failed:', err.message);
    }

    console.log(`👂 Pool Manager always listening to fallback raw HCS topic: ${this.privateTopic}`);

    new TopicMessageQuery()
      .setTopicId(this.privateTopic)
      .setStartTime(Math.floor(Date.now() / 1000) - 2) // Slight buffer for sync issues
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
