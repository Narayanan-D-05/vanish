# vanish-tools

Privacy tools for Hedera AI Agents featuring ZK-proofs and stealth transfers via HIP-1334.

## Motivation

AI Agents operating on public ledgers like Hedera require privacy to protect sensitive financial logic and user intent. `vanish-tools` provides the necessary cryptographic primitives to shield HBAR and transfer value without linking sender and receiver addresses, enabling private agent-to-agent (A2A) commerce.

## Capabilities

- **Zero-Knowledge Architecture:** Utilizes SnarkJS and Circom for off-chain witness generation and on-chain verification.
- **Stealth Transfers:** Implements HIP-1334 for encrypted, private payloads delivered via Hedera Consensus Service.
- **Privacy Pool Integration:** Seamlessly interacts with the VanishGuard Pool Manager (0.0.8210357) for multi-fragment liquidity.

## Technical Specifications

- **Topic ID:** 0.0.8274009 (Stealth Inbox)
- **Protocol:** HCS-10 / HIP-1334
- **Circuit:** `withdraw.circom` (16-level Merkle Tree)

## Usage Example

```javascript
const { submit_proof_to_pool } = require('vanish-tools');

// Example: Private A2A Transfer
await submit_proof_to_pool({
  proof: zkProofData,
  publicSignals: signals,
  payload: encryptedStealthPayload,
  poolAccountId: "0.0.8210357"
});
```

## Community & Support

- **GitHub:** [Vanish Protocol](https://github.com/vanish/vanish-tools)
- **Website:** [vanish.sh](https://vanish.sh)
