pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/sha256/sha256.circom";
include "circomlib/circuits/bitify.circom";

/**
 * Vanish Shield Circuit (2026 Poseidon-Optimized)
 * Simplified Merkle proof for maximum circom 2.x compatibility
 * 
 * Key optimization: Poseidon hashing (90% gas reduction vs SHA-256)
 */
template Shield(levels) {
    // Public inputs
    signal input nullifierHash;
    signal input commitment;
    signal input root[2];
    
    // Private inputs
    signal input secret;
    signal input nullifier;
    signal input amount;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    
    // 1. Compute and verify commitment = Poseidon(nullifier, secret, amount)
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;
    commitmentHasher.inputs[2] <== amount;
    commitment === commitmentHasher.out;
    
    // 2. Build Merkle proof using SHA-256 (for on-chain precompile compatibility)
    // Hybrid Hashing: Poseidon leaf -> Sha256 internal nodes
    component hashers[levels];
    component n2b_path[levels];
    component n2b_leaf = Num2Bits(256);
    n2b_leaf.in <== commitmentHasher.out;
    
    signal hashes[levels + 1][256];
    for (var i = 0; i < 256; i++) {
        hashes[0][i] <== n2b_leaf.out[i];
    }
    
    for (var i = 0; i < levels; i++) {
        hashers[i] = Sha256(512);
        n2b_path[i] = Num2Bits(256);
        n2b_path[i].in <== pathElements[i];
        
        // Input selection: if index == 0, [hash, path], else [path, hash]
        for (var k = 0; k < 256; k++) {
            // bits 0-255: Left child
            hashers[i].in[k] <== hashes[i][k] + pathIndices[i] * (n2b_path[i].out[k] - hashes[i][k]);
            // bits 256-511: Right child
            hashers[i].in[k + 256] <== n2b_path[i].out[k] + pathIndices[i] * (hashes[i][k] - n2b_path[i].out[k]);
        }
        
        for (var k = 0; k < 256; k++) {
            hashes[i + 1][k] <== hashers[i].out[k];
        }
    }
    
    // 3. Verify root matches (compare high/low 128 bits)
    component b2n_root_low = Bits2Num(128);
    component b2n_root_high = Bits2Num(128);
    for (var k = 0; k < 128; k++) {
        b2n_root_low.in[k] <== hashes[levels][k];
        b2n_root_high.in[k] <== hashes[levels][k + 128];
    }
    
    root[0] === b2n_root_low.out;
    root[1] === b2n_root_high.out;
    
    // 4. Compute and verify nullifier hash
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash === nullifierHasher.out;
}

// Depth 4 for Windows WASM build — use WSL (wsl bash wsl-build.sh) for full depth-20 production build
component main {public [nullifierHash, commitment, root]} = Shield(4);
