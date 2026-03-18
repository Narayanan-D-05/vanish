const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * VaultWrapper - Blinded Secret Management for AI Agents (2026)
 * 
 * Provides:
 * 1. AES-256-GCM Encryption for secrets at rest.
 * 2. 'Blinding' logic: AI only sees Reference IDs during normal operations.
 * 3. Secure Fetch: Real secrets are only decrypted during ZK-proof generation.
 */
class VaultWrapper {
    constructor(secretsPath) {
        this.secretsPath = secretsPath;
        this.ALGORITHM = 'aes-256-gcm';
        this.IV_LENGTH = 16;
        this.SALT_LENGTH = 64;
    }

    /**
     * Derive a key from a master password
     */
    deriveKey(password, salt) {
        return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    }

    /**
     * Encrypt the vault
     */
    encrypt(data, password) {
        const salt = crypto.randomBytes(this.SALT_LENGTH);
        const iv = crypto.randomBytes(this.IV_LENGTH);
        const key = this.deriveKey(password, salt);
        
        const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();

        const payload = {
            version: '2026.1',
            salt: salt.toString('hex'),
            iv: iv.toString('hex'),
            tag: tag.toString('hex'),
            data: encrypted.toString('hex')
        };

        fs.writeFileSync(this.secretsPath, JSON.stringify(payload, null, 2));
        return true;
    }

    /**
     * Decrypt the vault
     */
    decrypt(password) {
        if (!fs.existsSync(this.secretsPath)) return {};
        
        try {
            const payload = JSON.parse(fs.readFileSync(this.secretsPath, 'utf8'));
            
            // If it's a legacy plaintext file, return as is (to allow initial migration)
            if (!payload.tag) return payload;

            const salt = Buffer.from(payload.salt, 'hex');
            const iv = Buffer.from(payload.iv, 'hex');
            const tag = Buffer.from(payload.tag, 'hex');
            const encrypted = Buffer.from(payload.data, 'hex');
            
            const key = this.deriveKey(password, salt);
            const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
            decipher.setAuthTag(tag);
            
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            return JSON.parse(decrypted.toString('utf8'));
        } catch (error) {
            throw new Error('Vault Decryption Failed: Invalid Password or Corrupted Data.');
        }
    }

    /**
     * 'Blinded' view for the AI Agent
     * Strips raw secrets and nullifiers, leaving only Reference IDs and Amounts.
     */
    getBlindedVault(vaultData) {
        const blinded = {};
        for (const [id, data] of Object.entries(vaultData)) {
            blinded[id] = {
                id: id,
                amount: data.amount,
                timestamp: data.timestamp,
                used: data.used,
                status: '🔒 Reference Only (Secret Blinded)'
            };
        }
        return blinded;
    }
}

module.exports = VaultWrapper;
