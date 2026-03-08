pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

/**
 * Withdraw Circuit
 * Proves the right to withdraw funds from a commitment
 * without revealing the original commitment
 */
template Withdraw(levels) {
    // Public inputs
    signal input root;
    signal input nullifierHash;
    signal input recipient;
    signal input amount;
    
    // Private inputs
    signal input secret;
    signal input nullifier;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    
    // Compute commitment = Poseidon(nullifier, secret)
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;
    signal commitment <== commitmentHasher.out;
    
    // Verify Merkle proof
    component poseidons[levels];
    component mux[levels];
    
    signal hashes[levels + 1];
    hashes[0] <== commitment;
    
    for (var i = 0; i < levels; i++) {
        // Select left or right
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== hashes[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== hashes[i];
        mux[i].s <== pathIndices[i];
        
        // Hash current level
        poseidons[i] = Poseidon(2);
        poseidons[i].inputs[0] <== mux[i].out[0];
        poseidons[i].inputs[1] <== mux[i].out[1];
        hashes[i + 1] <== poseidons[i].out;
    }
    
    // Verify root matches
    root === hashes[levels];
    
    // Compute nullifier hash
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash === nullifierHasher.out;
    
    // Amount constraint (ensure amount is within valid range)
    component amountCheck = Num2Bits(64);
    amountCheck.in <== amount;
    
    // Recipient address constraint
    component recipientCheck = Num2Bits(160);
    recipientCheck.in <== recipient;
}

// MultiMux1 helper template
template MultiMux1(n) {
    signal input c[n][2];
    signal input s;
    signal output out[n];
    
    for (var i = 0; i < n; i++) {
        out[i] <== c[i][0] + s * (c[i][1] - c[i][0]);
    }
}

component main {public [root, nullifierHash, recipient, amount]} = Withdraw(20);
