/**
 * Vanish Pool Manager × HOL Registry — One-Shot Registration Script
 *
 * Run once:  npm run hol:register:pool
 *
 * What this does:
 *   1. Checks if HOL_POOL_ACCOUNT_ID already exists in .env → exits early if so (idempotent).
 *   2. Uses the Pool Manager's own HEDERA credentials to register it on the HOL Registry.
 *   3. The Pool Manager is registered as a SEPARATE agent from the User Agent, with its
 *      own HCS-10 inbound topic, reflecting its distinct role as a ZK-proof validator
 *      and batch executor in the Vanish Protocol.
 *   4. Persists HOL_POOL_ACCOUNT_ID, HOL_POOL_INBOUND_TOPIC_ID, HOL_POOL_OUTBOUND_TOPIC_ID
 *      to .env for the Pool Manager's runtime HCS-10 listener.
 *
 * Pool Manager's Skills:
 *   - Validate_ZK_Proof    → Verifies HIP-1334 SNARK proofs
 *   - Batch_Proofs         → Combines proofs into anonymized batches
 *   - Anchor_Merkle_Root   → Anchors batch roots to VanishGuard contract on-chain
 *   - Query_Anonymity_Set  → Returns current pool size and privacy metrics
 *   - AML_Compliance_Check → Runs Chainalysis + OFAC sanctions screening
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { HederaAgentKit, ServerSigner } from 'hedera-agent-kit';
import {
  HCS10Builder,
  OpenConvaiState,
  RegisterAgentTool,
} from '@hashgraphonline/standards-agent-kit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '..', '.env');

// ─── Idempotency Guard ────────────────────────────────────────────────────────
if (process.env.HOL_POOL_ACCOUNT_ID) {
  console.log(`✅ Pool Manager is already registered on HOL.`);
  console.log(`   Account : ${process.env.HOL_POOL_ACCOUNT_ID}`);
  console.log(`   Inbound : ${process.env.HOL_POOL_INBOUND_TOPIC_ID}`);
  console.log(`   Outbound: ${process.env.HOL_POOL_OUTBOUND_TOPIC_ID}`);
  process.exit(0);
}

// ─── Pool Manager Credentials ─────────────────────────────────────────────────
// The Pool Manager may use different keys from the User Agent.
// Falls back to the shared HEDERA_ vars if dedicated pool keys are not set.
const ACCOUNT_ID  = process.env.POOL_MANAGER_ACCOUNT_ID  || process.env.HEDERA_ACCOUNT_ID;
const PRIVATE_KEY = process.env.POOL_MANAGER_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY;

if (!ACCOUNT_ID || !PRIVATE_KEY) {
  console.error('❌ Pool Manager credentials not found.');
  console.error('   Set POOL_MANAGER_ACCOUNT_ID + POOL_MANAGER_PRIVATE_KEY in .env');
  console.error('   (or HEDERA_ACCOUNT_ID + HEDERA_PRIVATE_KEY as fallback)');
  process.exit(1);
}

async function registerPoolManager() {
  console.log('\n🔒 Vanish Pool Manager × Hashgraph Online Registry — Registration\n');
  console.log('━'.repeat(60));

  // 1. Bootstrap HederaAgentKit with Pool Manager credentials
  const signer = new ServerSigner(ACCOUNT_ID, PRIVATE_KEY, 'testnet');
  const hederaKit = new HederaAgentKit(signer, undefined, 'autonomous');
  await hederaKit.initialize();

  // 2. Create HOL state manager and HCS-10 builder
  const stateManager = new OpenConvaiState();
  const hcs10Builder  = new HCS10Builder(hederaKit, stateManager);

  // 3. Create the RegisterAgentTool
  const registerTool = new RegisterAgentTool({ hederaKit, hcs10Builder });

  console.log('📡 Sending Pool Manager registration to HOL Registry Broker...\n');

  // 4. Register the Pool Manager as a distinct autonomous agent
  const result = await registerTool.call({
    name:        'Vanish Pool Manager',
    description: 'An autonomous ZK-proof validator and batch executor. I verify HIP-1334 '
               + 'SNARK proofs, aggregate them into anonymized batches, anchor Merkle roots '
               + 'to the VanishGuard smart contract, and enforce AML/OFAC compliance. '
               + 'Other agents can delegate privacy-pool operations to me via HCS-10.',
    capabilities: [
      'TEXT_GENERATION',      // status/anonymity queries
      'DATA_PROCESSING',      // ZK-proof verification and batching
      'TRANSACTION_EXECUTION', // on-chain batch root publishing
    ],
    type:  'autonomous',
    model: 'deterministic (no LLM) + AI fallback (Ollama llama3.1)',
    properties: {
      tags: ['Privacy', 'Zero-Knowledge', 'Validator', 'Dark Pool', 'HCS-10', 'AML'],
      skills: [
        'Validate_ZK_Proof',
        'Batch_Proofs',
        'Anchor_Merkle_Root',
        'Query_Anonymity_Set',
        'AML_Compliance_Check',
      ],
      // Points to the User Agent as the human-facing companion
      companion: process.env.HOL_AGENT_ACCOUNT_ID || 'see Vanish Agentic Pool',
    },
    setAsCurrent: true,
  });

  console.log('✅ Pool Manager registered on HOL Registry!\n');
  console.log('Registration result:', JSON.stringify(result, null, 2));

  // 5. Retrieve persisted state
  const agentState = stateManager.getCurrentAgent?.() ?? {};

  const newAccountId       = agentState.accountId        || '';
  const newPrivateKey      = agentState.privateKey       || '';
  const newInboundTopicId  = agentState.inboundTopicId   || '';
  const newOutboundTopicId = agentState.outboundTopicId  || '';

  // 6. Append to .env under POOL-specific keys (non-destructive)
  const newEnvLines = [
    '',
    '# ─── HOL Pool Manager Registration ───────────────────────────',
    `HOL_POOL_ACCOUNT_ID=${newAccountId}`,
    `HOL_POOL_PRIVATE_KEY=${newPrivateKey}`,
    `HOL_POOL_INBOUND_TOPIC_ID=${newInboundTopicId}`,
    `HOL_POOL_OUTBOUND_TOPIC_ID=${newOutboundTopicId}`,
  ].join('\n');

  fs.appendFileSync(ENV_PATH, newEnvLines, 'utf8');

  console.log('\n💾 Pool Manager HOL credentials saved to .env:');
  console.log(`   HOL_POOL_ACCOUNT_ID         = ${newAccountId}`);
  console.log(`   HOL_POOL_INBOUND_TOPIC_ID   = ${newInboundTopicId}`);
  console.log(`   HOL_POOL_OUTBOUND_TOPIC_ID  = ${newOutboundTopicId}`);
  console.log('\n📌 Next: npm run hol:register  (if not done yet for User Agent)');
  console.log('         npm run start:pool   (pool agent will listen on its HCS-10 topic)\n');
}

registerPoolManager().catch((err) => {
  console.error('❌ Pool Manager HOL Registration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
