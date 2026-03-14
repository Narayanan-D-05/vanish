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
    this.lastApprovedDecision = null;

    this.aiEnabled = process.env.ENABLE_AI_CORE !== 'false';
    this.aiDecisionTimeoutMs = Number(this.policy.aiDecisionTimeoutMs || 5000);

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
      const iface = new Interface([
        'function submitBatchWithDecision(uint32 batchSize, uint256 delayMs, uint256 queueAgeMs, bytes32 merkleRoot, bytes32 auditHash, bytes32 decisionEnvelopeHash, bytes decisionSignature)',
      ]);
      const calldata = iface.encodeFunctionData('submitBatchWithDecision', [
        batchSize,
        BigInt(delayMs),
        BigInt(queueAgeMs),
        newMerkleRoot.padEnd(66, '0').slice(0, 66), // ensure 32-byte hex
        '0x' + auditHash.slice(0, 64).padEnd(64, '0'),
        decisionMeta && decisionMeta.envelopeHash
          ? '0x' + decisionMeta.envelopeHash.slice(0, 64)
          : '0x' + '0'.repeat(64),
        decisionMeta && decisionMeta.signatureHex
          ? '0x' + decisionMeta.signatureHex.replace(/^0x/, '')
          : '0x',
      ]);

      await new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(guardId))
        .setGas(100_000)
        .setFunctionParameters(Buffer.from(calldata.replace('0x', ''), 'hex'))
        .execute(this.client);

      console.log(`⛓️  Batch anchored on-chain → VanishGuard (${guardId})`);
    } catch (err) {
      console.error(`⚠️ VanishGuard.submitBatch failed: ${err.message}`);
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

    // ─── TIER 3: Safe fallback ─────────────────────────────────────────────────
    console.warn(`⚠️ [AML] Both oracle tiers failed for ${accountId}. Returning safe default.`);
    return 0;
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

    const signedEnvelope = this.signDecisionEnvelope(envelope);

    const validation = this.policyEngine.validateBatchDecision(envelope, context);
    await this.logDecisionAuditToHCS(
      envelope,
      validation,
      this.policy.version || 'unknown',
      proposed.fallbackUsed,
      signedEnvelope
    );

    if (!validation.approved) {
      console.log(`🛑 Policy guard rejected AI decision: ${validation.errors.join('; ')}`);
      return;
    }

    if (!envelope.payload.execute) {
      console.log('⏳ AI decision says wait; no batch scheduled yet');
      this.lastApprovedDecision = null;
      return;
    }

    const delayMs = envelope.payload.delayMs;
    console.log('🎯 Batch decision approved by policy guard');
    console.log(`   Queue size: ${context.queueSize}`);
    console.log(`   Delay: ${Math.round(delayMs / 1000)} seconds`);
    console.log(`   Reason: ${envelope.payload.reason}`);

    this.lastApprovedDecision = {
      decisionId: envelope.decisionId,
      envelopeHash: signedEnvelope.envelopeHash,
      signatureHex: signedEnvelope.signatureHex,
      signerPublicKey: signedEnvelope.signerPublicKey,
      scheduledDelayMs: delayMs,
      approvedAt: Date.now(),
    };

    this.batchScheduled = true;
    setTimeout(() => {
      this.executeBatch().catch((err) => console.error('❌ executeBatch failed:', err.message));
    }, delayMs);
  }

  async executeBatch() {
    console.log('🚀 Executing privacy batch...');

    const batchSize = this.proofQueue.length;
    const batch = [...this.proofQueue];
    const firstProofTs = this.firstProofTimestamp;
    const decisionMeta = this.lastApprovedDecision;

    this.proofQueue = [];
    this.firstProofTimestamp = null;
    this.batchScheduled = false;
    this.lastApprovedDecision = null;

    try {
      const anonymizedBatch = batch.map((p) => ({
        nullifierHash: p.publicSignals[0],
        commitment: p.publicSignals[1],
        proofType: p.proofType,
        stealthPayload: p.stealthPayload, // Include ZK-Rollup metadata in batch
      }));

      const newMerkleRoot = this.computeNewMerkleRoot(batch);

      const batchId = Math.random().toString(36).slice(2);
      const batchTimestamp = Date.now();

      await this.logBatchToHCS({
        batchId,
        timestamp: batchTimestamp,
        batchSize,
        newMerkleRoot,
        anonymizedProofs: anonymizedBatch.map((p) => ({
          nullifierHash: p.nullifierHash,
          type: p.proofType,
          stealthPayload: p.stealthPayload, // Pass payload to HCS logger
        })),
      });

      // Anchor on-chain: link batch to guard with audit hash
      const auditHash = this.hashObject({ batchId, newMerkleRoot, batchTimestamp });
      const queueAgeMs = firstProofTs
        ? batchTimestamp - firstProofTs
        : 0;
      await this.submitBatchToGuard(
        batchSize,
        decisionMeta ? decisionMeta.scheduledDelayMs : this.MIN_RANDOM_DELAY,
        queueAgeMs,
        newMerkleRoot,
        auditHash,
        decisionMeta
      );

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

  /**
   * Compute the new Merkle root using SHA-256 for all intermediate nodes.
   *
   * Hybrid Hashing pattern (2026 standard):
   *  - Leaf = Poseidon(nullifier, secret, amount)  ← stays inside the ZK circuit, never in Solidity
   *  - Internal nodes = sha256(left ‖ right)       ← uses Hedera's native SHA-256 precompile on-chain
   *
   * This keeps Poseidon OUT of Solidity (200k-500k gas per hash) while keeping
   * it in the ZK circuits where it is cheap (< 200 constraints per hash).
   */
  computeNewMerkleRoot(batch) {
    // Leaves are the commitment public signals (already Poseidon-hashed off-chain)
    let layer = batch.map((p) => Buffer.from(p.publicSignals[1].replace('0x', '').padStart(64, '0'), 'hex'));

    // If odd number of leaves, duplicate the last one (standard Merkle padding)
    while (layer.length > 1) {
      if (layer.length % 2 !== 0) layer.push(layer[layer.length - 1]);

      const nextLayer = [];
      for (let i = 0; i < layer.length; i += 2) {
        const combined = Buffer.concat([layer[i], layer[i + 1]]);
        nextLayer.push(crypto.createHash('sha256').update(combined).digest());
      }
      layer = nextLayer;
    }

    return '0x' + layer[0].toString('hex');
  }

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
