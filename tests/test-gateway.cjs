require('dotenv').config();
const { tools } = require('./agents/plugins/vanish-tools.cjs');

async function test() {
  const transfer = tools.find(t => t.name === 'transfer_hbar');
  
  console.log("=== Testing Transfer to Sanctioned Wallet (0.0.999999) ===");
  const res1 = await transfer.func({ toAccountId: '0.0.999999', amount: 1 });
  console.log("Result:", res1);
  
  console.log("\n=== Testing Transfer to Normal Wallet (0.0.123456) ===");
  const res2 = await transfer.func({ toAccountId: '0.0.123456', amount: 1 });
  console.log("Result:", res2);
}

test().catch(console.error);
