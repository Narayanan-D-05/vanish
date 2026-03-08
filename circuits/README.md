# Vanish zk-SNARK Circuits

This directory contains the zero-knowledge circuits for the Vanish privacy protocol.

## Circuits

### 1. shield.circom
Proves possession of a valid commitment in the Merkle tree without revealing which commitment.

**Public Inputs:**
- `root`: Current Merkle tree root
- `nullifierHash`: Hash of the nullifier (prevents double-spending)

**Private Inputs:**
- `secret`: User's secret value
- `nullifier`: Unique identifier
- `pathElements`: Merkle proof path elements
- `pathIndices`: Merkle proof indices

### 2. withdraw.circom
Proves the right to withdraw funds from a commitment.

**Public Inputs:**
- `root`: Merkle tree root
- `nullifierHash`: Nullifier hash
- `recipient`: Recipient address
- `amount`: Withdrawal amount

**Private Inputs:**
- `secret`: User's secret
- `nullifier`: Unique identifier
- `pathElements`: Merkle proof elements
- `pathIndices`: Merkle proof indices

## Compilation

### Prerequisites

```bash
npm install -g circom snarkjs
```

### Compile Circuits

```bash
# Compile shield circuit
circom shield.circom --r1cs --wasm --sym -o build

# Compile withdraw circuit
circom withdraw.circom --r1cs --wasm --sym -o build
```

### Generate Trusted Setup

```bash
# Download Powers of Tau (one-time setup)
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau

# Generate proving and verification keys for shield circuit
snarkjs groth16 setup build/shield.r1cs powersOfTau28_hez_final_14.ptau shield_0000.zkey

# Contribute to the ceremony (adds randomness)
snarkjs zkey contribute shield_0000.zkey shield_final.zkey --name="Contribution 1" -v

# Export verification key
snarkjs zkey export verificationkey shield_final.zkey verification_key.json

# Repeat for withdraw circuit
snarkjs groth16 setup build/withdraw.r1cs powersOfTau28_hez_final_14.ptau withdraw_0000.zkey
snarkjs zkey contribute withdraw_0000.zkey withdraw_final.zkey --name="Contribution 1" -v
snarkjs zkey export verificationkey withdraw_final.zkey withdraw_verification_key.json
```

## Testing

### Generate Test Proof

```javascript
const snarkjs = require('snarkjs');
const fs = require('fs');

async function generateTestProof() {
  const input = {
    root: '12345...',
    nullifierHash: '67890...',
    secret: 'my-secret',
    nullifier: 'my-nullifier',
    pathElements: [...],
    pathIndices: [...]
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    'build/shield.wasm',
    'shield_final.zkey'
  );

  console.log('Proof:', proof);
  console.log('Public Signals:', publicSignals);

  // Verify
  const vKey = JSON.parse(fs.readFileSync('verification_key.json'));
  const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  
  console.log('Verified:', verified);
}

generateTestProof();
```

## Circuit Depth

Both circuits use a Merkle tree depth of 20, supporting up to 2^20 (~1 million) commitments.

To change the depth, modify the instantiation line:

```circom
component main {public [root, nullifierHash]} = Shield(20);  // Change 20 to desired depth
```

## Security Considerations

1. **Trusted Setup**: The Powers of Tau ceremony must be performed securely
2. **Nullifier Management**: Nullifiers must be unique to prevent double-spending
3. **Commitment Randomness**: Use cryptographically secure random number generation
4. **Circuit Auditing**: Circuits should be audited before production use
