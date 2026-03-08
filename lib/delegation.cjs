const { AccountAllowanceApproveTransaction, Hbar, TransferTransaction } = require('@hashgraph/sdk');

/**
 * HIP-1340 EOA Code Delegation
 * Non-custodial agent authorization for spending rights
 */

class DelegationManager {
  constructor(client) {
    this.client = client;
  }

  /**
   * Delegate spending rights to an agent (smart contract or agent account)
   * @param {string} ownerAccountId - Owner's account ID
   * @param {string} agentAccountId - Agent's account ID that will spend on behalf
   * @param {number} amount - Maximum amount of HBAR to delegate
   * @returns {Object} Transaction receipt
   */
  async delegateSpendingRights(ownerAccountId, agentAccountId, amount) {
    console.log(`Delegating ${amount} HBAR spending rights from ${ownerAccountId} to ${agentAccountId}`);

    const tx = new AccountAllowanceApproveTransaction()
      .approveHbarAllowance(ownerAccountId, agentAccountId, new Hbar(amount));

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    return {
      transactionId: response.transactionId.toString(),
      status: receipt.status.toString(),
      delegatedAmount: amount,
      agent: agentAccountId,
      timestamp: Date.now()
    };
  }

  /**
   * Execute transfer using delegated spending rights
   * @param {string} ownerAccountId - Original owner's account
   * @param {string} recipientAccountId - Recipient's account
   * @param {number} amount - Amount to transfer
   * @returns {Object} Transaction receipt
   */
  async executeDelegatedTransfer(ownerAccountId, recipientAccountId, amount) {
    console.log(`Agent executing transfer of ${amount} HBAR from ${ownerAccountId} to ${recipientAccountId}`);

    const tx = new TransferTransaction()
      .addApprovedHbarTransfer(ownerAccountId, new Hbar(-amount))
      .addHbarTransfer(recipientAccountId, new Hbar(amount));

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    return {
      transactionId: response.transactionId.toString(),
      status: receipt.status.toString(),
      from: ownerAccountId,
      to: recipientAccountId,
      amount,
      timestamp: Date.now()
    };
  }

  /**
   * Check available allowance for an agent
   * @param {string} ownerAccountId - Owner's account ID
   * @param {string} agentAccountId - Agent's account ID
   * @returns {number} Available HBAR allowance
   */
  async checkAllowance(ownerAccountId, agentAccountId) {
    const query = new AccountAllowanceQuery()
      .setAccountId(ownerAccountId);

    // Note: This is conceptual - actual API may differ
    const allowances = await query.execute(this.client);
    
    // Find HBAR allowance for specific agent
    for (const allowance of allowances) {
      if (allowance.spenderAccountId.toString() === agentAccountId) {
        return allowance.amount.toBigNumber().toNumber();
      }
    }

    return 0;
  }

  /**
   * Revoke spending rights from an agent
   * @param {string} ownerAccountId - Owner's account ID
   * @param {string} agentAccountId - Agent's account ID to revoke
   */
  async revokeSpendingRights(ownerAccountId, agentAccountId) {
    console.log(`Revoking spending rights from ${agentAccountId}`);

    const tx = new AccountAllowanceApproveTransaction()
      .approveHbarAllowance(ownerAccountId, agentAccountId, new Hbar(0));

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    return {
      transactionId: response.transactionId.toString(),
      status: receipt.status.toString(),
      revokedAgent: agentAccountId,
      timestamp: Date.now()
    };
  }

  /**
   * Create worker account for balance fragmentation
   * @param {number} initialBalance - Initial HBAR balance for worker
   * @returns {Object} New worker account details
   */
  async createWorkerAccount(initialBalance = 10) {
    const { PrivateKey, AccountCreateTransaction, Hbar } = require('@hashgraph/sdk');

    // Generate new key pair for worker
    const workerPrivateKey = PrivateKey.generateED25519();
    const workerPublicKey = workerPrivateKey.publicKey;

    const tx = new AccountCreateTransaction()
      .setKey(workerPublicKey)
      .setInitialBalance(new Hbar(initialBalance))
      .setMaxAutomaticTokenAssociations(10);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    const workerAccountId = receipt.accountId;

    return {
      accountId: workerAccountId.toString(),
      privateKey: workerPrivateKey.toString(),
      publicKey: workerPublicKey.toString(),
      balance: initialBalance,
      created: Date.now()
    };
  }

  /**
   * Transfer funds from primary account to worker accounts
   * @param {string} primaryAccountId - Primary account to fragment from
   * @param {Array} workerAccounts - Array of worker account IDs
   * @param {number} fragmentSize - Amount per fragment
   */
  async fragmentToWorkers(primaryAccountId, workerAccounts, fragmentSize) {
    const results = [];

    for (const workerAccountId of workerAccounts) {
      try {
        const tx = new TransferTransaction()
          .addHbarTransfer(primaryAccountId, new Hbar(-fragmentSize))
          .addHbarTransfer(workerAccountId, new Hbar(fragmentSize));

        const response = await tx.execute(this.client);
        const receipt = await response.getReceipt(this.client);

        results.push({
          workerAccountId,
          transactionId: response.transactionId.toString(),
          status: receipt.status.toString(),
          amount: fragmentSize
        });
      } catch (error) {
        console.error(`Failed to fragment to ${workerAccountId}:`, error.message);
        results.push({
          workerAccountId,
          status: 'FAILED',
          error: error.message
        });
      }
    }

    return results;
  }
}

module.exports = DelegationManager;
