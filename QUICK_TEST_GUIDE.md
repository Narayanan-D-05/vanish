# 🎯 Quick Test Guide

## How to Test Complete Flow (Start to Finish)

Your question: **"how to test this flow from the start"**

---

## Prerequisites

```bash
# Check you have everything
node --version          # v22.22.1
ollama --version        # v0.17.7
cd /home/dnara/hedera
```

Your account: **0.0.8119040 (365.95 HBAR)**

---

## Option 1: Test Rule-Based Fragmentation (Fast)

```bash
npm run start:user
```

**Commands to try:**

```bash
# Check balance
> balance
Expected: 365.95 HBAR

# Preview fragmentation plan (no execution)
> plan 50
Expected: Shows 2 fragments, $0.002 cost, 20% privacy

# Preview larger amount
> plan 150  
Expected: Shows 6 fragments, $0.006 cost, 60% privacy

# Execute rule-based shield (LIVE)
> shield-smart 50
Expected: 
- Generates 2 ZK-proofs
- Stores 2 secrets
- Returns 2 secret IDs
- Cost: $0.002
⚠️  SAVE THE SECRET IDs!

# Check status
> status
Expected: Shows pool has 2 proofs from your fragments
```

---

## Option 2: Test AI-Powered Agent (Thinks!)

### Start Ollama (if not running)

```bash
# Terminal 1: Start Ollama
ollama serve
```

### Use AI Agent

```bash
# Terminal 2: Start user agent
npm run start:user
```

**AI Commands:**

```bash
# Ask AI for advice
> consult 75
Expected: AI gives friendly advice like:
"For 75 HBAR, I recommend using fragmentation. The cost 
of $0.003-0.004 is justified by privacy benefits..."

# See AI's detailed reasoning
> ai-plan 75
Expected: AI analyzes step-by-step:
1. Amount significance: Moderately large
2. Cost analysis: $0.003-0.005 affordable
3. Privacy need: Moderate-high
4. Decision: 3-4 fragments
AI Reasoning: "75 HBAR needs balanced approach..."

# Compare with rule-based
> plan 75
Expected: Rules say "3 fragments" (hardcoded)

Notice: AI might choose 4 fragments (better optimization)

# Execute AI-optimized shield (LIVE)
> ai-shield 75
Expected:
- AI thinks about strategy
- Shows reasoning
- Generates 3-4 ZK-proofs (AI-decided)
- Stores secrets
- Returns secret IDs
⚠️  SAVE THE SECRET IDs!
```

---

## Option 3: Test Complete Privacy Flow (All Agents)

### Terminal 1: Pool Manager

```bash
npm run start:pool
```

Expected: 
```
🎱 Pool Manager initialized
   Batch size: 5 proofs
   Batch timeout: 30 minutes
   Listening for proofs...
```

### Terminal 2: User Agent

```bash
npm run start:user
```

```bash
# Shield with fragmentation
> shield-smart 50
```

Expected:
```
✅ 2 ZK-proofs generated
📤 Submitted to Pool Manager
```

Watch Terminal 1 - Pool Manager should show:
```
📨 Received proof 1/5
📨 Received proof 2/5
⏳ Waiting for 3 more proofs (or 30 min timeout)...
```

### Terminal 3: Receiver Agent (Later)

After pool processes batch:

```bash
npm run start:receiver
```

Expected:
```
🔍 Scanning for completed batches...
💰 Found claimable funds!
   Amount: 50 HBAR
   To: [stealth address]
```

---

## Option 4: Run Automated Tests

### Test Rule-Based Fragmentation

```bash
npm run test:fragmentation
```

Expected output:
```
══ Test 1: Small Amount (5 HBAR) ══
Fragments: 1
Cost: $0.001

══ Test 2: Medium Amount (25 HBAR) ══
Fragments: 2
Cost: $0.002

══ Test 3: Large Amount (150 HBAR) ══
Fragments: 6
Cost: $0.006

══ Test 4: Very Large Amount (500 HBAR) ══
Fragments: 15
Cost: $0.015

✅ All tests passed!
```

### Test AI vs Rules Comparison

```bash
npm run test:ai
```

Expected output:
```
💰 TEST: 75 HBAR

🤖 RULE-BASED:
   Fragments: 3
   Reasoning: NONE (hardcoded rule)

🧠 AI-POWERED:
   Analyzing...
   💭 AI Reasoning: "75 HBAR is moderately large..."
   Fragments: 4
   Reasoning: "Better privacy worth extra $0.001"

📊 COMPARISON:
   AI chose DIFFERENT strategy!
   Why? AI optimized for privacy vs cost balance
```

---

## Commands Reference

### Basic Commands (All Modes)

```bash
status                    # Check pool status
balance                   # Check your HBAR balance
transfer <to> <amount>    # Transfer HBAR
stealth                   # Generate stealth address
help                      # Show all commands
exit                      # Exit agent
```

### Rule-Based Commands (Fast, No AI)

```bash
plan <amount>             # Preview rule-based plan
shield-smart <amount>     # Execute with rules
shield <amount>           # Simple (no fragmentation)
```

### AI-Powered Commands (Thinks!)

```bash
consult <amount>          # Ask AI for advice
ai-plan <amount>          # See AI reasoning
ai-shield <amount>        # Execute AI-optimized
```

---

## What to Expect

### Rule-Based (`shield-smart 50`):

```
📊 Analyzing...
🔀 Fragments: 2 (rule: 50 HBAR → 2 fragments)
⚡ Generating proof 1/2...
⚡ Generating proof 2/2...
✅ Complete! 2 ZK-proofs generated
🔑 Secret IDs: frag_123_0, frag_123_1
```

Time: ~5 seconds (instant calculation + ZK-proofs)

### AI-Powered (`ai-shield 50`):

```
🧠 AI analyzing...
💭 AI Reasoning:
   "50 HBAR is medium amount.
    Network has moderate traffic.
    Privacy is important here.
    Decision: 3 fragments
    Reasoning: Better privacy (30%) worth $0.003"

✨ AI Decision: 3 fragments
⚡ Generating proof 1/3...
⚡ Generating proof 2/3...
⚡ Generating proof 3/3...
✅ Complete! 3 ZK-proofs generated (AI-optimized)
🔑 Secret IDs: frag_124_0, frag_124_1, frag_124_2
```

Time: ~8 seconds (AI inference 2-3s + ZK-proofs)

---

## Key Differences

| Feature | shield-smart | ai-shield |
|---------|-------------|-----------|
| Speed | ⚡ Fast (5s) | 🐌 Slower (8s) |
| Reasoning | ❌ None | ✅ Explains |
| Adaptability | ❌ Fixed rules | ✅ Context-aware |
| AI Required | ❌ No | ✅ Ollama needed |
| Optimization | ⚠️ Basic | ✅ Advanced |

---

## Troubleshooting

### "Ollama not available"
**Solution:**
```bash
# Terminal 1
ollama serve

# Terminal 2
npm run start:user
> ai-shield 50
```

### "AI analysis failed"
**Solution:** Use rule-based fallback
```bash
> shield-smart 50
```

### "ZK-proof generation slow"
**Normal:** Each proof takes ~2 seconds
- 2 fragments = ~4 seconds
- 5 fragments = ~10 seconds
- 15 fragments = ~30 seconds

---

## Complete End-to-End Test

**Recommended flow:**

```bash
# 1. Start Ollama
ollama serve              # Terminal 1

# 2. Start Pool Manager
npm run start:pool        # Terminal 2

# 3. Start User Agent
npm run start:user        # Terminal 3
```

**In User Agent terminal:**

```bash
# Check balance
> balance
Expected: 365.95 HBAR

# Ask AI
> consult 100
Read AI advice

# See AI strategy
> ai-plan 100
Read AI reasoning

# Compare with rules
> plan 100
Compare fragment counts

# Execute AI shield (LIVE!)
> ai-shield 100
⚠️  SAVE THE SECRET IDs displayed!

# Check pool status
> status
See your proofs in pool

# Exit
> exit
```

**Watch Terminal 2 (Pool Manager):**
- Should show received proofs
- When 5 proofs total, processes batch
- Creates Merkle tree
- Announces batch completion

---

## Quick Reference

**Just want to test fast?**

```bash
npm run start:user
> plan 50              # Preview
> shield-smart 50      # Execute (rule-based)
```

**Want to see AI thinking?**

```bash
# Ensure Ollama running
ollama serve           # Terminal 1

npm run start:user     # Terminal 2
> ai-plan 100          # See AI reasoning
> ai-shield 100        # Execute AI-optimized
```

**Want automated tests?**

```bash
npm run test:fragmentation    # Rule-based tests
npm run test:ai               # AI vs rules comparison
```

---

## Your Next Steps

1. **Test rule-based first** (faster, no dependencies)
   ```bash
   npm run start:user
   > shield-smart 50
   ```

2. **Then try AI agent** (see the thinking!)
   ```bash
   npm run start:user
   > ai-shield 100
   ```

3. **Compare strategies**
   ```bash
   npm run test:ai
   ```

**Your balance: 365.95 HBAR - Ready to test!**
