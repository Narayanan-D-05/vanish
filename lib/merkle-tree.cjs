/**
 * IncrementalMerkleTree
 * 
 * EXACT circuit replica for shield.circom depth=4:
 * 
 *   Leaf  = Num2Bits(256)(commitment)   → LSB-first 256-bit array
 *   Level = Sha256(512)(left || right)  → MSB-first 256-bit array (circomlib output)
 *   Root  = split to root[0]=low128, root[1]=high128 via Bits2Num
 * 
 * pathElements[i] is the BigInt that, when passed through Num2Bits(256) in the circuit,
 * gives the sibling node's bit representation at that level.
 * 
 *  - Level 0 sibling: leaf → Num2Bits output (LSB-first) → bitsToNum gives back the commitment
 *  - Level >0 sibling: SHA256 output (MSB-first) → bitsToNum gives a specific BigInt
 *
 * Commitments stored as Poseidon field element DECIMAL strings.
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

class IncrementalMerkleTree {
  constructor(treePath, depth = 4) {
    this.treePath  = treePath;
    this.depth     = depth;
    this.maxLeaves = 2 ** depth;
    this.leaves    = []; // Decimal strings
    this._loadTree();
  }

  _loadTree() {
    try {
      if (fs.existsSync(this.treePath)) {
        this.leaves = JSON.parse(fs.readFileSync(this.treePath, 'utf8'));
      }
    } catch (e) {
      console.error(`⚠️ Merkle tree load failed: ${e.message}. Starting fresh.`);
      this.leaves = [];
    }
  }

  _saveTree() {
    try {
      const dir = path.dirname(this.treePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.treePath, JSON.stringify(this.leaves, null, 2));
    } catch (e) {
      console.error(`⚠️ Merkle tree save failed: ${e.message}`);
    }
  }

  /** Normalize any commitment to a decimal string */
  _toDecimal(value) {
    const s = String(value).trim();
    if (s.startsWith('0x') || s.startsWith('0X')) return BigInt(s).toString();
    // Looks like hex without prefix
    if (/^[0-9a-fA-F]{40,}$/.test(s) && !/^[0-9]+$/.test(s)) return BigInt('0x' + s).toString();
    return BigInt(s).toString();
  }

  insert(commitment) {
    if (this.leaves.length >= this.maxLeaves)
      throw new Error(`Merkle tree full (max ${this.maxLeaves} leaves)`);
    const dec = this._toDecimal(commitment);
    this.leaves.push(dec);
    this._saveTree();
    return this.leaves.length - 1;
  }

  indexOf(commitment) {
    const dec = this._toDecimal(commitment);
    return this.leaves.indexOf(dec);
  }

  // ─── Bit helpers ─────────────────────────────────────────────────────────────

  /** Num2Bits(256): decimal BigInt → 256 LSB-first bits */
  _num2BitsLSB(bigintVal) {
    const bits = [];
    let x = bigintVal;
    for (let i = 0; i < 256; i++) { bits.push(Number(x & 1n)); x >>= 1n; }
    return bits;
  }

  /**
   * SHA256 as circomlib does it:
   *   - Pack 512 input bits MSB-first within each byte
   *   - Output 256 bits MSB-first (big-endian SHA256 output)
   */
  _sha256Bits(bits512) {
    const bytes = [];
    for (let i = 0; i < 512; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte |= (bits512[i + j] || 0) << (7 - j);
      bytes.push(byte);
    }
    const digest = crypto.createHash('sha256').update(Buffer.from(bytes)).digest();
    const outBits = [];
    for (let i = 0; i < 32; i++) {
      const b = digest[i];
      for (let j = 7; j >= 0; j--) outBits.push((b >> j) & 1);
    }
    return outBits; // 256 MSB-first bits
  }

  /** bits → BigInt (treating index 0 as bit-position 0, i.e. LSB) */
  _bitsToNum(bits) {
    let r = 0n;
    for (let i = 0; i < bits.length; i++) if (bits[i]) r += (1n << BigInt(i));
    return r;
  }

  /**
   * Compute Merkle root and inclusion proof for leafIndex.
   *
   * Level 0 layer: convert each leaf commitment decimal → LSB-first bits (Num2Bits)
   * Level 1..depth: SHA256 outputs MSB-first; feed directly into next level
   *
   * pathElements[i] = BigInt whose Num2Bits(256) output matches the sibling node bits.
   * For level 0 siblings this = the commitment decimal itself.
   * For level >0 siblings this = bitsToNum(MSB-first SHA256 output bits).
   */
  getRootAndPath(leafIndex) {
    if (leafIndex < 0 || leafIndex >= this.leaves.length)
      throw new Error(`Leaf index ${leafIndex} out of bounds (tree has ${this.leaves.length})`);

    // Level-0: LSB-first leaf bit arrays
    let currentLevel = this.leaves.map(d => this._num2BitsLSB(BigInt(d)));

    // Pad to maxLeaves with all-zero leaves
    const zeroLeaf = new Array(256).fill(0);
    while (currentLevel.length < this.maxLeaves) currentLevel.push([...zeroLeaf]);

    let idx = leafIndex;
    const pathElements = [];
    const pathIndices  = [];

    for (let level = 0; level < this.depth; level++) {
      const isRight      = idx % 2 === 1;
      pathIndices.push(isRight ? 1 : 0);
      const sibIdx       = isRight ? idx - 1 : idx + 1;
      const sibBits      = currentLevel[sibIdx];

      // pathElement = BigInt whose Num2Bits matches sibBits
      // At level 0: sibBits is LSB-first (Num2Bits of commitment decimals)
      //   → bitsToNum gives back the original commitment value ✓
      // At level 1+: sibBits is MSB-first (SHA256 output)
      //   → bitsToNum gives a specific BigInt ✓ (circuit will Num2Bits it again)
      // 
      // WAIT — the circuit does Num2Bits(pathElements[i]) to get n2b_path[i].out[k]
      // That means the circuit interprets pathElements[i] as a decimal field element
      // and produces its LSB-first bit representation.
      //
      // At level 0: leaf is also LSB-first from Num2Bits → left=hashes[0], right sibling also LSBfirst ✓
      // At level 1+: hashes[i] is MSB-first (SHA256 output). The path element sibling must also be
      //   in MSB-first format (as stored in hashes[][]).
      //   BUT the circuit's Num2Bits(pathElement) produces LSB-first.
      //   This means bitsToNum(MSBfirst) ≠ the original value that produces MSBfirst through Num2Bits.
      //
      // This means: for level > 0 siblings, we need the BigInt that when Num2Bits'd gives the
      // SAME BIT PATTERN as the MSB-first SHA256 output. That BigInt = bitsToNum(MSBfirst bits).
      // Because bitsToNum(bits) = sum(bits[i] * 2^i), and Num2Bits(n) = (LSB-first bit array of n).
      // Num2Bits(bitsToNum(b)) = b ONLY if b is already in LSB-first order.
      //
      // SOLUTION: ALL levels should have the SAME bit ordering. The issue is level 0 uses LSBfirst
      // but level 1+ SHA256 outputs MSBfirst. This is the FUNDAMENTAL incongruence in the circuit.
      //
      // The circuit literally does:
      //   hashes[0][k] <= n2b_leaf.out[k]          -- LSB-first!
      //   hashes[i+1][k] <= hashers[i].out[k]      -- MSB-first!
      //   n2b_path[i].in <= pathElements[i]         -- Num2Bits = LSB-first
      //   hashers[i].in[k] = hashes[i][k] OR path[i].out[k]  -- mixing LSB and MSB
      //
      // Both hashes[i][k] and n2b_path[i].out[k] are fed into the SAME SHA256 hash.
      // At level 0: both are LSB-first (hashes[0] from Num2Bits, sibling from Num2Bits).
      // At level 1: hashes[1] is MSB-first SHA256 output.
      //             n2b_path[1].in is pathElements[1], n2b_path[1].out is LSB-first!
      //
      // So at level 1, the left/right selector mixes a MSB-first node with a LSB-first sibling!
      // This is correct ONLY if pathElements[1] is the BigInt that produces the SAME bit pattern
      // as hashes[1], which is the MSB-first SHA256 output.
      // That means pathElements[1] = bitsToNum(MSBfirst), NOT the original commitment.
      //
      // Summary: pathElements[i] = bitsToNum(currentBitRepresentation of sibling)
      // where currentBitRepresentation at level 0 = LSB-first Num2Bits, level 1+ = MSB-first SHA256.

      pathElements.push(this._bitsToNum(sibBits).toString());

      // Compute next level via SHA256
      const nextLevel = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const combined = currentLevel[i].concat(currentLevel[i + 1]);
        nextLevel.push(this._sha256Bits(combined));
      }
      currentLevel = nextLevel;
      idx = Math.floor(idx / 2);
    }

    const rootBits = currentLevel[0];
    const rootLow  = this._bitsToNum(rootBits.slice(0, 128));
    const rootHigh = this._bitsToNum(rootBits.slice(128, 256));
    const rootBigInt = (rootHigh << 128n) | rootLow;

    return {
      merkleRoot:         '0x' + rootBigInt.toString(16).padStart(64, '0'),
      merklePathElements: pathElements,
      merklePathIndices:  pathIndices,
      rootLow:            rootLow.toString(),
      rootHigh:           rootHigh.toString()
    };
  }
  /** Get the current root bigint */
  get root() {
    if (this.leaves.length === 0) {
      // Return zero-root for depth 4 (dummy)
      return 0n;
    }
    const { merkleRoot } = this.getRootAndPath(0);
    return BigInt(merkleRoot);
  }

  get levels() {
    return this.depth;
  }
}

module.exports = IncrementalMerkleTree;
