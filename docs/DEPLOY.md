# Production Deployment Guide

## NO SIMULATION - Real Contracts Only

This guide shows how to deploy **real** contracts to Hedera Testnet. No mocks, no demos, no hardcoded values.

---

## Step 1: Compile the Solidity Contract

### Option A: Using Remix IDE (Easiest)

1. Go to https://remix.ethereum.org/
2. Create new file: `MerkleTree.sol`
3. Copy contents from `contracts/MerkleTree.sol`
4. Select compiler: **0.8.20**
5. Click **Compile MerkleTree.sol**
6. Go to **Compilation Details**
7. Copy the **bytecode** (not deployedBytecode)
8. Save to `contracts/MerkleTree.bin`

### Option B: Using Hardhat

```bash
# Install Hardhat
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# Initialize Hardhat (if not already)
npx hardhat init

# Compile
npx hardhat compile

# Extract bytecode
node -e "const artifact = require('./artifacts/contracts/MerkleTree.sol/MerkleTree.json'); require('fs').writeFileSync('contracts/MerkleTree.bin', artifact.bytecode);"
```

---

## Step 2: Deploy to Hedera Testnet

```bash
npm run deploy:contract
```

**This will:**
- ✅ Deploy MerkleTree.sol to Hedera
- ✅ Auto-update POOL_CONTRACT_ID in .env
- ✅ Verify on Mirror Node
- ❌ FAIL if bytecode missing (no simulation)

**Cost:** ~0.05 HBAR (~$0.002)

---

## Step 3: Configure SaucerSwap Router

### Find Real SaucerSwap V2 Router

Check SaucerSwap documentation for testnet router:
- https://docs.saucerswap.finance/
- https://github.com/saucerswaplabs

**Update .env:**
```env
SAUCERSWAP_ROUTER=0.0.<REAL_ROUTER_ID>
```

### Verify Router Exists

```bash
# Check on HashScan
https://hashscan.io/testnet/contract/<ROUTER_ID>
```

**Alternative:** Deploy your own SaucerSwap fork (advanced)

---

## Step 4: Associate Tokens with Pool Account

Your pool manager needs token associations for swaps:

```bash
# Create association script
node associate-tokens.js
```

**Required associations:**
- USDC: 0.0.456858
- SAUCE: 0.0.731861

**Cost:** ~0.05 HBAR per association

---

## Step 5: Compile zk-SNARK Circuits

### Install Circom

```bash
# Install globally
npm install -g circom snarkjs

# Download Powers of Tau
cd circuits
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau -O pot12_final.ptau
```

### Compile Circuits

```bash
npm run build:circuits
```

**This compiles:**
- shield.circom → shield.r1cs
- withdraw.circom → withdraw.r1cs

### Trusted Setup

```bash
npm run setup:trusted
```

**This generates:**
- shield_final.zkey (proving key)
- verification_key.json (verifier key)

**Time:** ~5-10 minutes per circuit

---

## Step 6: Verify Production Readiness

Run the checklist:

```bash
node verify-production.js
```

**Checks:**
- ✅ POOL_CONTRACT_ID is real contract
- ✅ SAUCERSWAP_ROUTER is real router
- ✅ HCS topics exist
- ✅ Circuits compiled
- ✅ Pool has HBAR balance
- ✅ Tokens associated
- ❌ FAIL if any check fails

---

## Step 7: Start Agents (Production Mode)

```bash
# Terminal 1: Pool Manager
npm run start:pool

# Terminal 2: User Agent
npm run start:user

# Terminal 3: Receiver Agent
npm run start:receiver
```

**All agents will:**
- ❌ FAIL HARD if contracts not configured
- ❌ FAIL HARD if insufficient balance
- ❌ FAIL HARD if tokens not associated
- ✅ Execute real blockchain transactions only

---

## Error Handling

### If deployment fails:

**INSUFFICIENT_ACCOUNT_BALANCE:**
- Get more HBAR: https://portal.hedera.com/

**CONTRACT_BYTECODE_EMPTY:**
- Compile contract first (Step 1)

**INVALID_CONTRACT_ID (SaucerSwap):**
- Find real router address (Step 3)

**TOKEN_NOT_ASSOCIATED:**
- Run token association (Step 4)

**CIRCUIT_NOT_COMPILED:**
- Compile circuits (Step 5)

---

## Production Costs (Estimated)

| Operation | Cost (HBAR) | Cost (USD) |
|-----------|-------------|------------|
| Deploy contract | ~0.05 | ~$0.002 |
| HCS topic creation | ~0.01 | ~$0.0004 |
| Token association | ~0.05 | ~$0.002 |
| Shield transaction | ~0.20 | ~$0.008 |
| Swap on SaucerSwap | ~0.10 | ~$0.004 |
| **Total per privacy tx** | **~0.41** | **~$0.016** |

Compare to Ethereum Tornado Cash: **$20-50** per transaction

---

## Security Notes

- Private keys in .env are REAL - keep secure
- MerkleTree contract holds REAL funds
- Nullifiers prevent REAL double-spends
- zk-SNARKs provide REAL zero-knowledge proofs
- Stealth addresses are REAL one-time accounts

**NO SIMULATION. NO DEMO. NO MOCKUP.**

---

## Support

Issues? Check deployment logs:
- Hedera: https://hashscan.io/testnet
- Mirror Node: https://testnet.mirrornode.hedera.com
- Pool status: `npm run pool:status`

**All operations must succeed or fail - no simulation fallbacks.**
