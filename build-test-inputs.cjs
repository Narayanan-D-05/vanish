/**
 * build-test-inputs.cjs
 * Generates valid ZK proof inputs for the Vanish shield/withdraw circuits (depth=4).
 * 
 * This script EXACTLY replicates what `shield.circom` computes internally:
 * 1. Poseidon(nullifier, secret, amount) → commitment (field element)
 * 2. Num2Bits(256)(commitment) → 256 LSB-first bits = leaf
 * 3. For each level: Sha256(left_bits || right_bits) → 256 bits
 *    where the 512 input bits are passed in bit order matching circom
 * 4. The final 256 bits = Merkle root → split into root[0] (low 128) and root[1] (high 128)
 */

require('dotenv').config();
const { buildPoseidon } = require('circomlibjs');
const crypto = require('crypto');

/**
 * Convert a BigInt to LSB-first bit array (matching Num2Bits in circom)
 */
function num2BitsLSB(n, numBits = 256) {
  const bits = [];
  let x = BigInt(n);
  for (let i = 0; i < numBits; i++) {
    bits.push(Number(x & 1n));
    x >>= 1n;
  }
  return bits;
}

/**
 * Convert 512 LSB-first bits → bytes → SHA256 → 256 LSB-first bits
 * This matches circom's Sha256(512) when fed raw bit streams.
 * 
 * circom's SHA256 processes bits MSB-first within each byte.
 * Num2Bits outputs LSB-first, so each group of 8 bits must be reversed to get MSB order.
 */
function sha256Bits(bits512) {
  // Pack 512 bits into 64 bytes, reversing each 8-bit group (LSB→MSB for SHA256)
  const bytes = [];
  for (let i = 0; i < 512; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte |= (bits512[i + j] || 0) << (7 - j); // MSB first
    }
    bytes.push(byte);
  }
  const digest = crypto.createHash('sha256').update(Buffer.from(bytes)).digest();

  // Convert digest back to 256 LSB-first bits (to maintain the same format throughout)
  const outBits = [];
  for (let i = 0; i < 32; i++) {
    const b = digest[i];
    for (let j = 7; j >= 0; j--) {
      outBits.push((b >> j) & 1);
    }
  }
  // outBits is MSB-first from the digest. Convert to LSB-first to match hashes[] in circuit:
  // Actually the circuit stores hashes as output bits from Sha256 directly (via .out[k])
  // circomlib Sha256 outputs bits MSB-first. The circuit just assigns them directly to hashes[i+1][k].
  // So we return them in the same order circomlib outputs them (MSB-first).
  return outBits;
}

/**
 * Convert 256 bits (MSB-first, as stored in hashes[][]) → BigInt
 * For the final root, the circuit does:
 *   b2n_root_low.in[k] <== hashes[levels][k]        (bits 0..127)
 *   b2n_root_high.in[k] <== hashes[levels][k + 128] (bits 128..255)
 * Bits2Num converts LSB-first to number. But hashes is MSB-first from SHA256 output.
 * So bits[0] is actually the MSB from SHA256, which Bits2Num treats as the LSB.
 */
function bitsToNum(bits) {
  let result = 0n;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) result += (1n << BigInt(i));
  }
  return result;
}

async function generateTestInputs(options = {}) {
  const poseidon = await buildPoseidon();

  // User inputs
  const secret = options.secret || '12345678901234567890123456789012';
  const nullifier = options.nullifier || '98765432109876543210987654321098';
  const amountHbar = options.amount || 10;
  const recipient = options.recipient || '99999'; // numeric account num

  const secretBigInt = BigInt(secret);
  const nullifierBigInt = BigInt(nullifier);
  const amountTinybars = BigInt(Math.round(amountHbar * 100_000_000));

  // 1. Compute commitment + nullifier hash
  const commitment = poseidon.F.toString(poseidon([nullifierBigInt, secretBigInt, amountTinybars]));
  const nullifierHash = poseidon.F.toString(poseidon([nullifierBigInt]));

  console.log('🔐 commitment:', commitment.slice(0, 16) + '...');
  console.log('🔐 nullifierHash:', nullifierHash.slice(0, 16) + '...');

  // 2. Convert commitment to LSB-first bits (Num2Bits output)
  const leafBitsLSB = num2BitsLSB(commitment, 256);

  // 3. Zero sibling (Num2Bits(0) = 256 zeros)
  const zeroBits = Array(256).fill(0);

  // 4. Build the 4-level tree with commitment at index 0, all siblings = 0
  // Each level: sha256Bits(current_bits || sibling_bits)
  // pathIndices = [0,0,0,0] means commitment is always the LEFT child
  const DEPTH = 4;
  let currentBits = leafBitsLSB;
  const pathElements = [];
  const pathIndics = [];

  for (let i = 0; i < DEPTH; i++) {
    // left = current, right = zero sibling (index=0 → no swapping)
    const combined = [...currentBits, ...zeroBits]; // 512 bits
    currentBits = sha256Bits(combined);
    pathElements.push('0');   // Sibling = 0
    pathIndics.push(0);       // Left child
  }

  // 5. Derive the root from the final bits
  const rootBits = currentBits; // 256 bits (output from final SHA256)
  const rootLowBits = rootBits.slice(0, 128);
  const rootHighBits = rootBits.slice(128, 256);
  const rootLow = bitsToNum(rootLowBits).toString();
  const rootHigh = bitsToNum(rootHighBits).toString();
  
  // Reconstruct single big root value for the generate_shield_proof tool
  const rootBigInt = (BigInt(rootHigh) << 128n) | BigInt(rootLow);

  console.log('🌳 Computed Merkle root (low):', rootLow.slice(0, 16) + '...');
  console.log('🌳 Computed Merkle root (high):', rootHigh.slice(0, 16) + '...');

  return {
    secret,
    nullifier,
    amount: amountHbar,
    commitment,
    nullifierHash,
    merkleRoot: rootBigInt.toString(),
    merklePathElements: pathElements,
    merklePathIndices: pathIndics,
    recipient,
    rootLow,
    rootHigh
  };
}

module.exports = { generateTestInputs };

// Run standalone if called directly
if (require.main === module) {
  generateTestInputs().then(inputs => {
    console.log('\n✅ Circuit-valid inputs generated:');
    console.log(JSON.stringify(inputs, null, 2));
  }).catch(console.error);
}
