require('dotenv').config();
const { 
  Client, 
  PrivateKey, 
  AccountId,
  ContractCreateFlow,
  ContractFunctionParameters,
  Hbar
} = require('@hashgraph/sdk');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Deploy MerkleTree.sol contract to Hedera using Hardhat
 * This is the real privacy pool contract - no simulation
 */

async function deployContract() {
  console.log('🚀 Deploying Vanish MerkleTree Contract\n');

  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
    console.error('❌ Missing Hedera credentials');
    process.exit(1);
  }

  try {
    // Initialize client
    const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    const privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    
    const client = Client.forTestnet();
    client.setOperator(accountId, privateKey);

    console.log(`✅ Connected to Hedera Testnet`);
    console.log(`   Deployer: ${accountId.toString()}\n`);

    // Compile contract with Hardhat
    console.log('📝 Compiling MerkleTree.sol with Hardhat...');
    try {
      const { stdout, stderr } = await execPromise('npx hardhat compile');
      console.log(stdout);
      if (stderr) console.error(stderr);
      console.log('✅ Compilation successful\n');
    } catch (error) {
      console.error('❌ Compilation failed:', error.message);
      process.exit(1);
    }
    
    // Read compiled artifact
    const artifactPath = path.join(__dirname, 'artifacts', 'contracts', 'MerkleTree.sol', 'VanishMerkleTree.json');
    
    if (!fs.existsSync(artifactPath)) {
      console.error('❌ Compiled artifact not found');
      console.error(`   Expected: ${artifactPath}`);
      process.exit(1);
    }

    console.log('📦 Reading compiled bytecode...');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const bytecode = artifact.bytecode;
    
    if (!bytecode || bytecode.length < 10) {
      console.error('❌ Invalid bytecode');
      process.exit(1);
    }

    console.log(`   Bytecode size: ${bytecode.length / 2} bytes\n`);

    // Deploy contract
    console.log('🚀 Deploying contract to Hedera...');
    console.log('   This may take 30-60 seconds...\n');

    const contractCreate = await new ContractCreateFlow()
      .setBytecode(bytecode)
      .setGas(300000)
      .setConstructorParameters(new ContractFunctionParameters())
      .execute(client);

    const receipt = await contractCreate.getReceipt(client);
    const contractId = receipt.contractId;

    console.log('═'.repeat(60));
    console.log('✅ CONTRACT DEPLOYED SUCCESSFULLY!\n');
    console.log(`   Contract ID: ${contractId.toString()}`);
    console.log(`   Transaction: ${contractCreate.transactionId.toString()}`);
    console.log(`   Gas Used: ~${receipt.gasUsed || 'N/A'}`);
    console.log(`   Cost: ~${(0.05).toFixed(4)} HBAR\n`);
    console.log('═'.repeat(60));

    // Update .env file
    await updateEnvFile(contractId.toString());

    // Verify deployment
    console.log('\n🔍 Verifying deployment...');
    await verifyContract(client, contractId);

    client.close();

  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    
    if (error.message.includes('INSUFFICIENT_GAS')) {
      console.error('\n💡 Increase gas limit in deployment script');
    } else if (error.message.includes('INSUFFICIENT_ACCOUNT_BALANCE')) {
      console.error('\n💡 Your account needs more HBAR');
      console.error('   Get testnet HBAR at: https://portal.hedera.com/');
    } else if (error.message.includes('CONTRACT_BYTECODE_EMPTY')) {
      console.error('\n💡 Bytecode is empty or invalid');
    }
    
    process.exit(1);
  }
}

/**
 * Verify contract deployment
 */
async function verifyContract(client, contractId) {
  try {
    const axios = require('axios');
    const mirrorUrl = `${process.env.MIRROR_NODE_URL}/api/v1/contracts/${contractId.toString()}`;
    
    // Wait for mirror node to index
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const response = await axios.get(mirrorUrl);
    
    if (response.data && response.data.contract_id) {
      console.log('✅ Contract verified on Mirror Node');
      console.log(`   View at: ${mirrorUrl}\n`);
      return true;
    }
    
  } catch (error) {
    console.log('⚠️  Mirror Node verification pending (may take a few minutes)\n');
  }
  
  return false;
}

/**
 * Update .env with deployed contract ID
 */
async function updateEnvFile(contractId) {
  try {
    const envPath = '.env';
    let envContent = fs.readFileSync(envPath, 'utf8');

    envContent = envContent.replace(
      /POOL_CONTRACT_ID=.*/,
      `POOL_CONTRACT_ID=${contractId}`
    );

    fs.writeFileSync(envPath, envContent);

    console.log('\n✅ .env file updated');
    console.log(`   POOL_CONTRACT_ID=${contractId}\n`);

  } catch (error) {
    console.log('\n⚠️  Could not auto-update .env');
    console.log(`   Add manually: POOL_CONTRACT_ID=${contractId}\n`);
  }
}

// Run deployment
deployContract().catch(console.error);
