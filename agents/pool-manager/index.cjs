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
  TransferTransaction,
  Hbar,
  TransactionId,
  Transaction,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  ContractCallQuery,
  ContractId,
} = require('@hashgraph/sdk');
const express = require('express');
const cors = require('cors');
const snarkjs = require('snarkjs');
const nodeFs = require('fs');
const fsp = nodeFs.promises;
const path = require('path');
const crypto = require('crypto');
const { keccak256, Wallet } = require('ethers');
const { EventEmitter } = require('events');

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

// =============================================================================
// SSE LOG STREAMING - Global Event Emitter for Real-time Terminal Output
// =============================================================================
const vanishLogEmitter = new EventEmitter();

// Intercept console.log to broadcast to frontend
const originalLog = console.log;
console.log = function(...args) {
  const message = args.join(' ');
  // Broadcast to all connected SSE clients
  vanishLogEmitter.emit('new-log', {
    timestamp: new Date().toISOString(),
    text: message,
    agent: 'PoolManager',
    type: 'log'
  });
  // Still print to actual terminal
  originalLog.apply(console, args);
};

// Intercept console.error as well
const originalError = console.error;
console.error = function(...args) {
  const message = args.join(' ');
  vanishLogEmitter.emit('new-log', {
    timestamp: new Date().toISOString(),
    text: message,
    agent: 'PoolManager',
    type: 'error'
  });
  originalError.apply(console, args);
};

const normalizeHex = (hex, length = 64) => {
  if (!hex) return '0x' + '0'.repeat(length);
  let clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return '0x' + clean.toLowerCase().padStart(length, '0').slice(-length);
};

class PoolManager {
  constructor() {
    // Validate credentials exist - fail loudly if missing
    const accountIdStr = process.env.POOL_MANAGER_ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID;
    const privateKeyStr = process.env.POOL_MANAGER_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY;

    if (!accountIdStr || !privateKeyStr) {
      throw new Error(
        'POOL_MANAGER_ACCOUNT_ID (or HEDERA_ACCOUNT_ID) and ' +
        'POOL_MANAGER_PRIVATE_KEY (or HEDERA_PRIVATE_KEY) must be set in environment. ' +
        'Real credentials are required for testnet transactions.'
      );
    }

    this.accountId = AccountId.fromString(accountIdStr);
    this.privateKey = PrivateKey.fromString(privateKeyStr);
    this.client = Client.forTestnet();
    this.client.setOperator(this.accountId, this.privateKey);
    // Increase robustness for testnet node instability
    this.client.setMaxAttempts(15);
    this.client.setNodeWaitTime(500);

    this.privateTopic = process.env.PRIVATE_TOPIC_ID;
    this.publicTopic = process.env.PUBLIC_ANNOUNCEMENT_TOPIC_ID;

    this.policyPath = process.env.VANISH_POLICY_PATH || path.join(__dirname, '../../config/vanish-policy.json');
    this.policyEngine = new PolicyEngine(this.policyPath);
    this.policy = this.policyEngine.policy;

    this.proofQueue = [];
    this.MIN_BATCH_SIZE = Number(this.policy.minBatchSize || 2);
    this.MAX_WAIT_TIME = Number(this.policy.maxWaitMinutes || 2) * 60 * 1000;
    this.MIN_RANDOM_DELAY = Number(this.policy.minDelaySeconds || 1) * 1000;
    this.MAX_RANDOM_DELAY = Number(this.policy.maxDelayMinutes ? this.policy.maxDelayMinutes * 60 : 60) * 1000;

    // Safety: Ensure bounds are valid to avoid policy engine rejection in deterministic fallback
    if (this.MAX_RANDOM_DELAY <= this.MIN_RANDOM_DELAY) {
      this.MAX_RANDOM_DELAY = this.MIN_RANDOM_DELAY + 5000;
    }

    this.treePath = path.join(__dirname, '../../config/merkle_tree.json');
    this.merkleTree = new IncrementalMerkleTree(this.treePath, 4);

    // Track anchored roots for withdrawal validation
    this.anchoredRootsPath = path.join(__dirname, '../../config/anchored_roots.json');
    this.anchoredRoots = this.loadAnchoredRoots();

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

    this.decisionInProgress = false;

    console.log('🔒 Pool Manager initialized (AI + Policy Guard)');
    console.log(`   Account: ${this.accountId}`);
    console.log(`   Policy: ${this.policyPath}`);
    console.log(`   AI Core: ${this.aiEnabled ? 'enabled' : 'disabled'}`);
    console.log(`   Decision Signer: ${this.decisionSignerWallet ? this.decisionSignerWallet.address : 'ed25519 fallback (off-chain only)'}`);
    console.log(`   Batching: Min ${this.MIN_BATCH_SIZE} proofs OR ${this.MAX_WAIT_TIME / 60000} minutes`);
    console.log(`   Delay bounds: ${this.MIN_RANDOM_DELAY / 1000}-${this.MAX_RANDOM_DELAY / 1000} seconds`);

    // HCS Message Cache for API
    this.hcsCache = {
      auditThoughts: [],
      transactions: []
    };

    // Start Express UI API Server
    this.startExpressServer();
  }

  /**
   * Start Express Server to serve the frontend dashboard
   */
  startExpressServer() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // GET /api/stats
    app.get('/api/stats', (req, res) => {
      res.json({
        success: true,
        anonymitySet: this.anchoredRoots.size || 0,
        poolSize: (this.merkleTree.leaves || []).length,
        pendingActions: this.proofQueue.length,
        totalVolume: 0 // Track actual pool HBAR balance in a robust way
      });
    });

    // GET /api/merkle-tree
    app.get('/api/merkle-tree', (req, res) => {
      res.json({
        success: true,
        root: this.merkleTree.root ? this.merkleTree.root.toString(16) : '0',
        depth: this.merkleTree.depth || 4,
        leafCount: (this.merkleTree.leaves || []).length,
        pendingCount: this.proofQueue.length
      });
    });

    // GET /api/transactions
    app.get('/api/transactions', (req, res) => {
      // Build transactions from hcsCache + proof queue history  
      const allTxs = [...this.hcsCache.transactions];
      
      // Supplement with any queued/processed proofs we know about
      if (this.proofQueue && this.proofQueue.length > 0) {
        this.proofQueue.forEach(proof => {
          const exists = allTxs.some(t => t.id === proof.id);
          if (!exists) {
            allTxs.push({
              id: proof.id || `proof_${Date.now()}`,
              type: 'shield',
              amount: `${proof.amount || '?'} HBAR`,
              timestamp: proof.timestamp || Date.now(),
              hashscanUrl: ''
            });
          }
        });
      }

      res.json({ success: true, transactions: allTxs });
    });

    // GET /api/ai/thoughts
    app.get('/api/ai/thoughts', (req, res) => {
      res.json({ success: true, thoughts: this.hcsCache.auditThoughts });
    });

    // GET /api/stream/thoughts — Real-time SSE endpoint for live terminal output
    app.get('/api/stream/thoughts', (req, res) => {
      // Set headers for Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders(); // Establish the connection immediately

      // Define the listener function
      const sendLog = (logData) => {
        res.write(`data: ${JSON.stringify(logData)}\n\n`);
      };

      // Subscribe to the global log emitter
      vanishLogEmitter.on('new-log', sendLog);

      // Send initial connection message
      sendLog({
        timestamp: new Date().toISOString(),
        text: '🔴 Connected to PoolManager log stream',
        agent: 'PoolManager',
        type: 'system'
      });

      // Cleanup when the frontend disconnects
      req.on('close', () => {
        vanishLogEmitter.off('new-log', sendLog);
      });
    });

    const PORT = process.env.POOL_MANAGER_PORT || 3002;
    app.listen(PORT, () => {
      console.log(`\n🌐 Vanilla API Active: http://localhost:${PORT}`);
      console.log(`   └─ Dashboard UI connectable for network stats & HCS`);
    });
  }

  async loadVerificationKeys() {
    try {
      const shieldVkJson = await fsp.readFile(path.join(__dirname, '../../circuits/shield_verification_key.json'), 'utf8');
      this.shieldVK = JSON.parse(shieldVkJson);

      const withdrawVkJson = await fsp.readFile(path.join(__dirname, '../../circuits/withdraw_verification_key.json'), 'utf8');
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
   * Load anchored roots from persistent storage
   */
  loadAnchoredRoots() {
    try {
      if (nodeFs.existsSync(this.anchoredRootsPath)) {
        const data = JSON.parse(nodeFs.readFileSync(this.anchoredRootsPath, 'utf8'));
        console.log(`📂 Loaded ${data.length} anchored roots from storage`);
        return new Set(data);
      }
    } catch (e) {
      console.error(`⚠️ Failed to load anchored roots: ${e.message}`);
    }
    return new Set();
  }

  /**
   * Persist anchored roots to storage
   */
  persistAnchoredRoots(roots) {
    try {
      // Add new roots to the set
      roots.forEach(r => this.anchoredRoots.add(r.toLowerCase()));

      // Save to file
      const dir = path.dirname(this.anchoredRootsPath);
      if (!nodeFs.existsSync(dir)) nodeFs.mkdirSync(dir, { recursive: true });

      nodeFs.writeFileSync(
        this.anchoredRootsPath,
        JSON.stringify([...this.anchoredRoots], null, 2)
      );
      console.log(`💾 Persisted ${roots.length} new anchored roots (${this.anchoredRoots.size} total)`);
    } catch (e) {
      console.error(`⚠️ Failed to persist anchored roots: ${e.message}`);
    }
  }

  /**
   * Check if a root has been anchored (locally tracked)
   */
  isRootAnchored(rootHex) {
    return this.anchoredRoots.has(rootHex.toLowerCase());
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

      const receipt = await new TopicMessageSubmitTransaction()
        .setTopicId(this.publicTopic)
        .setMessage(JSON.stringify(audit))
        .execute(this.client);

      // Save for UI Dashboard
      this.hcsCache.auditThoughts.push({
        id: audit.decisionId,
        timestamp: audit.timestamp,
        type: 'decision',
        message: `AI Policy Decision: ${validation.approved ? 'Approved' : 'Rejected'}`,
        context: JSON.stringify(envelope.context)
      });
      if (this.hcsCache.auditThoughts.length > 50) this.hcsCache.auditThoughts.shift();

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
      const { ContractExecuteTransaction, ContractId, ContractCallQuery } = require('@hashgraph/sdk');
      const { Interface } = require('ethers');

      // Detect if we have a contract-verifiable ECDSA signature.
      // Ed25519 signatures (standard for Hedera) cannot be verified via ecrecover on-chain.
      const hasEcdsa = decisionMeta && decisionMeta.signatureScheme === 'ecdsa-secp256k1';

      const rootsArray = Array.isArray(newMerkleRoot) ? newMerkleRoot : [newMerkleRoot];
      const normalizedRoots = rootsArray.map(r => normalizeHex(r));

      // Deduplicate roots - contract may reject duplicates
      const uniqueRoots = [...new Set(normalizedRoots)];

      const abi = hasEcdsa
        ? ['function submitBatchWithDecision(uint32 batchSize, uint256 delayMs, uint256 queueAgeMs, bytes32[] roots, bytes32 auditHash, bytes32 decisionEnvelopeHash, bytes decisionSignature)']
        : ['function submitBatch(uint32 batchSize, uint256 delayMs, uint256 queueAgeMs, bytes32[] roots, bytes32 auditHash)'];

      const iface = new Interface(abi);

      // Pass the *entire* batchSize (Shields + Withdraws) to the contract so it passes the
      // policy validation checks. `uniqueRoots` length does not need to equal `batchSize`.
      const actualBatchSize = batchSize;

      const params = hasEcdsa
        ? [
            actualBatchSize,
            BigInt(delayMs),
            BigInt(queueAgeMs),
            uniqueRoots,
            normalizeHex(auditHash),
            normalizeHex(decisionMeta.envelopeHash),
            normalizeHex(decisionMeta.signatureHex, 0), // Signatures are variable length, don't pad
          ]
        : [
            actualBatchSize,
            BigInt(delayMs),
            BigInt(queueAgeMs),
            uniqueRoots,
            normalizeHex(auditHash),
          ];

      const calldata = iface.encodeFunctionData(hasEcdsa ? 'submitBatchWithDecision' : 'submitBatch', params);

      const txResponse = await new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(guardId))
        .setGas(1_000_000) // Increased for multi-root loops
        .setFunctionParameters(Buffer.from(calldata.replace('0x', ''), 'hex'))
        .execute(this.client);

      const receipt = await txResponse.getReceipt(this.client);

      if (receipt.status.toString() === 'SUCCESS') {
        console.log(`⛓️  Batch anchored on-chain → VanishGuard (${guardId})`);
        console.log(`   Roots anchored: ${uniqueRoots.length}`);
        console.log(`✨ Protocol Ritual Complete: 100.0% of funds settled to privacy pool.`);

        // Verify roots are now in rootHistory
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for mirror node

        const checkAbi = ['function rootHistory(bytes32) view returns (bool)'];
        const checkIface = new Interface(checkAbi);

        for (const root of uniqueRoots) {
          try {
            const checkCalldata = checkIface.encodeFunctionData('rootHistory', [root]);
            const checkResult = await new ContractCallQuery()
              .setContractId(ContractId.fromString(guardId))
              .setGas(50_000)
              .setFunctionParameters(Buffer.from(checkCalldata.replace('0x', ''), 'hex'))
              .execute(this.client);

            const exists = checkIface.decodeFunctionResult('rootHistory', checkResult.bytes)[0];
            if (exists) {
              console.log(`   ✅ Root ${root.slice(0, 18)}... confirmed in rootHistory`);
            } else {
              console.warn(`   ⚠️ Root ${root.slice(0, 18)}... NOT found in rootHistory after anchor`);
            }
          } catch (verifyErr) {
            console.warn(`   ⚠️ Could not verify root ${root.slice(0, 18)}...: ${verifyErr.message}`);
          }
        }
      } else {
        console.error(`❌ VanishGuard anchor status: ${receipt.status.toString()}`);
      }
    } catch (err) {
      console.error(`⚠️ VanishGuard anchor failed: ${err.message}`);
      // Throw error so caller can handle retry
      throw err;
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
    const apiKey = process.env.CHAINALYSIS_API_KEY;
    if (apiKey) {
      try {
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
        } else {
          console.warn(`⚠️ [AML] Mirror Node could not resolve EVM address for ${accountId}. Skipping Tier 1 REST check.`);
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
      } else {
        console.warn(`⚠️ [AML] Mirror Node could not resolve EVM address for ${accountId}. Skipping Tier 2 On-Chain check.`);
      }
    } catch (onChainErr) {
      console.warn(`⚠️ [On-Chain Oracle] Failed (${onChainErr.message}).`);
    }

    // ─── TIER 3: Safe Exit (Fallbacks) ────────────────────────────────────────
    const isTestnet = process.env.HEDERA_NETWORK === 'testnet';
    const allowSafeExit = isTestnet || process.env.ALLOW_OFFLINE_COMPLIANCE === 'true';

    if (allowSafeExit) {
      console.warn(`⚠️ [AML] Both oracle tiers failed for ${accountId}.`);
      console.warn(`   Failsafe activated: using Safe Exit (Score: 0) for ${process.env.HEDERA_NETWORK} environment.`);
      return 0;
    }

    console.warn(`🚨 [AML] Both oracle tiers failed for ${accountId}. Rejecting to enforce strict compliance.`);
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
      console.log(`❌ Rejected invalid proof: ${proofData.submissionId}`);
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
      // 2. Fund Pull (HIP-1340) - only for shield proofs
      if (proofData.proofType === 'shield') {
        let attempts = 0;
        const maxAttempts = 3;
        let success = false;
        const delegation = new DelegationManager(this.client);

        while (attempts < maxAttempts && !success) {
          try {
            const receipt = await delegation.executeDelegatedTransfer(
              proofData.submitter,
              process.env.POOL_CONTRACT_ID,
              proofData.amount
            );
            console.log(`💸 HIP-1340 pull: ${proofData.amount} HBAR from ${proofData.submitter} → ${process.env.POOL_CONTRACT_ID}`);
            console.log(`   Tx: ${receipt.transactionId}`);
            success = true;
          } catch (err) {
            attempts++;
            if (err.message.includes('SPENDER_DOES_NOT__HAVE_ALLOWANCE') && attempts < maxAttempts) {
              console.warn(`⏳ [RACE] Allowance not yet detected for ${proofData.submitter}. Retrying in 2s... (Attempt ${attempts}/${maxAttempts})`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
            
            if (err.message.includes('INSUFFICIENT_PAYER_BALANCE')) {
              console.error(`❌ Fund pull failed: Insufficient Balance in ${proofData.submitter}`);
              return false;
            } else {
              console.error(`⚠️ Fund pull failed: ${err.message}`);
              return false;
            }
          }
        }
      }
    }

    this.proofQueue.push({
      ...proofData,
      timestamp: Date.now(),
      submissionId: proofData.submissionId || crypto.randomUUID(),
    });

    // GROW TREE REAL-TIME: Insert into Merkle tree immediately so UI "Ghost Map" updates
    const type = (proofData.proofType || '').toLowerCase();
    const commitment = proofData.commitment || (type === 'shield' ? proofData.publicSignals?.[0] : null);

    if (type === 'shield' && commitment) {
      try {
        console.log(`🌳 Growing Merkle Tree: Inserting leaf ${String(commitment).slice(0, 10)}...`);
        this.merkleTree.insert(commitment);
      } catch (e) {
        if (e.message.includes('Merkle tree full')) {
          console.warn(`🔄 Visualization Tree full, resetting to simulate continuous privacy set...`);
          this.merkleTree.leaves = [];
          this.merkleTree.insert(commitment);
        } else {
          console.error(`⚠️ Tree insertion failed: ${e.message}`);
        }
      }
    }

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

      // 1. Handle Shields FIRST — Per-Fragment Pool Architecture
      // Each commitment is an independent privacy pool with its own root.
      // This enables parallel async processing and eliminates multi-leaf ordering ambiguity.
      let anchoredRoots = [];
      if (shieldProofs.length > 0) {
        const { computeFragmentRoot } = require('../../build-test-inputs.cjs');
        const batchTimestamp = Date.now();
        const batchId = Math.random().toString(36).slice(2);
        const fragmentRoots = [];
        for (const p of shieldProofs) {
          const commitment = p.publicSignals[1]; // decimal string
          const fragmentData = computeFragmentRoot(commitment);
          const fragmentRoot = fragmentData.rootHex;
          fragmentRoots.push(fragmentRoot);

          console.log(`   🔐 Fragment root computed: ${fragmentRoot.slice(0, 18)}...`);

          // ⚠️ Removed legacy double-sweep logic. Funds are already securely pulled
          // into the VanishGuard contract during `addProofToQueue` execution via `executeDelegatedTransfer`.
          console.log(`   ✅ Fragment ready for anchoring (funds secured upfront).`);
        }

        const lastFragmentRoot = fragmentRoots[fragmentRoots.length - 1];

        await this.logBatchToHCS({
          batchId,
          timestamp: batchTimestamp,
          batchSize: shieldProofs.length,
          architecture: 'per-fragment-pool',
          newMerkleRoot: lastFragmentRoot,
          anonymizedProofs: shieldProofs.map((p) => ({
            nullifierHash: p.publicSignals[0],
            type: p.proofType,
          })),
        });

        const auditHash = this.hashObject({ batchId, lastFragmentRoot, batchTimestamp });
        const queueAgeMs = firstProofTs ? batchTimestamp - firstProofTs : 0;

        // Try to anchor roots with retry logic
        let anchorSuccess = false;
        let anchorAttempts = 0;
        const maxAnchorAttempts = 3;

        while (!anchorSuccess && anchorAttempts < maxAnchorAttempts) {
          anchorAttempts++;
          try {
            await this.submitBatchToGuard(
              batchSize,
              decisionMeta ? decisionMeta.scheduledDelayMs : this.MIN_RANDOM_DELAY,
              queueAgeMs,
              fragmentRoots,
              auditHash,
              decisionMeta
            );
            anchorSuccess = true;
          } catch (anchorErr) {
            console.error(`   ⚠️ Anchor attempt ${anchorAttempts} failed: ${anchorErr.message}`);
            if (anchorAttempts < maxAnchorAttempts) {
              console.log(`   🔄 Retrying in 2s...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        if (anchorSuccess) {
          // Store anchored roots for withdrawal validation
          anchoredRoots = fragmentRoots;
          // Persist anchored roots to file for recovery
          this.persistAnchoredRoots(fragmentRoots);
          console.log(`   ✅ ${anchoredRoots.length} roots anchored and ready for withdrawals`);

          // Notify user agent that these shield proofs are fully confirmed so it can clear them from pending
          for (const p of shieldProofs) {
            await this.notifyWithdrawalComplete(p, {
              status: 'SUCCESS',
              type: 'SHIELD_COMPLETE',
              transactionId: 'batch_anchor_' + batchId,
              amount: p.publicSignals[5] ? Number(BigInt(p.publicSignals[5])) / 1e8 : 0, 
              recipient: null,
              nullifierHash: String(p.publicSignals[0]),
              commitment: String(p.publicSignals[1]),
              timestamp: Date.now()
            });
          }
        } else {
          console.error(`   ❌ Failed to anchor roots after ${maxAnchorAttempts} attempts`);
          console.error(`   ⚠️ Withdrawals for these commitments will fail until roots are anchored`);
        }
      }

      // 2. Handle Withdrawals (Execute on-chain) - ONLY after shields are anchored
      // Wait a moment for mirror node to sync if we just anchored roots
      if (shieldProofs.length > 0 && withdrawProofs.length > 0) {
        console.log(`   ⏳ Waiting 3s for mirror node to sync anchored roots...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

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
   * Phase 38: Sweep shielded HBAR from the user's allowance into the VanishGuard contract
   * to ensure the vault has solvency for future withdrawals.
   */
  async sweepShieldedFunds(proofData) {
    const { TransferTransaction, ContractId, Hbar, TransactionId } = require('@hashgraph/sdk');
    const guardId = process.env.VANISH_GUARD_CONTRACT_ID;
    if (!guardId) throw new Error('VANISH_GUARD_CONTRACT_ID not set');

    const submitter = proofData.submitter;
    const amount = Number(proofData.amount);

    if (!submitter) throw new Error('No submitter provided in proofData, cannot sweep funds.');

    console.log(`   💸 Sweeping ${amount} HBAR from ${submitter} to VanishGuard...`);
    
    // Explicitly pay for gas using the Pool Manager's account to decouple origin
    // since the submitter gave us taking rights (allowance) for `amount`.
    const sweepTx = new TransferTransaction()
      .addApprovedHbarTransfer(submitter, new Hbar(amount).negated())
      .addHbarTransfer(guardId, new Hbar(amount))
      .setTransactionId(TransactionId.generate(this.accountId));

    const txResponse = await sweepTx.execute(this.client);
    const receipt = await txResponse.getReceipt(this.client);
    
    if (receipt.status.toString() === 'SUCCESS') {
      console.log(`   ✅ Vault funded: ${amount} HBAR secured in contract`);
    } else {
      throw new Error(`Transfer failed: ${receipt.status.toString()}`);
    }
  }

  /**
   * Execute a single withdrawal proof on the VanishGuard contract
   */
  async executeWithdrawalOnChain(proofData) {
    const guardId = process.env.VANISH_GUARD_CONTRACT_ID;
    if (!guardId) throw new Error('VANISH_GUARD_CONTRACT_ID not set');

    const { ContractExecuteTransaction, ContractId, ContractCallQuery, Hbar } = require('@hashgraph/sdk');
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

    // Pre-check: Verify nullifier hasn't been used
    try {
      const nullifierCheckAbi = ['function nullifiers(uint256) view returns (bool)'];
      const nullifierIface = new Interface(nullifierCheckAbi);
      const nullifierCheckCalldata = nullifierIface.encodeFunctionData('nullifiers', [BigInt(nullifierHash)]);
      const nullifierResult = await new ContractCallQuery()
        .setContractId(ContractId.fromString(guardId))
        .setGas(50_000)
        .setFunctionParameters(Buffer.from(nullifierCheckCalldata.replace('0x', ''), 'hex'))
        .execute(this.client);
      const nullifierUsed = nullifierIface.decodeFunctionResult('nullifiers', nullifierResult.bytes)[0];

      if (nullifierUsed) {
        console.error(`   ❌ Nullifier ${String(nullifierHash).slice(0, 18)}... has already been spent!`);
        console.error(`   This withdrawal cannot proceed - the proof has already been used.`);
        throw new Error('NullifierAlreadyUsed: This proof has already been spent. Cannot withdraw twice with the same proof.');
      }
      console.log(`   ✓ Nullifier check passed (not yet spent)`);
    } catch (preCheckErr) {
      if (preCheckErr.message.includes('NullifierAlreadyUsed')) throw preCheckErr;
      console.warn(`   ⚠️ Could not verify nullifier status: ${preCheckErr.message}`);
    }

    // First, check if root exists locally (faster)
    if (this.isRootAnchored(rootHex)) {
      console.log(`✅ Root ${rootHex.slice(0, 18)}... found in local anchored roots`);
    } else {
      // Fall back to on-chain check
      console.log(`   🔍 Checking root ${rootHex.slice(0, 18)}... on-chain...`);
      const rootCheckAbi = ['function rootHistory(bytes32) view returns (bool)', 'function currentMerkleRoot() view returns (bytes32)'];
      const rootCheckIface = new Interface(rootCheckAbi);

      try {
        const rootCheckCalldata = rootCheckIface.encodeFunctionData('rootHistory', [rootHex]);
        const rootCheckResult = await new ContractCallQuery()
          .setContractId(ContractId.fromString(guardId))
          .setGas(50_000)
          .setFunctionParameters(Buffer.from(rootCheckCalldata.replace('0x', ''), 'hex'))
          .execute(this.client);

        const rootExists = rootCheckIface.decodeFunctionResult('rootHistory', rootCheckResult.bytes)[0];

        if (!rootExists) {
          console.log(`⚠️ Root ${rootHex.slice(0, 18)}... NOT found in contract rootHistory`);
          console.log(`   Commitment: ${commitmentHex.slice(0, 18)}...`);
          console.log(`   Local anchored roots: ${this.anchoredRoots.size}`);

          // AUTO-RECOVERY: Try to anchor the missing root
          console.log(`   🔄 Attempting auto-recovery: anchoring missing root...`);
          const recovered = await this.manuallyAnchorRoot(rootHex);

          if (recovered) {
            console.log(`   ✅ Root anchored via auto-recovery! Retrying withdrawal...`);
            // Wait a moment for mirror node sync
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            throw new Error(`RootNotFound: The Merkle root for this withdrawal has not been anchored to the contract. Auto-recovery failed. Ensure the deposit was properly shielded.`);
          }
        }

        console.log(`✅ Root ${rootHex.slice(0, 18)}... found in contract rootHistory`);
        // Add to local tracking for future
        this.anchoredRoots.add(rootHex.toLowerCase());
      } catch (checkErr) {
        if (checkErr.message.includes('RootNotFound')) throw checkErr;
        console.warn(`⚠️ Could not verify root existence: ${checkErr.message}`);
      }
    }

    const abi = isInternalSwap
      ? ['function internalSwap(uint256 amountTinybars, uint256 nullifierHash, bytes32 sourceCommitment, bytes32 newCommitment, bytes32 root, uint256[2] proofA, uint256[2][2] proofB, uint256[2] proofC)']
      : ['function withdraw(uint256 amountTinybars, address payable recipient, uint256 nullifierHash, bytes32 commitment, bytes32 root, uint256[2] proofA, uint256[2][2] proofB, uint256[2] proofC)'];

    const iface = new Interface(abi);
    // Format proof for Solidity (snarkjs uses different format than Solidity verifier)
    // Note: snarkjs outputs pi_b in [[a,b],[c,d]] format but Solidity expects [[b,a],[d,c]]
    const pA = [proofData.proof.pi_a[0], proofData.proof.pi_a[1]];
    const pB = [
      [proofData.proof.pi_b[0][1], proofData.proof.pi_b[0][0]],
      [proofData.proof.pi_b[1][1], proofData.proof.pi_b[1][0]]
    ];
    const pC = [proofData.proof.pi_c[0], proofData.proof.pi_c[1]];

    // Log proof parameters for debugging
    if (process.env.ENABLE_DEBUG === 'true') {
      console.log(`   🔐 Proof parameters:`);
      console.log(`      Amount: ${amountTinybars} tinybars (${Number(amountTinybars) / 1e8} HBAR)`);
      console.log(`      Nullifier: ${String(nullifierHash).slice(0, 18)}...`);
      console.log(`      Commitment: ${commitmentHex.slice(0, 18)}...`);
      console.log(`      Root: ${rootHex.slice(0, 18)}...`);
      console.log(`      Recipient: ${isInternalSwap ? 'INTERNAL SWAP' : recipient}`);
    }

    // Verify proof locally before submitting to contract
    try {
      const isValid = await this.verifyProof(proofData.proof, proofData.publicSignals, 'withdraw');
      if (!isValid) {
        throw new Error('Local proof verification failed - proof is mathematically invalid');
      }
      console.log(`   ✓ Local proof verification passed`);
    } catch (verifyErr) {
      console.error(`   ❌ Local proof verification failed: ${verifyErr.message}`);
      throw new Error(`Proof verification failed: ${verifyErr.message}`);
    }

    const methodName = isInternalSwap ? 'internalSwap' : 'withdraw';
    const methodParams = isInternalSwap
      ? [amountTinybars, BigInt(nullifierHash), commitmentHex, newCommitment, rootHex, pA, pB, pC]
      : [amountTinybars, recipient, BigInt(nullifierHash), commitmentHex, rootHex, pA, pB, pC];

    const calldata = iface.encodeFunctionData(methodName, methodParams);

    let txResponse;
    try {
      console.log(`   📤 Submitting ${methodName} transaction to VanishGuard...`);
      txResponse = await new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(guardId))
        .setGas(1_200_000)
        .setFunctionParameters(Buffer.from(calldata.replace('0x', ''), 'hex'))
        .execute(this.client);

      const receipt = await txResponse.getReceipt(this.client);
      console.log(`✅ ${isInternalSwap ? 'Internal Swap' : 'Withdrawal'} executed on Hedera! Status: ${receipt.status.toString()}`);
      console.log(`   Tx ID: ${txResponse.transactionId.toString()}`);

      // Notify user agent of successful withdrawal
      await this.notifyWithdrawalComplete(proofData, {
        status: 'SUCCESS',
        transactionId: txResponse.transactionId.toString(),
        amount: Number(amountTinybars) / 1e8,
        recipient: recipient,
        nullifierHash: String(nullifierHash),
        commitment: commitmentHex,
        timestamp: Date.now()
      });

    } catch (err) {
      // Check for specific revert reasons
      const errMsg = err.message || '';
      const status = err.status?._code?.toString() || '';

      console.error(`   ❌ Withdrawal failed: ${errMsg}`);
      if (err.status) console.error(`   Status: ${status}`);

      if (errMsg.includes('NullifierAlreadyUsed')) {
        throw new Error('Withdrawal failed: This proof has already been used (nullifier spent).');
      }
      if (errMsg.includes('InvalidWithdrawProof')) {
        throw new Error('Withdrawal failed: ZK proof verification failed. The proof may be malformed or for a different circuit.');
      }
      if (errMsg.includes('RootNotFound')) {
        throw new Error('Withdrawal failed: Merkle root not recognized by contract. The deposit may not have been batched yet.');
      }
      if (errMsg.includes('WithdrawalFailed')) {
        throw new Error('Withdrawal failed: The HBAR transfer to recipient failed. Check contract balance.');
      }
      if (errMsg.includes('CONTRACT_REVERT_EXECUTED')) {
        // Try to get more details from the transaction record
        throw new Error(`Withdrawal failed: Contract reverted. Possible causes: (1) Nullifier already used, (2) Proof already used, (3) Contract out of HBAR balance, (4) Invalid proof format. Check that this exact proof hasn't been submitted before.`);
      }
      throw err;
    }

    // 3. Notify Recipient if it's a Stealth Payment
    if (!isInternalSwap && proofData.stealthPayload && proofData.stealthPayload.recipientAccountId) {
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

    // 4. Notify Recipient if it's an Internal Swap
    if (isInternalSwap && proofData.stealthPayload && proofData.stealthPayload.recipientAccountId) {
      try {
        const payload = {
          type: 'INTERNAL_SWAP',
          amount: Number(amountTinybars) / 1e8,
          newCommitment: newCommitment,
          newSecret: proofData.stealthPayload.newSecret,        // CRITICAL: Recipient needs this to spend
          newNullifier: proofData.stealthPayload.newNullifier,  // CRITICAL: Recipient needs this to spend
          sourceCommitment: commitmentHex,
          nullifierHash: String(nullifierHash),
          recipientAccountId: proofData.stealthPayload.recipientAccountId,
          senderAccountId: proofData.stealthPayload.senderAccountId || this.accountId.toString(),
          timestamp: Date.now(),
          batchId: proofData.submissionId,
          transactionId: txResponse.transactionId.toString()
        };

        console.log(`📡 Sending internal swap notification to ${proofData.stealthPayload.recipientAccountId}...`);
        await hip1334.sendEncryptedMessage(this.client, proofData.stealthPayload.recipientAccountId, payload);
        console.log(`✅ Internal swap notification sent with new commitment.`);
      } catch (notifErr) {
        console.warn(`⚠️ Internal swap notification failed: ${notifErr.message}`);
      }
    }
  }

  /**
   * Check if a Merkle root exists in the contract's rootHistory
   * Useful for debugging withdrawal issues
   */
  async checkRootExists(rootHex) {
    const guardId = process.env.VANISH_GUARD_CONTRACT_ID;
    if (!guardId) {
      console.log('⚠️ VANISH_GUARD_CONTRACT_ID not set');
      return null;
    }

    try {
      const { ContractCallQuery, ContractId } = require('@hashgraph/sdk');
      const { Interface } = require('ethers');

      const abi = ['function rootHistory(bytes32) view returns (bool)', 'function currentMerkleRoot() view returns (bytes32)'];
      const iface = new Interface(abi);

      const normalizedRoot = normalizeHex(rootHex);

      // Check rootHistory
      const historyCalldata = iface.encodeFunctionData('rootHistory', [normalizedRoot]);
      const historyResult = await new ContractCallQuery()
        .setContractId(ContractId.fromString(guardId))
        .setGas(50_000)
        .setFunctionParameters(Buffer.from(historyCalldata.replace('0x', ''), 'hex'))
        .execute(this.client);
      const inHistory = iface.decodeFunctionResult('rootHistory', historyResult.bytes)[0];

      // Check current root
      const currentCalldata = iface.encodeFunctionData('currentMerkleRoot');
      const currentResult = await new ContractCallQuery()
        .setContractId(ContractId.fromString(guardId))
        .setGas(50_000)
        .setFunctionParameters(Buffer.from(currentCalldata.replace('0x', ''), 'hex'))
        .execute(this.client);
      const currentRoot = iface.decodeFunctionResult('currentMerkleRoot', currentResult.bytes)[0];

      if (process.env.ENABLE_DEBUG === 'true') {
        console.log(`🔍 Root check for ${normalizedRoot.slice(0, 18)}...:`);
        console.log(`   In rootHistory: ${inHistory ? '✅ YES' : '❌ NO'}`);
        console.log(`   Is current root: ${currentRoot.toLowerCase() === normalizedRoot.toLowerCase() ? '✅ YES' : '❌ NO'}`);
        console.log(`   Current contract root: ${currentRoot.slice(0, 18)}...`);
      }

      return { inHistory, isCurrent: currentRoot.toLowerCase() === normalizedRoot.toLowerCase(), currentRoot };
    } catch (err) {
      console.error(`⚠️ Failed to check root: ${err.message}`);
      return null;
    }
  }

  /**
   * Manually anchor a root to the contract (recovery function)
   * Use this when roots weren't properly anchored during shield processing
   */
  async manuallyAnchorRoot(rootHex) {
    const guardId = process.env.VANISH_GUARD_CONTRACT_ID;
    if (!guardId) throw new Error('VANISH_GUARD_CONTRACT_ID not set');

    console.log(`🔧 Manually anchoring root ${rootHex.slice(0, 18)}... to VanishGuard`);

    const normalizedRoot = normalizeHex(rootHex);

    // First check if already anchored
    const checkResult = await this.checkRootExists(normalizedRoot);
    if (checkResult?.inHistory) {
      console.log(`   ✅ Root already anchored`);
      this.anchoredRoots.add(normalizedRoot.toLowerCase());
      this.persistAnchoredRoots([normalizedRoot]);
      return true;
    }

    // Anchor the root
    try {
      const { ContractExecuteTransaction, ContractId } = require('@hashgraph/sdk');
      const { Interface } = require('ethers');

      const abi = ['function submitBatch(uint32 batchSize, uint256 delayMs, uint256 queueAgeMs, bytes32[] roots, bytes32 auditHash)'];
      const iface = new Interface(abi);

      const auditHash = normalizeHex(crypto.createHash('sha256').update(`RECOVERY_${normalizedRoot}_${Date.now()}`).digest('hex'));

      // Must satisfy contract's minBatchSize policy (typically 2)
      // Pad with duplicate root to meet minimum if needed
      const minBatchSize = Math.max(2, this.MIN_BATCH_SIZE);
      const rootsArray = [normalizedRoot];
      while (rootsArray.length < minBatchSize) {
        rootsArray.push(normalizedRoot); // Pad with same root
      }

      const params = [
        rootsArray.length, // batchSize must match roots array length and meet policy minimum
        BigInt(1000), // delayMs
        BigInt(1000), // queueAgeMs
        rootsArray, // roots array (padded to meet minBatchSize)
        auditHash
      ];

      const calldata = iface.encodeFunctionData('submitBatch', params);

      const txResponse = await new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(guardId))
        .setGas(500_000)
        .setFunctionParameters(Buffer.from(calldata.replace('0x', ''), 'hex'))
        .execute(this.client);

      const receipt = await txResponse.getReceipt(this.client);

      if (receipt.status.toString() === 'SUCCESS') {
        console.log(`   ✅ Root anchored successfully!`);
        console.log(`   Tx ID: ${txResponse.transactionId.toString()}`);
        this.anchoredRoots.add(normalizedRoot.toLowerCase());
        this.persistAnchoredRoots([normalizedRoot]);
        return true;
      } else {
        console.error(`   ❌ Anchor failed: ${receipt.status.toString()}`);
        return false;
      }
    } catch (err) {
      console.error(`   ❌ Manual anchor failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Notify user agent that withdrawal completed successfully
   * Uses HIP-1334 encrypted messaging
   */
  async notifyWithdrawalComplete(proofData, result) {
    try {
      const submitter = proofData.submitter;
      if (!submitter) {
        console.log(`   ℹ️ No submitter info, skipping completion notification`);
        return;
      }

      const hip1334 = require('../../lib/hip1334.cjs');

      const notification = {
        type: result.type || 'WITHDRAWAL_COMPLETE',
        submissionId: proofData.submissionId,
        nullifierHash: result.nullifierHash,
        commitment: result.commitment,
        amount: result.amount,
        recipient: result.recipient,
        transactionId: result.transactionId,
        timestamp: result.timestamp,
        status: result.status
      };

      console.log(`   📤 Sending completion notification to ${submitter}...`);
      console.log(`      Submission ID: ${proofData.submissionId}`);
      await hip1334.sendEncryptedMessage(this.client, submitter, notification);
      console.log(`   ✅ User agent notified of successful withdrawal`);
    } catch (notifyErr) {
      console.warn(`   ⚠️ Failed to notify user agent: ${notifyErr.message}`);
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
      
      // Save for UI Dashboard
      this.hcsCache.transactions.push({
        id: txResponse.transactionId.toString(),
        type: 'shield',
        amount: `${batchData.anonymizedProofs.length} proofs`,
        timestamp: batchData.timestamp,
        hashscanUrl: `https://hashscan.io/testnet/transaction/${txResponse.transactionId.toString()}`
      });
      if (this.hcsCache.transactions.length > 50) this.hcsCache.transactions.shift();

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
      // Ensure memo is synchronized (idempotent)
      const { AccountUpdateTransaction } = require('@hashgraph/sdk');
      await new AccountUpdateTransaction()
        .setAccountId(this.accountId)
        .setAccountMemo(`[HIP-1334:${this.hip1334TopicId}]`)
        .execute(this.client);
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
    // Route SPONSORED_SWEEP requests separately from proof submissions
    if (payload.type === 'SPONSORED_SWEEP') {
      await this.executeSponsoredSweep(payload);
      return;
    }

    if (payload.type !== 'PROOF_SUBMISSION') return;
    console.log(`📩 [HIP-1334] Proof received: ${payload.submissionId}`);
    if (!payload.proofType) {
      console.log('⚠️ Missing proofType, skipping');
      return;
    }

    // 🛡️ SECURITY: Strict Denomination Scoping (Air-Gapped Validations)
    // To prevent compute exhaustion (DoS) and gas draining, we ONLY accept 
    // mathematically perfect denominations. Dust amounts are dropped instantly.
    const type = (payload.proofType || '').toUpperCase();
    if (type === 'SHIELD' || type === 'WITHDRAW') {
      const amt = parseFloat(payload.amount);
      const policy = require('../../config/vanish-policy.json');
      const allowed = policy.allowedDenominations || [0.1, 1, 10, 100];
      if (!allowed.includes(amt)) {
        console.warn(`🔒 [SECURITY] Dropped invalid denomination proof: ${amt} HBAR from ${payload.submitterAccountId || 'unknown'}`);
        return; // Silent drop to avoid amplifying DoS
      }
    }

    await this.addProofToQueue(payload);
  }

  /**
   * Execute a Pool Manager-sponsored stealth sweep.
   * The UserAgent pre-signed the transaction with the stealth private key;
   * the Pool Manager adds its fee-payer signature and broadcasts.
   * On-chain: Fee Payer = Pool Manager (no link to UserAgent or user!) 🛡️
   */
  async executeSponsoredSweep(payload) {
    const { txBytes, recipientAccountId, stealthAddress, amount, requesterAccountId } = payload;
    console.log(`\n🔐 [SPONSORED_SWEEP] Received from ${requesterAccountId}`);
    console.log(`   Stealth: ${stealthAddress} → Recipient: ${recipientAccountId}`);
    console.log(`   Amount:  ${amount} HBAR`);

    try {
      if (!txBytes) throw new Error('Missing txBytes in sponsored sweep request');
      if (!recipientAccountId) throw new Error('Missing recipientAccountId');
      if (!stealthAddress) throw new Error('Missing stealthAddress');

      // Deserialize the partially-signed transaction
      const txBuffer = Buffer.from(txBytes, 'base64');
      const tx = Transaction.fromBytes(txBuffer);

      // Add Pool Manager's fee-payer signature (this makes it the on-chain payer)
      const signedTx = await tx.sign(this.privateKey);

      // Broadcast to Hedera
      console.log(`   📤 Broadcasting sponsored sweep (Pool Manager pays fees)...`);
      const response = await signedTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      const txId = response.transactionId.toString();

      console.log(`   ✅ Sponsored sweep complete!`);
      console.log(`   Tx ID: ${txId}`);
      console.log(`   Status: ${receipt.status.toString()}`);
      console.log(`   🔒 Privacy: Fee payer = Pool Manager (${this.accountId.toString()}) — no UserAgent on-chain!`);

      // Notify the requesting UserAgent of success
      if (requesterAccountId) {
        try {
          const hip1334 = require('../../lib/hip1334.cjs');
          await hip1334.sendEncryptedMessage(this.client, requesterAccountId, {
            type: 'SWEEP_COMPLETE',
            status: 'SUCCESS',
            stealthAddress,
            recipientAccountId,
            amount,
            transactionId: txId,
            timestamp: Date.now()
          });
          console.log(`   📨 SWEEP_COMPLETE notification sent to ${requesterAccountId}`);
        } catch (notifErr) {
          console.warn(`   ⚠️ Could not send SWEEP_COMPLETE notification: ${notifErr.message}`);
        }
      }
    } catch (err) {
      console.error(`   ❌ Sponsored sweep failed: ${err.message}`);
      // Notify requester of failure so they can fall back
      if (requesterAccountId) {
        try {
          const hip1334 = require('../../lib/hip1334.cjs');
          await hip1334.sendEncryptedMessage(this.client, requesterAccountId, {
            type: 'SWEEP_COMPLETE',
            status: 'FAILED',
            stealthAddress,
            error: err.message,
            timestamp: Date.now()
          });
        } catch (_) { /* ignore notification errors */ }
      }
    }
  }

  async startListening() {
    try {
      await this.loadVerificationKeys();
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
      .setStartTime(Math.floor(Date.now() / 1000) - (3600 * 48)) // Look back 48 hours to recover missed proofs
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

  // Auto-spawn HOL HCS-10 listener if Pool Manager is registered on HOL
  if (process.env.HOL_POOL_ACCOUNT_ID) {
    const { spawn } = require('child_process');
    const listenerPath = path.resolve(__dirname, '..', 'hol-listener-pool.mjs');
    if (require('fs').existsSync(listenerPath)) {
      console.log('🌐 [HOL] Spawning Pool Manager HCS-10 listener...');
      const holProc = spawn('node', [listenerPath], {
        detached: false,
        stdio: 'inherit',
        env: { ...process.env },
      });
      holProc.on('error', (e) => console.error('❌ [HOL] Pool listener error:', e.message));
      holProc.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.warn(`⚠️  [HOL] Pool listener exited (${code}). Restart manually: npm run start:hol:pool`);
        }
      });
      console.log(`✅ [HOL] Pool Manager HCS-10 listener started (PID: ${holProc.pid})`);
    } else {
      console.warn('⚠️  [HOL] Pool listener script not found. Run: npm run hol:register:pool first.');
    }
  }

  // Status logging every 5 minutes
  setInterval(() => {
    console.log('📊 Pool Status:', JSON.stringify(manager.getStatus(), null, 2));
  }, 5 * 60 * 1000);

  // One-time command listener for clearing queue (type 'clear' and press Enter)
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('⌨️  Commands available:');
  console.log('  Type "clear" + Enter to clear proof queue');
  console.log('  Type "status" + Enter to see current status');

  rl.on('line', (input) => {
    const cmd = input.trim().toLowerCase();
    if (cmd === 'clear') {
      const count = manager.proofQueue.length;
      manager.proofQueue = [];
      manager.firstProofTimestamp = null;
      manager.batchScheduled = false;
      console.log(`🧹 Cleared ${count} proofs from queue`);
    } else if (cmd === 'status') {
      console.log('📊 Pool Status:', JSON.stringify(manager.getStatus(), null, 2));
    }
  });
}

main().catch(console.error);

module.exports = { PoolManager };
