const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Professional Circuit Build Script for Vanish (2026)
 * - Downloads Powers of Tau ceremony file
 * - Compiles circuits with circom2
 * - Generates proving/verification keys
 * - Creates Solidity verifier contracts
 */

const CIRCUITS_DIR = path.join(__dirname, 'circuits');
const PTAU_FILE = 'powersOfTau28_hez_final_21.ptau';
const PTAU_URL = `https://storage.googleapis.com/zkevm/ptau/${PTAU_FILE}`;

function runCommand(command, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    console.log(`\n  $ ${command}`);
    exec(command, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error(stderr);
        reject(error);
      } else {
        if (stdout) console.log(stdout);
        resolve(stdout);
      }
    });
  });
}

async function downloadPtau() {
  const ptauPath = path.join(CIRCUITS_DIR, PTAU_FILE);

  if (fs.existsSync(ptauPath)) {
    console.log('✅ Powers of Tau file already exists');
    return;
  }

  console.log('📥 Downloading Powers of Tau ceremony file (~50MB)...');
  console.log('   This is a one-time download for trusted setup');

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(ptauPath);
    https.get(PTAU_URL, (response) => {
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const percent = ((downloaded / totalSize) * 100).toFixed(1);
        process.stdout.write(`\r   Progress: ${percent}%`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('\n✅ Powers of Tau downloaded successfully\n');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(ptauPath);
      reject(err);
    });
  });
}

async function compileCircuit(name) {
  console.log(`\n🔧 Compiling ${name}.circom...`);

  const inputFile = path.join(CIRCUITS_DIR, `${name}.circom`);
  const outputDir = path.join(CIRCUITS_DIR, 'build');
  const includeDir = path.join(__dirname, 'node_modules');

  // Compile with circom2 (increase memory limit for 1.2M+ constraint circuits)
  await runCommand(
    `node --max-old-space-size=8192 node_modules/circom2/cli.js "${inputFile}" --r1cs --wasm --sym -o "${outputDir}" -l "${includeDir}"`,
    __dirname
  );

  console.log(`✅ ${name}.circom compiled`);
}

async function generateZkey(circuitName) {
  console.log(`\n🔑 Generating proving key for ${circuitName}...`);

  const r1csFile = path.join(CIRCUITS_DIR, 'build', `${circuitName}.r1cs`);
  const ptauFile = path.join(CIRCUITS_DIR, PTAU_FILE);
  const zkeyFile = path.join(CIRCUITS_DIR, `${circuitName}_final.zkey`);

  // Phase 1: Setup
  await runCommand(
    `npx snarkjs groth16 setup "${r1csFile}" "${ptauFile}" "${zkeyFile}"`,
    __dirname
  );

  console.log(`✅ Proving key generated: ${circuitName}_final.zkey`);
}

async function exportVerificationKey(circuitName) {
  console.log(`\n📤 Exporting verification key for ${circuitName}...`);

  const zkeyFile = path.join(CIRCUITS_DIR, `${circuitName}_final.zkey`);
  const vkeyFile = path.join(CIRCUITS_DIR, `${circuitName}_verification_key.json`);

  await runCommand(
    `npx snarkjs zkey export verificationkey "${zkeyFile}" "${vkeyFile}"`,
    __dirname
  );

  console.log(`✅ Verification key exported: ${circuitName}_verification_key.json`);
}

async function generateSolidityVerifier(circuitName) {
  console.log(`\n🔨 Generating Solidity verifier for ${circuitName}...`);

  const zkeyFile = path.join(CIRCUITS_DIR, `${circuitName}_final.zkey`);
  const contractFile = path.join(__dirname, 'contracts', `${circuitName}Verifier.sol`);

  await runCommand(
    `npx snarkjs zkey export solidityverifier "${zkeyFile}" "${contractFile}"`,
    __dirname
  );

  console.log(`✅ Solidity verifier generated: contracts/${circuitName}Verifier.sol`);
}

async function buildCircuits() {
  console.log('🚀 Vanish Circuit Build System (2026)\n');
  console.log('═'.repeat(60));

  try {
    // Step 1: Download Powers of Tau
    await downloadPtau();

    // Step 2: Compile circuits
    const circuitsToBuild = [
      { name: 'shield', file: 'shield.circom' },
      { name: 'withdraw', file: 'withdraw.circom' },
      { name: 'exclusion', file: 'exclusion.circom' }
    ];

    for (const circuit of circuitsToBuild) {
      console.log('\n' + '─'.repeat(60));
      await compileCircuit(circuit.name);
      await generateZkey(circuit.name);
      await exportVerificationKey(circuit.name);
      await generateSolidityVerifier(circuit.name);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('\n🎉 BUILD COMPLETE!\n');
    console.log('Generated files:');
    console.log('  - circuits/shield_final.zkey');
    console.log('  - circuits/shield_verification_key.json');
    console.log('  - contracts/shieldVerifier.sol');
    console.log('  - circuits/withdraw_final.zkey');
    console.log('  - circuits/withdraw_verification_key.json');
    console.log('  - contracts/withdrawVerifier.sol\n');
    console.log('Next steps:');
    console.log('  1. Deploy verifier contracts: npx hardhat compile');
    console.log('  2. Update .env with PROVING_KEY_PATH=./circuits/shield_final.zkey');
    console.log('  3. Test agents: npm run start:user\n');

  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  buildCircuits();
}

module.exports = { buildCircuits };
