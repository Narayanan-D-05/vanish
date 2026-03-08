#!/bin/bash
# Optimize Ollama for Faster Responses

echo "🚀 Optimizing Ollama Performance..."
echo ""

# 1. Keep model loaded in memory
echo "1️⃣ Keeping llama3.2 loaded in memory (prevents reload delays)..."
ollama run llama3.2 <<EOF
Hello
EOF
echo "✅ Model preloaded"
echo ""

# 2. Set environment variables for better performance
echo "2️⃣ Setting performance environment variables..."
export OLLAMA_NUM_PARALLEL=4
export OLLAMA_MAX_LOADED_MODELS=1
echo "✅ OLLAMA_NUM_PARALLEL=4 (handle 4 concurrent requests)"
echo "✅ OLLAMA_MAX_LOADED_MODELS=1 (keep model in memory)"
echo ""

# 3. Show current Ollama status
echo "3️⃣ Current Ollama Status:"
ollama list | head -5
echo ""

# 4. Test response time
echo "4️⃣ Testing response time..."
time (echo "What is 2+2?" | ollama run llama3.2)
echo ""

echo "✅ Optimization Complete!"
echo ""
echo "💡 For persistent optimization, add to ~/.bashrc:"
echo "   export OLLAMA_NUM_PARALLEL=4"
echo "   export OLLAMA_MAX_LOADED_MODELS=1"
echo ""
echo "📊 Performance Tips:"
echo "   • First response: 15-30s (model loading)"
echo "   • Subsequent: 2-5s (model in memory)"
echo "   • Keep Ollama running: ollama serve &"
echo "   • Use smaller model: ollama pull llama3.2:1b (faster)"
echo ""
