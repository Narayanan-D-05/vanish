const crypto = require('crypto');
const { keccak256 } = require('js-sha3');
const nacl = require('tweetnacl');
const { PrivateKey, PublicKey, AccountId } = require('@hashgraph/sdk');

/**
 * ERC-5564 Stealth Address Implementation for Hedera
 * Generates one-time "ghost" accounts for privacy-preserving transfers
 */

class StealthAddressGenerator {
  /**
   * Generate a stealth meta-address (permanent receiving address)
   * @returns {Object} { spendingKey, viewingKey, metaAddress }
   */
  static generateMetaAddress() {
    const spendingKeyPair = nacl.box.keyPair();
    const viewingKeyPair = nacl.box.keyPair();

    return {
      spendingPrivateKey: Buffer.from(spendingKeyPair.secretKey).toString('hex'),
      spendingPublicKey: Buffer.from(spendingKeyPair.publicKey).toString('hex'),
      viewingPrivateKey: Buffer.from(viewingKeyPair.secretKey).toString('hex'),
      viewingPublicKey: Buffer.from(viewingKeyPair.publicKey).toString('hex'),
      metaAddress: this.encodeMetaAddress(
        Buffer.from(spendingKeyPair.publicKey),
        Buffer.from(viewingKeyPair.publicKey)
      )
    };
  }

  /**
   * Encode meta-address from public keys
   */
  static encodeMetaAddress(spendingPubKey, viewingPubKey) {
    return Buffer.concat([
      Buffer.from('VANISH:', 'utf8'),
      spendingPubKey,
      viewingPubKey
    ]).toString('base64');
  }

  /**
   * Decode meta-address to extract public keys
   */
  static decodeMetaAddress(metaAddress) {
    const decoded = Buffer.from(metaAddress, 'base64');
    const prefix = decoded.slice(0, 7).toString('utf8');
    
    if (prefix !== 'VANISH:') {
      throw new Error('Invalid meta-address format');
    }

    return {
      spendingPublicKey: decoded.slice(7, 39),
      viewingPublicKey: decoded.slice(39, 71)
    };
  }

  /**
   * Generate a stealth address for a receiver
   * @param {string} receiverMetaAddress - Base64 encoded meta-address
   * @returns {Object} { stealthAddress, ephemeralPublicKey, viewTag }
   */
  static generateStealthAddress(receiverMetaAddress) {
    const { spendingPublicKey, viewingPublicKey } = this.decodeMetaAddress(receiverMetaAddress);

    // Generate ephemeral key pair
    const ephemeralKeyPair = nacl.box.keyPair();

    // Compute shared secret using Diffie-Hellman
    const sharedSecret = nacl.box.before(
      spendingPublicKey,
      ephemeralKeyPair.secretKey
    );

    // Derive stealth private key
    const stealthPrivateKeyHash = keccak256(
      Buffer.concat([
        Buffer.from(sharedSecret),
        viewingPublicKey
      ])
    );

    // Create Hedera PrivateKey from derived hash
    const stealthPrivateKey = PrivateKey.fromBytes(
      Buffer.from(stealthPrivateKeyHash.slice(0, 64), 'hex')
    );

    // Generate stealth public key and account ID
    const stealthPublicKey = stealthPrivateKey.publicKey;

    // Compute view tag for efficient scanning (first 4 bytes of shared secret)
    const viewTag = Buffer.from(sharedSecret).slice(0, 4).toString('hex');

    return {
      stealthPrivateKey: stealthPrivateKey.toString(),
      stealthPublicKey: stealthPublicKey.toString(),
      ephemeralPublicKey: Buffer.from(ephemeralKeyPair.publicKey).toString('hex'),
      viewTag,
      sharedSecretHash: stealthPrivateKeyHash
    };
  }

  /**
   * Scan for stealth addresses meant for this receiver
   * @param {string} viewingPrivateKey - Receiver's viewing private key
   * @param {Array} announcements - Array of stealth address announcements from chain
   * @returns {Array} Detected stealth addresses
   */
  static scanForStealthAddresses(viewingPrivateKey, spendingPrivateKey, announcements) {
    const detectedAddresses = [];
    const viewingKey = Buffer.from(viewingPrivateKey, 'hex');
    const spendingKey = Buffer.from(spendingPrivateKey, 'hex');

    for (const announcement of announcements) {
      try {
        const ephemeralPubKey = Buffer.from(announcement.ephemeralPublicKey, 'hex');
        
        // Compute shared secret
        const sharedSecret = nacl.box.before(ephemeralPubKey, spendingKey);

        // Derive stealth private key
        const stealthPrivateKeyHash = keccak256(
          Buffer.concat([
            Buffer.from(sharedSecret),
            viewingKey
          ])
        );

        // Check if view tag matches (optimization)
        const computedViewTag = Buffer.from(sharedSecret).slice(0, 4).toString('hex');
        
        if (computedViewTag === announcement.viewTag) {
          const stealthPrivateKey = PrivateKey.fromBytes(
            Buffer.from(stealthPrivateKeyHash.slice(0, 64), 'hex')
          );

          detectedAddresses.push({
            stealthAddress: announcement.stealthAddress,
            stealthPrivateKey: stealthPrivateKey.toString(),
            amount: announcement.amount,
            timestamp: announcement.timestamp
          });
        }
      } catch (error) {
        console.error('Error scanning announcement:', error.message);
      }
    }

    return detectedAddresses;
  }

  /**
   * Create announcement data for publishing to HCS
   */
  static createAnnouncement(stealthPublicKey, ephemeralPublicKey, viewTag, amount) {
    return {
      stealthPublicKey,
      ephemeralPublicKey,
      viewTag,
      amount: amount.toString(),
      timestamp: Date.now(),
      protocol: 'VANISH-v1'
    };
  }
}

module.exports = StealthAddressGenerator;
