require('dotenv').config();
const { Client, TransferTransaction, Hbar, AccountBalanceQuery, AccountId } = require('@hashgraph/sdk');

/**
 * Transfer remaining HBAR from old account to new account
 * Leave 1 HBAR in old account for final cleanup
 */

async function migrateFunds() {
  const oldAccountId = process.argv[2];
  const oldPrivateKey = process.argv[3];
  const newAccountId = process.env.HEDERA_ACCOUNT_ID;
  
  if (!oldAccountId || !oldPrivateKey) {
    console.error('❌ Usage: node migrate-funds.cjs OLD_ACCOUNT_ID OLD_PRIVATE_KEY');
    console.error('   Example: node migrate-funds.cjs 0.0.8114260 302e020100...');
    process.exit(1);
  }
  
  console.log('💸 Migrating Funds to New Account\n');
  console.log(`   From: ${oldAccountId}`);
  console.log(`   To:   ${newAccountId}\n`);
  
  // Create client with OLD credentials
  const client = Client.forTestnet();
  client.setOperator(oldAccountId, oldPrivateKey);
  
  // Check old account balance
  const oldBalance = await new AccountBalanceQuery()
    .setAccountId(oldAccountId)
    .execute(client);
  
  const totalHbar = oldBalance.hbars.toTinybars().toNumber() / 100000000;
  
  // Keep 1 HBAR for fees and final cleanup
  const transferAmount = Math.max(0, totalHbar - 1);
  
  if (transferAmount <= 0) {
    console.log('⚠️  No funds to transfer (balance too low)');
    client.close();
    return;
  }
  
  console.log(`📊 Old Account Balance: ${totalHbar.toFixed(2)} HBAR`);
  console.log(`💰 Transferring: ${transferAmount.toFixed(2)} HBAR`);
  console.log(`🔒 Keeping: 1.00 HBAR for cleanup\n`);
  
  // Transfer funds
  const transferTx = await new TransferTransaction()
    .addHbarTransfer(oldAccountId, new Hbar(-transferAmount))
    .addHbarTransfer(newAccountId, new Hbar(transferAmount))
    .execute(client);
  
  const receipt = await transferTx.getReceipt(client);
  
  console.log(`✅ Transfer Complete!`);
  console.log(`   Transaction: ${transferTx.transactionId.toString()}`);
  console.log(`   Status: ${receipt.status.toString()}\n`);
  
  // Verify new account balance
  const newBalance = await new AccountBalanceQuery()
    .setAccountId(newAccountId)
    .execute(client);
  
  const newHbar = newBalance.hbars.toTinybars().toNumber() / 100000000;
  console.log(`✅ New Account Balance: ${newHbar.toFixed(2)} HBAR\n`);
  
  console.log('═'.repeat(60));
  console.log('\n🎯 NEXT STEPS:\n');
  console.log('1. Redeploy contracts: npm run deploy:contract');
  console.log('2. Re-create HCS topics: npm run setup:topics');
  console.log('3. Re-associate tokens: npm run associate:tokens');
  console.log('4. Verify production: npm run verify:production\n');
  
  client.close();
}

migrateFunds().catch(error => {
  console.error('❌ Transfer failed:', error.message);
  process.exit(1);
});
