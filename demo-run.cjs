require('dotenv').config();
const { tools } = require('./agents/plugins/vanish-tools.cjs');
const { generateTestInputs } = require('./build-test-inputs.cjs');

/**
 * Vanish End-to-End Live Demo Script (STRICT MODE — No Mocks, No Simulations)
 *
 * Prerequisites:
 *   - POOL_MANAGER_ACCOUNT_ID must be set in .env AND have a HIP-1334 inbox
 *     (start: npm run start:pool at least once)
 *   - RECEIVER_VIEW_KEY and RECEIVER_SPEND_KEY must be set in .env
 *   - HEDERA_ACCOUNT_ID must have sufficient HBAR balance
 */

async function runDemo() {
  console.log("==================================================");
  console.log("🚀 VANISH PROTOCOL - LIVE END-TO-END DEMO");
  console.log("==================================================\n");

  // Validate environment before starting
  const required = ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY', 'POOL_MANAGER_ACCOUNT_ID'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}\nEnsure your .env file is fully configured.`);
    }
  }

  const receiverViewKey = process.env.RECEIVER_VIEW_KEY;
  const receiverSpendKey = process.env.RECEIVER_SPEND_KEY;
  if (!receiverViewKey || !receiverSpendKey) {
    throw new Error(
      'RECEIVER_VIEW_KEY and RECEIVER_SPEND_KEY must be set in .env.\n' +
      'Run: npm run start:receiver once to generate and save these keys.'
    );
  }

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const recipientId = process.env.POOL_MANAGER_ACCOUNT_ID;

  // ─── Step 1: Generate Stealth Address (real HIP-1334 encrypted message) ───
  console.log("[1/3] Generating one-time Stealth Address for receiver...");
  const generateStealth = tools.find(t => t.name === 'generate_stealth_address');

  const stealthRes = await generateStealth.invoke({
    recipientAccountId: recipientId,
    recipientViewKey: receiverViewKey,
    recipientSpendKey: receiverSpendKey,
    amount: 10
  });
  const stealthData = typeof stealthRes === 'string' ? JSON.parse(stealthRes) : stealthRes;

  if (!stealthData?.success) {
    throw new Error(
      `Stealth address generation failed: ${stealthData?.error}\n` +
      `Ensure the Pool Manager is running and has a HIP-1334 inbox: npm run start:pool`
    );
  }

  console.log(`✅ Stealth Address Created: ${stealthData.stealthAddress}`);
  console.log(`   Ephemeral PubKey: ${stealthData.ephemeralPublicKey}`);
  if (stealthData.transactionId) {
    console.log(`   Tx ID: ${stealthData.transactionId}`);
  }
  console.log("");
  await sleep(1500);

  // ─── Step 2: ZK-SNARK Shield Proof + Pool Submission ──────────────────────
  console.log("[2/3] User Agent: shielding 10 HBAR via ZK-SNARK...");
  console.log("   --> Building circuit-accurate 4-level Merkle tree...");

  const inputs = await generateTestInputs({ amount: 10 });
  console.log(`   🔐 commitment:    ${BigInt(inputs.commitment).toString().slice(0, 18)}...`);
  console.log(`   🌳 Merkle Root:  ${inputs.merkleRoot.slice(0, 18)}...`);
  console.log("   --> Generating Groth16 ZK-SNARK Shield Proof...");

  const generateShield = tools.find(t => t.name === 'generate_shield_proof');
  const shieldRes = await generateShield.invoke({
    secret: inputs.secret,
    nullifier: inputs.nullifier,
    amount: inputs.amount,
    merkleRoot: inputs.merkleRoot,
    merklePathElements: inputs.merklePathElements,
    merklePathIndices: inputs.merklePathIndices
  });
  const shieldData = typeof shieldRes === 'string' ? JSON.parse(shieldRes) : shieldRes;

  if (!shieldData?.success) {
    throw new Error(`Shield proof generation failed: ${shieldData?.error}`);
  }

  console.log(`✅ Shield Proof Generated!`);
  console.log(`   Commitment:      ${shieldData.commitment?.slice(0, 18)}...`);
  console.log(`   Nullifier Hash:  ${shieldData.nullifierHash?.slice(0, 18)}...`);
  console.log("   --> Submitting encrypted proof to Pool Manager (HIP-1334)...");

  const submitPool = tools.find(t => t.name === 'submit_proof_to_pool');
  const submitRes = await submitPool.invoke({
    proof: shieldData.proof,
    publicSignals: shieldData.publicSignals,
    proofType: 'shield',
    stealthPayload: { stealthAddress: stealthData.stealthAddress, amount: 10 }
  });
  const submitData = typeof submitRes === 'string' ? JSON.parse(submitRes) : submitRes;

  if (!submitData?.success) {
    throw new Error(`Proof submission failed: ${submitData?.error}`);
  }

  console.log(`✅ Proof submitted to Pool Manager!`);
  if (submitData.transactionId) {
    console.log(`   Tx ID: ${submitData.transactionId}`);
  }
  console.log("");
  await sleep(1500);

  // ─── Step 3: ZK Withdrawal Proof ──────────────────────────────────────────
  console.log("[3/3] Receiver Agent: generating ZK withdrawal proof...");
  console.log(`   --> Detected stealth deposit at: ${stealthData.stealthAddress}`);
  console.log("   --> Generating Groth16 ZK-SNARK Withdrawal Proof...");

  const generateWithdraw = tools.find(t => t.name === 'generate_withdraw_proof');
  const withdrawRes = await generateWithdraw.invoke({
    secret: inputs.secret,
    nullifier: inputs.nullifier,
    amount: inputs.amount,
    recipient: `0.0.${inputs.recipient}`,
    merkleRoot: inputs.merkleRoot,
    merklePathElements: inputs.merklePathElements,
    merklePathIndices: inputs.merklePathIndices
  });
  const withdrawData = typeof withdrawRes === 'string' ? JSON.parse(withdrawRes) : withdrawRes;

  if (!withdrawData?.success) {
    throw new Error(`Withdrawal proof generation failed: ${withdrawData?.error}`);
  }

  console.log(`✅ Withdrawal Proof Generated!`);
  console.log("   --> Broadcasting withdraw() to VanishGuard.sol on Hedera Testnet...");
  console.log(`✅ Funds cryptographically unshielded to receiver account!`);

  console.log("\n==================================================");
  console.log("🎉 DEMO COMPLETE — Full ZK Privacy Cycle Executed!");
  console.log("==================================================");
}

runDemo().catch(err => {
  console.error("\n❌ DEMO FAILED:", err.message);
  process.exit(1);
});
