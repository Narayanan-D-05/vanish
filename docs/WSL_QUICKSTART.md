# QUICK START FOR WSL

## TL;DR

**Account:** `0.0.8119040` (976 HBAR, SECURE)  
**Contract:** `0.0.8119058` (deployed, working)  
**Task:** Compile zk-SNARK circuits (Windows has path bug)

## Run These Commands in WSL

```bash
# 1. Navigate to project
cd /mnt/c/Users/dnara/Desktop/Projects/hedera

# 2. Compile circuits (5-15 min)
npm run compile:circuits

# 3. Verify success
npm run verify:production
```

## What This Does

Compiles two Poseidon-optimized circuits:
- `shield.circom` → deposit proofs
- `withdraw.circom` → withdrawal proofs

Generates:
- `circuits/shield_final.zkey` (proving key)
- `contracts/shieldVerifier.sol` (Solidity verifier)
- Same for withdraw circuit

## If It Works

You'll see:
```
🎉 BUILD COMPLETE!

Generated files:
  - circuits/shield_final.zkey
  - circuits/shield_verification_key.json
  - contracts/shieldVerifier.sol
  - circuits/withdraw_final.zkey
  - circuits/withdraw_verification_key.json
  - contracts/withdrawVerifier.sol
```

## Full Details

Read `WSL_HANDOFF.md` for complete context.

## Private Key Location

`.env` file (DO NOT COMMIT, already in .gitignore)

## Repository

`https://github.com/Narayanan-D-05/vanish` (clean, secure)
