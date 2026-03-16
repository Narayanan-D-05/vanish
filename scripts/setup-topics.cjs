require('dotenv').config();
const { 
  Client, 
  PrivateKey, 
  AccountId,
  TopicCreateTransaction,
  TopicId
} = require('@hashgraph/sdk');

/**
 * Setup Script: Create HCS Topics for Vanish
 * Creates two topics:
 * 1. PRIVATE_TOPIC_ID - For encrypted zk-SNARK proofs
 * 2. PUBLIC_ANNOUNCEMENT_TOPIC_ID - For stealth address announcements
 */

async function createHCSTopics() {
  console.log('🚀 Vanish HCS Topic Setup\n');

  // Check if credentials exist
  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
    console.error('❌ Missing Hedera credentials in .env file');
    console.error('   Please add HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY\n');
    console.log('💡 Get testnet account at: https://portal.hedera.com/register\n');
    process.exit(1);
  }

  try {
    // Initialize Hedera client
    const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    const privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);

    const client = Client.forTestnet();
    client.setOperator(accountId, privateKey);

    console.log(`✅ Connected to Hedera Testnet`);
    console.log(`   Account: ${accountId.toString()}\n`);

    // Create PRIVATE_TOPIC_ID (encrypted proofs)
    console.log('📝 Creating PRIVATE_TOPIC_ID (encrypted proofs)...');
    
    const privateTopic = await new TopicCreateTransaction()
      .setTopicMemo('Vanish - Encrypted zk-SNARK Proofs')
      .setSubmitKey(privateKey.publicKey)  // Only operator can submit
      .execute(client);

    const privateReceipt = await privateTopic.getReceipt(client);
    const privateTopicId = privateReceipt.topicId;

    console.log(`✅ PRIVATE_TOPIC_ID created: ${privateTopicId.toString()}`);
    console.log(`   Purpose: Encrypted proof-of-payment messages`);
    console.log(`   Access: Restricted (submit key required)\n`);

    // Create PUBLIC_ANNOUNCEMENT_TOPIC_ID (stealth announcements)
    console.log('📢 Creating PUBLIC_ANNOUNCEMENT_TOPIC_ID (stealth announcements)...');
    
    const publicTopic = await new TopicCreateTransaction()
      .setTopicMemo('Vanish - Stealth Address Announcements')
      // No submit key = anyone can submit
      .execute(client);

    const publicReceipt = await publicTopic.getReceipt(client);
    const publicTopicId = publicReceipt.topicId;

    console.log(`✅ PUBLIC_ANNOUNCEMENT_TOPIC_ID created: ${publicTopicId.toString()}`);
    console.log(`   Purpose: Stealth address ephemeral keys`);
    console.log(`   Access: Public (anyone can submit)\n`);

    // Display summary
    console.log('━'.repeat(60));
    console.log('✅ HCS Topics Created Successfully!\n');
    console.log('📋 Add these to your .env file:\n');
    console.log(`PRIVATE_TOPIC_ID=${privateTopicId.toString()}`);
    console.log(`PUBLIC_ANNOUNCEMENT_TOPIC_ID=${publicTopicId.toString()}\n`);
    console.log('━'.repeat(60));

    // Auto-update .env file
    await updateEnvFile(privateTopicId.toString(), publicTopicId.toString());

    client.close();

  } catch (error) {
    console.error('❌ Error creating topics:', error.message);
    
    if (error.message.includes('INVALID_SIGNATURE')) {
      console.error('\n💡 Check that your HEDERA_PRIVATE_KEY matches HEDERA_ACCOUNT_ID');
    } else if (error.message.includes('INSUFFICIENT_ACCOUNT_BALANCE')) {
      console.error('\n💡 Your account needs HBAR. Get free testnet HBAR at:');
      console.error('   https://portal.hedera.com/');
    }
    
    process.exit(1);
  }
}

/**
 * Update .env file with topic IDs
 */
async function updateEnvFile(privateTopicId, publicTopicId) {
  const fs = require('fs');
  const path = require('path');

  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');

    // Replace placeholder values
    envContent = envContent.replace(
      /PRIVATE_TOPIC_ID=.*/,
      `PRIVATE_TOPIC_ID=${privateTopicId}`
    );
    envContent = envContent.replace(
      /PUBLIC_ANNOUNCEMENT_TOPIC_ID=.*/,
      `PUBLIC_ANNOUNCEMENT_TOPIC_ID=${publicTopicId}`
    );

    fs.writeFileSync(envPath, envContent);

    console.log('\n✅ .env file updated automatically\n');

  } catch (error) {
    console.log('\n⚠️  Could not auto-update .env file');
    console.log('   Please add the topic IDs manually\n');
  }
}

/**
 * Get topic info (optional)
 */
async function getTopicInfo(topicIdString) {
  const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
  const privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);

  const client = Client.forTestnet();
  client.setOperator(accountId, privateKey);

  const topicId = TopicId.fromString(topicIdString);

  // Query topic via Mirror Node
  const axios = require('axios');
  const mirrorUrl = `${process.env.MIRROR_NODE_URL}/api/v1/topics/${topicIdString}`;

  try {
    const response = await axios.get(mirrorUrl);
    console.log('📊 Topic Info:', response.data);
  } catch (error) {
    console.log('⚠️  Topic info not yet available (may take a few seconds)');
  }

  client.close();
}

// Run setup
createHCSTopics().catch(console.error);
