/**
 * setup-allowance.cjs
 * 
 * Grants a HIP-336 HBAR spend allowance to the Vanish Pool contract.
 * 
 * This must be run ONCE per depositor account before the Pool Manager
 * can execute "fund pulls" on their behalf.
 * 
 * The error SPENDER_DOES_NOT_HAVE_ALLOWANCE means this script has not
 * been run yet (or the allowance was already consumed).
 * 
 * Usage:
 *   node setup-allowance.cjs [amount_hbar]
 *   node setup-allowance.cjs 500        # grant 500 HBAR allowance
 *   node setup-allowance.cjs            # default: 1000 HBAR
 */

require('dotenv').config();
const {
    Client, PrivateKey, AccountId, AccountAllowanceApproveTransaction, Hbar
} = require('@hashgraph/sdk');

async function main() {
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_PRIVATE_KEY;
    const poolContract = process.env.VANISH_GUARD_CONTRACT_ID;   // spender
    const amountHbar = parseFloat(process.argv[2] || '1000');

    if (!accountId || !privateKey) {
        console.error('❌ Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env');
        process.exit(1);
    }
    if (!poolContract) {
        console.error('❌ Set VANISH_GUARD_CONTRACT_ID in .env (the Pool Contract that will spend on your behalf)');
        process.exit(1);
    }

    const client = Client.forTestnet();
    client.setOperator(AccountId.fromString(accountId), PrivateKey.fromString(privateKey));

    console.log('🔑 Vanish Allowance Setup');
    console.log(`   Owner (you):  ${accountId}`);
    console.log(`   Spender:      ${poolContract}  (Vanish Pool Contract)`);
    console.log(`   Amount:       ${amountHbar} HBAR`);
    console.log('');

    try {
        const tx = await new AccountAllowanceApproveTransaction()
            .approveHbarAllowance(
                AccountId.fromString(accountId),   // owner
                AccountId.fromString(poolContract), // spender (the Pool Contract)
                new Hbar(amountHbar)
            )
            .execute(client);

        const receipt = await tx.getReceipt(client);
        console.log(`✅ Allowance granted!`);
        console.log(`   Transaction: ${tx.transactionId}`);
        console.log(`   Status:      ${receipt.status}`);
        console.log('');
        console.log(`The Pool Manager can now pull up to ${amountHbar} HBAR from your account`);
        console.log(`when you submit a proof. Run again to increase the allowance.`);
    } catch (err) {
        console.error(`❌ Failed: ${err.message}`);
    } finally {
        client.close();
    }
}

main().catch(console.error);
