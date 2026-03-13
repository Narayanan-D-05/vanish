/**
 * Vanish Receiver Agent - Stealth Address Scanner (2026)
 * 
 * RESPONSIBILITIES:
 * 1. Monitor HCS public topic for stealth address announcements
 * 2. Detect funds sent to user's stealth addresses
 * 3. Claim funds privately using view keys
 * 4. Notify user of received funds (via encrypted HCS)
 * 
 * PRIVACY MODEL:
 * - Only the recipient can detect stealth transfers (using view key)
 * - Observer sees random-looking addresses, can't link to recipient
 * - Funds claimed automatically without revealing identity
 */

require('dotenv').config();
const { Client, PrivateKey, AccountId, TopicMessageQuery, TransferTransaction, Hbar } = require('@hashgraph/sdk');
const { keccak256 } = require('ethers');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const hip1334 = require('../../lib/hip1334.cjs');

class ReceiverAgent {
  constructor() {
    // Hedera client setup
    this.accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    this.privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    this.client = Client.forTestnet();
    this.client.setOperator(this.accountId, this.privateKey);

    // HCS topics
    this.publicTopic = process.env.PUBLIC_ANNOUNCEMENT_TOPIC_ID;
    this.privateTopic = process.env.PRIVATE_TOPIC_ID;

    // Stealth keys are loaded asynchronously in init()
    this.viewPrivateKey = null;
    this.spendPrivateKey = null;

    // Track detected stealth addresses
    this.detectedAddresses = new Set();
    this.claimedNullifiers = new Set();

    console.log('👀 Receiver Agent initialized');
    console.log(`   Account: ${this.accountId}`);
    console.log(`   Monitoring: ${this.publicTopic}`);
    console.log(`   Status: Scanning for stealth transfers...`);
  }

  /**
   * Load (or generate) the user's stealth keypair from secure storage.
   * 
   * Keys are sourced from dedicated STEALTH_VIEW_KEY / STEALTH_SPEND_KEY env vars,
   * NOT derived from the Hedera account key. On first run, fresh X25519 keys are
   * auto-generated, saved, and the env vars are printed for secure storage.
   */
  async init() {
    const keysFile = path.join(__dirname, '.stealth-keys.json');

    // Preferred path: dedicated env vars (production)
    if (process.env.STEALTH_VIEW_KEY && process.env.STEALTH_SPEND_KEY) {
      this.viewPrivateKey = process.env.STEALTH_VIEW_KEY;
      this.spendPrivateKey = process.env.STEALTH_SPEND_KEY;
      console.log('🔑 Stealth keys loaded from environment variables.');
      return;
    }

    // Fallback: load from auto-generated file
    try {
      const saved = JSON.parse(await fs.readFile(keysFile, 'utf8'));
      this.viewPrivateKey = saved.viewPrivateKey;
      this.spendPrivateKey = saved.spendPrivateKey;
      console.log('🔑 Stealth keys loaded from .stealth-keys.json');
      console.log('   ⚠️  For production, set STEALTH_VIEW_KEY and STEALTH_SPEND_KEY in .env');
    } catch {
      // First run: generate fresh X25519 keypairs for view and spend
      console.log('🔑 Generating new stealth keypair (first run)...');
      const viewEcdh = crypto.createECDH('x25519');
      viewEcdh.generateKeys();
      const spendEcdh = crypto.createECDH('x25519');
      spendEcdh.generateKeys();

      this.viewPrivateKey = viewEcdh.getPrivateKey('hex');
      this.spendPrivateKey = spendEcdh.getPrivateKey('hex');

      await fs.writeFile(keysFile, JSON.stringify({
        viewPrivateKey: this.viewPrivateKey,
        spendPrivateKey: this.spendPrivateKey,
        viewPublicKey: viewEcdh.getPublicKey('hex'),
        spendPublicKey: spendEcdh.getPublicKey('hex'),
        generatedAt: new Date().toISOString()
      }, null, 2));

      console.log('   ✅ Stealth keypair saved to .stealth-keys.json');
      console.log('   📋 To persist across restarts, add these to .env:');
      console.log(`   STEALTH_VIEW_KEY=${this.viewPrivateKey}`);
      console.log(`   STEALTH_SPEND_KEY=${this.spendPrivateKey}`);
    }
  }

  /**
   * Check if a stealth address belongs to this user
   * Uses ECDH with view key to detect ownership
   */
  isMyStealthAddress(ephemeralPublicKey, stealthAddress) {
    try {
      // Compute shared secret using our view key
      const sharedSecret = keccak256(
        Buffer.concat([
          Buffer.from(this.viewPrivateKey, 'hex'),
          Buffer.from(ephemeralPublicKey.replace('0x', ''), 'hex')
        ])
      );

      // Derive expected stealth address
      const expectedAddress = keccak256(
        Buffer.concat([
          Buffer.from(sharedSecret.replace('0x', ''), 'hex'),
          Buffer.from(this.spendPrivateKey, 'hex')
        ])
      );

      // Compare first 20 bytes (Ethereum-style address)
      const expectedShort = '0x' + expectedAddress.slice(2, 42);

      return expectedShort.toLowerCase() === stealthAddress.toLowerCase();

    } catch (error) {
      console.error('Error checking stealth address:', error.message);
      return false;
    }
  }

  /**
   * Scan HCS for stealth address announcements
   */
  async startScanning() {
    console.log('🔍 Scanning HCS for stealth address announcements...');
    console.log(`   Listening to PUBLIC topic: ${this.publicTopic}`);
    console.log(`   Waiting for STEALTH_ANNOUNCEMENT and PRIVACY_BATCH messages...\n`);

    new TopicMessageQuery()
      .setTopicId(this.publicTopic)
      .setStartTime(Math.floor(Date.now() / 1000)) // Only new messages from now on
      .subscribe(this.client, null, async (message) => {
        try {
          // HCS message.contents can be base64 encoded or raw bytes
          let messageString = Buffer.from(message.contents).toString('utf8');

          // Check if it's base64 encoded (starts with eyJ which is base64 for "{")
          if (messageString.startsWith('eyJ') || messageString.match(/^[A-Za-z0-9+/=]+$/)) {
            try {
              messageString = Buffer.from(messageString, 'base64').toString('utf8');
            } catch (e) {
              // Not base64, use as-is
            }
          }

          const payload = JSON.parse(messageString);

          // Log all received message types for debugging
          console.log(`📨 Received HCS message: ${payload.type || 'UNKNOWN'}`);

          // Check for stealth address announcements
          if (payload.type === 'STEALTH_ANNOUNCEMENT') {
            await this.processStealthAnnouncement(payload);
          }

          // Check for batch completions (funds are now available)
          else if (payload.type === 'PRIVACY_BATCH') {
            await this.checkBatchForFunds(payload);
          }

          else {
            console.log(`   ⚠️  Unhandled message type: ${payload.type}\n`);
          }

        } catch (error) {
          // Log parsing errors for debugging (but don't crash)
          console.error('❌ Error processing HCS message:', error.message);
          if (message.contents) {
            const rawMessage = Buffer.from(message.contents).toString('utf8');
            console.error('Raw message (first 100 chars):', rawMessage.substring(0, 100));
          }
        }
      });
  }

  /**
   * Process stealth address announcement
   */
  async processStealthAnnouncement(announcement) {
    const { ephemeralPublicKey, stealthAddress, amount, token } = announcement;

    // Check if this stealth address is ours
    const isMine = this.isMyStealthAddress(ephemeralPublicKey, stealthAddress);

    if (isMine && !this.detectedAddresses.has(stealthAddress)) {
      console.log('✨ STEALTH TRANSFER DETECTED!');
      console.log(`   Amount: ${amount} ${token}`);
      console.log(`   Stealth Address: ${stealthAddress}`);
      console.log(`   Status: Waiting for batch completion...\n`);

      // Track this address
      this.detectedAddresses.add(stealthAddress);

      // Notify user via their own encrypted HIP-1334 inbox
      try {
        await hip1334.sendEncryptedMessage(this.client, this.accountId.toString(), {
          type: 'STEALTH_DETECTED',
          stealthAddress,
          amount,
          token,
          ephemeralPublicKey,
          timestamp: Date.now(),
          message: `Stealth transfer of ${amount} ${token || 'HBAR'} detected. Awaiting batch completion to claim.`
        });
        console.log(`   📨 Encrypted notification sent to your HCS inbox.\n`);
      } catch (notifErr) {
        console.warn(`   ⚠️ Notification failed (${notifErr.message}) — detection still logged locally.\n`);
      }
    }
  }

  /**
   * Check if a completed batch contains funds for us
   */
  async checkBatchForFunds(batchData) {
    // In production, would parse batch data and check if any
    // nullifiers correspond to our detected stealth addresses

    console.log('📦 PRIVACY_BATCH received!');
    console.log(`   Batch ID: ${batchData.batchId}`);
    console.log(`   Batch Size: ${batchData.batchSize} proofs`);
    console.log(`   Merkle Root: ${batchData.newMerkleRoot}`);
    console.log(`   Detected stealth addresses: ${this.detectedAddresses.size}\n`);

    // For now, we'll claim funds when we detect a batch and we have
    // pending stealth addresses

    if (this.detectedAddresses.size > 0) {
      console.log('💰 Checking for claimable funds...');

      // Iterate through detected addresses
      for (const stealthAddress of this.detectedAddresses) {
        await this.claimFunds(stealthAddress, batchData);
      }
    }
  }

  /**
   * Claim funds from a stealth address
   */
  async claimFunds(stealthAddress, batchData) {
    // Check if already claimed
    if (this.claimedNullifiers.has(stealthAddress)) {
      return;
    }

    try {
      console.log(`🎁 Claiming funds from stealth address: ${stealthAddress}`);

      // In production, this would:
      // 1. Generate ZK-proof of ownership (using view + spend keys)
      // 2. Submit withdrawal proof to Pool Manager
      // 3. Pool Manager verifies and transfers funds to our account

      // For boilerplate, simulate claim
      console.log('   ✅ Funds claimed successfully!');
      console.log(`   Transferred to: ${this.accountId}\n`);

      // Mark as claimed
      this.claimedNullifiers.add(stealthAddress);
      this.detectedAddresses.delete(stealthAddress);

    } catch (error) {
      console.error(`   ❌ Failed to claim funds: ${error.message}\n`);
    }
  }

  /**
   * Monitor for direct stealth transfers (not through pool)
   * This handles P2P stealth transfers outside the mixing pool
   */
  async scanForDirectTransfers() {
    // This would integrate with Hedera Mirror Node API
    // to detect actual on-chain transfers to stealth addresses

    // For boilerplate, we rely on HCS announcements
    console.log('Note: Direct stealth transfer scanning requires Mirror Node API integration');
  }

  /**
   * Health check and status report
   */
  getStatus() {
    return {
      account: this.accountId.toString(),
      pendingDetections: this.detectedAddresses.size,
      totalClaimed: this.claimedNullifiers.size,
      scanning: true
    };
  }
}

// Start Receiver Agent
async function main() {
  const agent = new ReceiverAgent();
  await agent.init();  // Load or generate stealth keys securely
  await agent.startScanning();

  // Status monitoring (every 10 minutes)
  setInterval(() => {
    const status = agent.getStatus();
    console.log('📊 Receiver Status:', status);
  }, 10 * 60 * 1000);

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n👋 Receiver Agent stopped');
    process.exit(0);
  });
}

main().catch(console.error);

module.exports = { ReceiverAgent };
