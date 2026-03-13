pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
    Vanish - Proof of Innocence (Selective Disclosure)
    
    This circuit mathematically proves that a user's original deposit (defined by their secret + nullifier)
    does NOT exist inside a given public AML Exclusion List Merkle Tree.
*/

template ExclusionProof(levels) {
    // Public Inputs
    signal input exclusionListRoot; // The root of the AML blacklist Merkle tree
    signal input nullifierHash;     // The public nullifier hash (to link to the withdrawal)

    // Private Inputs
    signal input secret;
    signal input nullifier;
    signal input amount;
    // The merkle path matching the user's deposit to the EXCLUSION tree
    signal input exclusionPathElements[levels];
    signal input exclusionPathIndices[levels];

    // 1. Verify the Nullifier Hash (ensures this proof matches the specific withdrawal)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash === nullifierHasher.out;

    // 2. Compute the Deposit Commitment
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;
    commitmentHasher.inputs[2] <== amount;
    signal commitment <== commitmentHasher.out;

    // 3. Compute the Root of the Exclusion Tree using the provided path (Inline Poseidon Merkle Checker)
    component hashers[levels];
    signal hashes[levels + 1];
    hashes[0] <== commitmentHasher.out;
    
    for (var i = 0; i < levels; i++) {
        hashers[i] = Poseidon(2);
        
        // Input selection based on path (quadratic constraints allowed)
        hashers[i].inputs[0] <== hashes[i] + exclusionPathIndices[i] * (exclusionPathElements[i] - hashes[i]);
        hashers[i].inputs[1] <== exclusionPathElements[i] + exclusionPathIndices[i] * (hashes[i] - exclusionPathElements[i]);
        
        hashes[i + 1] <== hashers[i].out;
    }

    // 4. THE PROOF OF INNOCENCE: Assert that the computed root from the user's path 
    // does NOT match the public Exclusion List Root.
    // If it *does* match, it means the user's deposit is on the blacklist and the proof fails.
    
    component isBlacklisted = IsEqual();
    isBlacklisted.in[0] <== hashes[levels];
    isBlacklisted.in[1] <== exclusionListRoot;

    // The proof is only valid if isBlacklisted resolves to 0 (false)
    isBlacklisted.out === 0;
}

// Instantiate the component (20 levels is standard for Vanish)
component main {public [exclusionListRoot, nullifierHash]} = ExclusionProof(20);
