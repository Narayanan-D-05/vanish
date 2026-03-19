import hre from "hardhat";
import { 
  Client, 
  PrivateKey, 
  AccountId,
  ContractCreateFlow,
  ContractExecuteTransaction,
  ContractId
} from "@hashgraph/sdk";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

let hederaClient;

async function main() {
  console.log("🚀 Starting VanishGuard Infrastructure Deployment (ESM)\n");

  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
    throw new Error("Missing HEDERA_ACCOUNT_ID or HEDERA_PRIVATE_KEY in .env");
  }

  console.log("📍 Initializing Hedera Account...");
  const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
  const privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);

  console.log("📍 Connecting to Testnet...");
  hederaClient = Client.forTestnet();
  hederaClient.setOperator(accountId, privateKey);

  console.log(`✅ Connected as ${accountId.toString()}\n`);

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
      .setGas(800000)
      .execute(hederaClient);
    
    const receipt = await contractCreate.getReceipt(hederaClient);
    deployedVerifiers[verifier.name] = receipt.contractId.toString();
    console.log(`   ✅ ${verifier.name} ID: ${deployedVerifiers[verifier.name]}`);
  }

  // 3. Deploy VanishGuard
  console.log("\n🛡️  Deploying VanishGuard Gateway...");
  
  const constructorArgs = [
    2,                          // minBatchSize
    50,                         // maxBatchSize
    10,                         // minDelaySeconds
    60,                         // maxDelayMinutes
    1440,                       // maxWaitMinutes (24h)
    [100000000, 500000000, 1000000000, 5000000000], // 0.1, 0.5, 1, 5 HBAR (in tinybars)
    "2.1-Golden-Thread"        // policyVersion
  ];

  const factory = await hre.ethers.getContractFactory("VanishGuard");
  const deployTx = await factory.getDeployTransaction(...constructorArgs);
  const bytecodeWithArgs = deployTx.data;

  const guardCreate = await new ContractCreateFlow()
    .setBytecode(bytecodeWithArgs)
    .setGas(2500000)
    .execute(hederaClient);

  const guardReceipt = await guardCreate.getReceipt(hederaClient);
  const guardId = guardReceipt.contractId;
  console.log(`   ✅ VanishGuard ID: ${guardId.toString()}\n`);

  // 4. Link Verifiers
  console.log("🔗 Linking Verifiers to VanishGuard...");
  const abi = ["function setVerifiers(address _shield, address _withdraw, address _exclusion)"];
  const iface = new hre.ethers.Interface(abi);
  
  const shieldAddr = `0x${ContractId.fromString(deployedVerifiers.ShieldVerifier).toSolidityAddress()}`;
  const withdrawAddr = `0x${ContractId.fromString(deployedVerifiers.WithdrawVerifier).toSolidityAddress()}`;
  const exclusionAddr = `0x${ContractId.fromString(deployedVerifiers.ExclusionVerifier).toSolidityAddress()}`;

  const calldata = iface.encodeFunctionData("setVerifiers", [shieldAddr, withdrawAddr, exclusionAddr]);

  const linkTx = await new ContractExecuteTransaction()
    .setContractId(guardId)
    .setGas(250000)
    .setFunctionParameters(Buffer.from(calldata.replace("0x", ""), "hex"))
    .execute(hederaClient);

  await linkTx.getReceipt(hederaClient);
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
  console.log("═".repeat(60));
}

main()
  .then(() => {
    if (hederaClient) hederaClient.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failure:", error.message);
    if (hederaClient) hederaClient.close();
    process.exit(1);
  });
