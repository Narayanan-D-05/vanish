require('dotenv').config();
const { tools, generateSelectiveDisclosureTool } = require('./agents/plugins/vanish-tools.cjs');

// Extract the new securely whitelisted transfer tool
const requestWhitelistedTransferTool = tools.find(t => t.name === 'request_whitelisted_transfer');

/**
 * Vanish - Gateway Policy Enforcement Test
 * 
 * Simulates a Prompt Injection attack where the AI is tricked into 
 * trying to send user funds to a hacker's address. Verifies that the 
 * deterministic SecurityGateway intercepts and blocks the intent.
 */

async function main() {
    console.log('🛡️ Testing Gateway Policy Enforcement (Prompt Injection Defense)\\n');

    if (!requestWhitelistedTransferTool) {
        console.error('❌ Could not find request_whitelisted_transfer tool. Was it exported correctly?');
        process.exit(1);
    }

    console.log('--- TEST 1: Authorized Transfer (Whitelisted) ---');
    console.log('Simulating AI Intent: Transfer 1 HBAR to whitelisted alias 0.0.123456');

    const authorizedResultJSON = await requestWhitelistedTransferTool.func({
        toAccountId: '0.0.123456',
        amount: 1
    });

    const authorizedResult = JSON.parse(authorizedResultJSON);
    console.log(`Gateway Status: ${authorizedResult.gatewayStatus}`);
    console.log(`Message: ${authorizedResult.message}\\n`);

    console.log('--- TEST 2: Prompt Injection Attack (Not Whitelisted) ---');
    console.log('Simulating AI Intent: **HACKED** Transfer 1000 HBAR to attacker wallet 0.0.999999');

    const injectedResultJSON = await requestWhitelistedTransferTool.func({
        toAccountId: '0.0.999999',
        amount: 1000
    });

    const injectedResult = JSON.parse(injectedResultJSON);
    console.log(`Gateway Status: ${injectedResult.gatewayStatus}`);
    console.log(`Message: ${injectedResult.message}\\n`);

    // Verify the assertions
    if (injectedResult.gatewayStatus === 'BLOCKED' && authorizedResult.gatewayStatus === 'APPROVED') {
        console.log('✅ PASS: The Security Gateway successfully intercepted the malicious intent!');
    } else {
        console.log('❌ FAIL: The Security Gateway did not enforce the whitelist policy correctly.');
    }

    process.exit(0);
}

main().catch(console.error);
