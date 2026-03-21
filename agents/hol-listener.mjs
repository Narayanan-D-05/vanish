/**
 * Vanish × HOL Registry — HCS-10 Message Listener
 *
 * Start with: npm run start:hol
 * (Also auto-spawned by the User Agent on boot if HOL_AGENT_ACCOUNT_ID is set)
 *
 * What this does:
 *   1. Connects to the registered Vanish HOL account.
 *   2. Monitors the HCS-10 inbound topic for connection requests and messages.
 *   3. Auto-accepts connection requests from other agents/users.
 *   4. Translates natural-language messages into commands forwarded to the
 *      existing User Agent REST API (localhost:3001/api/command).
 *   5. Sends the User Agent's response back to the requester via HCS-10.
 *
 * Verified APIs used:
 *   - HederaAgentKit (hedera-agent-kit)
 *   - HCS10Builder, OpenConvaiState (state manager)
 *   - CheckMessagesTool, AcceptConnectionRequestTool, SendMessageToConnectionTool
 *   - ListUnapprovedConnectionRequestsTool
 *   (@hashgraphonline/standards-agent-kit)
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
const HOL_ACCOUNT_ID  = process.env.HOL_AGENT_ACCOUNT_ID;
const HOL_PRIVATE_KEY = process.env.HOL_AGENT_PRIVATE_KEY;
const HOL_INBOUND     = process.env.HOL_INBOUND_TOPIC_ID;

if (!HOL_ACCOUNT_ID || !HOL_PRIVATE_KEY || !HOL_INBOUND) {
  console.error('❌ HOL credentials not found. Run "npm run hol:register" first.');
  process.exit(1);
}

const USER_AGENT_API  = process.env.USER_AGENT_API_URL || 'http://localhost:3001';
const POLL_INTERVAL_MS = parseInt(process.env.HOL_POLL_MS || '5000', 10);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
const signer = new ServerSigner(HOL_ACCOUNT_ID, HOL_PRIVATE_KEY, 'testnet');
const hederaKit = new HederaAgentKit(signer, undefined, 'autonomous');
await hederaKit.initialize();

const stateManager = new OpenConvaiState();

// Restore persisted agent identity into state so tools know which agent is active
stateManager.setCurrentAgent?.({
  accountId:       HOL_ACCOUNT_ID,
  inboundTopicId:  HOL_INBOUND,
  outboundTopicId: process.env.HOL_OUTBOUND_TOPIC_ID,
});

const hcs10Builder = new HCS10Builder(hederaKit, stateManager);

// Instantiate tools
const checkMessages        = new CheckMessagesTool({ hederaKit, hcs10Builder });
const acceptConnection     = new AcceptConnectionRequestTool({ hederaKit, hcs10Builder });
const sendMessage          = new SendMessageToConnectionTool({ hederaKit, hcs10Builder });
const listUnapproved       = new ListUnapprovedConnectionRequestsTool({ hederaKit, hcs10Builder });

// ─── Forward command to User Agent ───────────────────────────────────────────
async function forwardToUserAgent(naturalLanguageCommand) {
  try {
    const resp = await fetch(`${USER_AGENT_API}/api/command`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ 
        command: naturalLanguageCommand, 
        source: 'hol-hcs10',
        sandbox: true // 🚨 SECURITY: Strips dangerous tools (transfer, withdraw) 
      }),
    });

    if (!resp.ok) {
      return `❌ User Agent returned HTTP ${resp.status}`;
    }

    const data = await resp.json();
    return data.result || data.message || JSON.stringify(data);
  } catch (err) {
    return `❌ Could not reach User Agent (${USER_AGENT_API}): ${err.message}`;
  }
}

// ─── Rate Limiter (Anti-Spam) ────────────────────────────────────────────────
const rateLimits = new Map(); // senderId -> { count, windowStart }
const MAX_REQUESTS_PER_MIN = 5;

// ─── Main Poll Loop ───────────────────────────────────────────────────────────
async function poll() {
  console.log('🌐 [HOL Listener] Checking for connection requests...');

  // 1. Accept any pending connection requests
  try {
    const pendingRaw = await listUnapproved.call({});
    const pending = JSON.parse(pendingRaw);
    if (pending?.requests?.length > 0) {
      for (const req of pending.requests) {
        console.log(`🤝 [HOL] Accepting connection from: ${req.requesterId}`);
        await acceptConnection.call({ requestKey: req.id });
        console.log(`✅ [HOL] Accepted connection ${req.id}`);
      }
    }
  } catch (err) {
    // Non-fatal — may just mean no requests
    if (!err.message?.includes('no pending')) {
      console.warn(`⚠️  [HOL] Error checking connections: ${err.message}`);
    }
  }

  // 2. Check incoming messages on HCS-10 inbound topic
  console.log('🌐 [HOL Listener] Checking for incoming messages...');
  try {
    const rawMessages = await checkMessages.call({
      targetIdentifier: HOL_INBOUND,
      lastMessagesCount:   10,
    });

    const messages = JSON.parse(rawMessages);
    if (!messages?.messages?.length) {
      return; // nothing new
    }

    for (const msg of messages.messages) {
      const text = msg.content?.text || msg.content || '';
      const sender = msg.senderId;
      if (!text.trim() || !sender) continue;

      // --- 🛡️ Rate Limiting Check ---
      const now = Date.now();
      let rl = rateLimits.get(sender);
      if (!rl || now - rl.windowStart > 60000) {
        rl = { count: 0, windowStart: now };
      }
      
      if (rl.count >= MAX_REQUESTS_PER_MIN) {
        console.warn(`⚠️ [HOL SECURITY] Blocked spam from ${sender} (>${MAX_REQUESTS_PER_MIN}/min)`);
        continue; // Drop message silently to avoid gas drain
      }
      
      rl.count++;
      rateLimits.set(sender, rl);
      // ------------------------------

      console.log(`\n📩 [HOL HCS-10] Message from ${sender} (${rl.count}/${MAX_REQUESTS_PER_MIN} this minute):\n   "${text}"\n`);

      // Forward to User Agent (SANDBOXED)
      const agentResponse = await forwardToUserAgent(text);
      console.log(`💬 [Vanish Response]: ${agentResponse.slice(0, 200)}...`);

      // Send response back via HCS-10
      if (msg.connectionId) {
        await sendMessage.call({
          connectionId: msg.connectionId,
          message:      agentResponse,
        });
        console.log(`✅ [HOL] Response sent back to ${msg.senderId}`);
      }
    }
  } catch (err) {
    if (!err.message?.includes('No messages')) {
      console.warn(`⚠️  [HOL] Error reading messages: ${err.message}`);
    }
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌐 Vanish HOL HCS-10 Listener Online');
  console.log('━'.repeat(60));
  console.log(`   HOL Account : ${HOL_ACCOUNT_ID}`);
  console.log(`   Inbound Topic: ${HOL_INBOUND}`);
  console.log(`   Polling every ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`   Forwarding to: ${USER_AGENT_API}`);
  console.log('━'.repeat(60) + '\n');

  // Run immediately, then on interval
  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('❌ HOL Listener crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
