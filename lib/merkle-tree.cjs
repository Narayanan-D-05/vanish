const fs = require('fs');
const path = require('path');
const { buildPoseidon } = require('circomlibjs');
const crypto = require('crypto');

/**
 * IncrementalMerkleTree
 * Minimal implementation for Vanish Protocol Depth = 4
 * Follows Hybrid Hashing:
 * - Leaves = Commitments (already Poseidon hashed)
 * - Internal Nodes = Sha256(left ‖ right)
 */
class IncrementalMerkleTree {
  constructor(treePath, depth = 4) {
    this.treePath = treePath;
    this.depth = depth;
    this.maxLeaves = 2 ** depth;
    this.leaves = [];
    this.loadTree();
  }

  loadTree() {
    try {
      if (fs.existsSync(this.treePath)) {
        const data = fs.readFileSync(this.treePath, 'utf8');
        this.leaves = JSON.parse(data);
      } else {
        this.leaves = [];
      }
    } catch (e) {
      console.error(`⚠️ Failed to load Merkle tree: ${e.message}. Starting fresh.`);
      this.leaves = [];
    }
  }

  saveTree() {
    try {
      fs.writeFileSync(this.treePath, JSON.stringify(this.leaves, null, 2));
    } catch (e) {
      console.error(`⚠️ Failed to save Merkle tree: ${e.message}`);
    }
  }

  insert(commitmentHex) {
    if (this.leaves.length >= this.maxLeaves) {
      throw new Error('Merkle tree full!');
    }
    
    // Normalize to 64 char hex without 0x
    let clean = commitmentHex.startsWith('0x') ? commitmentHex.slice(2) : commitmentHex;
    clean = clean.toLowerCase().padStart(64, '0');
    
    this.leaves.push(clean);
    this.saveTree();
    return this.leaves.length - 1;
  }

  /**
   * Helper identical to Sha256 Bits used in build-test-inputs.cjs
   */
  _sha256Bits(bits512) {
    const bytes = [];
    for (let i = 0; i < 512; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte |= (bits512[i + j] || 0) << (7 - j);
      }
      bytes.push(byte);
    }
    const digest = crypto.createHash('sha256').update(Buffer.from(bytes)).digest();
    const outBits = [];
    for (let i = 0; i < 32; i++) {
      const b = digest[i];
      for (let j = 7; j >= 0; j--) {
        outBits.push((b >> j) & 1);
      }
    }
    return outBits;
  }

  _num2BitsLSB(hexStr, numBits = 256) {
    const bits = [];
    let x = BigInt('0x' + hexStr);
    for (let i = 0; i < numBits; i++) {
      bits.push(Number(x & 1n));
      x >>= 1n;
    }
    return bits;
  }

  _bitsToNum(bits) {
    let result = 0n;
    for (let i = 0; i < bits.length; i++) {
      if (bits[i]) result += (1n << BigInt(i));
    }
    return result;
  }

  getRootAndPath(leafIndex) {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of bounds.`);
    }

    // Initialize level 0 with padded leaves
    let currentLevel = this.leaves.map(l => this._num2BitsLSB(l, 256));
    
    // Pad to maxLeaves with zero hashes 
    const zeroLeaf = this._num2BitsLSB('0'.repeat(64), 256);
    while (currentLevel.length < this.maxLeaves) {
      currentLevel.push(zeroLeaf);
    }

    let currentIndex = leafIndex;
    const pathElements = [];
    const pathIndices = [];

    // Build tree bottom up
    for (let level = 0; level < this.depth; level++) {
      const isRight = currentIndex % 2 === 1;
      pathIndices.push(isRight ? 1 : 0);

      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
      const siblingNode = currentLevel[siblingIndex];
      pathElements.push(this._bitsToNum(siblingNode).toString());

      const nextLevel = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1];
        const combined = left.concat(right);
        const hash = this._sha256Bits(combined);
        nextLevel.push(hash);
      }
      
      currentLevel = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);
    }

    const rootBits = currentLevel[0];
    const rootLowBits = rootBits.slice(0, 128);
    const rootHighBits = rootBits.slice(128, 256);
    
    const rootLow = this._bitsToNum(rootLowBits).toString();
    const rootHigh = this._bitsToNum(rootHighBits).toString();

    // The single 'merkleRoot' string representing hex of the whole 256 bits, just for consistency
    // But Circom uses [rootLow, rootHigh]
    let rootHex = this._bitsToNum(rootBits).toString(16).padStart(64, '0');
    
    return {
      merkleRoot: '0x' + rootHex,
      merklePathElements: pathElements,
      merklePathIndices: pathIndices,
      rootLow,
      rootHigh
    };
  }
}

module.exports = IncrementalMerkleTree;
