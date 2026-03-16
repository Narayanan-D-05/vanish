#!/bin/bash
# Quick setup script for Vanish AI Mode

echo "🚀 Vanish AI Mode Setup"
echo "======================="
echo ""
echo "Choose your AI provider:"
echo ""
echo "1) OpenAI GPT-4 (Easiest - 2 minutes)"
echo "   • Get key from: https://platform.openai.com/api-keys"
echo "   • Cost: ~$0.01 per conversation"
echo "   • Best for: Quick setup, most capable"
echo ""
echo "2) Ollama (Most Private - 10 minutes)"
echo "   • Runs on your machine, no cloud"
echo "   • Free forever"
echo "   • Best for: Maximum privacy"
echo ""
echo "3) Skip AI Mode"
echo "   • Use Direct Mode (simple commands)"
echo "   • No AI needed"
echo ""
read -p "Your choice (1/2/3): " choice

case $choice in
  1)
    echo ""
    echo "📝 OpenAI Setup:"
    echo "1. Visit: https://platform.openai.com/api-keys"
    echo "2. Create an API key"
    echo "3. Copy the key (starts with sk-)"
    echo ""
    read -p "Paste your OpenAI API key: " api_key
    
    if [ -n "$api_key" ]; then
      echo "OPENAI_API_KEY=$api_key" >> .env
      echo ""
      echo "✅ OpenAI configured!"
      echo ""
      echo "Starting AI agent..."
      npm run start:user:ai
    else
      echo "❌ No key provided. Setup cancelled."
    fi
    ;;
    
  2)
    echo ""
    echo "📦 Installing Ollama..."
    
    # Install zstd if needed
    if ! command -v zstd &> /dev/null; then
      echo "Installing zstd (required)..."
      sudo apt-get update && sudo apt-get install -y zstd
    fi
    
    # Install Ollama
    curl -fsSL https://ollama.com/install.sh | sh
    
    echo ""
    echo "Starting Ollama server..."
    ollama serve &
    sleep 3
    
    echo ""
    echo "Downloading Llama 3.1 model (4.7GB)..."
    echo "This may take a few minutes..."
    ollama pull llama3.1
    
    echo ""
    echo "✅ Ollama configured!"
    echo ""
    echo "Starting AI agent..."
    npm run start:user:ai
    ;;
    
  3)
    echo ""
    echo "✅ Using Direct Mode (no AI)"
    echo ""
    echo "Starting User Agent..."
    npm run start:user
    ;;
    
  *)
    echo "Invalid choice. Run ./setup-ai.sh again."
    exit 1
    ;;
esac
