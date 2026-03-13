const { Client, PrivateKey, AccountId, TopicMessageSubmitTransaction } = require('@hashgraph/sdk');
const crypto = require('crypto');
require('dotenv').config();

/**
 * Vanish Noisy Heartbeat Generator (Timing Channel Mitigation)
 * 
 * Strategy: Constant-Time Execution & "Chaff" Traffic
 * This script continuously fires structurally valid but mathematically meaningless 
 * "STEALTH_ANNOUNCEMENT" messages into the HCS topic.
 * 
 * By adding random jitter, real user transactions blend invisibly into the noise.
 */

async function main() {
    console.log('💓 Starting Vanish Noisy Heartbeat (Chaff Generator)...');

    // Load Hedera configurations
    const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    const privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    const topicId = process.env.PUBLIC_ANNOUNCEMENT_TOPIC_ID;

    const client = Client.forTestnet();
    client.setOperator(accountId, privateKey);

    console.log(`   Account: ${accountId}`);
    console.log(`   Target Topic: ${topicId}`);
    console.log(`   Status: Pumping chaff into the network at random intervals.\\n`);

    // Infinite loop sending chaff
    while (true) {
        try {
            // 1. Generate structurally sound fake data
            // Random 32-byte ephemeral key
            const fakeEphemeral = crypto.randomBytes(32).toString('hex');
            // Random 20-byte address
            const fakeAddress = crypto.randomBytes(20).toString('hex');

            const chaffPayload = {
                type: 'STEALTH_ANNOUNCEMENT',
                ephemeralPublicKey: `0x${fakeEphemeral}`,
                stealthAddress: `0x${fakeAddress}`,
                amount: (Math.random() * 100).toFixed(4), // Looks like realistic HBAR amount
                token: 'HBAR',
                isChaff: true // Optional marker; the math will reject it anyway
            };

            // 2. Submit to Hedera Consensus Service
            const tx = new TopicMessageSubmitTransaction()
                .setTopicId(topicId)
                .setMessage(JSON.stringify(chaffPayload));

            const response = await tx.execute(client);
            const receipt = await response.getReceipt(client);

            console.log(`   [CHAFF SENT] Seq: ${receipt.topicSequenceNumber.toString()} | Amt: ${chaffPayload.amount} HBAR`);
        } catch (err) {
            console.error(`   [ERROR] Failed to send chaff: ${err.message}`);
        }

        // 3. Jitter Delay
        // Random delay between 2 and 7 seconds (2000ms - 7000ms)
        // This breaks the exact timing link for any observers.
        const jitterMs = Math.floor(Math.random() * 5000) + 2000;
        // console.log(`   Sleeping for ${jitterMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, jitterMs));
    }
}

main().catch(console.error);
