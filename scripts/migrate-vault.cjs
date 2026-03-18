const UserAgent = require('./agents/user-agent/index.cjs');

async function migrate() {
    process.env.AGENT_VERBOSE = 'false';
    const agent = new UserAgent();
    
    // loadSecrets() in constructor already detected plaintext and migrated Map
    // Now we just need to call saveSecrets() to write the encrypted file.
    console.log('🛡️  Encrypting legacy vault...');
    agent.saveSecrets();
    console.log('✅ Migration complete. secrets.json is now encrypted with AES-256-GCM.');
    process.exit(0);
}

migrate();
