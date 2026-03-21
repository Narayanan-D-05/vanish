/**
 * Vanish × HOL Registry — One-Shot Registration Script
 *
 * Run once:  npm run hol:register
 *
 * What this does:
 *   1. Checks if HOL_AGENT_ACCOUNT_ID already exists in .env → exits early if so.
 *   2. Uses (@hashgraphonline/standards-agent-kit) to register the Vanish Agent on
 *      the Hashgraph Online Registry Broker via HCS-10.
 *   3. Persists the new account credentials and HCS-10 topic IDs back to .env so
 *      subsequent runs (hol-listener) can pick them up without re-registering.
 *
 * Verified APIs used:
 *   - HederaAgentKit (hedera-agent-kit)
 *   - HCS10Builder, OpenConvaiState, RegisterAgentTool (@hashgraphonline/standards-agent-kit)
 *   - AIAgentCapability enum (@hashgraphonline/standards-agent-kit)
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
if (process.env.HOL_AGENT_ACCOUNT_ID) {
  console.log(`✅ Vanish is already registered on HOL.`);
  console.log(`   Account : ${process.env.HOL_AGENT_ACCOUNT_ID}`);
  console.log(`   Inbound : ${process.env.HOL_INBOUND_TOPIC_ID}`);
  console.log(`   Outbound: ${process.env.HOL_OUTBOUND_TOPIC_ID}`);
  process.exit(0);
}

// ─── Prerequisites Check ──────────────────────────────────────────────────────
const ACCOUNT_ID  = process.env.HEDERA_ACCOUNT_ID;
const PRIVATE_KEY = process.env.HEDERA_PRIVATE_KEY;

if (!ACCOUNT_ID || !PRIVATE_KEY) {
  console.error('❌ HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set in .env');
  process.exit(1);
}

async function register() {
  console.log('\n🌐 Vanish × Hashgraph Online Registry — Registration\n');
  console.log('━'.repeat(60));

  // 1. Bootstrap HederaAgentKit with existing Hedera credentials
  const signer = new ServerSigner(ACCOUNT_ID, PRIVATE_KEY, 'testnet');
  const hederaKit = new HederaAgentKit(signer, undefined, 'autonomous');
  await hederaKit.initialize();

  // 2. Create HOL state manager and HCS-10 builder
  const stateManager = new OpenConvaiState();
  const hcs10Builder  = new HCS10Builder(hederaKit, stateManager);

  // 3. Create the RegisterAgentTool (LangChain-compatible but invocable directly)
  const registerTool = new RegisterAgentTool({ hederaKit, hcs10Builder });

  console.log('📡 Sending registration to HOL Registry Broker...\n');

  // 4. Register Vanish — fills in the HOL profile
  //    This creates a new sub-account + HCS-10 inbound/outbound topics.
  const result = await registerTool.call({
    name:        'Vanish Agentic Pool',
    description: 'An autonomous, ZK-powered dark pool. I act as a privacy concierge, '
               + 'allowing humans and HOL agents to pool capital, obfuscate transactions, '
               + 'and execute stealth transfers on Hedera.',
    capabilities: [
      'TEXT_GENERATION',      // natural-language chat interface
      'DATA_PROCESSING',      // ZK-proof computation
      'TRANSACTION_EXECUTION', // on-chain transfers via HIP-1340
    ],
    type:  'autonomous',
    model: 'llama3.1 (Ollama local)',
    socials: {
      github: 'https://github.com/hashgraph-online/vanish',
    },
    // tags are passed as custom properties (string array)
    properties: {
      tags: ['Privacy', 'Zero-Knowledge', 'DeFi', 'Dark Pool', 'HCS-10'],
      skills: ['Shield_HBAR', 'Generate_ZK_Proof', 'Stealth_Sweep', 'Query_Anonymity_Set'],
    },
    setAsCurrent: true, // auto-saves to OpenConvaiState
  });

  console.log('✅ Vanish registered on HOL Registry!\n');
  console.log('Registration result:', JSON.stringify(result, null, 2));

  // 5. Retrieve persisted state so we can write it to .env
  const agentState = stateManager.getCurrentAgent?.() ?? {};

  const newAccountId       = agentState.accountId        || '';
  const newPrivateKey      = agentState.privateKey       || '';
  const newInboundTopicId  = agentState.inboundTopicId   || '';
  const newOutboundTopicId = agentState.outboundTopicId  || '';

  // 6. Append new vars to .env (non-destructive)
  const newEnvLines = [
    '',
    '# ─── Hashgraph Online (HOL) Registration ───────────────────────',
    `HOL_AGENT_ACCOUNT_ID=${newAccountId}`,
    `HOL_AGENT_PRIVATE_KEY=${newPrivateKey}`,
    `HOL_INBOUND_TOPIC_ID=${newInboundTopicId}`,
    `HOL_OUTBOUND_TOPIC_ID=${newOutboundTopicId}`,
  ].join('\n');

  fs.appendFileSync(ENV_PATH, newEnvLines, 'utf8');

  console.log('\n💾 HOL credentials saved to .env:');
  console.log(`   HOL_AGENT_ACCOUNT_ID  = ${newAccountId}`);
  console.log(`   HOL_INBOUND_TOPIC_ID  = ${newInboundTopicId}`);
  console.log(`   HOL_OUTBOUND_TOPIC_ID = ${newOutboundTopicId}`);
  console.log('\n📌 Next step: npm run start:hol  (or it auto-starts with User Agent)\n');
}

register().catch((err) => {
  console.error('❌ HOL Registration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
