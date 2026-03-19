#!/usr/bin/env node
/**
 * Clear Proof State - Reset to Fresh State
 *
 * This script clears:
 * 1. Pool Manager proof queue
 * 2. User Agent pending withdrawals
 * 3. Anchored roots tracking (optional)
 * 4. Marks fragments from pending withdrawals as 'used' in vault (prevents NullifierAlreadyUsed)
 *
 * Run this when you want to start fresh with no stale proofs.
 */

const fs = require('fs');
const path = require('path');

const VaultWrapper = require('../agents/user-agent/vault-wrapper.cjs');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const ROOTS_FILE = path.join(CONFIG_DIR, 'anchored_roots.json');
const MERKLE_TREE = path.join(CONFIG_DIR, 'merkle_tree.json');
const PENDING_FILE = path.join(__dirname, '..', 'pending_withdrawals.json');
const SECRETS_FILE = path.join(CONFIG_DIR, 'vanish_secrets.encrypted');

console.log('🧹 Clearing Proof State...\n');

// First, mark pending withdrawal fragments as 'used' in vault before deleting
let markedCount = 0;
if (fs.existsSync(PENDING_FILE) && fs.existsSync(SECRETS_FILE)) {
  try {
    const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    if (pending.length > 0) {
      console.log(`📋 Found ${pending.length} pending withdrawals. Marking fragments as 'used' in vault...`);

      const vault = new VaultWrapper(SECRETS_FILE);
      const password = process.env.VAULT_PASSWORD || 'vanish2026';
      const vaultData = vault.decrypt(password);

      for (const withdrawal of pending) {
        const secretId = withdrawal.secretId;
        if (secretId && vaultData[secretId]) {
          if (!vaultData[secretId].used) {
            vaultData[secretId].used = true;
            markedCount++;
            console.log(`   🚫 Marked ${secretId} as 'used'`);
          }
        }
      }

      if (markedCount > 0) {
        vault.encrypt(vaultData, password);
        console.log(`✅ Saved vault with ${markedCount} fragments marked as 'used'\n`);
      } else {
        console.log(`ℹ️ All fragments already marked as 'used'\n`);
      }
    }
  } catch (e) {
    console.warn(`⚠️ Could not mark fragments as used: ${e.message}\n`);
  }
}

// Clear anchored roots
if (fs.existsSync(ROOTS_FILE)) {
  try {
    fs.unlinkSync(ROOTS_FILE);
    console.log('✅ Cleared anchored_roots.json');
  } catch (e) {
    console.error(`⚠️ Failed to clear anchored_roots.json: ${e.message}`);
  }
} else {
  console.log('ℹ️ anchored_roots.json does not exist (already clean)');
}

// Clear pending withdrawals
if (fs.existsSync(PENDING_FILE)) {
  try {
    fs.unlinkSync(PENDING_FILE);
    console.log('✅ Cleared pending_withdrawals.json');
  } catch (e) {
    console.error(`⚠️ Failed to clear pending_withdrawals.json: ${e.message}`);
  }
} else {
  console.log('ℹ️ pending_withdrawals.json does not exist (already clean)');
}

// Clear merkle tree (optional - keeps commitments)
if (fs.existsSync(MERKLE_TREE)) {
  try {
    fs.writeFileSync(MERKLE_TREE, '[]');
    console.log('✅ Reset merkle_tree.json (emptied)');
  } catch (e) {
    console.error(`⚠️ Failed to reset merkle_tree.json: ${e.message}`);
  }
} else {
  console.log('ℹ️ merkle_tree.json does not exist (already clean)');
}

console.log('\n🎉 State cleared successfully!');
console.log('\nNext steps:');
console.log('  1. Restart the Pool Manager');
console.log('  2. Restart the User Agent');
console.log('  3. Submit new proofs (they will be fresh)');
console.log('\n⚠️ Note: Previously submitted proofs to the contract may still show');
console.log('   as "already used" if their nullifiers were spent on-chain.');
