/**
 * Vanish Pool Manager × HOL — HCS-10 Message Listener
 *
 * Start with: npm run start:hol:pool
 * (Also auto-spawned by Pool Manager on boot if HOL_POOL_ACCOUNT_ID is set)
 *
 * What this does:
 *   1. Listens on the Pool Manager's HOL HCS-10 inbound topic for messages
 *      from other agents (e.g., User Agent, external DAOs).
 *   2. Auto-accepts connection requests.
 *   3. Parses incoming delegation requests (validate proof, query anonymity set)
 *      and forwards them to the Pool Manager's REST API at localhost:3002.
 *   4. Sends the Pool Manager's response back via HCS-10.
 */

import 'dotenv/config';
import { HederaAgentKit, ServerSigner } from 'hedera-agent-kit';
import {
  HCS10Builder,
  OpenConvaiState,
  CheckMessagesTool,
  AcceptConnectionRequestTool,
  SendMessageToConnectionTool,
  ListUnapprovedConnectionRequestsTool,
} from '@hashgraphonline/standards-agent-kit';

// ─── Prerequisites ────────────────────────────────────────────────────────────
const HOL_ACCOUNT_ID  = process.env.HOL_POOL_ACCOUNT_ID;
const HOL_PRIVATE_KEY = process.env.HOL_POOL_PRIVATE_KEY;
const HOL_INBOUND     = process.env.HOL_POOL_INBOUND_TOPIC_ID;

if (!HOL_ACCOUNT_ID || !HOL_PRIVATE_KEY || !HOL_INBOUND) {
  console.error('❌ Pool Manager HOL credentials not found.');
  console.error('   Run "npm run hol:register:pool" first.');
  process.exit(1);
}

const POOL_API_URL     = process.env.POOL_API_URL || 'http://localhost:3002';
const POLL_INTERVAL_MS = parseInt(process.env.HOL_POLL_MS || '5000', 10);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
const signer = new ServerSigner(HOL_ACCOUNT_ID, HOL_PRIVATE_KEY, 'testnet');
const hederaKit = new HederaAgentKit(signer, undefined, 'autonomous');
await hederaKit.initialize();

const stateManager = new OpenConvaiState();
stateManager.setCurrentAgent?.({
  accountId:       HOL_ACCOUNT_ID,
  inboundTopicId:  HOL_INBOUND,
  outboundTopicId: process.env.HOL_POOL_OUTBOUND_TOPIC_ID,
});

const hcs10Builder = new HCS10Builder(hederaKit, stateManager);

const checkMessages    = new CheckMessagesTool({ hederaKit, hcs10Builder });
const acceptConnection = new AcceptConnectionRequestTool({ hederaKit, hcs10Builder });
const sendMessage      = new SendMessageToConnectionTool({ hederaKit, hcs10Builder });
const listUnapproved   = new ListUnapprovedConnectionRequestsTool({ hederaKit, hcs10Builder });

// ─── Security: Rate Limiting & UAID Tracking ─────────────────────────────────
const rateLimits = new Map(); // senderId -> { count, windowStart }
const MAX_REQUESTS_PER_MIN = 10; // Slightly higher for Pool Manager

// Simulated check to verify if senderId is a registered HOL Agent 
// In production, we'd query the HOL Registry directly via @hashgraphonline/standards-sdk
async function verifyAgentRegistration(senderId) {
  // For the hackathon, we assume any properly formatted connection ID implies 
  // some level of "Skin in the Game" (gas spent to register/connect).
  return senderId && senderId.length > 5; 
}

// ─── Forward to Pool Manager API (AIR GAPPED) ────────────────────────────────
async function forwardToPoolManager(text) {
  // 🚨 SECURITY: AIR GAPPED LLM
  // We NEVER pass raw text from the public HOL network into an LLM or eval().
  // We strictly parse keywords to route to static REST endpoints.
  const lower = text.toLowerCase().trim();

  // Route based on INTENT keywords (Strict Scoping)
  let endpoint = '/status';
  let method   = 'GET';
  let body     = null;

  if (lower.includes('status') || lower.includes('anonymity') || lower.includes('pool')) {
    endpoint = '/status';
    method   = 'GET';
  } else if (lower.includes('submit') && lower.includes('proof')) {
    // 🛡️ SECURITY: Denomination Enforcement happens in the Pool API itself,
    // but the listener enforces that ONLY valid JSON proofs map to this route.
    return `🛡️ [HOL SECURITY] Proof submission via HCS-10 text is disabled to prevent compute exhaustion attacks (DoS). Please submit ZK proofs directly to the Pool Manager REST API at ${POOL_API_URL}/proof/submit.`;
  } else {
    // Generic fallback - safe read-only status
    endpoint = '/status';
    method   = 'GET';
  }

  try {
    const resp = await fetch(`${POOL_API_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    body ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      return `❌ Pool Manager API returned HTTP ${resp.status}`;
    }

    const data = await resp.json();
    return JSON.stringify(data, null, 2);
  } catch (err) {
    return `❌ Could not reach Pool Manager (${POOL_API_URL}): ${err.message}`;
  }
}

// ─── Poll Loop ────────────────────────────────────────────────────────────────
async function poll() {
  // Accept pending connections
  try {
    const pendingRaw = await listUnapproved.call({});
    const pending = JSON.parse(pendingRaw);
    if (pending?.requests?.length > 0) {
      for (const req of pending.requests) {
        console.log(`🤝 [HOL Pool] Accepting connection from: ${req.requesterId}`);
        await acceptConnection.call({ requestKey: req.id });
      }
    }
  } catch {
    // Non-fatal
  }

  // Check messages
  try {
    const rawMessages = await checkMessages.call({
      targetIdentifier: HOL_INBOUND,
      lastMessagesCount:   10,
    });

    const messages = JSON.parse(rawMessages);
    if (!messages?.messages?.length) return;

    for (const msg of messages.messages) {
      const text = msg.content?.text || msg.content || '';
      const sender = msg.senderId;
      if (!text.trim() || !sender) continue;

      // 1. 🛡️ SECURITY: "Skin in the Game" UAID Filter
      const isVerified = await verifyAgentRegistration(sender);
      if (!isVerified) {
        console.warn(`🔒 [HOL Pool SECURITY] Dropped message from unregistered entity: ${sender}`);
        continue;
      }

      // 2. 🛡️ SECURITY: Rate Limiting Check (Anti-Spam / AML Exhaustion protect)
      const now = Date.now();
      let rl = rateLimits.get(sender);
      if (!rl || now - rl.windowStart > 60000) {
        rl = { count: 0, windowStart: now };
      }
      
      if (rl.count >= MAX_REQUESTS_PER_MIN) {
        console.warn(`⚠️ [HOL Pool SECURITY] Blocked spam from ${sender} (>${MAX_REQUESTS_PER_MIN}/min)`);
        continue; // Silent drop - don't spend gas replying
      }
      
      rl.count++;
      rateLimits.set(sender, rl);

      console.log(`\n📩 [HOL Pool HCS-10] Message from ${sender} (${rl.count}/${MAX_REQUESTS_PER_MIN}/min):\n   "${text}"`);

      // 3. AIR GAPPED Routing
      const response = await forwardToPoolManager(text);
      console.log(`💬 [Pool Response]: ${response.slice(0, 100)}...`);

      if (msg.connectionId) {
        await sendMessage.call({
          connectionId: msg.connectionId,
          message:      response,
        });
        console.log(`✅ [HOL Pool] Response sent back to ${msg.senderId}`);
      }
    }
  } catch (err) {
    if (!err.message?.includes('No messages')) {
      console.warn(`⚠️  [HOL Pool] Error reading messages: ${err.message}`);
    }
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔒 Vanish Pool Manager HOL HCS-10 Listener Online');
  console.log('━'.repeat(60));
  console.log(`   HOL Account  : ${HOL_ACCOUNT_ID}`);
  console.log(`   Inbound Topic: ${HOL_INBOUND}`);
  console.log(`   Polling every: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`   Pool API     : ${POOL_API_URL}`);
  console.log('━'.repeat(60) + '\n');

  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('❌ HOL Pool Listener crashed:', err.message);
  process.exit(1);
});
