require('dotenv').config();
const { Client, PrivateKey, AccountCreateTransaction, Hbar, AccountBalanceQuery } = require('@hashgraph/sdk');

/**
 * Create a new Hedera testnet account
 * Then transfer funds from old account to new account
 */

async function createAndMigrate() {
  console.log('🔐 Creating New Hedera Testnet Account\n');
  
  // Generate new key pair
  const newPrivateKey = PrivateKey.generateED25519();
  const newPublicKey = newPrivateKey.publicKey;
  
  console.log('✅ Generated new key pair:');
  console.log(`   Public Key:  ${newPublicKey.toString()}`);
  console.log(`   Private Key: ${newPrivateKey.toString()}`);
  console.log('\n⚠️  SAVE THESE KEYS SECURELY!\n');
  
  // Create client with OLD account (to create new account)
  const client = Client.forTestnet();
  client.setOperator(process.env.HEDERA_ACCOUNT_ID, process.env.HEDERA_PRIVATE_KEY);
  
  console.log('Creating new account on Hedera testnet...');
  
  // Create new account with 10 HBAR initial balance
  const createAccountTx = await new AccountCreateTransaction()
    .setKey(newPublicKey)
    .setInitialBalance(new Hbar(10))
    .execute(client);
  
  const receipt = await createAccountTx.getReceipt(client);
  const newAccountId = receipt.accountId;
  
  console.log(`✅ New Account Created: ${newAccountId.toString()}\n`);
  
  // Check old account balance
  const oldBalance = await new AccountBalanceQuery()
    .setAccountId(process.env.HEDERA_ACCOUNT_ID)
    .execute(client);
  
  const oldHbar = oldBalance.hbars.toTinybars().toNumber() / 100000000;
  console.log(`Old Account (${process.env.HEDERA_ACCOUNT_ID}): ${oldHbar.toFixed(2)} HBAR`);
  
  // Check new account balance
  const newBalance = await new AccountBalanceQuery()
    .setAccountId(newAccountId)
    .execute(client);
  
  const newHbar = newBalance.hbars.toTinybars().toNumber() / 100000000;
  console.log(`New Account (${newAccountId.toString()}): ${newHbar.toFixed(2)} HBAR\n`);
  
  console.log('═'.repeat(60));
  console.log('\n📝 UPDATE YOUR .env FILE WITH:\n');
  console.log(`HEDERA_ACCOUNT_ID=${newAccountId.toString()}`);
  console.log(`HEDERA_PRIVATE_KEY=${newPrivateKey.toString()}`);
  console.log('\n⚠️  IMPORTANT: Keep old account for now to transfer remaining HBAR');
  console.log('   Run: npm run migrate:funds to transfer all HBAR to new account\n');
  
  client.close();
}

createAndMigrate().catch(error => {
  console.error('❌ Failed to create account:', error.message);
  process.exit(1);
});
