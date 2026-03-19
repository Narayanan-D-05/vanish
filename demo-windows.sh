#!/bin/bash
# Vanish Demo - Three Window Setup (Unix/Mac)
# This script opens three terminals for the complete demo

echo "=========================================="
echo "   VANISH PRIVACY DEMO - Three Windows"
echo "=========================================="
echo ""
echo "Window 1: Pool Manager (The Settlement Layer)"
echo "Window 2: Sender (Account 0.0.8119040)"
echo "Window 3: Receiver (Account 0.0.8114260)"
echo ""
read -p "Press Enter to start..."

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    gnome-terminal --title="Pool Manager" -- bash -c "echo 'Pool Manager Starting...'; npm run start:pool; exec bash" &
    sleep 3
    gnome-terminal --title="Sender (0.0.8119040)" -- bash -c "echo 'Sender Agent Starting...'; npm run start:vanish -- 0.0.8119040 302e020100300506032b657004220420a7940d2086e3cbf6fb541e55b5b9b6c3001b1164eb0f2d34ef51f2649174d171; exec bash" &
    sleep 3
    gnome-terminal --title="Receiver (0.0.8114260)" -- bash -c "echo 'Receiver Agent Starting...'; npm run start:vanish -- 0.0.8114260 302e020100300506032b65700422042041484232ac82ef67ff45e3d45424ef64429583060d72222b20110c9cb187f11b; exec bash" &
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    osascript -e 'tell application "Terminal" to do script "cd '"$(pwd)"'; echo Pool Manager Starting...; npm run start:pool"' &
    sleep 3
    osascript -e 'tell application "Terminal" to do script "cd '"$(pwd)"'; echo Sender Agent Starting...; npm run start:vanish -- 0.0.8119040 302e020100300506032b657004220420a7940d2086e3cbf6fb541e55b5b9b6c3001b1164eb0f2d34ef51f2649174d171"' &
    sleep 3
    osascript -e 'tell application "Terminal" to do script "cd '"$(pwd)"'; echo Receiver Agent Starting...; npm run start:vanish -- 0.0.8114260 302e020100300506032b65700422042041484232ac82ef67ff45e3d45424ef64429583060d72222b20110c9cb187f11b"' &
else
    echo "Unknown OS. Please open three terminals manually and run:"
    echo "  Terminal 1: npm run start:pool"
    echo "  Terminal 2: npm run start:vanish -- 0.0.8119040 302e020100300506032b657004220420a7940d2086e3cbf6fb541e55b5b9b6c3001b1164eb0f2d34ef51f2649174d171"
    echo "  Terminal 3: npm run start:vanish -- 0.0.8114260 302e020100300506032b65700422042041484232ac82ef67ff45e3d45424ef64429583060d72222b20110c9cb187f11b"
    exit 1
fi

echo ""
echo "=========================================="
echo "Demo windows opened!"
echo ""
echo "Demo Flow:"
echo "1. In Sender window:   balance"
echo "2. In Sender window:   transfer 0.0.8114260 2"
echo "3. Watch Pool Manager process the batch"
echo "4. In Receiver window: balance (should show 2 HBAR)"
echo "=========================================="
