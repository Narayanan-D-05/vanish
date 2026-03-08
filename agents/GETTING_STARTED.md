# Vanish 2026 - Getting Started Guide

## 🚀 Quick Start

### Prerequisites

1. **Install Ollama (Local AI)**
   ```bash
   # Visit https://ollama.ai and install for your system
   # Then start the server:
   ollama serve
   
   # Pull Llama 3.1 model:
   ollama pull llama3.1
   ```

2. **Verify Installation**
   ```bash
   # Check Node.js version (need v22+)
   node --version
   
   # Check Ollama is running
   curl http://localhost:11434/api/tags
   
   # Install dependencies (already done)
   npm install --legacy-peer-deps
   ```

### Running the Agents

#### 1. Start Pool Manager (Autonomous Coordinator)
```bash
npm run start:pool
```

**What it does:**
- Listens for ZK-proof submissions on HCS
- Verifies proofs mathematically using snarkjs
- Implements hybrid batching (min 5 proofs OR 30 minutes)
- Adds random 5-15 minute delay to prevent timing attacks
- Logs anonymized batches to HCS for audit trail

**You should see:**
```
🔒 Pool Manager initialized
   Account: 0.0.8119040
   Batching: Min 5 proofs OR 30 minutes
   Random delay: 5-15 minutes
✅ Verification keys loaded
👂 Pool Manager listening for proof submissions...
```

#### 2. Start User Agent (Chat Interface)
```bash
npm run start:user
```

**What it does:**
- Provides chat-based interface for privacy operations
- Generates ZK-proofs locally (secrets never leave your device)
- Uses local Ollama LLM (no cloud APIs)
- Submits anonymized proofs to Pool Manager

**Example Commands:**
```
💬 You: Shield 100 HBAR
🤖 Agent: Generating ZK-proof locally... [generates proof] 
         Proof submitted to Pool Manager. Your secret: 0x1234...
         SAVE THIS SECRET - you'll need it to withdraw funds!

💬 You: Check pool status
🤖 Agent: Current pool status:
         - Total deposits: 127
         - Anonymity set: 89 participants
         - Your next batch: 12-27 minutes
         
💬 You: Generate a stealth address
🤖 Agent: Stealth address created: 0x5678...
         Ephemeral key: 0xabcd...
         Share the ephemeral key with the sender.
```

#### 3. Start Receiver Agent (Stealth Scanner)
```bash
npm run start:receiver
```

**What it does:**
- Scans HCS for stealth address announcements
- Detects funds sent to your stealth addresses
- Claims funds privately when detected

---

## 🏗️ Architecture Overview

### The 2026 Stack

```
┌─────────────────────────────────────────────────────┐
│  User Agent (Chat Interface)                        │
│  - Local Ollama LLM (Privacy-First AI)             │
│  - ZK-Proof Generation (snarkjs, local)            │
│  - Stealth Address Generation                       │
│  - HIP-1340 Delegation for Swaps                   │
└─────────────────────────────────────────────────────┘
                       │
                       │ Submit Proof via HCS
                       ↓
┌─────────────────────────────────────────────────────┐
│  Pool Manager (Autonomous Coordinator)              │
│  - Verify Proofs (snarkjs.groth16.verify)          │
│  - Hybrid Batching (5 proofs OR 30 min)           │
│  - Random Delay (5-15 min) - Anti-Timing Attack   │
│  - HCS Audit Trail (Anonymized Commitments)       │
└─────────────────────────────────────────────────────┘
                       │
                       │ Execute Batch
                       ↓
┌─────────────────────────────────────────────────────┐
│  Hedera Network                                     │
│  - VanishPool.sol Contract (ZK-Verification)       │
│  - HCS (Consensus Service) - Audit Trail           │
│  - SaucerSwap (Optional DEX Swaps)                 │
└─────────────────────────────────────────────────────┘
                       │
                       │ Announce on HCS
                       ↓
┌─────────────────────────────────────────────────────┐
│  Receiver Agent (Stealth Scanner)                  │
│  - Monitor HCS for Stealth Announcements           │
│  - Detect Funds with View Key                      │
│  - Claim Funds Privately                           │
└─────────────────────────────────────────────────────┘
```

### Key Innovations (2026)

| Feature | Technology | Benefit |
|---------|-----------|---------|
| **Local AI** | Ollama (Llama 3.1) | User data never sent to cloud providers |
| **HIP-1340 Delegation** | Smart contract delegation | Users don't expose private keys to agents |
| **Hybrid Batching** | Size + Time triggers | Balances cost efficiency with UX |
| **Random Timing Delay** | 5-15 min jitter | Defeats statistical timing attacks |
| **HCS Audit Trail** | Anonymized commitments | Transparent verification without revealing users |

---

## 🔐 Security Model

### What's Private?
- ✅ User secrets (generated locally, never transmitted)
- ✅ Transaction amounts (hidden in ZK-proofs)
- ✅ Recipient addresses (stealth addresses)
- ✅ Transaction linkability (batching breaks connection)
- ✅ AI reasoning (local Ollama, no cloud logging)

### What's Public?
- ✅ Proof validity (mathematical correctness)
- ✅ Batch timing (but obfuscated with random delays)
- ✅ Anonymity set size (but not participant identities)
- ✅ Merkle root updates (for synchronization)

### What Pool Manager Knows?
- ❌ User identities (only sees account IDs, not real names)
- ❌ User secrets (never transmitted)
- ❌ Transaction graph (batching breaks links)
- ✅ Proof validity (can verify math)
- ✅ Queue size (for batching decisions)

---

## 🧪 Testing the Flow

### Test 1: Shield Funds (Deposit)

1. **Start Pool Manager** (Terminal 1)
   ```bash
   npm run start:pool
   ```

2. **Start User Agent** (Terminal 2)
   ```bash
   npm run start:user
   ```

3. **Shield 100 HBAR** (in User Agent terminal)
   ```
   💬 You: Shield 100 HBAR
   ```

4. **Expected Flow:**
   - User Agent generates random secret locally
   - Creates ZK-proof using snarkjs (local computation)
   - Submits proof to Pool Manager via HCS
   - Pool Manager adds to queue (1/5 proofs)
   - Agent gives you secret to save: `0x1234...`

5. **Repeat 4 more times** (with other users/accounts)
   - After 5th proof, Pool Manager schedules batch
   - Random delay of 5-15 minutes added
   - Batch executes, proofs processed
   - Merkle root updated on HCS

### Test 2: Check Pool Status

```
💬 You: What's the current pool status?

🤖 Agent: Pool Status:
         - Total deposits: 127
         - Anonymity set: 89 participants
         - Pending proofs: 3/5
         - Next batch: 12-27 minutes
         - Current Merkle root: 0x1234...5678
```

### Test 3: Generate Stealth Address

```
💬 You: Generate a stealth address for me

🤖 Agent: Stealth address generated:
         Address: 0xabcd...ef01
         Ephemeral key: 0x9876...5432
         
         Share the ephemeral key with anyone who wants to send
         you funds privately. Only you can detect and claim them.
```

---

## 🎯 Next Steps

### For Development

1. **Implement Merkle Tree**
   - Currently using simplified placeholder
   - Need full incremental Merkle tree implementation
   - See: circuits/shield.circom (already has tree verification logic)

2. **SaucerSwap Integration**
   - Fix token address conversion (Hedera ID → EVM address)
   - Implement actual swap execution in Pool Manager

3. **HIP-1340 Delegation**
   - Deploy delegation contracts
   - Update User Agent to request delegation
   - Update Pool Manager to use delegated permissions

4. **Deploy Verifier Contracts**
   - Deploy shieldVerifier.sol to Hedera
   - Deploy withdrawVerifier.sol to Hedera
   - Update Pool Manager to call on-chain verification

### For Production

1. **Rate Limiting**
   - Add proof submission rate limits (prevent DoS)
   - Implement queue size caps

2. **Error Recovery**
   - Batch execution retry logic
   - Failed proof handling
   - HCS message recovery

3. **Monitoring**
   - Prometheus metrics
   - Alert on batch failures
   - Queue size monitoring

4. **Documentation**
   - User guide for stealth addresses
   - Security audit documentation
   - API documentation for integrators

---

## 🔧 Troubleshooting

### Ollama Not Running
```bash
Error: Ollama is not running!

Solution:
1. Install: https://ollama.ai
2. Run: ollama serve
3. Pull model: ollama pull llama3.1
4. Restart User Agent
```

### Verification Key Not Found
```bash
Error: ENOENT: no such file or directory 'shield_verification_key.json'

Solution:
npm run compile:circuits
```

### Proof Verification Failed
```bash
✗ shield proof verification FAILED

Possible causes:
1. Merkle tree not initialized (use real tree, not placeholder)
2. Wrong circuit inputs format
3. Corrupted verification keys

Debug:
- Check circuits/build/ directory exists
- Verify .zkey files are not corrupted
- Test with known-good inputs
```

### HCS Messages Not Received
```bash
Pool Manager not receiving proofs

Solution:
1. Check .env has correct PRIVATE_TOPIC_ID
2. Verify topic exists on Hedera (use HashScan)
3. Check account has submit key permissions
4. Verify client is connected: Client.forTestnet()
```

---

## 📚 Additional Resources

- **Hedera Agent Kit Docs**: https://github.com/hedera-dev/hedera-agent-kit
- **ZK-SNARK Tutorial**: circuits/README.md
- **HIP-1340 Specification**: https://hips.hedera.com/hip/hip-1340
- **Architecture Deep Dive**: ARCHITECTURE.md
- **Deployment Guide**: DEPLOY.md

---

## 🎓 Learn More

### How Privacy Works

1. **Deposit Phase** (User Agent)
   - User generates secret `s` (random 32 bytes)
   - Computes commitment `C = H(s, n)` where `n` is nullifier
   - Generates ZK-proof: "I know `s` and `n` such that `C = H(s, n)`"
   - Deposits funds with commitment `C` (secret `s` never revealed)

2. **Batching Phase** (Pool Manager)
   - Collects 5+ proofs from different users
   - Waits random 5-15 minutes (timing obfuscation)
   - Submits all proofs in single batch
   - No one can link specific deposit to specific proof

3. **Withdraw Phase** (User Agent)
   - User provides original secret `s` and nullifier `n`
   - Generates ZK-proof: "I know `s` that matches some commitment `C` in the tree"
   - Pool Manager verifies proof (but can't tell which `C` it is)
   - Funds withdrawn to new stealth address

4. **Result**: Complete unlinkability between deposit and withdrawal

---

**Ready to build privacy-first applications? Start experimenting! 🚀**
