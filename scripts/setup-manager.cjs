require('dotenv').config();
const {
  Client,
  PrivateKey,
  AccountCreateTransaction,
  Hbar,
  TransferTransaction,
  AccountId
} = require('@hashgraph/sdk');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🚀 Bootstrapping dedicated Vanish Pool Manager Account...');

  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
    console.error('❌ Error: User HEDERA_ACCOUNT_ID or private key not found in .env.');
    process.exit(1);
  }

  const userAccountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
  const userPrivateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
  
  const client = Client.forTestnet();
  client.setOperator(userAccountId, userPrivateKey);

  // Generate new keys for the Pool Manager
  const managerPrivateKey = PrivateKey.generateED25519();
  const managerPublicKey = managerPrivateKey.publicKey;
  const initialFunding = 100; // 100 HBAR for gas

  console.log(`   Generating ED25519 Keypair...`);
  console.log(`   Funding with ${initialFunding} HBAR from User account...`);

  // Create account
  const transaction = new AccountCreateTransaction()
    .setKey(managerPublicKey)
    .setInitialBalance(new Hbar(initialFunding));

  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const newAccountId = receipt.accountId;

  console.log('\n✅ Separate Pool Manager Account Created!');
  console.log(`   Account ID:  ${newAccountId.toString()}`);
  console.log(`   Private Key: ${managerPrivateKey.toString()}`);

  // Update .env
  const envPath = path.join(__dirname, '../.env');
  let envConfig = fs.readFileSync(envPath, 'utf8');

  // Remove existing POOL_MANAGER lines if they exist
  envConfig = envConfig.replace(/^POOL_MANAGER_ACCOUNT_ID=.*\n?/gm, '');
  envConfig = envConfig.replace(/^POOL_MANAGER_PRIVATE_KEY=.*\n?/gm, '');
  envConfig = envConfig.replace(/^AI_DECISION_SIGNER_PRIVATE_KEY=.*\n?/gm, '');

  envConfig += `\n# Dedicated Pool Manager Configuration (Generated)\n`;
  envConfig += `POOL_MANAGER_ACCOUNT_ID=${newAccountId.toString()}\n`;
  envConfig += `POOL_MANAGER_PRIVATE_KEY=${managerPrivateKey.toString()}\n`;
  envConfig += `AI_DECISION_SIGNER_PRIVATE_KEY=${managerPrivateKey.toString() /* Fallback for decision signer if using ECDSA normally, but ED25519 works for HCS */}\n`;

  fs.writeFileSync(envPath, envConfig);
  console.log(`\n📄 .env updated successfully. The 'Dev Mode' bypass is now permanently disabled.`);
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
