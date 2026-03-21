require('dotenv').config();
const { Client, AccountBalanceQuery, ContractId, AccountId, PrivateKey } = require('@hashgraph/sdk');

async function main() {
  try {
    const client = Client.forTestnet();
    client.setOperator(
      AccountId.fromString(process.env.HEDERA_ACCOUNT_ID),
      PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY)
    );
    
    const contractId = process.env.VANISH_GUARD_CONTRACT_ID || '0.0.8274009';
    console.log(`Checking balance for contract: ${contractId}`);
    
    const balanceQuery = new AccountBalanceQuery()
        .setContractId(ContractId.fromString(contractId));
        
    const balance = await balanceQuery.execute(client);
    console.log(`\n============================`);
    console.log(`💰 BALANCE: ${balance.hbars.toString()}`);
    console.log(`============================\n`);
  } catch (error) {
    console.error("Error fetching balance:");
    console.error(error.message);
  }
  process.exit();
}

main();
