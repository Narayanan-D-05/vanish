require('dotenv').config();
const { Client, PrivateKey } = require('@hashgraph/sdk');
const axios = require('axios');
const StealthAddressGenerator = require('../../lib/stealth');
const HCSPrivateMessaging = require('../../lib/hcs-private');

/**
 * Receiver Agent (Stealth Watcher)
 * Scans Mirror Node for stealth addresses and claims funds
 */

class ReceiverAgent {
  constructor() {
    this.client = null;
    this.accountId = process.env.HEDERA_ACCOUNT_ID;
    this.privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    this.hcsMessaging = null;
    this.receiverKeys = null;
    this.detectedTransfers = [];
    this.polling = false;
  }

  async initialize() {
    console.log('👁️  Initializing Receiver Agent (Stealth Watcher)...\n');

    this.client = Client.forTestnet();
    this.client.setOperator(this.accountId, this.privateKey);

    this.hcsMessaging = new HCSPrivateMessaging(this.client);

    console.log(`✅ Connected to Hedera Testnet`);
    console.log(`✅ Receiver Account: ${this.accountId}\n`);

    // Generate receiver meta-address
    await this.generateReceiverKeys();

    // Subscribe to private HCS messages
    this.subscribeToPrivateMessages();
  }

  /**
   * Generate receiver's meta-address keys
   */
  async generateReceiverKeys() {
    console.log('🔑 Generating Receiver Keys...');

    // Check if keys exist in .env
    const existingSpendingKey = process.env.RECEIVER_META_ADDRESS_SPENDING_KEY;
    const existingViewingKey = process.env.RECEIVER_META_ADDRESS_VIEWING_KEY;

    if (existingSpendingKey && existingViewingKey) {
      console.log('✅ Using existing receiver keys from .env\n');
      this.receiverKeys = {
        spendingPrivateKey: existingSpendingKey,
        viewingPrivateKey: existingViewingKey,
        // Reconstruct meta-address
        metaAddress: 'FROM_ENV'
      };
    } else {
      // Generate new keys
      this.receiverKeys = StealthAddressGenerator.generateMetaAddress();
      
      console.log('\n📋 SAVE THESE KEYS TO YOUR .env FILE:');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`RECEIVER_META_ADDRESS_SPENDING_KEY=${this.receiverKeys.spendingPrivateKey}`);
      console.log(`RECEIVER_META_ADDRESS_VIEWING_KEY=${this.receiverKeys.viewingPrivateKey}`);
      console.log('═══════════════════════════════════════════════════════');
      console.log(`\n📬 Your Meta-Address (share with senders):`);
      console.log(`${this.receiverKeys.metaAddress}\n`);
    }
  }

  /**
   * Subscribe to private HCS messages
   */
  subscribeToPrivateMessages() {
    if (!process.env.PRIVATE_TOPIC_ID) {
      console.log('⚠️  No PRIVATE_TOPIC_ID configured. Skipping HCS subscription.\n');
      return;
    }

    console.log('📨 Subscribing to private HCS messages...');

    this.hcsMessaging.subscribeToPrivateMessages(
      process.env.PRIVATE_TOPIC_ID,
      this.receiverKeys.viewingPrivateKey,
      (message) => {
        this.handlePrivateMessage(message);
      }
    );

    console.log('✅ Subscribed to HCS topic\n');
  }

  /**
   * Handle incoming private message
   */
  handlePrivateMessage(message) {
    console.log('💌 Received private message:');
    console.log(`   Type: ${message.data.type}`);
    console.log(`   Amount: ${message.data.amount}`);
    console.log(`   Stealth Address: ${message.data.stealthAddress.slice(0, 20)}...`);
    console.log(`   Memo: ${message.data.memo}\n`);

    this.detectedTransfers.push({
      ...message.data,
      receivedAt: Date.now()
    });
  }

  /**
   * Start scanning Mirror Node for stealth addresses
   */
  async startScanning() {
    console.log('🔍 Starting Mirror Node scanner...\n');
    console.log('═══════════════════════════════════════════════════════\n');

    this.polling = true;
    const pollInterval = parseInt(process.env.MIRROR_NODE_POLL_INTERVAL) || 5000;

    while (this.polling) {
      try {
        await this.scanMirrorNode();
        await this.sleep(pollInterval);
      } catch (error) {
        console.error('Scanner error:', error.message);
        await this.sleep(pollInterval);
      }
    }
  }

  /**
   * Scan Mirror Node for transactions
   */
  async scanMirrorNode() {
    try {
      const mirrorNodeUrl = process.env.MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com';
      
      // Query recent transactions
      const response = await axios.get(`${mirrorNodeUrl}/api/v1/transactions`, {
        params: {
          limit: 10,
          order: 'desc'
        }
      });

      const transactions = response.data.transactions || [];

      // Look for stealth address announcements
      for (const tx of transactions) {
        await this.processTransaction(tx);
      }

    } catch (error) {
      console.error('Mirror Node query error:', error.message);
    }
  }

  /**
   * Process a transaction to check if it's for us
   */
  async processTransaction(tx) {
    // Check if transaction contains HCS message
    if (tx.consensus_timestamp && tx.memo_base64) {
      try {
        const memo = Buffer.from(tx.memo_base64, 'base64').toString('utf8');
        const announcement = JSON.parse(memo);

        if (announcement.type === 'STEALTH_ANNOUNCEMENT') {
          await this.checkStealthAddress(announcement);
        }
      } catch (error) {
        // Not a stealth announcement, ignore
      }
    }
  }

  /**
   * Check if stealth address is meant for us
   */
  async checkStealthAddress(announcement) {
    try {
      // Use viewing key to scan
      const detectedAddresses = StealthAddressGenerator.scanForStealthAddresses(
        this.receiverKeys.viewingPrivateKey,
        this.receiverKeys.spendingPrivateKey,
        [announcement]
      );

      if (detectedAddresses.length > 0) {
        console.log('🎯 DETECTED STEALTH TRANSFER!');
        console.log('═══════════════════════════════════════════════════════');
        
        for (const detected of detectedAddresses) {
          console.log(`   Amount: ${detected.amount}`);
          console.log(`   Address: ${detected.stealthAddress}`);
          console.log(`   Private Key: ${detected.stealthPrivateKey.slice(0, 20)}...`);
          console.log('═══════════════════════════════════════════════════════\n');

          // Claim the funds
          await this.claimFunds(detected);
        }
      }
    } catch (error) {
      console.error('Error checking stealth address:', error.message);
    }
  }

  /**
   * Claim funds from stealth address
   */
  async claimFunds(stealthTransfer) {
    console.log('💰 Claiming funds from stealth address...');

    try {
      // Import stealth private key
      const stealthPrivKey = PrivateKey.fromString(stealthTransfer.stealthPrivateKey);

      // Transfer from stealth address to receiver's main vault
      const { TransferTransaction, Hbar } = require('@hashgraph/sdk');

      // Create temporary client with stealth private key
      const stealthClient = Client.forTestnet();
      stealthClient.setOperator(stealthTransfer.stealthAddress, stealthPrivKey);

      const tx = new TransferTransaction()
        .addHbarTransfer(stealthTransfer.stealthAddress, new Hbar(-stealthTransfer.amount))
        .addHbarTransfer(this.accountId, new Hbar(stealthTransfer.amount));

      console.log('⚠️  Actual claim not yet implemented (placeholder)');
      console.log('✅ Simulated claim complete\n');

      // const response = await tx.execute(stealthClient);
      // const receipt = await response.getReceipt(stealthClient);
      
      // console.log(`✅ Funds claimed! Transaction: ${response.transactionId}\n`);

      stealthClient.close();
    } catch (error) {
      console.error('❌ Failed to claim funds:', error.message);
    }
  }

  /**
   * Display detected transfers
   */
  displayDetectedTransfers() {
    if (this.detectedTransfers.length === 0) {
      console.log('📭 No detected transfers yet...\n');
      return;
    }

    console.log('\n📊 DETECTED TRANSFERS');
    console.log('═══════════════════════════════════════════════════════');
    
    for (let i = 0; i < this.detectedTransfers.length; i++) {
      const transfer = this.detectedTransfers[i];
      console.log(`\n${i + 1}. Amount: ${transfer.amount} HBAR`);
      console.log(`   Received: ${new Date(transfer.receivedAt).toLocaleString()}`);
      console.log(`   Memo: ${transfer.memo || 'N/A'}`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════\n');
  }

  /**
   * Helper: Sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown() {
    console.log('\n🛑 Shutting down Receiver Agent...');
    this.polling = false;
    if (this.client) {
      this.client.close();
    }
  }
}

// Run the agent
async function main() {
  const agent = new ReceiverAgent();

  try {
    await agent.initialize();

    // Display detected transfers every 15 seconds
    setInterval(() => {
      agent.displayDetectedTransfers();
    }, 15000);

    // Start scanning
    await agent.startScanning();

  } catch (error) {
    console.error('Fatal error:', error);
    await agent.shutdown();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ReceiverAgent;
