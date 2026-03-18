# Vanish Protocol: End-to-End Testing Guide (2026)

This guide outlines the scenarios and commands to verify that your Vanish agents are performing as **Autonomous Economic Actors**.

## Prerequisites
1. **Ollama running**: Required for "Inner Monologue" and AI-driven fragmentation reasoning.
2. **HBAR in Operator Account**: Ensure your `HEDERA_ACCOUNT_ID` has at least 50 HBAR for testing.
3. **Environment Configured**: All Topic IDs and Contract IDs must be set in `.env`.

---

## 🏗️ Scenario 1: The One-Click Demo (Presentation Flow)
The fastest way to verify the entire ZK-privacy cycle is using the presentation script. It automates three separate agents in one run.

**Run command:**
```bash
node demo-run.cjs
```

**What to look for:**
- [ ] **Step 1**: Stealth address generation + HIP-1334 encrypted message.
- [ ] **Step 2**: 4-level Merkle tree construction & Groth16 ZK-Proof generation.
- [ ] **Step 3**: Receiver detection and simulated ZK Withdrawal.
- [ ] **Transaction ID**: You should see a `transactionId` in the terminal for every HCS operation.

---

## 🧠 Scenario 2: AI-Powered Smart Shielding
Test the User Agent's ability to "think" about privacy vs. cost.

1. **Start the User Agent in AI mode:**
   ```bash
   npm run start:user
   ```
2. **Execute an AI Plan:**
   ```bash
   > ai-plan 100
   ```
   *Verify that the agent logs [THOUGHT] and [LOGIC] traces explaining why it chose specific fragment sizes.*
3. **Execute AI Shield:**
   ```bash
   > ai-shield 100
   ```
   *The agent will generate ZK-proofs locally and submit them to the Pool Manager.*

---

## ⚖️ Scenario 3: Autonomous Pool Batching
Verify that the Pool Manager acts as a self-governing actor.

1. **Start the Pool Manager:**
   ```bash
   npm run start:pool
   ```
2. **Trigger Batching:**
   Submit at least 2 proofs (via `ai-shield` in another terminal or repeated runs).
3. **Observe Decision Logic:**
   The Pool Manager will log:
   * `🎯 AI decision approved by policy guard`
   * `🧾 AI decision audit signed & logged`
   * `⛓️ Batch anchored on-chain → VanishGuard`

---

## 🎯 Scenario 4: Stealth Wallet Scanning
Test the Receiver Agent's ability to find hidden funds without a centralized server.

1. **Start the Receiver Agent:**
   ```bash
   npm run start:receiver
   ```
2. **Wait for Detection:**
   If you sent funds to a stealth address in Scenario 1 or 2, the Receiver will log:
   * `📨 [Receiver] Detected potential stealth transfer!`
   * `✅ Valid stealth transfer for this agent!`
   * `[SAFETY_CHECK: PASSED] Auto-claim logic initialized`

---

## ❓ FAQ: Funding
**Q: Do I need to fund the pools?**
**A:** No, the Pool (the Smart Contract) does not need initial funding. It acts as a vault that holds deposited funds. However:
1. **User Agent** needs HBAR to pay for the shield transaction.
2. **Pool Manager** needs HBAR to pay for HCS audit logs and the on-chain batch anchor.
3. **Receiver Agent** needs HBAR if it is the one submitting the withdrawal transaction.

In your current setup, ensure your **Operator Account** (in `.env`) has a balance. The Pool Manager account also needs HBAR to pay for the HCS announcements.

---

## 📑 Terminal Audit Trail
Every command now outputs the **Hedera Transaction ID**. You can copy these IDs and paste them into [HashScan](https://hashscan.io/testnet) to see the cryptographic proof of the agent's work on the public ledger.
