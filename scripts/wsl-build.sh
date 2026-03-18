#!/bin/bash
# Professional WSL Build Script for Vanish ZK Circuits (2026)

set -e

# Always run from the project root (works whether called from Windows or WSL)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "📂 Working directory: $PROJECT_ROOT"

# Configuration
CIRCUITS_DIR="./circuits"
BUILD_DIR="./circuits/build"
PTAU_FILE="powersOfTau28_hez_final_21.ptau"

# Use local circom2 (Rust-based, supports pragma circom 2.x)
CIRCOM="node ./node_modules/circom2/cli.js"

mkdir -p "${BUILD_DIR}"

# Verify circom2 is available
echo "🔍 Checking circom2..."
$CIRCOM --version || { echo "❌ circom2 not found in node_modules. Run 'npm install' first."; exit 1; }

# Check PTAU file
if [ ! -f "${CIRCUITS_DIR}/${PTAU_FILE}" ]; then
    echo "❌ ${PTAU_FILE} not found in circuits/. Please ensure it exists."
    exit 1
fi
echo "✅ PTAU file found: ${CIRCUITS_DIR}/${PTAU_FILE}"

# Function to build a single circuit
build_circuit() {
    local name=$1
    echo ""
    echo "════════════════════════════════════════"
    echo "🔧 Building: ${name}.circom"
    echo "════════════════════════════════════════"

    # 1. Compile circom → r1cs + wasm
    echo "   [1/4] Compiling..."
    $CIRCOM "${CIRCUITS_DIR}/${name}.circom" --r1cs --wasm --sym \
        -o "${BUILD_DIR}" \
        -l "./node_modules"

    # 2. Groth16 setup (r1cs + ptau → zkey)
    echo "   [2/4] Groth16 setup..."
    npx snarkjs groth16 setup \
        "${BUILD_DIR}/${name}.r1cs" \
        "${CIRCUITS_DIR}/${PTAU_FILE}" \
        "${CIRCUITS_DIR}/${name}_final.zkey"

    # 3. Export verification key
    echo "   [3/4] Exporting verification key..."
    npx snarkjs zkey export verificationkey \
        "${CIRCUITS_DIR}/${name}_final.zkey" \
        "${CIRCUITS_DIR}/${name}_verification_key.json"

    # 4. Export Solidity verifier
    echo "   [4/4] Exporting Solidity verifier..."
    npx snarkjs zkey export solidityverifier \
        "${CIRCUITS_DIR}/${name}_final.zkey" \
        "./contracts/${name}Verifier.sol"

    echo "✅ ${name} — DONE"
}

# Build only the withdraw circuit (the one we changed)
# Uncomment shield/exclusion only if you want to fully rebuild those too
build_circuit "withdraw"
# build_circuit "shield"
# build_circuit "exclusion"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🎉 CIRCUIT BUILD COMPLETE"
echo "Generated:"
echo "  - circuits/withdraw_final.zkey"
echo "  - circuits/withdraw_verification_key.json"
echo "  - contracts/withdrawVerifier.sol"
echo "  - contracts/shieldVerifier.sol"
