require('dotenv').config();
const { Client, PrivateKey, TransferTransaction, Hbar, TokenId, AccountId } = require('@hashgraph/sdk');
const ZKProver = require('../user-agent/prover.cjs');
const SaucerSwapIntegration = require('../../lib/saucerswap.cjs');

/**
 * Pool Manager Agent (Verifier)
 * Verifies zk-SNARK proofs and executes swaps without knowing sender/receiver identities
 */

class PoolManagerAgent {
  constructor() {
    this.client = null;
    this.accountId = process.env.HEDERA_ACCOUNT_ID;
    this.privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    this.zkProver = new ZKProver();
    this.saucerSwap = null;
    this.merkleTree = [];
    this.nullifiers = new Set();
  }

  async initialize() {
    console.log('🔍 Initializing Pool Manager (Verifier)...\n');

    this.client = Client.forTestnet();
    this.client.setOperator(this.accountId, this.privateKey);

    console.log(`✅ Connected to Hedera Testnet`);
    console.log(`✅ Pool Manager Account: ${this.accountId}`);
    
    // Initialize SaucerSwap integration (B+C Hybrid Strategy)
    this.saucerSwap = new SaucerSwapIntegration(this.client, this.accountId);
    console.log(`✅ SaucerSwap integration ready\n`);

    // Initialize Merkle tree
    await this.initializeMerkleTree();

    // Start listening for proof submissions
    this.startProofListener();
  }

  /**
   * Initialize Merkle tree for commitments
   */
  async initializeMerkleTree() {
    console.log('🌳 Initializing Merkle Tree...');
    
    // In production, load existing tree from storage
    this.merkleTree = [];
    this.merkleRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
    
    console.log(`✅ Merkle Tree initialized (depth: ${process.env.MERKLE_TREE_DEPTH || 20})\n`);
  }

  /**
   * Add commitment to Merkle tree
   */
  addCommitment(commitment) {
    console.log(`📝 Adding commitment to tree: ${commitment.slice(0, 16)}...`);
    
    this.merkleTree.push(commitment);
    this.merkleRoot = this.computeMerkleRoot();
    
    console.log(`✅ New Merkle root: ${this.merkleRoot.slice(0, 16)}...\n`);
    
    return {
      index: this.merkleTree.length - 1,
      root: this.merkleRoot
    };
  }

  /**
   * Compute Merkle root (simplified)
   */
  computeMerkleRoot() {
    if (this.merkleTree.length === 0) {
      return '0x0000000000000000000000000000000000000000000000000000000000000000';
    }

    const { keccak256 } = require('js-sha3');
    let currentLevel = [...this.merkleTree];

    while (currentLevel.length > 1) {
      const nextLevel = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || left;
        const combined = keccak256(left + right);
        nextLevel.push(combined);
      }

      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }

  /**
   * Verify zk-SNARK proof
   */
  async verifyProof(proof, publicSignals) {
    console.log('🔐 Verifying zk-SNARK proof...');

    try {
      // Check if proof is placeholder
      if (proof.placeholder) {
        console.log('⚠️  Placeholder proof detected (development mode)');
        return this.verifyPlaceholderProof(proof, publicSignals);
      }

      // Verify using snarkjs
      const isValid = await this.zkProver.verifyProof(proof.proof, publicSignals);

      if (!isValid) {
        console.log('❌ Proof verification failed\n');
        return false;
      }

      // Verify Merkle root matches
      const expectedRoot = this.merkleRoot;
      const proofRoot = publicSignals[0];

      if (expectedRoot !== proofRoot) {
        console.log('❌ Merkle root mismatch\n');
        return false;
      }

      // Check nullifier hasn't been used
      const nullifierHash = publicSignals[1];
      if (this.nullifiers.has(nullifierHash)) {
        console.log('❌ Nullifier already used (double-spend attempt)\n');
        return false;
      }

      // Mark nullifier as used
      this.nullifiers.add(nullifierHash);

      console.log('✅ Proof verified successfully\n');
      return true;

    } catch (error) {
      console.error('❌ Proof verification error:', error.message);
      return false;
    }
  }

  /**
   * Verify placeholder proof (for development)
   */
  verifyPlaceholderProof(proof, publicSignals) {
    console.log('⚠️  Using placeholder verification (dev mode)');

    // Basic checks for placeholder
    const nullifierHash = publicSignals[1];
    
    if (this.nullifiers.has(nullifierHash)) {
      console.log('❌ Nullifier already used\n');
      return false;
    }

    this.nullifiers.add(nullifierHash);
    console.log('✅ Placeholder proof accepted\n');
    return true;
  }

  /**
   * Execute swap after proof verification (B+C Hybrid Strategy)
   * 1. User deposits to pool (privacy layer)
   * 2. Pool swaps on SaucerSwap (liquidity layer)
   * 3. Pool sends to stealth address (anonymity)
   */
  async executeSwap(proof, stealthAddress, amount, targetToken = 'USDC') {
    console.log('💱 Executing blind swap (B+C Hybrid)...');
    console.log(`   Amount: ${amount} HBAR → ${targetToken}`);
    console.log(`   Destination: ${stealthAddress.slice(0, 20)}...\n`);

    // Step 1: Verify zk-SNARK proof
    const isValid = await this.verifyProof(proof, proof.publicSignals);

    if (!isValid) {
      throw new Error('Proof verification failed');
    }

    console.log('🔐 Proof verified - User identity hidden\n');

    // Step 2: Execute swap on SaucerSwap using pool's identity
    try {
      // Get quote from SaucerSwap
      const estimatedOut = await this.saucerSwap.getAmountOut(amount, 'HBAR', targetToken);
      const minAmountOut = estimatedOut * 0.98; // 2% slippage tolerance

      // Execute swap (DEX only sees pool, not user)
      const swapResult = await this.saucerSwap.swapHBARForToken(
        amount,
        targetToken,
        minAmountOut
      );

      if (!swapResult.success) {
        throw new Error('Swap execution failed');
      }

      console.log('✅ Swap completed on SaucerSwap');
      console.log(`   DEX only saw pool identity: ${this.accountId}`);
      console.log(`   User identity protected\n`);

      // Step 3: Transfer tokens to stealth address
      await this.sendToStealthAddress(stealthAddress, estimatedOut, targetToken);

      console.log('✅ B+C Hybrid swap complete!');
      console.log(`   Privacy: ✓ (zk-SNARK)`);
      console.log(`   Liquidity: ✓ (SaucerSwap)`);
      console.log(`   Anonymity: ✓ (Stealth Address)\n`);

      return {
        success: true,
        swapTx: swapResult.transactionId,
        amountOut: estimatedOut,
        destination: stealthAddress
      };

    } catch (error) {
      console.error('❌ Swap execution error:', error.message);
      throw error;
    }
  }

  /**
   * Send tokens to stealth address
   */
  async sendToStealthAddress(stealthAddress, amount, tokenType) {
    console.log('📤 Sending to stealth address...');
    console.log(`   Amount: ${amount} ${tokenType}`);
    console.log(`   Destination: ${stealthAddress.slice(0, 20)}...`);

    try {
      if (tokenType === 'HBAR') {
        // Transfer HBAR
        const transferTx = await new TransferTransaction()
          .addHbarTransfer(this.accountId, new Hbar(-amount))
          .addHbarTransfer(stealthAddress, new Hbar(amount))
          .execute(this.client);

        const receipt = await transferTx.getReceipt(this.client);
        console.log(`✅ HBAR transferred: ${transferTx.transactionId.toString()}\n`);

        return transferTx.transactionId.toString();

      } else {
        // Transfer HTS token (USDC, SAUCE, etc.)
        const tokenId = this.saucerSwap.tokens[tokenType];
        
        const transferTx = await new TransferTransaction()
          .addTokenTransfer(TokenId.fromString(tokenId), this.accountId, -amount)
          .addTokenTransfer(TokenId.fromString(tokenId), stealthAddress, amount)
          .execute(this.client);

        const receipt = await transferTx.getReceipt(this.client);
        console.log(`✅ ${tokenType} transferred: ${transferTx.transactionId.toString()}\n`);

        return transferTx.transactionId.toString();
      }

    } catch (error) {
      console.error('❌ Transfer failed:', error.message);
      console.error('   Real transactions required - no simulation mode');
      throw error;
    }

    return {
      success: true,
      transactionId: 'MOCK_TX_ID',
      amount,
      destination: stealthAddress
    };
  }

  /**
   * Start listening for proof submissions
   */
  startProofListener() {
    console.log('👂 Listening for proof submissions...\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // In production, this would listen to an HCS topic or smart contract events
    // For now, just indicate the agent is ready
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      totalCommitments: this.merkleTree.length,
      merkleRoot: this.merkleRoot,
      usedNullifiers: this.nullifiers.size,
      poolManagerAccount: this.accountId
    };
  }

  /**
   * Display pool status
   */
  displayStatus() {
    const stats = this.getPoolStats();

    console.log('\n📊 POOL MANAGER STATUS');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Total Commitments: ${stats.totalCommitments}`);
    console.log(`   Used Nullifiers: ${stats.usedNullifiers}`);
    console.log(`   Current Root: ${stats.merkleRoot.slice(0, 20)}...`);
    console.log(`   Pool Manager: ${stats.poolManagerAccount}`);
    console.log('═══════════════════════════════════════════════════════\n');
  }

  async shutdown() {
    console.log('\n🛑 Shutting down Pool Manager...');
    if (this.client) {
      this.client.close();
    }
  }
}

// Run the agent
async function main() {
  const agent = new PoolManagerAgent();

  try {
    await agent.initialize();

    // Display status every 10 seconds
    setInterval(() => {
      agent.displayStatus();
    }, 10000);

    // Keep agent running
    console.log('✅ Pool Manager is ready and listening...\n');
    console.log('Press Ctrl+C to stop\n');

  } catch (error) {
    console.error('Fatal error:', error);
    await agent.shutdown();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = PoolManagerAgent;
