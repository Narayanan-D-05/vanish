// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./withdrawVerifier.sol";

/**
 * @title VanishMerkleTree
 * @dev Merkle tree for storing commitments in the Vanish privacy protocol
 * @notice This contract manages commitments and verifies zero-knowledge proofs
 */
contract VanishMerkleTree {
    uint256 public constant TREE_DEPTH = 20;
    uint256 public constant MAX_LEAVES = 2**TREE_DEPTH;
    
    // Merkle tree storage
    mapping(uint256 => uint256) public tree;
    uint256 public nextLeafIndex = 0;
    uint256 public currentRoot;
    
    // Nullifier tracking (prevents double-spending)
    mapping(uint256 => bool) public nullifiers;
    
    // Events
    event CommitmentAdded(uint256 indexed leafIndex, uint256 commitment, uint256 newRoot);
    event WithdrawalExecuted(uint256 indexed nullifierHash, address recipient, uint256 amount);
    
    // Errors
    error TreeFull();
    error NullifierUsed();
    error InvalidProof();
    error InvalidCommitment();
    
    WithdrawVerifier public withdrawVerifier;

    /**
     * @dev Constructor initializes the Merkle tree and the verifier
     */
    constructor() {
        // Initialize root
        currentRoot = 0;
        withdrawVerifier = new WithdrawVerifier();
    }
    
    /**
     * @dev Add a commitment to the Merkle tree
     * @param commitment The commitment hash to add
     * @return leafIndex The index where commitment was inserted
     */
    function addCommitment(uint256 commitment) external returns (uint256 leafIndex) {
        if (nextLeafIndex >= MAX_LEAVES) revert TreeFull();
        if (commitment == 0) revert InvalidCommitment();
        
        leafIndex = nextLeafIndex;
        tree[leafIndex] = commitment;
        nextLeafIndex++;
        
        // Update root (simplified - in production, compute full Merkle root)
        currentRoot = computeRoot();
        
        emit CommitmentAdded(leafIndex, commitment, currentRoot);
        
        return leafIndex;
    }
    
    /**
     * @dev Verify a zk-SNARK proof and execute withdrawal
     * @param proof The zk-SNARK proof [pA[0], pA[1], pB[0][0], pB[0][1], pB[1][0], pB[1][1], pC[0], pC[1]]
     * @param root The Merkle root
     * @param nullifierHash The nullifier hash
     * @param recipient The recipient address
     * @param amount The withdrawal amount
     */
    function withdraw(
        uint256[8] calldata proof,
        uint256 root,
        uint256 nullifierHash,
        address recipient,
        uint256 amount
    ) external {
        // Verify root is valid
        if (root != currentRoot) revert InvalidProof();
        
        // Check nullifier hasn't been used
        if (nullifiers[nullifierHash]) revert NullifierUsed();
        
        // Verify zk-SNARK proof
        if (!verifyProof(proof, root, nullifierHash, uint256(uint160(recipient)), amount)) {
            revert InvalidProof();
        }
        
        // Mark nullifier as used
        nullifiers[nullifierHash] = true;
        
        // Execute withdrawal (transfer HBAR/tokens)
        // In production, implement actual token transfer
        
        emit WithdrawalExecuted(nullifierHash, recipient, amount);
    }
    
    /**
     * @dev Compute Merkle root (simplified version)
     * @return The current Merkle root
     */
    function computeRoot() internal view returns (uint256) {
        if (nextLeafIndex == 0) return 0;
        
        // Simplified root computation
        // In production, use proper Merkle tree hashing
        uint256 combinedHash = 0;
        
        for (uint256 i = 0; i < nextLeafIndex; i++) {
            combinedHash = uint256(keccak256(abi.encodePacked(combinedHash, tree[i])));
        }
        
        return combinedHash;
    }
    
    /**
     * @dev Verify zk-SNARK proof
     * @param proof The proof components
     * @param root Merkle root
     * @param nullifierHash Nullifier hash
     * @param recipient Recipient address as uint256
     * @param amount Withdrawal amount
     * @return True if proof is valid
     */
    function verifyProof(
        uint256[8] calldata proof,
        uint256 root,
        uint256 nullifierHash,
        uint256 recipient,
        uint256 amount
    ) internal view returns (bool) {
        uint256[2] memory pA = [proof[0], proof[1]];
        uint256[2][2] memory pB = [[proof[2], proof[3]], [proof[4], proof[5]]];
        uint256[2] memory pC = [proof[6], proof[7]];
        
        // Signal order for withdraw.circom: nullifierHash, commitment, root[2], recipient, amount
        // Note: MerkleTree.sol doesn't currently store original commitment in a way that matches the ZK proof flow perfectly here,
        // but for now we fix the interface count. In a real flow, the commitment would be passed or recomputed.
        uint256 commitment = 0; // Placeholder for now to fix signal count
        
        uint256[6] memory pubSignals;
        pubSignals[0] = nullifierHash;
        pubSignals[1] = commitment;
        pubSignals[2] = uint256(uint128(root));
        pubSignals[3] = uint256(uint128(root >> 128));
        pubSignals[4] = recipient;
        pubSignals[5] = amount;
        
        return withdrawVerifier.verifyProof(pA, pB, pC, pubSignals);
    }
    
    /**
     * @dev Get Merkle path for a leaf
     * @param leafIndex The leaf index
     * @return path The Merkle path elements
     * @return indices The path indices (0 = left, 1 = right)
     */
    function getMerklePath(uint256 leafIndex) 
        external 
        view 
        returns (uint256[] memory path, uint256[] memory indices) 
    {
        require(leafIndex < nextLeafIndex, "Invalid leaf index");
        
        path = new uint256[](TREE_DEPTH);
        indices = new uint256[](TREE_DEPTH);
        
        uint256 currentIndex = leafIndex;
        
        for (uint256 i = 0; i < TREE_DEPTH; i++) {
            uint256 siblingIndex = currentIndex % 2 == 0 ? currentIndex + 1 : currentIndex - 1;
            
            path[i] = siblingIndex < nextLeafIndex ? tree[siblingIndex] : 0;
            indices[i] = currentIndex % 2;
            
            currentIndex = currentIndex / 2;
        }
        
        return (path, indices);
    }
    
    /**
     * @dev Check if a nullifier has been used
     * @param nullifierHash The nullifier hash to check
     * @return True if nullifier has been used
     */
    function isNullifierUsed(uint256 nullifierHash) external view returns (bool) {
        return nullifiers[nullifierHash];
    }
    
    /**
     * @dev Get current tree statistics
     * @return depth Tree depth
     * @return leaves Number of leaves
     * @return root Current root
     */
    function getTreeStats() 
        external 
        view 
        returns (uint256 depth, uint256 leaves, uint256 root) 
    {
        return (TREE_DEPTH, nextLeafIndex, currentRoot);
    }
    
    /**
     * @dev Verify a commitment exists in the tree
     * @param commitment The commitment to verify
     * @return exists True if commitment exists
     * @return index The index where commitment is stored
     */
    function verifyCommitment(uint256 commitment) 
        external 
        view 
        returns (bool exists, uint256 index) 
    {
        for (uint256 i = 0; i < nextLeafIndex; i++) {
            if (tree[i] == commitment) {
                return (true, i);
            }
        }
        return (false, 0);
    }
}
