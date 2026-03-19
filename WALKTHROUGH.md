# 🌀 Vanish: The Golden Thread (2026 Architecture)

In 2026, **Vanish** isn't just a privacy dApp; it's a **Decentralized Autonomous Privacy Network**. It solves the hardest problem in crypto—making high-privacy ZK systems easy enough for anyone—by offloading the complexity to a specialized **Tri-Agent Cluster**.

By combining the **Hedera Agent Kit** with **ZK-SNARKs** and the latest **HIPs**, Vanish creates a system where the AI does the "thinking," the Hedera network provides the "truth," and ZK-proofs provide the "silence."

---

## 🏗️ The Tri-Agent Workflow

### 1. The User Agent (The Architect)
*   **Agentic Behavior:** Instead of simple one-off transactions, the agent **plans**. It analyzes your balance and network traffic to decide the optimal fragmentation strategy (e.g., shredding 500 HBAR into 12 distinct fragments).
*   **ZK-Creation:** Generates **Groth16 proofs** locally using `circuits/shield.circom`. Your private keys never leave your device; privacy is "Local-First."
*   **Hedera Feature:** Uses **HIP-1334 (Private Message Box)**. It discovers the Pool's inbox via account memos and drops encrypted proofs without any direct p2p connection.

### 2. The Pool Manager (The Governor & Relayer)
*   **Agentic Behavior:** A **Proposer-Guard** system. An LLM "proposes" execution windows based on global anonymity targets, but a **Deterministic Policy Engine** ensures it follows rigid safety rules (e.g., minimum batch sizes).
*   **Relayer Role:** Acts as the **Privacy Relayer**. It collects ZK-proofs and submits them to the blockchain. This decouples the user's main account from the withdrawal, ensuring the user doesn't have to pay gas (which would dox them).
*   **ZK-Usage:** Verified via `snarkjs`. The manager acts as a "blind bouncer"—it knows your proof is mathematically sound but cannot see your identity.
*   **Hedera Feature:** Uses **HIP-1340 (EOA Delegation)**. Users delegate specific code execution to the Vanish contract, allowing the agent to pull funds and settle batches autonomously while the user is offline.

### 3. The Receiver Agent (The Ghost)
*   **Agentic Behavior:** A **Passive Ghost Monitor**. It lives in the background, scanning the HCS Audit Topic for stealth handshakes.
*   **Stealth Detection:** Uses a **View Key** and Diffie-Hellman handshakes to autonomously identify "found money" in the public noise.
*   **Hedera Feature:** Uses **HCS (Hedera Consensus Service)** as a decentralized bulletin board for anonymized announcements.

---

## 🛠️ The 2026 Hedera Power-Stack

| Feature | Role in Vanish | Why it's "Agentic" |
| :--- | :--- | :--- |
| **Hedera Agent Kit** | The "Body" | Gives the LLM "hands" to sign HCS messages and HTS transfers. |
| **HIP-1334** | The "Whisper" | Standardized encrypted inboxes so agents can talk without dApp-specific APIs. |
| **HIP-1340** | The "Proxy" | Allows the AI to act as a "Legal Representative" for the user's wallet. |
| **HCS Audit Trail** | The "Memory" | An immutable log of every AI decision, making the agent **Provably Honest**. |

---

## 🧠 Advanced Agentic Privacy
Vanish wins because the AI is the protocol:
1.  **Autonomous Risk Detection:** The Pool Manager monitors **Sybil Attacks** and autonomously pauses batches if the **Chainalysis Oracle** flags a risk.
2.  **Temporal Obfuscation:** The agent decides to wait a random time (e.g., 7m 12s) to break timing patterns.
3.  **Self-Healing Sync:** Agents use the **HCS Topic History** to autonomously rebuild their state after downtime.

---

## 🚀 Recent Wins & Protocol Upgrades

- **Just-In-Time (JIT) Merkle Synchronization:** Fixed `minBatchSize` policy conflicts in the Pool Manager. Implemented a production-grade JIT layer that autonomously anchors Merkle roots to satisfying the contract's anonymity policy (min size 2).
- **Autonomous Triple-Verifier Infrastructure:** Migrated to a modular 2026 architecture where `Shield`, `Withdraw`, and `Exclusion` verifiers are independent contracts linked to a central `VanishGuard` gateway. This enables parallel scaling and independent circuit upgrades without redeploying the main pool logic.
- **Persistent Root Tracking & Verification:** The Pool Manager now features local persistence for anchored roots (`config/anchored_roots.json`) and performs real-time on-chain verification of root existence before every withdrawal, eliminating "Zero-Knowledge Race Conditions."
- **AI Fragmentation Safety Guard:** Implemented a protocol-level override in the User Agent that enforces a minimum of 4 fragments for "Quiet Pools" (anonymity set < 10). This prevents LLM reasoning/output contradictions from compromising user privacy and ensures high-entropy noise regardless of AI hallucination.

---

**"In Vanish, the AI is the Protocol."** We've made privacy goal-oriented, autonomous, and invisible.

## Architecture: Competitive Marketplace

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Agent A  │     │   User Agent B  │     │   User Agent C  │
│   (Fragmented   │     │   (Fragmented   │     │   (Fragmented   │
│    Shielding)   │     │    Shielding)   │     │    Shielding)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  Discovers Pool       │  Discovers Pool       │
         │  Manager via HCS     │  Manager via HCS     │  Discovers Pool
         │                       │                       │  Manager via HCS
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    HCS Public Topic                             │
│  - Pool Manager Metrics (latency, anonymity, fees)              │
│  - Decision Audits (AI decisions + signatures)                 │
│  - Batch Announcements (signed by AI Decision Key)              │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Pool Manager 1 │  │  Pool Manager 2 │  │  Pool Manager 3 │
│  - Low Latency  │  │  - Large        │  │  - Low Fees     │
│  - High Anonymity│  │    Anonymity Set│  │  - Fast Batch   │
│  - Medium Fees  │  │  - Medium Fees  │  │  - Small Anon   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Pool Manager Selection Criteria

User Agents evaluate Pool Managers based on:

1. **Latency**: Time from proof submission to batch execution
2. **Anonymity Set Size**: Number of participants in recent batches
3. **Fee Structure**: Transaction costs for batching
4. **Reliability**: Historical uptime and success rate

## How It Works

### 1. Discovery Phase

User Agents subscribe to the HCS Public Topic to discover available Pool Managers:

```javascript
// Pseudo-code for discovery
const poolManagers = await discoverPoolManagers(publicTopicId);
// Returns: [{ address, metrics: { latency, anonymitySetSize, fees } }]
```

### 2. Selection Phase

User Agent selects the optimal Pool Manager based on its requirements:

```javascript
// Select pool manager with best anonymity
const selected = poolManagers.sort((a, b) =>
  b.metrics.anonymitySetSize - a.metrics.anonymitySetSize
)[0];
```

### 3. Submission Phase

Proofs are submitted via HIP-1334 (encrypted inbox):

```javascript
await hip1334.sendEncryptedMessage(client, selected.address, proofPayload);
```

### 4. Execution Phase

The selected Pool Manager:
1. Collects proofs until batch threshold is met
2. AI proposes batch decision (signed with AI Decision Key)
3. Policy Guard validates the decision
4. Decision + Rationale hash submitted to HCS (auditable)
5. Batch executed on-chain

## Decision Auditing

Every batch decision is:

1. **Signed** with the Pool Manager's AI Decision Key
2. **Logged** to HCS Public Topic with:
   - Decision ID
   - Context hash
   - Validation result
   - Signature

1. Fetching the decision from HCS
2. Verifying the signature
3. Validating against the policy rules

---

## 🛡️ Provably Honest AI (HCS Auditing)

Vanish solves the "Black Box" problem of AI agents. You don't have to trust that the Pool Manager is being fair; you can verify it.

*   **Decision Hashing:** Every time the AI proposes a batch, it generates a unique `DecisionId`.
*   **Cryptographic Rationale:** The agent's thinking process (the `Thought Trace`) is hashed along with the batch data.
*   **HCS Anchoring:** This hash is signed with the Pool Manager's **Decision Key** and sent to a public HCS Topic.
*   **Immutability:** Once on HCS, the AI cannot "change its mind" or hide why it prioritized certain fragments.

---

## 🧪 Testing & Verification

For a step-by-step Standard Operating Procedure (SOP) to test the entire Tri-Agent flow, see the [Testing Guide](file:///c:/Users/dnara/.gemini/antigravity/brain/3cf64635-4c95-4993-8069-fdfc55f87733/testing_guide.md).

### Automated Demo Verification

1. **Run the demo**:
   ```bash
   npm run demo
   ```

2. **Observe structured monologue**:
   - Look for `[THOUGHT]` and `[LOGIC]` traces
   - Verify privacy score calculation is logged

3. **Test Safety Guard**:
   - Attempt to shield 1,000,000 HBAR (exceeds daily limit)
   - Verify the tool invocation is blocked
   - Check for `[SAFETY_CHECK: BLOCKED]` message

### Manual Verification

1. **Verify decision signing**:
   - Check HCS topic for AI decision audit entries
   - Verify signature matches Pool Manager's AI Decision Key

2. **Verify HCS persistence**:
   - Fetch batch announcements from public topic
   - Confirm Hash(Decision + Rationale) is present

## Security Properties

- **Non-repudiation**: All decisions signed with AI Decision Key
- **Auditability**: HCS provides immutable audit trail
- **Policy Enforcement**: Safety Guard blocks policy violations
- **Transparency**: Users can verify Pool Manager behavior

---

## 🛡️ 'Exit Point' Security (The Safe Exit)

In 2026, the most dangerous moment for privacy is the **"Exit Point"**—withdrawing funds from a stealth address into a main account. A simple HBAR transfer creates an on-chain link that analysts can flag. Vanish handles this with an autonomous **Safe Exit** strategy:

| Feature | Direct Transfer (Unsafe) | Vanish Shielded Exit (Safe) |
| :--- | :--- | :--- |
| **On-Chain Trail** | `Stealth -> Main` (Clear Link) | `Pool -> Main` (Broken Link) |
| **Gas Origin** | Main Account (Doxxed) | **Pool Manager (Anonymous)** |
| **Timing** | Immediate (Linked) | **Randomized Delay (Unlinked)** |
| **Amount** | Exact Amount (Fingerprinted) | **Scrubbed/Rounded (Anonymized)** |

4. **Gas-less Move (HIP-1340):** The Pool Manager pays the gas fee for the withdrawal via delegated execution, ensuring your main account never "touches" the stealth address to fund the transaction.

### 🖥️ Safe Exit in Action (Terminal Output)

````carousel
```text
💬 You: withdraw 0.0.123456 5.57

🛡️  Vanish Privacy Advisory: 'Exit Point' Security Check

⚠️  Warning: Withdrawal of non-round amount (5.57 HBAR) detected.
💡 Privacy Tip: Withdrawing 'round' amounts (e.g., 5 HBAR) breaks the 'Amount Fingerprint' used by chain analysis.

⚠️  'Exit Point' Alert: Withdrawing to a main account (0.0.123456) creates an on-chain link.
💡 Safer Alternative: Stay inside the pool. Use 'internal-transfer' for peer-to-peer privacy.

✅ HIP-1340 Protection: The Pool Manager will pay the gas for this withdrawal to decouple your wallets.

🔍 Searching local vault for a matching HBAR fragment...
...
```
<!-- slide -->
```text
💬 You: balance

💰 Vanish Shielded Balance: 4.00 HBAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Available Fragments:
   - frag_1773741554887_4: 2 HBAR (3/18/2026, 12:29:14 PM)
   - frag_1773741563107_5: 2 HBAR (3/18/2026, 12:29:23 PM)

💡 To withdraw securely, use: withdraw <recipientAccountId> <amount>
💡 AI will automatically resolve the secret ID for you.
```
````
## 🔒 Automation & Local Security

Vanish is designed for a "Hands-Off" privacy experience.

---

## 🔒 2026 "Shadow Security" (Implemented)

Vanish has been hardened against the next generation of AI-driven threats:

1.  **Secretless Agent Architecture:** The AI "Thinks" using blinded reference IDs. It never touches a raw private key.
2.  **AES-256-GCM Vaulting:** Your ZK-secrets are encrypted at rest with industry-standard AES-GCM, keyed by your master password.
3.  **Human-In-The-Loop (HITL):** The agent *proposes* a withdrawal, but it cannot sign the transaction until you type `confirm` in the terminal.
4.  **Log Redaction:** Sensitive ZK-inputs (secrets, nullifiers) are automatically **[REDACTED]** from all agent traces, ensuring no data leaks even in verbose mode.

### 🧪 Ready to verify?
Follow the **[Official Testing SOP](file:///c:/Users/dnara/.gemini/antigravity/brain/3cf64635-4c95-4993-8069-fdfc55f87733/testing_guide.md)** to run your first 100% private, 100% secure transfer.

## Integration Points

### User Agent

Uses AgentLogger for reasoning observability:
- `[THOUGHT]` - Internal state evaluation
- `[LOGIC]` - Reasoning chain
- `[DECISION]` - Final decision with rationale
- `[SAFETY_CHECK]` - Security verification

### Pool Manager

- Decision signing with ECDSA secp256k1
- HCS audit logging for third-party verification
- Policy Guard for decision validation