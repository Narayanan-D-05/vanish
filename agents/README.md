# Vanish Agent-Relayer Architecture (2026)

## Overview
This directory contains the modernized Hedera Agent Kit v3 implementation for Vanish.

## Architecture

### Components
- **User Agent** (`user-agent/`) - Chat-based interface with local ZK-proof generation
- **Pool Manager** (`pool-manager/`) - Autonomous batching and mixing coordinator
- **Receiver Agent** (`receiver-agent/`) - Stealth address scanner and fund claimer
- **Plugins** (`plugins/`) - Custom Hedera tools for ZK-proofs and HCS

### Key Features
- 🧠 **Local AI**: Ollama (Llama 3.x) for privacy-preserving intelligence
- 🔐 **HIP-1340**: Safe delegation patterns for swap permissions
- ⏱️ **Hybrid Batching**: Min 5 proofs OR 30 minutes + random delay (5-15 min)
- 📜 **HCS Audit**: Anonymized commitments + transaction hashes on consensus layer

## Usage

```bash
# Start Pool Manager (autonomous coordinator)
npm run start:pool

# Start User Agent (chat interface)
npm run start:user

# Start Receiver Agent (stealth address scanner)
npm run start:receiver
```

## Design Decisions (2026)

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| AI Brain | Ollama (Local LLM) | Privacy-first: no data sent to centralized providers |
| Authority | HIP-1340 Delegation | Users delegate swap permissions without exposing private keys |
| Efficiency | Hybrid Batching | Balances cost (min 5 proofs) with UX (max 30 min wait) |
| Integrity | HCS Commitments | Immutable audit trail with anonymized proof data |

## Security Model

### User Agent
- Generates ZK-proofs **locally** using snarkjs
- Never exposes user secrets to the network
- Uses HIP-1340 to delegate swap permissions to smart contract

### Pool Manager
- Collects minimum 5 proofs before batching
- Adds random 5-15 minute delay to prevent timing attacks
- Logs anonymized commitments to HCS for audit trail
- Uses rate limiting to prevent DoS

### Receiver Agent
- Scans HCS for stealth address announcements
- Only reveals funds to users with correct view key
- Uses encrypted HCS topics for private notifications
