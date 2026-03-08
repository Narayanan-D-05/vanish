const { TransferTransaction, Hbar } = require('@hashgraph/sdk');

/**
 * Balance Fragmentor
 * Splits primary balance into N ephemeral worker accounts for privacy
 */

class BalanceFragmentor {
  constructor(client) {
    this.client = client;
  }

  /**
   * Fragment balance across multiple worker accounts
   * @param {string} primaryAccount - Source account to fragment from
   * @param {number} totalAmount - Total amount to fragment
   * @param {number} numWorkers - Number of worker accounts to create
   * @returns {Array} Array of worker account details
   */
  async fragmentBalance(primaryAccount, totalAmount, numWorkers) {
    const workers = [];
    const fragmentSize = totalAmount / numWorkers;

    console.log(`Fragmenting ${totalAmount} HBAR into ${numWorkers} fragments of ${fragmentSize} HBAR each`);

    for (let i = 0; i < numWorkers; i++) {
      try {
        // Create worker account
        const workerAccount = await this.createWorkerAccount(fragmentSize);

        // Transfer fragment to worker
        await this.transferToWorker(primaryAccount, workerAccount.accountId, fragmentSize);

        workers.push({
          accountId: workerAccount.accountId,
          privateKey: workerAccount.privateKey,
          balance: fragmentSize,
          created: Date.now(),
          index: i
        });

        console.log(`✅ Fragment ${i + 1}/${numWorkers}: ${workerAccount.accountId}`);
      } catch (error) {
        console.error(`❌ Failed to create fragment ${i + 1}:`, error.message);
      }
    }

    return workers;
  }

  /**
   * Create a worker account
   */
  async createWorkerAccount(initialBalance) {
    const { PrivateKey, AccountCreateTransaction } = require('@hashgraph/sdk');

    const workerPrivateKey = PrivateKey.generateED25519();
    const workerPublicKey = workerPrivateKey.publicKey;

    const tx = new AccountCreateTransaction()
      .setKey(workerPublicKey)
      .setInitialBalance(new Hbar(initialBalance));

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    return {
      accountId: receipt.accountId.toString(),
      privateKey: workerPrivateKey.toString(),
      publicKey: workerPublicKey.toString(),
      balance: initialBalance
    };
  }

  /**
   * Transfer HBAR to worker account
   */
  async transferToWorker(fromAccount, toAccount, amount) {
    const tx = new TransferTransaction()
      .addHbarTransfer(fromAccount, new Hbar(-amount))
      .addHbarTransfer(toAccount, new Hbar(amount));

    const response = await tx.execute(this.client);
    await response.getReceipt(this.client);

    return response.transactionId.toString();
  }

  /**
   * Just-in-time fund assembly
   * Collect fragments from worker accounts when needed
   */
  async assembleFunds(workerAccounts, targetAmount, targetAccount) {
    console.log(`Assembling ${targetAmount} HBAR from ${workerAccounts.length} workers`);

    let assembled = 0;
    const transactions = [];

    for (const worker of workerAccounts) {
      if (assembled >= targetAmount) break;

      const amountToUse = Math.min(worker.balance, targetAmount - assembled);

      try {
        const txId = await this.transferToWorker(worker.accountId, targetAccount, amountToUse);
        transactions.push({
          from: worker.accountId,
          amount: amountToUse,
          transactionId: txId
        });

        assembled += amountToUse;
        console.log(`✅ Assembled ${amountToUse} HBAR from ${worker.accountId}`);
      } catch (error) {
        console.error(`❌ Failed to assemble from ${worker.accountId}:`, error.message);
      }
    }

    return {
      totalAssembled: assembled,
      transactions
    };
  }

  /**
   * Cleanup old worker accounts after specified time
   */
  async cleanupWorkers(workerAccounts, maxAgeHours = 24) {
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    for (const worker of workerAccounts) {
      const age = now - worker.created;

      if (age > maxAge) {
        try {
          // Transfer remaining balance back and close account
          console.log(`Cleaning up old worker: ${worker.accountId}`);
          // TODO: Implement account closure
        } catch (error) {
          console.error(`Failed to cleanup ${worker.accountId}:`, error.message);
        }
      }
    }
  }
}

module.exports = BalanceFragmentor;
