const { Client, TopicMessageSubmitTransaction, TopicMessageQuery } = require('@hashgraph/sdk');
const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');

/**
 * Hedera Consensus Service (HCS) Private Messaging
 * Encrypted proof-of-payment and selective disclosure
 */

class HCSPrivateMessaging {
  constructor(client) {
    this.client = client;
  }

  /**
   * Encrypt data with receiver's public key
   * @param {string} receiverPublicKey - Hex encoded public key
   * @param {Object} data - Data to encrypt
   * @returns {string} Encrypted message (base64)
   */
  static encryptForReceiver(receiverPublicKey, data) {
    const receiverPubKeyBytes = Buffer.from(receiverPublicKey, 'hex');
    const dataString = JSON.stringify(data);
    const dataBytes = naclUtil.decodeUTF8(dataString);

    // Generate ephemeral key pair for this message
    const ephemeralKeyPair = nacl.box.keyPair();

    // Encrypt using receiver's public key and ephemeral private key
    const nonce = nacl.randomBytes(24);
    const encrypted = nacl.box(
      dataBytes,
      nonce,
      receiverPubKeyBytes,
      ephemeralKeyPair.secretKey
    );

    // Package: ephemeralPubKey + nonce + encrypted data
    const payload = {
      ephemeralPublicKey: Buffer.from(ephemeralKeyPair.publicKey).toString('hex'),
      nonce: Buffer.from(nonce).toString('hex'),
      encrypted: Buffer.from(encrypted).toString('hex'),
      timestamp: Date.now(),
      version: 'VANISH-v1'
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Decrypt message with receiver's private key
   * @param {string} encryptedMessage - Base64 encoded encrypted package
   * @param {string} receiverPrivateKey - Hex encoded private key
   * @returns {Object} Decrypted data
   */
  static decryptMessage(encryptedMessage, receiverPrivateKey) {
    const packageData = JSON.parse(
      Buffer.from(encryptedMessage, 'base64').toString('utf8')
    );

    const ephemeralPubKey = Buffer.from(packageData.ephemeralPublicKey, 'hex');
    const nonce = Buffer.from(packageData.nonce, 'hex');
    const encrypted = Buffer.from(packageData.encrypted, 'hex');
    const receiverPrivKeyBytes = Buffer.from(receiverPrivateKey, 'hex');

    // Decrypt using receiver's private key and sender's ephemeral public key
    const decrypted = nacl.box.open(
      encrypted,
      nonce,
      ephemeralPubKey,
      receiverPrivKeyBytes
    );

    if (!decrypted) {
      throw new Error('Decryption failed - invalid key or corrupted data');
    }

    return JSON.parse(naclUtil.encodeUTF8(decrypted));
  }

  /**
   * Send encrypted proof of payment to HCS topic
   * @param {string} topicId - HCS Topic ID (e.g., "0.0.12345")
   * @param {string} receiverPublicKey - Receiver's public key for encryption
   * @param {Object} proofData - Proof data to send
   */
  async sendPrivateProof(topicId, receiverPublicKey, proofData) {
    const encryptedProof = HCSPrivateMessaging.encryptForReceiver(receiverPublicKey, {
      type: 'PROOF_OF_ORIGIN',
      senderCommitment: proofData.senderCommitment, // zk commitment, not identity
      amount: proofData.amount,
      stealthAddress: proofData.stealthAddress,
      timestamp: Date.now(),
      memo: proofData.memo || 'Private Transfer',
      nullifierHash: proofData.nullifierHash
    });

    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(encryptedProof);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    return {
      transactionId: response.transactionId.toString(),
      status: receipt.status.toString(),
      sequenceNumber: receipt.topicSequenceNumber.toString()
    };
  }

  /**
   * Subscribe to HCS topic and decrypt messages
   * @param {string} topicId - HCS Topic ID
   * @param {string} receiverPrivateKey - Private key for decryption
   * @param {Function} callback - Callback function for each decrypted message
   */
  subscribeToPrivateMessages(topicId, receiverPrivateKey, callback) {
    new TopicMessageQuery()
      .setTopicId(topicId)
      .subscribe(this.client, null, (message) => {
        try {
          const encryptedMessage = Buffer.from(message.contents).toString('utf8');
          const decryptedData = HCSPrivateMessaging.decryptMessage(
            encryptedMessage,
            receiverPrivateKey
          );

          callback({
            sequenceNumber: message.sequenceNumber.toString(),
            consensusTimestamp: message.consensusTimestamp.toString(),
            data: decryptedData,
            runningHash: Buffer.from(message.runningHash).toString('hex')
          });
        } catch (error) {
          // Message not meant for us or decryption failed
          console.debug('Could not decrypt message:', error.message);
        }
      });
  }

  /**
   * Create selective disclosure proof
   * @param {Object} transactionData - Transaction data to disclose
   * @returns {Object} Disclosure proof
   */
  static createSelectiveDisclosure(transactionData) {
    return {
      type: 'SELECTIVE_DISCLOSURE',
      sender: transactionData.senderVault,
      receiver: transactionData.receiverVault,
      amount: transactionData.amount,
      timestamp: transactionData.timestamp,
      transactionHash: transactionData.transactionHash,
      memo: transactionData.memo,
      signature: transactionData.signature, // Signed by sender's private key
      proof: 'This transaction was initiated by the sender'
    };
  }

  /**
   * Send public announcement (stealth address published to chain)
   * @param {string} topicId - Public announcement topic ID
   * @param {Object} announcement - Stealth address announcement
   */
  async sendPublicAnnouncement(topicId, announcement) {
    const message = JSON.stringify({
      type: 'STEALTH_ANNOUNCEMENT',
      ...announcement
    });

    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message);

    const response = await tx.execute(this.client);
    return response.transactionId.toString();
  }
}

module.exports = HCSPrivateMessaging;
