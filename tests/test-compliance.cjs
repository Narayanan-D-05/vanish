require('dotenv').config();
const { PoolManager } = require('./agents/pool-manager/index.cjs');
const { generateSelectiveDisclosureTool } = require('./agents/plugins/vanish-tools.cjs');
const snarkjs = require('snarkjs');
const fs = require('fs');

/**
 * Vanish - Compliance Layer Test
 * 
 * Verifies that the Pool Manager enforces "Proof of Innocence" by automatically 
 * rejecting known malicious entities ("0.0.999999") from entering the shielded pool.
 * Also verifies that valid users can generate Selective Disclosure reports.
 */

async function main() {
    console.log('🛡️ Testing Vanish AML & Compliance Features\\n');

    // 1. Initialize Pool Manager to test rejecting dirty money
    process.env.ENABLE_AI_CORE = 'false'; // Skip AI reasoning for the raw unit test
    const poolManager = new PoolManager();
    await poolManager.loadVerificationKeys();

    // Create mock deposit proof payloads
    const cleanProof = {
        submitter: '0.0.123456',
        proofType: 'shield',
        amount: 100,
        proof: {}, // Dummy proof (we will mock the verify function for this test only)
        publicSignals: ['nullifier1', 'commitment1']
    };

    const dirtyProof = {
        submitter: '0.0.999999', // Our simulated "Hacker" walled defined in pool-manager
        proofType: 'shield',
        amount: 500,
        proof: {},
        publicSignals: ['nullifier2', 'commitment2']
    };

    // Mock verifyProof just to test the AML logic without real circom builds parsing
    poolManager.verifyProof = async () => true;

    console.log('--- TEST 1: AML Firewall ---');
    console.log('Testing CLEAN Deposit from ordinary user (0.0.123456)...');
    const cleanResult = await poolManager.addProofToQueue(cleanProof);
    console.log(`Pool Manager Accepted Clean Deposit: ${cleanResult !== false}\\n`);

    console.log('Testing DIRTY Deposit from known bad actor (0.0.999999)...');
    const dirtyResult = await poolManager.addProofToQueue(dirtyProof);
    console.log(`Pool Manager Accepted Dirty Deposit: ${dirtyResult !== false}\\n`);

    // 2. Test generating a Selective Disclosure Report
    console.log('--- TEST 2: Selective Disclosure ---');
    console.log('Invoking `generate_selective_disclosure` tool for an exchange off-ramp...');

    const reportJSON = await generateSelectiveDisclosureTool.func({
        viewKey: 'abc123def456',
        nullifierHash: '0x123...abc',
        recipientAddress: '0.0.888888', // e.g. Binance Deposit Address
        amount: 100
    });

    const parsed = JSON.parse(reportJSON);
    console.log('✅ Proof of Innocence Report Generated:');
    console.log(JSON.stringify(parsed.report, null, 2));

    console.log('\n✅ All Compliance Tests Finished.');
    poolManager.client.close();
    setTimeout(() => process.exit(0), 1000);
}

main().catch(console.error);
