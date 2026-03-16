# Vanish Protocol - Agent Service Walkthrough

## Overview

The Vanish Pool Manager is not a singleton—it operates as a **Service Agent** within a competitive marketplace. User Agents discover and select Pool Managers based on published HCS metrics including latency, anonymity set size, and fees.

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

Third-party auditors can verify that the Pool Manager followed its policy by:
1. Fetching the decision from HCS
2. Verifying the signature
3. Validating against the policy rules

## Verification Plan

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