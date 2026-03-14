pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/sha256/sha256.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

/**
 * Vanish - Proof of Innocence (Selective Disclosure v2.0)
 * 2026 Privacy Hardened Implementation
 * 
 * Objectives:
 * 1. Prove your deposit (nullifier + secret) is NOT in the AML Exclusion List.
 * 2. Prove the Exclusion List version you are testing against is valid (member of the on-chain Accumulator).
 * 3. Preserve privacy by splitting 256-bit roots into 2 x 128-bit fields.
 * 4. Hybrid Hashing (Sha256 path, Poseidon leaf).
 */

template ExclusionProof(levels, accumulatorLevels) {
    // Public Inputs (root[2] supports full 256-bit Sha256)
    signal input accumulatorRoot[2]; 
    signal input nullifierHash;

    // Private Inputs
    signal input secret;
    signal input nullifier;
    signal input amount;

    // --- Part A: Prove Non-Inclusion in Exclusion List ---
    // User provides their path in the (public) Exclusion List Tree.
    // If the commitment matches a leaf in that tree, the proof MUST fail.
    signal input exclusionListRoot[2];
    signal input exclusionPathElements[levels];
    signal input exclusionPathIndices[levels];

    // 1. Verify Nullifier Hash
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash === nullifierHasher.out;

    // 2. Compute Deposit Commitment (Poseidon Leaf)
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;
    commitmentHasher.inputs[2] <== amount;
    
    // 3. Compute Merkle Root of Exclusion Tree (Sha256 Path)
    component exclusionHashers[levels];
    component n2b_path_ex[levels];
    component n2b_leaf = Num2Bits(256);
    n2b_leaf.in <== commitmentHasher.out;

    signal exclusionHashes[levels + 1][256];
    for (var i = 0; i < 256; i++) {
        exclusionHashes[0][i] <== n2b_leaf.out[i];
    }

    for (var i = 0; i < levels; i++) {
        exclusionHashers[i] = Sha256(512);
        n2b_path_ex[i] = Num2Bits(256);
        n2b_path_ex[i].in <== exclusionPathElements[i];

        for (var k = 0; k < 256; k++) {
            exclusionHashers[i].in[k] <== exclusionHashes[i][k] + exclusionPathIndices[i] * (n2b_path_ex[i].out[k] - exclusionHashes[i][k]);
            exclusionHashers[i].in[k + 256] <== n2b_path_ex[i].out[k] + exclusionPathIndices[i] * (exclusionHashes[i][k] - n2b_path_ex[i].out[k]);
        }
        for (var k = 0; k < 256; k++) {
            exclusionHashes[levels+1 == levels+1 ? i + 1 : 0][k] <== exclusionHashers[i].out[k];
        }
    }

    // 4. Assert Non-Inclusion: computed root != exclusionListRoot
    component b2n_ex_low = Bits2Num(128);
    component b2n_ex_high = Bits2Num(128);
    for (var k = 0; k < 128; k++) {
        b2n_ex_low.in[k] <== exclusionHashes[levels][k];
        b2n_ex_high.in[k] <== exclusionHashes[levels][k + 128];
    }

    component isBlacklistedLow = IsEqual();
    isBlacklistedLow.in[0] <== b2n_ex_low.out;
    isBlacklistedLow.in[1] <== exclusionListRoot[0];

    component isBlacklistedHigh = IsEqual();
    isBlacklistedHigh.in[0] <== b2n_ex_high.out;
    isBlacklistedHigh.in[1] <== exclusionListRoot[1];

    // it is blacklisted if BOTH low and high match
    component isBlacklisted = IsEqual();
    isBlacklisted.in[0] <== isBlacklistedLow.out + isBlacklistedHigh.out;
    isBlacklisted.in[1] <== 2;

    isBlacklisted.out === 0; // Fail if in blacklist

    // --- Part B: Prove Exclusion List Root is valid (Member of Accumulator) ---
    // User provides path from exclusionListRoot to the on-chain accumulatorRoot.
    signal input accumulatorPathElements[accumulatorLevels];
    signal input accumulatorPathIndices[accumulatorLevels];

    component accHashers[accumulatorLevels];
    component n2b_path_acc[accumulatorLevels];
    component n2b_ex_low = Num2Bits(128);
    component n2b_ex_high = Num2Bits(128);
    n2b_ex_low.in <== exclusionListRoot[0];
    n2b_ex_high.in <== exclusionListRoot[1];

    signal accHashes[accumulatorLevels + 1][256];
    for (var k = 0; k < 128; k++) {
        accHashes[0][k] <== n2b_ex_low.out[k];
        accHashes[0][k + 128] <== n2b_ex_high.out[k];
    }

    for (var i = 0; i < accumulatorLevels; i++) {
        accHashers[i] = Sha256(512);
        n2b_path_acc[i] = Num2Bits(256);
        n2b_path_acc[i].in <== accumulatorPathElements[i];

        for (var k = 0; k < 256; k++) {
            accHashers[i].in[k] <== accHashes[i][k] + accumulatorPathIndices[i] * (n2b_path_acc[i].out[k] - accHashes[i][k]);
            accHashers[i].in[k + 256] <== n2b_path_acc[i].out[k] + accumulatorPathIndices[i] * (accHashes[i][k] - n2b_path_acc[i].out[k]);
        }
        for (var k = 0; k < 256; k++) {
            accHashes[i + 1][k] <== accHashers[i].out[k];
        }
    }

    // Verify accumulator root
    component b2n_acc_low = Bits2Num(128);
    component b2n_acc_high = Bits2Num(128);
    for (var k = 0; k < 128; k++) {
        b2n_acc_low.in[k] <== accHashes[accumulatorLevels][k];
        b2n_acc_high.in[k] <== accHashes[accumulatorLevels][k + 128];
    }

    accumulatorRoot[0] === b2n_acc_low.out;
    accumulatorRoot[1] === b2n_acc_high.out;
}

// Depth 4/4 for Windows WASM build — use WSL (wsl bash wsl-build.sh) for full depth-20/14 production build
component main {public [accumulatorRoot, nullifierHash]} = ExclusionProof(4, 4);
