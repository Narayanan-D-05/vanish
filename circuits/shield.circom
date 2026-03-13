pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

/**
 * Vanish Shield Circuit (2026 Poseidon-Optimized)
 * Simplified Merkle proof for maximum circom 2.x compatibility
 * 
 * Key optimization: Poseidon hashing (90% gas reduction vs SHA-256)
 */
template Shield(levels) {
    // Public inputs
    signal input root;
    signal input nullifierHash;
    
    // Private inputs
    signal input secret;
    signal input nullifier;
    signal input amount;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    
    // Compute commitment = Poseidon(nullifier, secret, amount)
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;
    commitmentHasher.inputs[2] <== amount;
    
    // Verify Merkle proof with Poseidon hashes
    component hashers[levels];
    signal hashes[levels + 1];
    hashes[0] <== commitmentHasher.out;
    
    for (var i = 0; i < levels; i++) {
        hashers[i] = Poseidon(2);
        
        // Input selection based on path
        // This uses quadratic constraints which are allowed
        hashers[i].inputs[0] <== hashes[i] + pathIndices[i] * (pathElements[i] - hashes[i]);
        hashers[i].inputs[1] <== pathElements[i] + pathIndices[i] * (hashes[i] - pathElements[i]);
        
        hashes[i + 1] <== hashers[i].out;
    }
    
    // Verify root matches
    root === hashes[levels];
    
    // Compute and verify nullifier hash
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash === nullifierHasher.out;
}

// Instantiate with depth 20 (supports 2^20 = ~1M commitments)
component main {public [root, nullifierHash]} = Shield(20);
