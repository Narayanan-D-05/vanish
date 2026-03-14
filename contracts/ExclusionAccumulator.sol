// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ExclusionAccumulator
 * @notice Rolling accumulator of AML Exclusion List Merkle roots.
 *
 * Flaw 3 Fix: Version Fingerprinting
 * ─────────────────────────────────────────────────────────────────────────
 * The naive "Proof of Innocence" proves non-inclusion against a SINGLE
 * static exclusion root. An exchange can fingerprint the exact version of
 * the exclusion list used, narrowing the anonymity set to all depositors
 * before that version was published.
 *
 * This contract maintains a rolling ring buffer of the last MAX_ROOTS
 * exclusion roots. The ZK proof proves innocence against ANY root in the
 * accumulator — the exchange only sees the accumulator root, not which
 * specific exclusion list version was used.
 *
 * Architecture:
 *  - Owner publishes new Exclusion List roots via publishRoot()
 *  - getAccumulatorRoot() returns sha256 Merkle root of all stored roots
 *  - ZK circuit (exclusion.circom) proves:
 *      1. Deposit NOT in the exclusion list (the existing non-inclusion proof)
 *      2. The exclusion list root IS in the accumulator (membership proof)
 *  - Exchange verifies against accumulatorRoot — no version timestamp leak
 */
contract ExclusionAccumulator {

    // ─────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────

    uint256 public constant MAX_ROOTS = 100; // Rolling window size

    // ─────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────

    address public owner;

    /// @dev Ring buffer of exclusion list roots (newest at [head])
    bytes32[100] private _roots;

    /// @dev Points to the slot where the NEXT root will be written
    uint256 private _head;

    /// @dev Total roots ever published (may exceed MAX_ROOTS)
    uint256 public totalPublished;

    /// @dev Current sha256 Merkle root of all active roots in the buffer
    bytes32 public accumulatorRoot;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    event RootPublished(
        bytes32 indexed exclusionRoot,
        uint256 indexed version,
        bytes32 newAccumulatorRoot,
        uint256 timestamp
    );

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "ExclusionAccumulator: not owner");
        _;
    }

    // ─────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    // ─────────────────────────────────────────────
    //  Core: Publish Exclusion Root
    // ─────────────────────────────────────────────

    /**
     * @notice Publish a new AML Exclusion List Merkle root.
     * @dev Overwrites the oldest root in the ring buffer (FIFO).
     *      Recomputes the accumulator root after insertion.
     * @param exclusionRoot  sha256 Merkle root of the new exclusion list
     */
    function publishRoot(bytes32 exclusionRoot) external onlyOwner {
        require(exclusionRoot != bytes32(0), "ExclusionAccumulator: empty root");

        // Write into ring buffer at current head
        _roots[_head] = exclusionRoot;
        _head = (_head + 1) % MAX_ROOTS;
        totalPublished++;

        // Recompute the accumulator Merkle root using sha256
        accumulatorRoot = _computeAccumulatorRoot();

        emit RootPublished(exclusionRoot, totalPublished, accumulatorRoot, block.timestamp);
    }

    // ─────────────────────────────────────────────
    //  View Functions
    // ─────────────────────────────────────────────

    /**
     * @notice Check whether a given exclusion root is in the active accumulator window.
     * @param root  The exclusion list root to check
     * @return true if found in the ring buffer
     */
    function isRootInAccumulator(bytes32 root) external view returns (bool) {
        uint256 active = totalPublished < MAX_ROOTS ? totalPublished : MAX_ROOTS;
        for (uint256 i = 0; i < active; i++) {
            if (_roots[i] == root) return true;
        }
        return false;
    }

    /**
     * @notice Return all active roots in the ring buffer (for ZK witness generation off-chain).
     */
    function getActiveRoots() external view returns (bytes32[] memory) {
        uint256 active = totalPublished < MAX_ROOTS ? totalPublished : MAX_ROOTS;
        bytes32[] memory result = new bytes32[](active);
        for (uint256 i = 0; i < active; i++) {
            result[i] = _roots[i];
        }
        return result;
    }

    // ─────────────────────────────────────────────
    //  Internal: sha256 Merkle Tree over ring buffer
    // ─────────────────────────────────────────────

    /**
     * @dev Compute a sha256-based Merkle root over all active roots in the ring buffer.
     *      This uses the native sha256 precompile (cheap on Hedera / EVM chains).
     *
     *      Hybrid Hashing: sha256 for the accumulator tree (on-chain, precompile),
     *      Poseidon for ZK circuit internals (off-chain, SNARK-friendly).
     */
    function _computeAccumulatorRoot() internal view returns (bytes32) {
        uint256 active = totalPublished < MAX_ROOTS ? totalPublished : MAX_ROOTS;
        if (active == 0) return bytes32(0);

        // Copy into dynamic array for Merkle tree computation
        bytes32[] memory layer = new bytes32[](active);
        for (uint256 i = 0; i < active; i++) {
            layer[i] = _roots[i];
        }

        // Build Merkle tree layer by layer using sha256
        while (layer.length > 1) {
            uint256 nextLen = (layer.length + 1) / 2;
            bytes32[] memory next = new bytes32[](nextLen);
            for (uint256 i = 0; i < nextLen; i++) {
                uint256 left  = i * 2;
                uint256 right = left + 1 < layer.length ? left + 1 : left; // duplicate if odd
                next[i] = sha256(abi.encodePacked(layer[left], layer[right]));
            }
            layer = next;
        }

        return layer[0];
    }
}
