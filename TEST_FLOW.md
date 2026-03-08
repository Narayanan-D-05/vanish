# 🧪 Complete Flow Testing Guide

## Full Flow: Start to Finish

### Prerequisites
- Account: 0.0.8119040 (365.95 HBAR)
- Pool Contract: 0.0.8119058
- HCS Topics: 0.0.8119062 (private), 0.0.8119063 (public)
- Circuits compiled ✅
- Ollama running ✅

---

## Flow 1: Simple Shield (No AI)

### Step 1: Start User Agent
```bash
npm run start:user
> balance
```

**Expected:** Shows 365.95 HBAR

### Step 2: Shield Funds (Simple)
```bash
> shield 10
```

**Expected:**
1. Generates 1 ZK-proof (~2 seconds)
2. Stores secret with ID
3. Submits proof to pool
4. Returns commitment hash

### Step 3: Check Pool Status
```bash
> status
```

**Expected:** Shows 1 proof in queue (waiting for 4 more users)

---

## Flow 2: Smart Fragmentation (Rule-Based)

### Step 1: Preview Plan
```bash
> plan 100
```

**Expected:** Shows 4 fragments (rule-based: 100 HBAR → 4 fragments)

### Step 2: Execute Smart Shield
```bash
> shield-smart 100
```

**Expected:**
1. Generates 4 ZK-proofs (~8 seconds)
2. Stores 4 secrets
3. Submits all 4 proofs
4. Pool processes immediately (batch size reached)

### Step 3: Check Pool
```bash
> status
```

**Expected:** Shows batch processed or waiting

---

## Flow 3: Complete Privacy Flow

### Terminal 1: Start Pool Manager
```bash
npm run start:pool
```

**Expected:** Listening for proofs, 30-min batch timer

### Terminal 2: User Shield
```bash
npm run start:user
> shield-smart 50
```

**Expected:** 50 HBAR → 2-3 fragments

### Terminal 3: Receiver Claims
```bash
npm run start:receiver
# Wait for pool to process batch
# Then claim funds to stealth address
```

**Expected:** Funds arrive at receiver stealth address

---

## Problem with Current System

### ❌ Not Thinking - Just Rules

**Current fragmentor.cjs:**
```javascript
if (amount < 10) return 1;
else if (amount < 50) return Math.min(3, Math.ceil(amount / 15));
else if (amount < 200) return Math.min(8, Math.ceil(amount / 25));
else return Math.min(15, Math.ceil(amount / 30));
```

**This is NOT an AI agent! It's a hardcoded bot.**

### What True AI Should Do

**AI Agent Thinking:**
```
User: Shield 75 HBAR

Agent thinks:
- 75 HBAR is moderately large
- Current network: gas prices are high
- Privacy requirement: moderate (not a whale transaction)
- Cost constraint: user prefers efficiency
- Analysis: 5 fragments would be ideal for privacy, 
  but 3 fragments saves cost with acceptable privacy
- Decision: Use 3 fragments with sizes [24, 26, 25]
- Reason: "Balancing cost ($0.003) vs privacy (30%) 
  given current network conditions"
```

**Agent should reason about:**
- Network conditions (gas prices)
- Time of day (batching likelihood)
- Amount significance (is this whale-level?)
- User's privacy preferences
- Cost sensitivity
- Previous patterns

---

## Next: Make It Think

We need to replace hardcoded rules with **Ollama AI reasoning**.
