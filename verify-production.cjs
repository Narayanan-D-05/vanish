require('dotenv').config();
const { Client, AccountId, ContractId, TopicId, AccountBalanceQuery } = require('@hashgraph/sdk');
const axios = require('axios');
const fs = require('fs');

/**
 * Production Readiness Verification
 * NO SIMULATION - Fail fast if not production-ready
 */

async function verifyProduction() {
  console.log('🔍 Vanish Production Readiness Check\n');
  console.log('═'.repeat(60));
  
  let allPassed = true;
  const checks = [];

  // Check 1: Hedera Credentials
  console.log('\n1️⃣  Checking Hedera Credentials...');
  try {
    if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
      throw new Error('Missing credentials');
    }
    
    const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    console.log(`   ✅ Account ID: ${accountId.toString()}`);
    
    // Check balance
    const client = Client.forTestnet();
    client.setOperator(accountId, process.env.HEDERA_PRIVATE_KEY);
    
    // Store for other checks
    global.client = client;
    global.accountId = accountId;
    
    checks.push({ name: 'Hedera Credentials', status: 'PASS' });
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    allPassed = false;
    checks.push({ name: 'Hedera Credentials', status: 'FAIL' });
  }

  // Check 2: Pool Contract Deployed
  console.log('\n2️⃣  Checking Pool Contract...');
  try {
    const contractId = process.env.POOL_CONTRACT_ID;
    
    if (!contractId || contractId === '0.0.XXXXXX') {
      throw new Error('POOL_CONTRACT_ID not configured - run: npm run deploy:contract');
    }
    
    // Verify on Mirror Node
    const mirrorUrl = `${process.env.MIRROR_NODE_URL}/api/v1/contracts/${contractId}`;
    const response = await axios.get(mirrorUrl);
    
    if (!response.data || !response.data.contract_id) {
      throw new Error('Contract not found on Mirror Node');
    }
    
    console.log(`   ✅ Contract ID: ${contractId}`);
    console.log(`   ✅ Verified on Mirror Node`);
    checks.push({ name: 'Pool Contract', status: 'PASS' });
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    allPassed = false;
    checks.push({ name: 'Pool Contract', status: 'FAIL' });
  }

  // Check 3: SaucerSwap Router
  console.log('\n3️⃣  Checking SaucerSwap Router...');
  try {
    const routerId = process.env.SAUCERSWAP_ROUTER;
    
    if (!routerId || routerId === '0.0.1234567' || routerId === '0.0.XXXXXX') {
      throw new Error('SAUCERSWAP_ROUTER not configured - find real router address');
    }
    
    // Verify on Mirror Node
    const mirrorUrl = `${process.env.MIRROR_NODE_URL}/api/v1/contracts/${routerId}`;
    const response = await axios.get(mirrorUrl);
    
    if (!response.data || !response.data.contract_id) {
      throw new Error('Router not found - may be invalid contract ID');
    }
    
    console.log(`   ✅ Router ID: ${routerId}`);
    console.log(`   ✅ Contract exists on blockchain`);
    checks.push({ name: 'SaucerSwap Router', status: 'PASS' });
  } catch (error) {
    console.log(`   ⚠️  WARNING: ${error.message}`);
    console.log(`   ⚠️  Swaps will fail without real router`);
    checks.push({ name: 'SaucerSwap Router', status: 'WARN' });
  }

  // Check 4: HCS Topics
  console.log('\n4️⃣  Checking HCS Topics...');
  try {
    const privateTopic = process.env.PRIVATE_TOPIC_ID;
    const publicTopic = process.env.PUBLIC_ANNOUNCEMENT_TOPIC_ID;
    
    if (!privateTopic || privateTopic === '0.0.XXXXXX') {
      throw new Error('PRIVATE_TOPIC_ID not configured - run: npm run setup:topics');
    }
    
    if (!publicTopic || publicTopic === '0.0.XXXXXX') {
      throw new Error('PUBLIC_ANNOUNCEMENT_TOPIC_ID not configured');
    }
    
    console.log(`   ✅ Private Topic: ${privateTopic}`);
    console.log(`   ✅ Public Topic: ${publicTopic}`);
    checks.push({ name: 'HCS Topics', status: 'PASS' });
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    allPassed = false;
    checks.push({ name: 'HCS Topics', status: 'FAIL' });
  }

  // Check 5: zk-SNARK Circuits
  console.log('\n5️⃣  Checking zk-SNARK Circuits...');
  try {
    const provingKey = process.env.PROVING_KEY_PATH;
    const verificationKey = process.env.VERIFICATION_KEY_PATH;
    
    if (!fs.existsSync(provingKey)) {
      throw new Error(`Proving key not found: ${provingKey} - run: npm run build:circuits`);
    }
    
    if (!fs.existsSync(verificationKey)) {
      throw new Error(`Verification key not found: ${verificationKey}`);
    }
    
    console.log(`   ✅ Proving key exists`);
    console.log(`   ✅ Verification key exists`);
    checks.push({ name: 'zk-SNARK Circuits', status: 'PASS' });
  } catch (error) {
    console.log(`   ⚠️  WARNING: ${error.message}`);
    console.log(`   ⚠️  Proof generation will fail without compiled circuits`);
    checks.push({ name: 'zk-SNARK Circuits', status: 'WARN' });
  }

  // Check 6: Token Associations
  console.log('\n6️⃣  Checking Token Associations...');
  try {
    const tokenIds = [
      process.env.WHBAR_TOKEN_ID,
      process.env.USDC_TOKEN_ID,
      process.env.SAUCE_TOKEN_ID
    ].filter(id => id && id !== '0.0.XXXXXX');
    
    if (tokenIds.length === 0) {
      throw new Error('No tokens configured - swaps will fail');
    }
    
    // Check if tokens are actually associated with the account
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const mirrorUrl = `${process.env.MIRROR_NODE_URL}/api/v1/accounts/${accountId}/tokens`;
    const response = await axios.get(mirrorUrl);
    
    const associatedTokens = response.data.tokens || [];
    const associatedIds = associatedTokens.map(t => t.token_id);
    
    const missingTokens = tokenIds.filter(id => !associatedIds.includes(id));
    
    if (missingTokens.length > 0) {
      console.log(`   ⚠️  ${tokenIds.length - missingTokens.length}/${tokenIds.length} tokens associated`);
      console.log(`   ⚠️  Missing: ${missingTokens.join(', ')}`);
      console.log(`   ⚠️  Run: npm run associate:tokens`);
      checks.push({ name: 'Token Associations', status: 'WARN' });
    } else {
      console.log(`   ✅ ${tokenIds.length} tokens associated (WHBAR, USDC, SAUCE)`);
      checks.push({ name: 'Token Associations', status: 'PASS' });
    }
  } catch (error) {
    console.log(`   ⚠️  WARNING: ${error.message}`);
    checks.push({ name: 'Token Associations', status: 'WARN' });
  }

  // Check 7: Account Balance
  console.log('\n7️⃣  Checking Account Balance...');
  try {
    if (!global.client) throw new Error('Client not initialized');
    
    const balanceQuery = new AccountBalanceQuery()
      .setAccountId(global.accountId);
    
    const balance = await balanceQuery.execute(global.client);
    const hbarBalance = balance.hbars.toTinybars().toNumber() / 100000000;
    
    if (hbarBalance < 1) {
      throw new Error(`Insufficient balance: ${hbarBalance} HBAR - need at least 1 HBAR`);
    }
    
    console.log(`   ✅ Balance: ${hbarBalance.toFixed(2)} HBAR`);
    checks.push({ name: 'Account Balance', status: 'PASS' });
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    allPassed = false;
    checks.push({ name: 'Account Balance', status: 'FAIL' });
  }

  // Summary
  console.log('\n═'.repeat(60));
  console.log('📊 VERIFICATION SUMMARY\n');
  
  checks.forEach(check => {
    const icon = check.status === 'PASS' ? '✅' : check.status === 'WARN' ? '⚠️' : '❌';
    console.log(`   ${icon} ${check.name}: ${check.status}`);
  });
  
  console.log('\n═'.repeat(60));
  
  if (allPassed) {
    console.log('\n🎉 PRODUCTION READY!\n');
    console.log('   All critical checks passed');
    console.log('   Start agents: npm run start:pool\n');
    process.exit(0);
  } else {
    console.log('\n❌ NOT PRODUCTION READY\n');
    console.log('   Fix failed checks before starting agents');
    console.log('   NO SIMULATION MODE - Real contracts required\n');
    process.exit(1);
  }

  if (global.client) {
    global.client.close();
  }
}

verifyProduction().catch(error => {
  console.error('\n❌ Verification failed:', error.message);
  process.exit(1);
});
