const axios = require('axios');

/**
 * Mirror Node Scanner
 * Continuously scans Hedera Mirror Node for stealth address announcements
 */

class MirrorNodeScanner {
  constructor(mirrorNodeUrl = 'https://testnet.mirrornode.hedera.com') {
    this.mirrorNodeUrl = mirrorNodeUrl;
    this.lastScannedTimestamp = null;
    this.scanning = false;
  }

  /**
   * Start continuous scanning
   * @param {Function} callback - Called for each detected announcement
   * @param {number} pollInterval - Milliseconds between scans
   */
  async startScanning(callback, pollInterval = 5000) {
    this.scanning = true;
    console.log(`Starting scanner (${pollInterval}ms interval)...\n`);

    while (this.scanning) {
      try {
        const announcements = await this.scan();
        
        for (const announcement of announcements) {
          callback(announcement);
        }

        await this.sleep(pollInterval);
      } catch (error) {
        console.error('Scan error:', error.message);
        await this.sleep(pollInterval);
      }
    }
  }

  /**
   * Stop scanning
   */
  stopScanning() {
    this.scanning = false;
  }

  /**
   * Perform a single scan
   * @returns {Array} Array of stealth address announcements
   */
  async scan() {
    try {
      const transactions = await this.fetchRecentTransactions();
      const announcements = [];

      for (const tx of transactions) {
        const announcement = this.extractAnnouncement(tx);
        if (announcement) {
          announcements.push(announcement);
        }
      }

      return announcements;
    } catch (error) {
      console.error('Error during scan:', error.message);
      return [];
    }
  }

  /**
   * Fetch recent transactions from Mirror Node
   */
  async fetchRecentTransactions() {
    const params = {
      limit: 25,
      order: 'desc'
    };

    if (this.lastScannedTimestamp) {
      params.timestamp = `gt:${this.lastScannedTimestamp}`;
    }

    const response = await axios.get(`${this.mirrorNodeUrl}/api/v1/transactions`, { params });

    const transactions = response.data.transactions || [];

    // Update last scanned timestamp
    if (transactions.length > 0) {
      this.lastScannedTimestamp = transactions[0].consensus_timestamp;
    }

    return transactions;
  }

  /**
   * Extract stealth address announcement from transaction
   */
  extractAnnouncement(tx) {
    try {
      // Check memo for stealth announcement
      if (tx.memo_base64) {
        const memo = Buffer.from(tx.memo_base64, 'base64').toString('utf8');
        const data = JSON.parse(memo);

        if (data.type === 'STEALTH_ANNOUNCEMENT' && data.protocol === 'VANISH-v1') {
          return {
            transactionId: tx.transaction_id,
            consensusTimestamp: tx.consensus_timestamp,
            ephemeralPublicKey: data.ephemeralPublicKey,
            stealthPublicKey: data.stealthPublicKey,
            viewTag: data.viewTag,
            amount: data.amount,
            timestamp: data.timestamp
          };
        }
      }

      return null;
    } catch (error) {
      // Not a valid announcement
      return null;
    }
  }

  /**
   * Query specific account transactions
   * @param {string} accountId - Account ID to query
   */
  async queryAccountTransactions(accountId) {
    try {
      const response = await axios.get(
        `${this.mirrorNodeUrl}/api/v1/accounts/${accountId}/transactions`,
        {
          params: {
            limit: 10,
            order: 'desc'
          }
        }
      );

      return response.data.transactions || [];
    } catch (error) {
      console.error(`Error querying account ${accountId}:`, error.message);
      return [];
    }
  }

  /**
   * Query HCS topic messages
   * @param {string} topicId - Topic ID to query
   */
  async queryTopicMessages(topicId) {
    try {
      const response = await axios.get(
        `${this.mirrorNodeUrl}/api/v1/topics/${topicId}/messages`,
        {
          params: {
            limit: 10,
            order: 'desc'
          }
        }
      );

      return response.data.messages || [];
    } catch (error) {
      console.error(`Error querying topic ${topicId}:`, error.message);
      return [];
    }
  }

  /**
   * Get account balance
   * @param {string} accountId - Account ID
   */
  async getAccountBalance(accountId) {
    try {
      const response = await axios.get(
        `${this.mirrorNodeUrl}/api/v1/accounts/${accountId}`
      );

      return response.data.balance || null;
    } catch (error) {
      console.error(`Error getting balance for ${accountId}:`, error.message);
      return null;
    }
  }

  /**
   * Helper: Sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get scanner statistics
   */
  getStats() {
    return {
      scanning: this.scanning,
      lastScannedTimestamp: this.lastScannedTimestamp,
      mirrorNodeUrl: this.mirrorNodeUrl
    };
  }
}

module.exports = MirrorNodeScanner;
