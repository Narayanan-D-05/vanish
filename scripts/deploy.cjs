const hre = require("hardhat");
const { 
  Client, 
  PrivateKey, 
  AccountId,
  ContractCreateFlow,
  Hbar
} = require("@hashgraph/sdk");
const fs = require("fs");

async function main() {
  console.log("🚀 Deploying Vanish MerkleTree Contract via Hardhat 3\n");

  // Compile contract
  console.log("📝 Compiling contracts...");
  await hre.run("compile");
  console.log("✅ Compilation complete\n");

  // Get compiled contract
  const artifact = await hre.artifacts.readArtifact("VanishMerkleTree");
  const bytecode = artifact.bytecode;

  console.log(`📦 Bytecode size: ${bytecode.length / 2} bytes\n`);

  // Deploy to Hedera using SDK
  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
    throw new Error("Missing HEDERA_ACCOUNT_ID or HEDERA_PRIVATE_KEY in .env");
  }

  const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
  const privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);

  const client = Client.forTestnet();
  client.setOperator(accountId, privateKey);

  console.log(`✅ Connected to Hedera Testnet`);
  console.log(`   Deployer: ${accountId.toString()}\n`);

  console.log("🚀 Deploying contract to Hedera...");
  console.log("   This may take 30-60 seconds...\n");

  const contractCreate = await new ContractCreateFlow()
    .setBytecode(bytecode)
    .setGas(300000)
    .execute(client);

  const receipt = await contractCreate.getReceipt(client);
  const contractId = receipt.contractId;

  console.log("═".repeat(60));
  console.log("✅ CONTRACT DEPLOYED SUCCESSFULLY!\n");
  console.log(`   Contract ID: ${contractId.toString()}`);
  console.log(`   Transaction: ${contractCreate.transactionId.toString()}`);
  console.log(`   Network: Hedera Testnet`);
  console.log(`   View: https://hashscan.io/testnet/contract/${contractId.toString()}\n`);
  console.log("═".repeat(60));

  // Update .env file
  const envPath = ".env";
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(
    /POOL_CONTRACT_ID=.*/,
    `POOL_CONTRACT_ID=${contractId.toString()}`
  );
  fs.writeFileSync(envPath, envContent);

  console.log("\n✅ .env file updated");
  console.log(`   POOL_CONTRACT_ID=${contractId.toString()}\n`);

  // Verify on Mirror Node
  console.log("🔍 Verifying on Mirror Node...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  const axios = require("axios");
  try {
    const mirrorUrl = `${process.env.MIRROR_NODE_URL}/api/v1/contracts/${contractId.toString()}`;
    const response = await axios.get(mirrorUrl);
    
    if (response.data && response.data.contract_id) {
      console.log("✅ Contract verified on Mirror Node");
      console.log(`   ${mirrorUrl}\n`);
    }
  } catch (error) {
    console.log("⚠️  Mirror Node verification pending (may take a few minutes)\n");
  }

  client.close();

  console.log("🎉 Deployment complete!");
  console.log("   Next: npm run associate:tokens\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
