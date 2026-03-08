# Setting Up AI Chat Mode for Vanish

## Quick Start - Choose Your AI Provider

Vanish AI Mode supports multiple LLM providers. Choose the one that fits your needs:

---

## Option 1: OpenAI GPT-4 (Easiest, Cloud)

**Best for**: Quick setup, most capable AI  
**Privacy**: Data sent to OpenAI servers

### Setup:
```bash
# 1. Get API key from https://platform.openai.com/api-keys

# 2. Add to .env file:
echo "OPENAI_API_KEY=sk-your-key-here" >> .env

# 3. Start AI agent:
npm run start:user:ai
```

**Example conversation:**
```
💬 You: Shield 100 HBAR into the privacy pool
🤖 AI: I'll help you shield 100 HBAR. Generating ZK-proof locally...
      [generates proof]
      ✅ Proof submitted! Here's your secret: 0x1234...
      IMPORTANT: Save this secret to withdraw later!
```

---

## Option 2: Ollama (Privacy-First, Local)

**Best for**: Maximum privacy, no data sent to cloud  
**Privacy**: Everything runs on your machine

### Setup:
```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Start Ollama server
ollama serve &

# 3. Pull a model (choose one):
ollama pull llama3.1        # Recommended, 4.7GB
ollama pull mistral         # Alternative, 4.1GB  
ollama pull phi3           # Lightweight, 2.3GB

# 4. Start AI agent:
npm run start:user:ai
```

**Note**: Requires ~8GB RAM and will auto-detect Ollama

---

## Option 3: Anthropic Claude (Cloud, Alternative)

**Best for**: Claude's reasoning capabilities  
**Privacy**: Data sent to Anthropic servers

### Setup:
```bash
# 1. Get API key from https://console.anthropic.com/

# 2. Install Anthropic package:
npm install @langchain/anthropic --legacy-peer-deps

# 3. Add to .env:
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" >> .env

# 4. Start AI agent:
npm run start:user:ai
```

---

## Comparison

| Provider | Privacy | Cost | Setup Time | Capabilities |
|----------|---------|------|------------|--------------|
| **OpenAI** | ⭐⭐ | $$ | 2 min | ⭐⭐⭐⭐⭐ |
| **Ollama** | ⭐⭐⭐⭐⭐ | Free | 10 min | ⭐⭐⭐⭐ |
| **Claude** | ⭐⭐ | $$ | 5 min | ⭐⭐⭐⭐⭐ |

---

## Testing Your Setup

### Test 1: Basic AI Response
```bash
npm run start:user:ai
```
```
💬 You: Hello
🤖 AI: Hello! I'm your Vanish privacy agent...
```

### Test 2: Check Balance
```
💬 You: What's my HBAR balance?
🤖 AI: Checking your balance for account 0.0.8119040...
      You have 975.99 HBAR available.
```

### Test 3: Shield Funds
```
💬 You: Shield 50 HBAR
🤖 AI: I'll shield 50 HBAR for you. This will:
      1. Generate a ZK-proof locally
      2. Submit to pool manager
      3. Batch with 5+ other transactions for privacy
      
      Generating proof... [Working]
      ✅ Done! Your secret: 0xabc123...
```

---

## Troubleshooting

### Error: "No LLM available"
**Solution**: You haven't configured any AI provider. Choose one above and set it up.

### Error: "OPENAI_API_KEY not found"
**Solution**: 
```bash
# Check if key is in .env
grep OPENAI_API_KEY .env

# If not, add it:
echo "OPENAI_API_KEY=your-key-here" >> .env
```

### Error: "Ollama connection refused"
**Solution**:
```bash
# Check if Ollama is running:
curl http://localhost:11434/api/tags

# If not, start it:
ollama serve &
```

### AI responses are slow
**Solution**:
- OpenAI: Normal (network latency)
- Ollama: Upgrade RAM or use smaller model (phi3)
- Claude: Normal (network latency)

---

## Privacy Considerations

### OpenAI / Claude (Cloud):
- ❌ Your questions sent to their servers
- ❌ They may store conversation history
- ✅ Your Hedera private keys NEVER sent
- ✅ ZK-proofs generated locally

**Recommendation**: Don't include sensitive wallet details in questions.

### Ollama (Local):
- ✅ Everything runs on your machine
- ✅ No data sent anywhere
- ✅ Complete privacy
- ✅ Works offline

**Recommendation**: Best for maximum privacy!

---

## Advanced: Multiple Models

You can switch between providers without reinstalling:

```bash
# Use OpenAI
export OPENAI_API_KEY=sk-your-key
npm run start:user:ai

# Use Ollama (unset OpenAI key first)
unset OPENAI_API_KEY
ollama serve &
npm run start:user:ai

# Use Claude
export ANTHROPIC_API_KEY=sk-ant-your-key
npm run start:user:ai
```

The agent will auto-detect in this priority:
1. Ollama (if running) - Privacy first!
2. OpenAI (if API key set)
3. Claude (if API key set)

---

## Without AI Mode

If you prefer no AI at all, use Direct Mode:
```bash
npm run start:user   # Simple commands, no AI needed

⚡ Command: shield 100
⚡ Command: status
⚡ Command: stealth
```

---

## Next Steps

1. Choose your AI provider (OpenAI recommended for testing)
2. Set up API keys
3. Run `npm run start:user:ai`
4. Try natural language commands!

**Questions?** Check the main [README.md](../../README.md) or [GETTING_STARTED.md](../GETTING_STARTED.md)
