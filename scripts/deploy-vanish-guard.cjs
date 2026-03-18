const hre = require("hardhat");
const { 
  Client, 
  PrivateKey, 
  AccountId,
  ContractCreateFlow,
  ContractExecuteTransaction,
  ContractId
} = require("@hashgraph/sdk");
const fs = require("fs");
const dotenv = require("dotenv");

dotenv.config();

/**
 * VanishGuard Deployment Script (2026 Production Standard)
 * Deploys the tri-verifier architecture:
 * 1. ShieldVerifier (4 signals)
 * 2. WithdrawVerifier (6 signals)
 * 3. ExclusionVerifier (3 signals)
 * 4. VanishGuard (Main Gateway)
 */
async function main() {
  console.log("🚀 Starting VanishGuard Infrastructure Deployment\n");

  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
    throw new Error("Missing HEDERA_ACCOUNT_ID or HEDERA_PRIVATE_KEY in .env");
  }

  const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
  const privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);

  const client = Client.forTestnet();
  client.setOperator(accountId, privateKey);

  console.log(`✅ Connected to Hedera Testnet as ${accountId.toString()}\n`);

  // 1. Compile Contracts
  console.log("📝 Compiling contracts...");
  await hre.run("compile");
  console.log("✅ Compilation complete\n");

  const verifiers = [
    { name: "ShieldVerifier", file: "ShieldVerifier" },
    { name: "WithdrawVerifier", file: "WithdrawVerifier" },
    { name: "ExclusionVerifier", file: "ExclusionVerifier" }
  ];

  const deployedVerifiers = {};

  // 2. Deploy Verifiers
  for (const verifier of verifiers) {
    console.log(`📦 Deploying ${verifier.name}...`);
    const artifact = await hre.artifacts.readArtifact(verifier.file);
    const contractCreate = await new ContractCreateFlow()
      .setBytecode(artifact.bytecode)
      .setGas(500000)
      .execute(client);
    
    const receipt = await contractCreate.getReceipt(client);
    deployedVerifiers[verifier.name] = receipt.contractId.toString();
    console.log(`   ✅ ${verifier.name} ID: ${deployedVerifiers[verifier.name]}`);
  }

  // 3. Deploy VanishGuard
  console.log("\n🛡️  Deploying VanishGuard Gateway...");
  const guardArtifact = await hre.artifacts.readArtifact("VanishGuard");
  
  // Constructor Params: minBatchSize, maxBatchSize, minDelaySeconds, maxDelayMinutes, maxWaitMinutes, allowedDenoms, policyVersion
  const constructorArgs = [
    2,                          // minBatchSize
    50,                         // maxBatchSize
    10,                         // minDelaySeconds
    60,                         // maxDelayMinutes
    1440,                       // maxWaitMinutes (24h)
    [100000000, 500000000, 1000000000, 5000000000], // 0.1, 0.5, 1, 5 HBAR (in tinybars)
    "2.1-Golden-Thread"        // policyVersion
  ];

  // We use Hardhat's ethers to encode constructor arguments because ContractCreateFlow 
  // needs them appended to the bytecode or passed via setConstructorParameters.
  const factory = await hre.ethers.getContractFactory("VanishGuard");
  const deployTx = await factory.getDeployTransaction(...constructorArgs);
  const bytecodeWithArgs = deployTx.data;

  const guardCreate = await new ContractCreateFlow()
    .setBytecode(bytecodeWithArgs)
    .setGas(2000000)
    .execute(client);

  const guardReceipt = await guardCreate.getReceipt(client);
  const guardId = guardReceipt.contractId;
  console.log(`   ✅ VanishGuard ID: ${guardId.toString()}\n`);

  // 4. Link Verifiers
  console.log("🔗 Linking Verifiers to VanishGuard...");
  const abi = ["function setVerifiers(address _shield, address _withdraw, address _exclusion)"];
  const iface = new hre.ethers.Interface(abi);
  
  // Convert Contract IDs to solidity addresses (EVM format)
  const shieldAddr = `0x${ContractId.fromString(deployedVerifiers.ShieldVerifier).toSolidityAddress()}`;
  const withdrawAddr = `0x${ContractId.fromString(deployedVerifiers.WithdrawVerifier).toSolidityAddress()}`;
  const exclusionAddr = `0x${ContractId.fromString(deployedVerifiers.ExclusionVerifier).toSolidityAddress()}`;

  const calldata = iface.encodeFunctionData("setVerifiers", [shieldAddr, withdrawAddr, exclusionAddr]);

  const linkTx = await new ContractExecuteTransaction()
    .setContractId(guardId)
    .setGas(200000)
    .setFunctionParameters(Buffer.from(calldata.replace("0x", ""), "hex"))
    .execute(client);

  await linkTx.getReceipt(client);
  console.log("   ✅ Verifiers linked successfully\n");

  // 5. Update .env
  console.log("📝 Updating .env configuration...");
  let envContent = fs.readFileSync(".env", "utf8");
  
  envContent = envContent.replace(/VANISH_GUARD_CONTRACT_ID=.*/, `VANISH_GUARD_CONTRACT_ID=${guardId.toString()}`);
  envContent = envContent.replace(/POOL_CONTRACT_ID=.*/, `POOL_CONTRACT_ID=${guardId.toString()}`);
  
  fs.writeFileSync(".env", envContent);
  console.log("   ✅ .env updated with new Contract IDs\n");

  console.log("═".repeat(60));
  console.log("🎉 INFRASTRUCTURE DEPLOYMENT COMPLETE");
  console.log(`   VanishGuard: ${guardId.toString()}`);
  console.log(`   Exploration: https://hashscan.io/testnet/contract/${guardId.toString()}`);
  console.log("═".repeat(60));

  client.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
