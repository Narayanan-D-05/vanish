const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');

/**
 * ZK Proof Verifier
 * Verifies zk-SNARK proofs submitted to the pool
 */

class ProofVerifier {
  constructor(circuitPath = './circuits') {
    this.circuitPath = circuitPath;
    this.verificationKey = null;
    this.loadVerificationKey();
  }

  /**
   * Load verification key from file
   */
  loadVerificationKey() {
    try {
      const keyPath = path.join(this.circuitPath, 'verification_key.json');
      
      if (fs.existsSync(keyPath)) {
        this.verificationKey = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        console.log('✅ Verification key loaded');
      } else {
        console.warn('⚠️  Verification key not found. Using placeholder mode.');
        this.verificationKey = null;
      }
    } catch (error) {
      console.error('Error loading verification key:', error.message);
      this.verificationKey = null;
    }
  }

  /**
   * Verify a zk-SNARK proof
   * @param {Object} proof - The proof object
   * @param {Array} publicSignals - Public signals [root, nullifierHash]
   * @returns {Promise<boolean>} Verification result
   */
  async verify(proof, publicSignals) {
    try {
      if (!this.verificationKey) {
        console.warn('⚠️  No verification key - using mock verification');
        return this.mockVerify(proof, publicSignals);
      }

      // Verify using snarkjs
      const isValid = await snarkjs.groth16.verify(
        this.verificationKey,
        publicSignals,
        proof
      );

      return isValid;
    } catch (error) {
      console.error('Verification error:', error.message);
      return false;
    }
  }

  /**
   * Mock verification for development
   */
  mockVerify(proof, publicSignals) {
    console.log('Using mock verification (development mode)');
    
    // Basic sanity checks
    if (!proof || !publicSignals) {
      return false;
    }

    if (publicSignals.length !== 2) {
      return false;
    }

    // In dev mode, accept all non-null proofs
    return true;
  }

  /**
   * Verify Merkle proof
   * @param {string} leaf - Leaf node (commitment)
   * @param {Array} pathElements - Path elements
   * @param {Array} pathIndices - Path indices (0 = left, 1 = right)
   * @param {string} root - Expected root
   * @returns {boolean} Whether proof is valid
   */
  verifyMerkleProof(leaf, pathElements, pathIndices, root) {
    const { keccak256 } = require('js-sha3');
    let currentHash = leaf;

    for (let i = 0; i < pathElements.length; i++) {
      const pathElement = pathElements[i];
      const isLeft = pathIndices[i] === 0;

      if (isLeft) {
        currentHash = keccak256(currentHash + pathElement);
      } else {
        currentHash = keccak256(pathElement + currentHash);
      }
    }

    return currentHash === root;
  }

  /**
   * Batch verify multiple proofs
   * @param {Array} proofs - Array of {proof, publicSignals} objects
   * @returns {Promise<Array<boolean>>} Array of verification results
   */
  async batchVerify(proofs) {
    const results = [];

    for (const { proof, publicSignals } of proofs) {
      try {
        const isValid = await this.verify(proof, publicSignals);
        results.push(isValid);
      } catch (error) {
        console.error('Batch verification error:', error.message);
        results.push(false);
      }
    }

    return results;
  }

  /**
   * Validate public signals format
   */
  validatePublicSignals(publicSignals) {
    if (!Array.isArray(publicSignals)) {
      return { valid: false, error: 'Public signals must be an array' };
    }

    if (publicSignals.length !== 2) {
      return { valid: false, error: 'Expected 2 public signals: [root, nullifierHash]' };
    }

    const [root, nullifierHash] = publicSignals;

    if (typeof root !== 'string' || typeof nullifierHash !== 'string') {
      return { valid: false, error: 'Public signals must be strings' };
    }

    return { valid: true };
  }

  /**
   * Extract proof data
   */
  extractProofData(proof) {
    return {
      protocol: proof.protocol || 'groth16',
      curve: proof.curve || 'bn128',
      pi_a: proof.pi_a,
      pi_b: proof.pi_b,
      pi_c: proof.pi_c
    };
  }
}

module.exports = ProofVerifier;
