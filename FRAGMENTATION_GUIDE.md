# 🎯 Smart Fragmentation - Complete Guide

## What is Smart Fragmentation?

Instead of sending your entire deposit as ONE transaction, the agent **automatically splits it into optimal fragments** that act as multiple independent users. Each fragment gets its own ZK-SNARK proof.

---

## How It Works

### Example: Shield 100 HBAR

**Traditional Way (shield):**
```
User → [1 ZK-proof for 100 HBAR] → Pool → Wait for 4+ others → Process
Timeline: 5-30 minutes wait
Cost: $0.001
Privacy: Mixed with 4+ real users
```

**Smart Way (shield-smart):**
```
User → Agent fragments into 5 pieces
   ├─ 18.5 HBAR → ZK-proof 1 ─┐
   ├─ 21.3 HBAR → ZK-proof 2 ─┤
   ├─ 19.2 HBAR → ZK-proof 3 ─┼─► Pool (looks like 5 users!)
   ├─ 20.8 HBAR → ZK-proof 4 ─┤
   └─ 20.2 HBAR → ZK-proof 5 ─┘
Timeline: INSTANT (batch size reached)
Cost: $0.005 (5 × $0.001)
Privacy: Acts as 5 different users
```

---

## Fragmentation Strategy

The agent **automatically calculates** optimal fragments:

| Amount | Fragments | Cost | Strategy |
|--------|-----------|------|----------|
| **< 10 HBAR** | 1 | $0.001 | No split (too small) |
| **10-50 HBAR** | 2-3 | $0.002-0.003 | Minimal (cost-optimized) |
| **50-200 HBAR** | 3-8 | $0.003-0.008 | Balanced (privacy + cost) |
| **> 200 HBAR** | 8-15 | $0.008-0.015 | Maximum privacy |

### Why Variable Fragments?

**Random amounts prevent pattern detection:**
- ❌ Bad: 20, 20, 20, 20, 20 (obvious pattern)
- ✅ Good: 18.5, 21.3, 19.2, 20.8, 20.2 (looks natural)

---

## Commands

### 1. Plan (Preview Only)

See fragmentation plan without executing:

```bash
npm run start:user
> plan 100
```

**Output:**
```
📈 Smart Fragmentation Plan

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 Amount: 100 HBAR
🔀 Fragments: 4
📦 Avg Size: 25 HBAR
🎭 Strategy: Balanced fragmentation (privacy + cost)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Fragment Breakdown:
   [1] 23.50 HBAR
   [2] 26.80 HBAR
   [3] 24.30 HBAR
   [4] 25.40 HBAR

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💵 Cost Analysis:
   ZK-Proofs: FREE (client-side)
   Transactions: $0.0040 (4 × $0.001)
   Total: $0.0040

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏱️  Estimated Time:
   Proof Generation: 8s
   Submission: 4s
   Pool Processing: 5s
   Total: ~1 minutes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔒 Privacy Metrics:
   Anonymity Set: 4 (acts as 4 users)
   Privacy Score: 40%
   Batch Wait: NONE (instant processing)
   Traceability: ZERO (ZK-SNARK proofs)
```

### 2. Shield-Smart (Execute)

Execute fragmented shield:

```bash
> shield-smart 100
```

**Process:**
```
🎯 Smart Shield: 100 HBAR (with fragmentation)

📊 Fragmentation Plan:
   Total: 100 HBAR
   Fragments: 4
   Strategy: Balanced fragmentation (privacy + cost)
   Privacy Score: 40%
   Cost: $0.0040
   Est. Time: 12 seconds

   [1/4] Generating proof for 23.5 HBAR...
   [2/4] Generating proof for 26.8 HBAR...
   [3/4] Generating proof for 24.3 HBAR...
   [4/4] Generating proof for 25.4 HBAR...

✅ Fragmentation Complete!

🎉 Smart Shield Results:

   Total: 100 HBAR fragmented into 4 pieces
   Success: 4/4 proofs generated

📦 Fragments:
   [1] 23.5 HBAR - 0xabc123... ✅
   [2] 26.8 HBAR - 0xdef456... ✅
   [3] 24.3 HBAR - 0xghi789... ✅
   [4] 25.4 HBAR - 0xjkl012... ✅

🔑 SAVE THESE SECRET IDs:
   Fragment 1: a1b2c3d4
   Fragment 2: e5f6g7h8
   Fragment 3: i9j0k1l2
   Fragment 4: m3n4o5p6

⚠️  You MUST save these to withdraw funds later!

📤 All 4 proofs submitted to Pool Manager
⏱️  Immediate processing (acts as 4 different users!)
💰 Cost: $0.0040 (4 × $0.001)
🔒 Privacy: 40% anonymity score
```

### 3. Simple Shield (No Fragmentation)

Old way, still available:

```bash
> shield 100
```

Traditional single-proof shield (waits for batch).

---

## Cost Comparison

### Example: 100 HBAR Transfer

| Method | Fragments | Cost | Wait Time | Privacy |
|--------|-----------|------|-----------|---------|
| **shield** | 1 | $0.001 | 5-30 min | 1 of 5+ users |
| **shield-smart** | 4 | $0.004 | INSTANT | Acts as 4 users |
| **Regular transfer** | 1 | $0.001 | 3 sec | ❌ PUBLIC |

**ROI Analysis:**
- Extra cost: $0.003
- Time saved: 5-30 minutes
- Privacy gain: Self-contained anonymity set
- **Result: Worth it for most use cases**

---

## Examples

### Small Amount (9 HBAR)
```
> plan 9

💰 Amount: 9 HBAR
🔀 Fragments: 1
🎭 Strategy: Single deposit (small amount, no fragmentation needed)
💵 Cost: $0.001
```

**Recommendation:** Use simple `shield 9`

---

### Medium Amount (35 HBAR)
```
> plan 35

💰 Amount: 35 HBAR
🔀 Fragments: 3
🎭 Strategy: Minimal fragmentation (cost-optimized)
💵 Cost: $0.003

📊 Fragments:
   [1] 10.85 HBAR
   [2] 12.45 HBAR
   [3] 11.70 HBAR
```

**Recommendation:** Use `shield-smart 35` for instant processing

---

### Large Amount (175 HBAR)
```
> plan 175

💰 Amount: 175 HBAR
🔀 Fragments: 7
🎭 Strategy: Balanced fragmentation (privacy + cost)
💵 Cost: $0.007

📊 Fragments:
   [1] 23.50 HBAR
   [2] 26.80 HBAR
   [3] 24.10 HBAR
   [4] 25.90 HBAR
   [5] 27.40 HBAR
   [6] 22.70 HBAR
   [7] 24.60 HBAR

🔒 Privacy Score: 70%
```

**Recommendation:** Use `shield-smart 175` for best privacy

---

### Very Large Amount (500 HBAR)
```
> plan 500

💰 Amount: 500 HBAR
🔀 Fragments: 15
🎭 Strategy: Maximum fragmentation (highest privacy)
💵 Cost: $0.015

🔒 Privacy Score: 100%
   Anonymity Set: 15 (acts as 15 users)
```

**Recommendation:** Use `shield-smart 500` for maximum privacy

---

## Benefits

### 1. **Instant Processing**
- No waiting for 5+ other users
- Batch size reached immediately
- Funds available faster

### 2. **Better Privacy**
- Each fragment looks like separate user
- Harder to correlate transactions
- Self-contained anonymity set

### 3. **Cost-Optimized**
- Only as many fragments as needed
- Smart algorithm balances cost vs privacy
- No unnecessary overhead

### 4. **ZK-SNARK Security**
- Each fragment gets full ZK-proof
- Mathematical privacy guarantees
- No trust required

### 5. **Flexible**
- Works for any amount
- Automatic optimization
- No configuration needed

---

## Technical Details

### Fragment Generation Algorithm

```javascript
function calculateOptimalFragments(amount) {
  if (amount < 10) return 1;
  else if (amount < 50) return Math.min(3, Math.ceil(amount / 15));
  else if (amount < 200) return Math.min(8, Math.ceil(amount / 25));
  else return Math.min(15, Math.ceil(amount / 30));
}
```

### Why These Numbers?

- **< 10 HBAR:** Too small to split efficiently
- **10-50:** 2-3 fragments (minimal cost, good privacy)
- **50-200:** 3-8 fragments (balanced approach)
- **> 200:** 8-15 fragments (maximum privacy worth the cost)

### Random Variation

Each fragment gets ±15% random variation:
- Prevents pattern recognition
- Makes fragments look unrelated
- Maintains exact total

---

## FAQ

**Q: Is shield-smart more expensive?**
A: Slightly (3-15× more transactions), but instant processing and better privacy.

**Q: Should I always use shield-smart?**
A: Recommended for amounts > 10 HBAR. For smaller amounts, simple shield is fine.

**Q: Can I customize fragment count?**
A: Currently automatic. Future versions may allow manual override.

**Q: Are fragments linked on-chain?**
A: No! Each fragment has separate ZK-proof. Mathematically unlinkable.

**Q: What if one fragment fails?**
A: Other fragments still succeed. You can retry failed fragments separately.

---

## Quick Reference

```bash
# Preview plan
plan <amount>

# Execute fragmented shield (RECOMMENDED)
shield-smart <amount>

# Simple shield (no fragmentation)
shield <amount>

# Check balance
balance

# Transfer (public)
transfer <account> <amount>
```

---

**Your balance: 365.95 HBAR**

**Try it now:**
```bash
npm run start:user
> plan 100
> shield-smart 100
```
