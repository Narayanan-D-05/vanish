/**
 * Vanish E2E Test: Private Stealth Payment (Pool -> Stealth)
 */
require('dotenv').config();
const { UserAgent } = require('./agents/user-agent/index.cjs');

async function test() {
  console.log('🏁 Starting E2E Private Stealth Test...');
  const agent = new UserAgent(false); // No AI for deterministic test

  // 1. Shield some funds
  console.log('\n--- PHASE 1: SHIELDING ---');
  const shieldRes = await agent.shieldFunds(10);
  console.log(shieldRes);

  if (!shieldRes.includes('SUCCESS')) {
    console.error('❌ Shielding submission failed');
    process.exit(1);
  }

  // Extract Secret ID
  const secretIdMatch = shieldRes.match(/Secret ID: ([a-f0-9]+)/);
  if (!secretIdMatch) {
    console.error('❌ Could not find Secret ID in response');
    process.exit(1);
  }
  const secretId = secretIdMatch[1];
  console.log(`✅ Saved Secret ID: ${secretId}`);

  // 2. Shield again to hit minBatchSize=2
  console.log('\n--- PHASE 2: REACHING BATCH LIMIT ---');
  const shieldRes2 = await agent.shieldFunds(10);
  console.log(shieldRes2);

  // 3. Initiate Private Stealth Payment (Pool -> Stealth)
  // We'll use the first secretId we generated
  console.log('\n--- PHASE 3: PRIVATE STEALTH PAYMENT ---');
  const stealthRes = await agent.generateStealthAddressPrivate("0.0.8119040", 5, secretId);
  console.log(stealthRes);

  console.log('\n--- PHASE 4: VERIFICATION ---');
  console.log('Check Pool Manager logs for batch execution and Receiver Agent for detection.');
  console.log('Test logic complete.');
  process.exit(0);
}

test().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
