#!/usr/bin/env node
/**
 * Sync Vault with On-Chain Nullifier Status
 *
 * This script:
 * 1. Reads your encrypted vault
 * 2. Checks each fragment's nullifier status on-chain
 * 3. Marks spent fragments as 'used' locally
 *
 * Run this when you get NullifierAlreadyUsed errors to clean up stale fragments.
 */

const fs = require('fs');
const path = require('path');
const { Interface } = require('@ethersproject/abi');
const {
  Client,
  ContractCallQuery,
  ContractId
} = require('@hashgraph/sdk');

const VaultWrapper = require('../agents/user-agent/vault-wrapper.cjs');

// Config
const CONFIG_DIR = path.join(__dirname, 'config');
const SECRETS_FILE = path.join(CONFIG_DIR, 'vanish_secrets.encrypted');

async function main() {
  console.log('🔄 Syncing Vault with On-Chain Nullifier Status...\n');

  // Check if vault exists
  if (!fs.existsSync(SECRETS_FILE)) {
    console.log('ℹ️ No encrypted vault found. Nothing to sync.');
    return;
  }

  // Get contract ID from env
  const guardId = process.env.VANISH_GUARD_ID;
  if (!guardId) {
    console.error('❌ VANISH_GUARD_ID not set in environment');
    process.exit(1);
  }

  // Setup Hedera client
  const client = Client.forTestnet();
  if (process.env.POOL_MANAGER_PRIVATE_KEY) {
    const { PrivateKey } = require('@hashgraph/sdk');
    const privateKey = PrivateKey.fromStringED25519(process.env.POOL_MANAGER_PRIVATE_KEY);
    const operatorId = process.env.POOL_MANAGER_ACCOUNT_ID;
    if (!operatorId) {
      console.error('❌ POOL_MANAGER_ACCOUNT_ID not set');
      process.exit(1);
    }
    client.setOperator(operatorId, privateKey);
  } else {
    console.error('❌ POOL_MANAGER_PRIVATE_KEY not set');
    process.exit(1);
  }

  // Load vault
  const vault = new VaultWrapper(SECRETS_FILE);
  const password = process.env.VAULT_PASSWORD || 'vanish2026';

  let vaultData;
  try {
    vaultData = vault.decrypt(password);
    console.log(`✅ Loaded vault with ${Object.keys(vaultData).length} entries\n`);
  } catch (e) {
    console.error('❌ Failed to decrypt vault:', e.message);
    process.exit(1);
  }

  // Check each fragment's nullifier on-chain
  const nullifierCheckAbi = ['function nullifiers(uint256) view returns (bool)'];
  const nullifierIface = new Interface(nullifierCheckAbi);

  let syncedCount = 0;
  let alreadyMarkedCount = 0;
  let errorCount = 0;

  for (const [secretId, data] of Object.entries(vaultData)) {
    if (!data.nullifier) {
      console.log(`⚠️  ${secretId}: No nullifier found, skipping`);
      continue;
    }

    if (data.used) {
      alreadyMarkedCount++;
      continue;
    }

    try {
      const nullifierHash = BigInt(data.nullifier).toString();
      const nullifierCheckCalldata = nullifierIface.encodeFunctionData('nullifiers', [nullifierHash]);
      const nullifierResult = await new ContractCallQuery()
        .setContractId(ContractId.fromString(guardId))
        .setGas(50_000)
        .setFunctionParameters(Buffer.from(nullifierCheckCalldata.replace('0x', ''), 'hex'))
        .execute(client);

      const nullifierUsed = nullifierIface.decodeFunctionResult('nullifiers', nullifierResult.bytes)[0];

      if (nullifierUsed) {
        console.log(`🚫 ${secretId}: Nullifier already spent on-chain → marking as used locally`);
        vaultData[secretId].used = true;
        syncedCount++;
      } else {
        console.log(`✅ ${secretId}: Nullifier available`);
      }
    } catch (e) {
      console.error(`❌ ${secretId}: Error checking nullifier - ${e.message}`);
      errorCount++;
    }
  }

  // Save updated vault
  if (syncedCount > 0) {
    vault.encrypt(vaultData, password);
    console.log(`\n💾 Saved vault with ${syncedCount} updated entries`);
  }

  console.log(`\n📊 Sync Summary:`);
  console.log(`   - Already marked as used: ${alreadyMarkedCount}`);
  console.log(`   - Newly marked as used: ${syncedCount}`);
  console.log(`   - Errors: ${errorCount}`);
  console.log(`   - Total fragments: ${Object.keys(vaultData).length}`);

  console.log(`\n✅ Vault sync complete!`);
  console.log(`\nNext steps:`);
  console.log(`  1. Restart your User Agent to load the updated vault`);
  console.log(`  2. Run 'balance' to see available fragments`);
  console.log(`  3. Try your stealth transaction again`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
