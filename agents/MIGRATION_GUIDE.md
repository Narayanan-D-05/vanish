# Migration Guide: Old Agents → 2026 Agent Kit Architecture

## Overview

This guide explains the evolution from the original script-based agents to the new Hedera Agent Kit implementation (now in `agents/`).

**Note:** The old script-based agents have been deprecated and removed. The current `agents/` directory contains the 2026 v3 architecture.

## Architecture Comparison

### Old Architecture (`agents/`)
```
agents/
├── pool-manager/
│   ├── index.cjs          (Simple HCS listener)
│   └── verifier.cjs       (Basic proof verification)
├── user-agent/
│   ├── index.cjs          (Automated script)
│   ├── fragmentor.cjs     (Balance splitting)
│   └── prover.cjs         (ZK-proof generation)
└── receiver-agent/
    ├── index.cjs          (HCS scanner)
    └── scanner.cjs        (Stealth detection)
```

**Characteristics:**
- ❌ Script-based, not conversational
- ❌ No AI/LLM integration
- ❌ Automated execution only
- ❌ No batching or timing obfuscation
- ❌ Limited privacy protections
- ✅ Simple, direct execution
- ✅ Good for testing basics

---

### New Architecture (2026 - Current)
```
agents/
├── plugins/
│   └── vanish-tools.cjs   (Custom ZK and stealth address tools)
├── pool-manager/
│   └── index.cjs          (Autonomous coordinator with batching)
├── user-agent/
│   └── index.cjs          (Chat interface with Ollama)
└── receiver-agent/
    └── index.cjs          (Advanced stealth scanner)
```

**Characteristics:**
- ✅ Chat-based user interface
- ✅ Local AI (Ollama) integration
- ✅ Plugin architecture for tools
- ✅ Hybrid batching (5 proofs OR 30 min)
- ✅ Random timing delays (anti-timing attack)
- ✅ HCS audit trail
- ✅ HIP-1340 delegation support
- ✅ Production-ready architecture

---

## Key Differences

### 1. User Interaction Model

**Old:**
```bash
# Run script, it executes automatically
npm run start:user

# Output:
Shielding 100 HBAR...
Creating worker accounts...
Done.
```

**New:**
```bash
# Start chat interface
npm run start:user

# Interactive conversation:
💬 You: Shield 100 HBAR
🤖 Agent: Generating ZK-proof locally...
         [proof details]
         Your secret: 0x1234... (SAVE THIS!)
         
💬 You: How long until the batch executes?
🤖 Agent: Based on current queue status (3/5 proofs),
         your batch should execute in 12-27 minutes.
```

### 2. Privacy Model

| Feature | Old Agents | New Agents (v3) |
|---------|-----------|-----------------|
| **Batching** | No batching | Min 5 proofs OR 30 min |
| **Timing Obfuscation** | None | Random 5-15 min delay |
| **Anonymity Set** | 1 (immediate execution) | 5+ (batch execution) |
| **Audit Trail** | None | HCS with anonymized data |
| **AI Brain** | None | Local Ollama (private) |

**Privacy Impact:**
- **Old:** Each transaction executed immediately → Timing attack possible
- **New:** Transactions batched with random delays → Timing attacks defeated

### 3. Pool Manager Behavior

**Old Pool Manager:**
```javascript
// Receives proof → Verify → Execute immediately
async processProof(proof) {
  const isValid = await verifyProof(proof);
  if (isValid) {
    await executeTransaction(proof); // ❌ Immediate execution
  }
}
```

**New Pool Manager (v3):**
```javascript
// Receives proof → Verify → Add to queue → Wait for batch trigger → Random delay → Execute
async addProofToQueue(proof) {
  const isValid = await verifyProof(proof);
  if (isValid) {
    this.proofQueue.push(proof);
    
    // Hybrid trigger: Size OR Time
    if (queue.length >= 5 || waitTime >= 30min) {
      const randomDelay = random(5min, 15min); // ✅ Privacy protection
      setTimeout(() => executeBatch(), randomDelay);
    }
  }
}
```

**Result:**
- **Old:** Attacker sees deposit at T+0, withdrawal at T+5s → Easy to link
- **New:** Attacker sees 5 deposits over 20 minutes, 1 batch at T+35min → Cannot link specific deposit to withdrawal

### 4. ZK-Proof Generation

**Old User Agent:**
```javascript
// Proof generation buried in complex script
async function shieldFunds() {
  // ... many lines of setup code ...
  const proof = await generateProof(inputs);
  // ... immediate submission ...
}
```

**New User Agent (v3):**
```javascript
// Proof generation as reusable tool
const generateShieldProofTool = new DynamicStructuredTool({
  name: 'generate_shield_proof',
  description: 'Generates a ZK-SNARK proof for depositing funds...',
  schema: z.object({ ... }),
  func: async ({ secret, amount, ... }) => {
    // Clean, focused proof generation
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(...);
    return { proof, commitment, nullifierHash };
  }
});

// Agent uses tool conversationally:
// User: "Shield 100 HBAR"
// → Agent calls generate_shield_proof tool
// → Returns user-friendly response with secret to save
```

**Benefits:**
- Reusable across different contexts
- Testable in isolation
- AI can combine with other tools
- Clear separation of concerns

### 5. Error Handling & User Experience

**Old:**
```javascript
// Script fails → Cryptic error
Error: Circuit witness generation failed
    at snarkjs.groth16.fullProve
    ... stack trace ...
```

**New (v3):**
```javascript
// Agent provides helpful guidance
💬 You: Shield 100 HBAR

❌ Agent: I encountered an error generating the proof:
         "Merkle tree assertion failed at line 44"
         
         This usually means the pool's Merkle tree needs to be
         initialized. Have you run the setup script?
         
         Try: npm run setup:pool
         
         Or if the pool is already set up, check that you have
         the latest Merkle root: npm run query:pool-status
```

---

## Migration Path

### Option 1: Full Migration (Recommended for Production)

1. **Install dependencies** (already done)
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Install Ollama**
   ```bash
   # Visit https://ollama.ai
   ollama serve
   ollama pull llama3.1
   ```

3. **Test new agents**
   ```bash
   # Terminal 1: Pool Manager
   npm run start:pool
   
   # Terminal 2: User Agent
   npm run start:user
   
   # Terminal 3: Receiver Agent
   npm run start:receiver
   ```

4. **Migrate data**
   - Export user secrets from old agent
   - Import into new agent's secure storage
   - Verify Merkle tree state matches

5. **Deprecate old agents**
   - Update documentation
   - Archive `agents/` directory
   - Update CI/CD pipelines

### Option 2: Gradual Migration

1. **Run both in parallel** (old for production, new for testing)
   ```bash
   # Old agents (existing production)
   npm run start:pool
   npm run start:user
   
   # New agents (testing/staging)
   npm run start:pool
   npm run start:user
   ```

2. **Migrate features incrementally**
   - Week 1: Test Pool Manager batching
   - Week 2: Test User Agent chat interface
   - Week 3: Test Receiver Agent stealth scanning
   - Week 4: Full production cutover

3. **Monitor both systems**
   - Compare proof verification results
   - Compare batch execution times
   - Compare gas costs

### Option 3: Hybrid Approach

**Keep old agents for automation, new agents for users:**

```bash
# Automated background tasks (old agents)
npm run start:pool        # Automated pool management

# User-facing interface (new agents)
npm run start:user     # Chat-based UI for end users
```

**Use case:** 
- Old Pool Manager handles legacy deposits
- New Pool Manager handles new deposits with batching
- Both write to same HCS topics
- Users interact via new chat interface

---

## Testing Checklist

Before migrating to production, verify:

- [ ] **Proof Generation**
  - [ ] Old and new agents generate identical proofs for same inputs
  - [ ] Verification keys match
  - [ ] Public signals format compatible

- [ ] **Batching Logic**
  - [ ] Min 5 proofs trigger works
  - [ ] 30-minute timeout trigger works
  - [ ] Random delay (5-15 min) applied correctly
  
- [ ] **HCS Integration**
  - [ ] Messages sent to correct topics
  - [ ] Message format compatible with existing code
  - [ ] Encrypted messages decrypt correctly

- [ ] **User Experience**
  - [ ] Ollama responds within reasonable time (<5s)
  - [ ] Chat interface handles errors gracefully
  - [ ] Secrets properly saved and retrieved

- [ ] **Security**
  - [ ] User secrets never logged
  - [ ] Private keys secured
  - [ ] Proof verification cannot be bypassed

---

## Performance Comparison

### Latency

| Operation | Old Agents | New Agents (v3) | Change |
|-----------|-----------|-----------------|--------|
| **Proof Generation** | ~8s | ~8s | No change (same circuits) |
| **Proof Submission** | Immediate | Queued | Trade-off for privacy |
| **Batch Execution** | N/A | 5-45 min | New feature |
| **User Query** | N/A | 2-5s (AI) | New feature |

### Privacy Comparison

| Metric | Old Agents | New Agents (v3) |
|--------|-----------|-----------------|
| **Anonymity Set** | 1 | 5-10+ |
| **Timing Correlation** | Easy | Difficult |
| **Transaction Graph** | Visible | Broken |

---

## Rollback Plan

If issues arise, you can rollback:

```bash
# Stop current agents
pkill -f "agents"

# Restart old agents
npm run start:pool
npm run start:user
npm run start:receiver

# Data is compatible (same .env, same circuits, same HCS topics)
```

---

## FAQ

**Q: Can I use the new agents without Ollama?**
A: Yes! Edit `agents/user-agent/index.cjs` and replace `ChatOllama` with `ChatOpenAI` (requires API key) or run in "tool-only" mode without AI.

**Q: Are the circuits compatible?**
A: Yes, both use the same circuits, verification keys, and proof format.

**Q: What about existing deposits in the old pool?**
A: They remain valid. The new Pool Manager can verify and process proofs from old deposits.

**Q: Do I need to redeploy contracts?**
A: No, the agents work with existing contracts. HIP-1340 delegation is optional.

**Q: What's the gas cost difference?**
A: Batching 5 proofs together is ~60% cheaper than executing 5 separately.

---

## Next Steps

1. **Read**: [GETTING_STARTED.md](./GETTING_STARTED.md) for detailed setup
2. **Test**: Run all three v3 agents in parallel
3. **Experiment**: Try different commands in User Agent chat
4. **Monitor**: Compare old vs new agent performance
5. **Deploy**: When ready, follow migration plan above

---

**Questions?** Check [ARCHITECTURE.md](../ARCHITECTURE.md) or open an issue.
