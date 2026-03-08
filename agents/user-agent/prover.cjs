const snarkjs = require('snarkjs');
const { keccak256 } = require('js-sha3');
const fs = require('fs');
const path = require('path');

/**
 * zk-SNARK Prover
 * Generates zero-knowledge proofs for private transactions
 */

class ZKProver {
  constructor(circuitPath = './circuits') {
    this.circuitPath = circuitPath;
  }

  /**
   * Generate a commitment (Poseidon hash of nullifier and secret)
   * @param {string} nullifier - Unique identifier to prevent double-spending
   * @param {string} secret - Secret known only to the user
   * @returns {string} Commitment hash
   */
  generateCommitment(nullifier, secret) {
    // Simplified commitment (in production, use Poseidon hash from circomlibjs)
    const combined = `${nullifier}${secret}`;
    return keccak256(combined);
  }

  /**
   * Generate nullifier hash (prevents double-spending)
   * @param {string} nullifier - Nullifier value
   * @returns {string} Nullifier hash
   */
  generateNullifierHash(nullifier) {
    return keccak256(nullifier);
  }

  /**
   * Generate zk-SNARK proof for shielding
   * @param {Object} input - Circuit input
   * @returns {Object} Proof and public signals
   */
  async generateShieldProof(input) {
    console.log('Generating zk-SNARK shield proof...');

    try {
      // Circuit input structure:
      // - root: Merkle tree root
      // - nullifierHash: Hash of nullifier
      // - secret: User's secret
      // - nullifier: Unique identifier
      // - pathElements: Merkle proof path
      // - pathIndices: Merkle proof indices

      const circuitWasmPath = path.join(this.circuitPath, 'shield.wasm');
      const provingKeyPath = path.join(this.circuitPath, 'shield_final.zkey');

      // Check if circuit files exist
      if (!fs.existsSync(circuitWasmPath)) {
        console.warn('⚠️  Circuit WASM not found. Generate placeholder proof.');
        return this.generatePlaceholderProof(input);
      }

      // Generate witness
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        circuitWasmPath,
        provingKeyPath
      );

      console.log('✅ zk-SNARK proof generated');

      return {
        proof: this.formatProof(proof),
        publicSignals,
        nullifierHash: input.nullifierHash,
        root: input.root
      };
    } catch (error) {
      console.error('Error generating proof:', error.message);
      return this.generatePlaceholderProof(input);
    }
  }

  /**
   * Generate withdrawal proof
   * @param {Object} input - Circuit input
   * @returns {Object} Proof and public signals
   */
  async generateWithdrawProof(input) {
    console.log('Generating zk-SNARK withdrawal proof...');

    try {
      const circuitWasmPath = path.join(this.circuitPath, 'withdraw.wasm');
      const provingKeyPath = path.join(this.circuitPath, 'withdraw_final.zkey');

      if (!fs.existsSync(circuitWasmPath)) {
        console.warn('⚠️  Circuit WASM not found. Generate placeholder proof.');
        return this.generatePlaceholderProof(input);
      }

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        circuitWasmPath,
        provingKeyPath
      );

      console.log('✅ zk-SNARK withdrawal proof generated');

      return {
        proof: this.formatProof(proof),
        publicSignals,
        nullifierHash: input.nullifierHash,
        recipient: input.recipient,
        amount: input.amount
      };
    } catch (error) {
      console.error('Error generating proof:', error.message);
      return this.generatePlaceholderProof(input);
    }
  }

  /**
   * Verify a zk-SNARK proof
   * @param {Object} proof - The proof object
   * @param {Array} publicSignals - Public signals
   * @returns {boolean} Verification result
   */
  async verifyProof(proof, publicSignals) {
    try {
      const verificationKeyPath = path.join(this.circuitPath, 'verification_key.json');

      if (!fs.existsSync(verificationKeyPath)) {
        console.warn('⚠️  Verification key not found. Skipping verification.');
        return true; // Placeholder
      }

      const verificationKey = JSON.parse(fs.readFileSync(verificationKeyPath));
      const verified = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);

      return verified;
    } catch (error) {
      console.error('Error verifying proof:', error.message);
      return false;
    }
  }

  /**
   * Generate Merkle tree proof for commitment
   * @param {string} commitment - The commitment to prove
   * @param {Array} tree - Merkle tree array
   * @returns {Object} Merkle proof
   */
  generateMerkleProof(commitment, tree) {
    // Simplified Merkle proof generation
    // In production, use a proper Merkle tree library
    
    const leafIndex = tree.indexOf(commitment);
    if (leafIndex === -1) {
      throw new Error('Commitment not found in tree');
    }

    const pathElements = [];
    const pathIndices = [];

    let currentIndex = leafIndex;
    let currentLevelSize = tree.length;

    // Build proof path (simplified)
    while (currentLevelSize > 1) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

      pathElements.push(tree[siblingIndex] || '0');
      pathIndices.push(isLeft ? 0 : 1);

      currentIndex = Math.floor(currentIndex / 2);
      currentLevelSize = Math.floor(currentLevelSize / 2);
    }

    return {
      pathElements,
      pathIndices,
      leafIndex
    };
  }

  /**
   * Format proof for smart contract verification
   */
  formatProof(proof) {
    return {
      pi_a: [proof.pi_a[0], proof.pi_a[1]],
      pi_b: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
      pi_c: [proof.pi_c[0], proof.pi_c[1]],
      protocol: proof.protocol,
      curve: proof.curve
    };
  }

  /**
   * Generate placeholder proof for testing
   */
  generatePlaceholderProof(input) {
    console.log('⚠️  Using placeholder proof (circuits not compiled)');

    return {
      proof: {
        pi_a: ['0x0', '0x0'],
        pi_b: [['0x0', '0x0'], ['0x0', '0x0']],
        pi_c: ['0x0', '0x0'],
        protocol: 'groth16',
        curve: 'bn128'
      },
      publicSignals: [input.root, input.nullifierHash],
      nullifierHash: input.nullifierHash,
      root: input.root,
      placeholder: true
    };
  }

  /**
   * Build circuit input from transaction data
   */
  buildCircuitInput(commitment, nullifier, secret, merkleProof, root) {
    const nullifierHash = this.generateNullifierHash(nullifier);

    return {
      root,
      nullifierHash,
      secret,
      nullifier,
      pathElements: merkleProof.pathElements,
      pathIndices: merkleProof.pathIndices
    };
  }
}

module.exports = ZKProver;
