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

  // Check if we already have a manager ID in .env
  const envPath = path.join(__dirname, '../.env');
  let envConfig = fs.readFileSync(envPath, 'utf8');
  const existingManagerIdMatch = envConfig.match(/^POOL_MANAGER_ACCOUNT_ID=(0\.0\.\d+)/m);
  const existingManagerId = existingManagerIdMatch ? existingManagerIdMatch[1] : null;

  // Generate ECDSA key for the AI Decision Signer (ethers compatibility) - ALWAYS REGENERATE THIS TO BE SAFE
  const aiSignerWallet = require('ethers').Wallet.createRandom();
  const aiSignerPrivateKey = aiSignerWallet.privateKey;

  let newAccountId = existingManagerId;
  let managerPrivateKeyString = process.env.POOL_MANAGER_PRIVATE_KEY;

  if (!existingManagerId) {
    console.log(`   No existing manager ID found. Creating new account...`);
    // Generate new keys for the Pool Manager (Hedera ED25519)
    const managerPrivateKey = PrivateKey.generateED25519();
    const managerPublicKey = managerPrivateKey.publicKey;
    managerPrivateKeyString = managerPrivateKey.toString();
    const initialFunding = 10; // Reduced to 10 HBAR for economy

    console.log(`   Generating ED25519 Manager Keypair...`);
    console.log(`   Funding Manager with ${initialFunding} HBAR from User account...`);

    // Create account
    const transaction = new AccountCreateTransaction()
      .setKey(managerPublicKey)
      .setInitialBalance(new Hbar(initialFunding));

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);
    newAccountId = receipt.accountId.toString();
    console.log(`\n✅ New Pool Manager Account Created: ${newAccountId}`);
  } else {
    console.log(`\n✅ Using existing Pool Manager Account: ${existingManagerId}`);
  }

  console.log(`   Generating ECDSA AI Signer Keypair...`);

  // Update .env
  // Remove existing lines to re-add them cleanly
  envConfig = envConfig.replace(/^POOL_MANAGER_ACCOUNT_ID=.*\n?/gm, '');
  envConfig = envConfig.replace(/^POOL_MANAGER_PRIVATE_KEY=.*\n?/gm, '');
  envConfig = envConfig.replace(/^AI_DECISION_SIGNER_PRIVATE_KEY=.*\n?/gm, '');
  
  // Clear stale HIP-1334 config if account is new
  if (!existingManagerId) {
    envConfig = envConfig.replace(/^HIP1334_TOPIC_ID=.*\n?/gm, '');
    envConfig = envConfig.replace(/^HIP1334_ENC_PRIV_KEY=.*\n?/gm, '');
  }

  envConfig += `\n# Dedicated Pool Manager Configuration (Generated)\n`;
  envConfig += `POOL_MANAGER_ACCOUNT_ID=${newAccountId}\n`;
  if (managerPrivateKeyString) {
    envConfig += `POOL_MANAGER_PRIVATE_KEY=${managerPrivateKeyString}\n`;
  }
  envConfig += `AI_DECISION_SIGNER_PRIVATE_KEY=${aiSignerPrivateKey}\n`;

  fs.writeFileSync(envPath, envConfig);
  console.log(`\n📄 .env updated successfully. The 'Dev Mode' bypass is now permanently disabled.`);
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
