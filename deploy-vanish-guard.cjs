/**
 * Deploy VanishGuard.sol to Hedera Testnet
 *
 * VanishGuard enforces the same policy rules as policy-engine.cjs but on-chain,
 * so bad pool-manager decisions revert at the contract level.
 *
 * Constructor args are read from vanish-policy.json and converted to on-chain types:
 *   - allowedDenominations: HBAR → tinybars (×100_000_000)
 */

require('dotenv').config();
const {
    Client,
    PrivateKey,
    AccountId,
    ContractCreateFlow,
    ContractFunctionParameters,
} = require('@hashgraph/sdk');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const TINYBARS_PER_HBAR = 100_000_000n;

async function deployVanishGuard() {
    console.log('🛡️  Deploying VanishGuard.sol to Hedera Testnet\n');

    if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
        console.error('❌ Missing HEDERA_ACCOUNT_ID or HEDERA_PRIVATE_KEY in .env');
        process.exit(1);
    }

    // ── Load policy config ──────────────────────────────────────────────────────
    const policyPath = process.env.VANISH_POLICY_PATH || './config/vanish-policy.json';
    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

    console.log('📋 Policy loaded from:', policyPath);
    console.log(`   minBatchSize:        ${policy.minBatchSize}`);
    console.log(`   maxBatchSize:        ${policy.maxBatchSize}`);
    console.log(`   minDelaySeconds:     ${policy.minDelaySeconds}`);
    console.log(`   maxDelayMinutes:     ${policy.maxDelayMinutes}`);
    console.log(`   maxWaitMinutes:      ${policy.maxWaitMinutes}`);
    console.log(`   allowedDenominations (HBAR): ${JSON.stringify(policy.allowedDenominations)}`);
    console.log(`   version:             ${policy.version}\n`);

    // Convert HBAR denominations → tinybars for on-chain storage
    const denomsTinybars = (policy.allowedDenominations || []).map(
        (hbar) => BigInt(Math.round(hbar * 1e8))
    );

    console.log(`   allowedDenominations (tinybars): [${denomsTinybars.join(', ')}]\n`);

    // ── Hedera client ───────────────────────────────────────────────────────────
    const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    const privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    const client = Client.forTestnet();
    client.setOperator(accountId, privateKey);

    console.log(`✅ Connected to Hedera Testnet`);
    console.log(`   Deployer: ${accountId.toString()}\n`);

    // ── Compile ─────────────────────────────────────────────────────────────────
    console.log('📝 Compiling contracts with Hardhat...');
    try {
        const { stdout, stderr } = await execPromise('npx hardhat compile 2>&1');
        if (stdout) console.log(stdout.trim());
        if (stderr && stderr.trim()) console.warn(stderr.trim());
        console.log('✅ Compilation successful\n');
    } catch (err) {
        console.error('❌ Hardhat compile failed:', err.message);
        process.exit(1);
    }

    // ── Read artifact ────────────────────────────────────────────────────────────
    const artifactPath = path.join(
        __dirname, 'artifacts', 'contracts', 'VanishGuard.sol', 'VanishGuard.json'
    );

    if (!fs.existsSync(artifactPath)) {
        console.error('❌ Compiled artifact not found at:', artifactPath);
        process.exit(1);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const bytecode = artifact.bytecode;

    if (!bytecode || bytecode.length < 10) {
        console.error('❌ Invalid or empty bytecode');
        process.exit(1);
    }
    console.log(`📦 Bytecode size: ${Math.round(bytecode.length / 2)} bytes\n`);

    // ── Build constructor parameters ────────────────────────────────────────────
    //
    // constructor(
    //   uint32  minBatchSize,
    //   uint32  maxBatchSize,
    //   uint32  minDelaySeconds,
    //   uint32  maxDelayMinutes,
    //   uint32  maxWaitMinutes,
    //   uint256[] allowedDenoms,  ← tinybars
    //   string  policyVersion
    // )
    //
    // ContractFunctionParameters does not natively support uint256[]; we encode
    // the constructor ABI manually using ethers AbiCoder and pass raw bytes.

    let constructorArgs;
    try {
        const { AbiCoder, toBeArray } = require('ethers');
        const coder = AbiCoder.defaultAbiCoder();
        const encodedArgs = coder.encode(
            ['uint32', 'uint32', 'uint32', 'uint32', 'uint32', 'uint256[]', 'string'],
            [
                policy.minBatchSize,
                policy.maxBatchSize,
                policy.minDelaySeconds,
                policy.maxDelayMinutes,
                policy.maxWaitMinutes,
                denomsTinybars,
                policy.version || '2026.1',
            ]
        );
        // Strip 0x prefix — Hedera SDK expects raw hex bytes appended to bytecode
        constructorArgs = encodedArgs.replace(/^0x/, '');
    } catch (err) {
        console.error('❌ Failed to ABI-encode constructor args:', err.message);
        process.exit(1);
    }

    // ── Deploy ──────────────────────────────────────────────────────────────────
    console.log('🚀 Deploying VanishGuard to Hedera...');
    console.log('   This may take 30-60 seconds...\n');

    const fullBytecode = bytecode + constructorArgs;

    const contractCreate = await new ContractCreateFlow()
        .setBytecode(fullBytecode)
        .setGas(4_000_000)   // Raised: VanishGuard has complex array storage + policy logic
        .execute(client);

    const receipt = await contractCreate.getReceipt(client);
    const contractId = receipt.contractId;

    console.log('═'.repeat(60));
    console.log('✅ VANISHGUARD DEPLOYED!\n');
    console.log(`   Contract ID:   ${contractId.toString()}`);
    console.log(`   Transaction:   ${contractCreate.transactionId.toString()}`);
    console.log(`   Policy:        ${policy.version || '2026.1'}`);
    console.log(`   Denominations: ${denomsTinybars.length > 0 ? denomsTinybars.length + ' locked' : 'unrestricted'}`);
    console.log('═'.repeat(60) + '\n');

    // ── Deploy & Link Verifiers ──────────────────────────────────────────────────
    async function deployVerifier(name) {
        const vPath = path.join(__dirname, 'artifacts', 'contracts', `${name}Verifier.sol`, `${name}Verifier.json`);
        if (!fs.existsSync(vPath)) {
            console.log(`⚠️  Verifier artifact ${name} not found, skipping.`);
            return null;
        }
        const vArtifact = JSON.parse(fs.readFileSync(vPath, 'utf8'));
        console.log(`🚀 Deploying ${name}Verifier...`);
        const vFlow = await new ContractCreateFlow()
            .setBytecode(vArtifact.bytecode)
            .setGas(800_000)
            .execute(client);
        const vReceipt = await vFlow.getReceipt(client);
        console.log(`✅ ${name}Verifier deployed at: ${vReceipt.contractId.toString()}`);
        return vReceipt.contractId;
    }

    const sV = await deployVerifier('shield');
    const wV = await deployVerifier('withdraw');
    const exV = await deployVerifier('exclusion');

    if (sV || wV || exV) {
        console.log('\n🔗 Linking verifiers to VanishGuard...');
        const { ContractExecuteTransaction } = require('@hashgraph/sdk');
        const { Interface } = require('ethers');
        const vIface = new Interface(['function setVerifiers(address _shield, address _withdraw, address _exclusion)']);
        // Convert Hedera Contract IDs to EVM addresses (0.0.x -> 0000000000000000000000000000000000000xxx)
        const toEvm = (id) => id ? '0x' + id.toSolidityAddress() : '0x' + '0'.repeat(40);

        const setLink = await new ContractExecuteTransaction()
            .setContractId(contractId)
            .setGas(200_000)
            .setFunctionParameters(Buffer.from(vIface.encodeFunctionData('setVerifiers', [
                toEvm(sV), toEvm(wV), toEvm(exV)
            ]).slice(2), 'hex'))
            .execute(client);
        await setLink.getReceipt(client);
        console.log('✅ Verifiers linked on-chain.\n');
    }


    // ── Update .env ──────────────────────────────────────────────────────────────
    try {
        const envPath = '.env';
        let envContent = fs.readFileSync(envPath, 'utf8');

        if (envContent.includes('VANISH_GUARD_CONTRACT_ID=')) {
            envContent = envContent.replace(
                /VANISH_GUARD_CONTRACT_ID=.*/,
                `VANISH_GUARD_CONTRACT_ID=${contractId.toString()}`
            );
        } else {
            envContent += `\nVANISH_GUARD_CONTRACT_ID=${contractId.toString()}\n`;
        }

        fs.writeFileSync(envPath, envContent);
        console.log('✅ .env updated with VANISH_GUARD_CONTRACT_ID');
        console.log(`   VANISH_GUARD_CONTRACT_ID=${contractId.toString()}\n`);
    } catch (err) {
        console.warn(`⚠️  Could not update .env automatically.`);
        console.warn(`   Add manually: VANISH_GUARD_CONTRACT_ID=${contractId.toString()}\n`);
    }

    // ── Mirror Node verify ──────────────────────────────────────────────────────
    try {
        await new Promise((r) => setTimeout(r, 5000));
        const axios = require('axios');
        const mirrorUrl = `${process.env.MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com'}/api/v1/contracts/${contractId.toString()}`;
        const res = await axios.get(mirrorUrl, { timeout: 10000 });
        if (res.data && res.data.contract_id) {
            console.log('🔍 Contract verified on Mirror Node');
            console.log(`   ${mirrorUrl}\n`);
        }
    } catch {
        console.log('⚠️  Mirror Node verification pending (may take a few minutes)\n');
    }

    console.log('🎉 Next steps:');
    console.log('   1. Pool Manager can now call submitBatch() to anchor every batch on-chain');
    console.log('   2. Shield deposits can call shieldDeposit() for on-chain denomination enforcement');
    console.log('   3. Anyone can call validateBatch() to pre-verify before submitting');

    client.close();
}

deployVanishGuard().catch((err) => {
    console.error('❌ Deployment failed:', err.message);
    process.exit(1);
});
