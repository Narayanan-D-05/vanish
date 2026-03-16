# 🤖 Ollama AI Chat - Complete Guide

## ✅ What's Working

Your Vanish AI agent is now fully operational with **Ollama** (local AI):

- ✅ **Ollama**: v0.17.7 running
- ✅ **Model**: Llama 3.2 (2.0 GB) loaded
- ✅ **Privacy Tools**: 5 tools integrated
- ✅ **Mode**: 100% local (no cloud APIs needed)

---

## 🎯 Three Ways to Use AI Chat

### 1. Interactive AI Chat (Recommended)

```bash
./start-ai-chat.sh
# OR
npm run start:user:ai
```

**Try these natural language commands:**
- "What is the pool status?"
- "Generate a stealth address for me"
- "Shield 50 HBAR into the privacy pool"
- "How does zero-knowledge proof privacy work?"
- "Explain the anonymity set"

### 2. Quick Demo (See AI in Action)

```bash
node quick-ai-demo.cjs
```

Shows a single AI interaction in ~20 seconds.

### 3. Full Demo Conversation

```bash
node demo-ai-conversation.cjs
```

Runs 3 sample questions to demonstrate capabilities.

---

## ⚡ Performance Optimization

### Current Performance
- **First response**: 15-30 seconds (model loading into memory)
- **Subsequent responses**: 2-5 seconds (model cached)

### Optimize for Speed

Run the optimization script:

```bash
./optimize-ollama.sh
```

**What it does:**
1. Preloads model into memory
2. Sets parallel processing
3. Tests response time
4. Shows current status

### Manual Optimization

Add to `~/.bashrc` for persistent settings:

```bash
export OLLAMA_NUM_PARALLEL=4
export OLLAMA_MAX_LOADED_MODELS=1
```

**Alternative: Faster Model**

For quicker responses, use the 1B parameter model:

```bash
ollama pull llama3.2:1b
```

Then update [agents/user-agent/ai-mode.cjs](agents/user-agent/ai-mode.cjs#L73):
```javascript
model: 'llama3.2:1b',  // 3x faster!
```

---

## 📊 Demo Conversation Example

Here's what a typical AI conversation looks like:

```
💬 You: What is the pool status?

🤔 Thinking...

🔧 Executing: query_pool_status...

🤖 AI: The privacy pool currently has 127 total deposits 
with an anonymity set of 89 participants. There are 3 out
of 5 pending proofs waiting to be batched. The next batch 
will execute in 12-27 minutes with random timing to prevent
correlation attacks.

---------

💬 You: Generate a stealth address

🤔 Thinking...

🔧 Executing: generate_stealth_address...

🤖 AI: I've generated a fresh stealth address for you:

Address: 0x4f76ffee6678349c07b08a921d305001118382d7
Ephemeral Key: 0x3436593adc417602edd2cb469c6d86a3...

⚠️ IMPORTANT: Save these keys:
• View Key: 0xd0b870b7a0eea8dff0cde03fe9965bb6...
• Spend Key: 0xd7a6ec8d99854dc432d1460a39630d0e...

Share the ephemeral key with anyone who wants to send you
funds privately!

---------

💬 You: How does zero-knowledge proof privacy work?

🤖 AI: Zero-knowledge proofs (ZK-SNARKs) allow you to prove
you own funds without revealing which specific deposit is 
yours. Here's how:

1. When you shield funds, you generate a secret commitment
2. This commitment goes into a Merkle tree with others
3. To withdraw, you prove "I know a secret in this tree"
4. The proof reveals NOTHING about which deposit is yours
5. All computations happen locally on your device

Your secrets never leave your computer, and observers cannot
link deposits to withdrawals. This is mathematically secure
cryptography, not just obfuscation.
```

---

## 🆚 AI Mode vs Direct Mode

| Feature | Direct Mode | AI Mode (Ollama) |
|---------|-------------|------------------|
| **Interface** | Simple commands | Natural language |
| **Speed** | Instant | 2-30s per query |
| **Setup** | Zero (works now) | Ollama required |
| **Privacy** | 100% local | 100% local |
| **Examples** | `status`, `shield 50` | "Shield 50 HBAR please" |

**Both modes have full functionality** - AI just adds conversational UX.

---

## 🎮 Interactive Commands

When you run `npm run start:user:ai`, you can:

**Privacy Operations:**
- Shield HBAR: "I want to shield 100 HBAR"
- Stealth address: "Generate a stealth address"
- Pool status: "How big is the anonymity set?"

**General Questions:**
- "How does this work?"
- "What's a zero-knowledge proof?"
- "Why do I need to save my secret?"

**Hedera Operations** (if Hedera Kit loads):
- "What's my balance?"
- "Transfer 10 HBAR to 0.0.123456"
- "Check account 0.0.8119040"

---

## 🛠️ Troubleshooting

### Slow First Response
**Normal!** First query loads model into memory (15-30s). Subsequent queries are fast (2-5s).

**Fix:** Run `./optimize-ollama.sh` to keep model loaded.

### "Ollama not available"
Check if running:
```bash
curl http://localhost:11434
ollama list
```

Restart if needed:
```bash
pkill ollama
ollama serve &
```

### Model Not Found
Pull the model:
```bash
ollama pull llama3.2
```

### Out of Memory
Use smaller model:
```bash
ollama pull llama3.2:1b
```

---

## 🚀 Quick Start (5 seconds)

```bash
# Option 1: Use helper script
./start-ai-chat.sh

# Option 2: Direct command
npm run start:user:ai
```

Type your question, press Enter, wait for response!

---

## 📈 Next Steps

1. **Try it now**: `./start-ai-chat.sh`
2. **Optimize**: `./optimize-ollama.sh`
3. **Test end-to-end**: Shield funds → Pool batches → Claim with receiver
4. **Production**: Deploy verifier contracts to mainnet

---

**Your AI privacy agent is ready!** 🎉

For non-AI usage, Direct Mode still works instantly:
```bash
npm run start:user
```
