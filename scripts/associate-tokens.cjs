require('dotenv').config();
const { 
  Client, 
  PrivateKey, 
  AccountId,
  TokenAssociateTransaction,
  TokenId
} = require('@hashgraph/sdk');

/**
 * Associate tokens with pool account
 * Required for SaucerSwap swaps - NO SIMULATION
 */

async function associateTokens() {
  console.log('🔗 Token Association for Pool Account\n');

  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
    console.error('❌ Missing Hedera credentials');
    process.exit(1);
  }

  const tokens = {
    WHBAR: process.env.WHBAR_TOKEN_ID,
    SAUCE: process.env.SAUCE_TOKEN_ID,
    USDC: process.env.USDC_TOKEN_ID,
    USDT: process.env.USDT_TOKEN_ID
  };

  try {
    const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    const privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    
    const client = Client.forTestnet();
    client.setOperator(accountId, privateKey);

    console.log(`✅ Pool Account: ${accountId.toString()}\n`);

    // Associate each token
    for (const [name, tokenIdStr] of Object.entries(tokens)) {
      if (!tokenIdStr || tokenIdStr === '0.0.XXXXXX') {
        console.log(`⚠️  Skipping ${name}: not configured in .env\n`);
        continue;
      }

      console.log(`🔗 Associating ${name} (${tokenIdStr})...`);

      try {
        const tokenId = TokenId.fromString(tokenIdStr);

        const associateTx = await new TokenAssociateTransaction()
          .setAccountId(accountId)
          .setTokenIds([tokenId])
          .freezeWith(client)
          .sign(privateKey);

        const response = await associateTx.execute(client);
        const receipt = await response.getReceipt(client);

        console.log(`✅ ${name} associated`);
        console.log(`   Transaction: ${response.transactionId.toString()}`);
        console.log(`   Cost: ~0.05 HBAR\n`);

      } catch (error) {
        if (error.message.includes('TOKEN_ALREADY_ASSOCIATED')) {
          console.log(`✅ ${name} already associated\n`);
        } else {
          console.error(`❌ ${name} association failed: ${error.message}\n`);
          throw error;
        }
      }
    }

    console.log('═'.repeat(60));
    console.log('✅ Token Associations Complete!');
    console.log('   Pool can now swap on SaucerSwap');
    console.log('═'.repeat(60));

    client.close();

  } catch (error) {
    console.error('❌ Association failed:', error.message);
    
    if (error.message.includes('INVALID_TOKEN_ID')) {
      console.error('\n💡 Check token IDs in .env file');
    } else if (error.message.includes('INSUFFICIENT_ACCOUNT_BALANCE')) {
      console.error('\n💡 Need more HBAR for association fees');
    }
    
    process.exit(1);
  }
}

associateTokens().catch(console.error);
