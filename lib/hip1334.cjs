/**
 * HIP-1334: Private Message Box Standard
 *
 * Every account advertises a dedicated HCS inbox topic via its Account Memo:
 *   [HIP-1334:0.0.XXXXX]
 *
 * First message in the inbox topic is always the encryption public key:
 *   { type:"HIP1334_INIT", version:"1.0", publicKey:"<hex>", scheme:"X25519-AES256GCM" }
 *
 * Subsequent messages are encrypted envelopes:
 *   { type:"HIP1334_MSG", ephemeralPublicKey, iv, authTag, ciphertext, timestamp }
 *
 * Encryption: X25519 ECDH key exchange → AES-256-GCM
 * The recipient's EC public key is fetched from the init message.
 * The sender generates an ephemeral X25519 key pair per message.
 *
 * Node.js compatibility note:
 *   crypto.createECDH('x25519') was removed in Node.js v17+ (x25519 is a DH
 *   function, not an EC curve). Use crypto.generateKeyPairSync('x25519') and
 *   crypto.diffieHellman() instead — this is the correct API for Node v17+.
 */

const crypto = require('crypto');
const { TopicCreateTransaction, TopicMessageSubmitTransaction, TopicMessageQuery, AccountUpdateTransaction } = require('@hashgraph/sdk');
const axios = require('axios');

const mirrorBase = () =>
  (process.env.MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com');

// ─────────────────────────────────────────────────────────────────────────────
//  X25519 Key Helpers (Node.js v17+ compatible)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a fresh X25519 key pair.
 * Returns { privateKeyHex, publicKeyHex } — raw 32-byte hex strings.
 */
function generateX25519KeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  // DER-encoded SPKI for x25519 has the 32-byte raw key at the last 32 bytes.
  const pubHex = publicKey.slice(-32).toString('hex');
  // DER-encoded PKCS8 for x25519 has the 32-byte raw key at the last 32 bytes.
  const privHex = privateKey.slice(-32).toString('hex');
  return { privateKeyHex: privHex, publicKeyHex: pubHex };
}

/**
 * Perform X25519 Diffie-Hellman: given our private key and their public key,
 * return the 32-byte shared secret as a Buffer.
 */
function x25519SharedSecret(ownPrivateKeyHex, theirPublicKeyHex) {
  const ownKey = crypto.createPrivateKey({
    key: _buildPKCS8(Buffer.from(ownPrivateKeyHex, 'hex')),
    format: 'der',
    type: 'pkcs8',
  });
  const theirKey = crypto.createPublicKey({
    key: _buildSPKI(Buffer.from(theirPublicKeyHex, 'hex')),
    format: 'der',
    type: 'spki',
  });
  return crypto.diffieHellman({ privateKey: ownKey, publicKey: theirKey });
}

// Build a minimal DER PKCS8 wrapper around a raw 32-byte X25519 private key.
function _buildPKCS8(rawKey32) {
  // PKCS8 header for X25519 (OID 1.3.101.110): 16 bytes fixed prefix
  const header = Buffer.from('302e020100300506032b656e04220420', 'hex');
  return Buffer.concat([header, rawKey32]);
}

// Build a minimal DER SPKI wrapper around a raw 32-byte X25519 public key.
function _buildSPKI(rawKey32) {
  // SubjectPublicKeyInfo header for X25519: 12 bytes fixed prefix
  const header = Buffer.from('302a300506032b656e032100', 'hex');
  return Buffer.concat([header, rawKey32]);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Inbox Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a HIP-1334 inbox for an account.
 * 1. Creates a new HCS topic.
 * 2. Posts the HIP1334_INIT message with a freshly-generated X25519 public key.
 * 3. Updates the account memo to advertise the topic.
 *
 * Returns { topicId, encPublicKey, encPrivateKey }
 */
async function createInbox(client, accountId, privateKey) {
  // 1. Create dedicated inbox topic
  const topicResp = await new TopicCreateTransaction()
    .setTopicMemo(`HIP-1334 inbox for ${accountId}`)
    .execute(client);
  const topicReceipt = await topicResp.getReceipt(client);
  const topicId = topicReceipt.topicId.toString();

  // 2. Generate X25519 key pair using the correct Node.js v17+ API
  const { privateKeyHex: encPrivateKey, publicKeyHex: encPublicKey } = generateX25519KeyPair();

  // 3. Post init message — public key discoverable by anyone
  const initMessage = JSON.stringify({
    type: 'HIP1334_INIT',
    version: '1.0',
    account: accountId,
    publicKey: encPublicKey,
    scheme: 'X25519-AES256GCM',
    timestamp: Date.now(),
  });

  await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(initMessage)
    .execute(client);

  // 4. Advertise inbox in account memo
  await new AccountUpdateTransaction()
    .setAccountId(accountId)
    .setAccountMemo(`[HIP-1334:${topicId}]`)
    .execute(client);

  console.log(`📬 HIP-1334 inbox created: ${topicId}`);
  console.log(`📣 Account memo set: [HIP-1334:${topicId}]`);

  return { topicId, encPublicKey, encPrivateKey };
}

/**
 * Discover an account's HIP-1334 inbox via the Mirror Node.
 * Reads the account memo, parses [HIP-1334:topicId], then fetches the
 * first message of that topic to get the encryption public key.
 *
 * Returns { topicId, publicKey, scheme }
 */
async function discoverInbox(targetAccountId) {
  // ─── OPTIONAL OVERRIDE ──────────────────────────────────────────────────
  // If we're talking to the Pool Manager and we have its topic in .env,
  // skip the Mirror Node lookup for speed and robustness.
  if (targetAccountId === process.env.POOL_MANAGER_ACCOUNT_ID && process.env.HIP1334_TOPIC_ID) {
    const topicId = process.env.HIP1334_TOPIC_ID;
    const init = await fetchInitMessage(topicId);
    return { topicId, publicKey: init.publicKey, scheme: init.scheme };
  }

  // Fetch account info
  const accountUrl = `${mirrorBase()}/api/v1/accounts/${targetAccountId}`;
  const accountRes = await axios.get(accountUrl, { timeout: 10000 });
  const memo = accountRes.data.memo || '';

  const match = memo.match(/\[HIP-1334:(0\.0\.\d+)\]/);
  if (!match) {
    // ─── FALLBACK: Use shared topic if account has no dedicated inbox ────────
    // In development/demo mode, all agents can share the same HIP-1334 topic
    if (process.env.HIP1334_TOPIC_ID) {
      console.log(`   ℹ️ Account ${targetAccountId} has no dedicated inbox, using shared topic ${process.env.HIP1334_TOPIC_ID}`);
      const topicId = process.env.HIP1334_TOPIC_ID;
      const init = await fetchInitMessage(topicId);
      return { topicId, publicKey: init.publicKey, scheme: init.scheme };
    }
    throw new Error(
      `Account ${targetAccountId} has no HIP-1334 inbox. ` +
      `Memo is: "${memo}". Start the Pool Manager first to create its inbox.`
    );
  }
  const topicId = match[1];
  const init = await fetchInitMessage(topicId);
  return { topicId, publicKey: init.publicKey, scheme: init.scheme };
}

/**
 * Helper to fetch the HIP1334_INIT message from a topic.
 */
async function fetchInitMessage(topicId) {

  // Fetch the init message (first message of the inbox topic)
  const msgUrl = `${mirrorBase()}/api/v1/topics/${topicId}/messages?limit=1&order=asc`;
  const msgRes = await axios.get(msgUrl, { timeout: 10000 });

  if (!msgRes.data.messages || msgRes.data.messages.length === 0) {
    throw new Error(`HIP-1334 inbox ${topicId} exists but has no init message yet.`);
  }

  const raw = Buffer.from(msgRes.data.messages[0].message, 'base64').toString('utf8');
  const init = JSON.parse(raw);

  if (init.type !== 'HIP1334_INIT') {
    throw new Error(`Expected HIP1334_INIT as first message in ${topicId}, got: ${init.type}`);
  }

  return init;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Encryption / Decryption
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypt plaintext for a recipient using their X25519 public key.
 * Generates an ephemeral key pair per message (forward secrecy per message).
 *
 * Returns { ephemeralPublicKey, iv, authTag, ciphertext } (all hex strings)
 */
function encryptMessage(plaintext, recipientPublicKeyHex) {
  // Ephemeral sender key — one-time use, per-message forward secrecy
  const { privateKeyHex: ephPriv, publicKeyHex: ephPub } = generateX25519KeyPair();

  // ECDH shared secret
  const sharedSecret = x25519SharedSecret(ephPriv, recipientPublicKeyHex);

  // Derive AES-256 key via SHA-256
  const aesKey = crypto.createHash('sha256').update(sharedSecret).digest();

  // AES-256-GCM encryption
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ephemeralPublicKey: ephPub,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
}

/**
 * Decrypt an HIP-1334 envelope using the recipient's X25519 private key.
 *
 * Returns the plaintext string.
 */
function decryptMessage({ ephemeralPublicKey, iv, authTag, ciphertext }, ownPrivateKeyHex) {
  const sharedSecret = x25519SharedSecret(ownPrivateKeyHex, ephemeralPublicKey);
  const aesKey = crypto.createHash('sha256').update(sharedSecret).digest();

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', aesKey, Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Send / Listen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discover a recipient's inbox and send an encrypted message to it.
 *
 * Returns { topicId, success }
 */
async function sendEncryptedMessage(client, targetAccountId, payload) {
  const inbox = await discoverInbox(targetAccountId);

  const encrypted = encryptMessage(JSON.stringify(payload), inbox.publicKey);

  const envelope = JSON.stringify({
    type: 'HIP1334_MSG',
    version: '1.0',
    ...encrypted,
    timestamp: Date.now(),
  });

  const txResponse = await new TopicMessageSubmitTransaction()
    .setTopicId(inbox.topicId)
    .setMessage(envelope)
    .execute(client);

  const receipt = await txResponse.getReceipt(client);
  console.log(`📨 Encrypted message → ${targetAccountId} inbox (${inbox.topicId})`);
  return { 
    topicId: inbox.topicId, 
    success: true, 
    transactionId: txResponse.transactionId.toString(),
    sequenceNumber: receipt.topicSequenceNumber.toString()
  };
}

/**
 * Subscribe to an HIP-1334 inbox topic.
 * Automatically decrypts incoming HIP1334_MSG envelopes and calls onMessage(payload).
 * Ignores HIP1334_INIT and other message types.
 */
function listenToInbox(client, topicId, encPrivateKey, onMessage) {
  console.log(`👂 HIP-1334 listening on inbox topic: ${topicId}`);

  new TopicMessageQuery()
    .setTopicId(topicId)
    .setStartTime(Math.floor(Date.now() / 1000) - 15) // offset for clock skew
    .subscribe(client, null, async (message) => {
      try {
        let raw = Buffer.from(message.contents).toString('utf8');
        // Handle base64-encoded HCS messages
        if (raw.startsWith('eyJ')) {
          raw = Buffer.from(raw, 'base64').toString('utf8');
        }

        const envelope = JSON.parse(raw);

        if (envelope.type === 'HIP1334_INIT') return; // skip key announcement
        if (envelope.type !== 'HIP1334_MSG') return;  // skip unknown types

        const plaintext = decryptMessage(envelope, encPrivateKey);
        const payload = JSON.parse(plaintext);
        await onMessage(payload);
      } catch (err) {
        console.error('❌ HIP-1334 decryption failed:', err.message);
      }
    });
}

module.exports = {
  createInbox,
  discoverInbox,
  sendEncryptedMessage,
  listenToInbox,
  encryptMessage,
  decryptMessage,
  // Exported for use by receiver-agent and vanish-tools
  generateX25519KeyPair,
  x25519SharedSecret,
};
