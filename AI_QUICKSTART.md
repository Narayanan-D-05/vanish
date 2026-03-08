# 🎨 Vanish AI Chat - Quick Reference

## ✨ Get Started in 2 Minutes

### The Easiest Way (OpenAI):

```bash
# 1. Get free API key: https://platform.openai.com/api-keys
# 2. Run the setup script:
./setup-ai.sh

# Or manually:
echo "OPENAI_API_KEY=sk-your-key-here" >> .env
npm run start:user:ai
```

---

## 💬 Example Conversations

### Natural Language Commands:

```
💬 You: What's my balance?
🤖 AI: Your account 0.0.8119040 has 975.99 HBAR

💬 You: Shield 100 HBAR for privacy
🤖 AI: Generating ZK-proof to shield 100 HBAR...
      ✅ Done! Secret: 0xabc...def
      Save this secret to withdraw later!

💬 You: Generate a stealth address
🤖 AI: Created stealth address: 0x123...456
      Share the ephemeral key: 0x789...abc

💬 You: How many people are in the privacy pool?
🤖 AI: The anonymity set currently has 89 participants,
      with 3 pending proofs in the queue.

💬 You: Send 50 HBAR to 0.0.123456
🤖 AI: Transferring 50 HBAR to 0.0.123456...
      ✅ Transaction successful!
```

---

## 🚀 Three Ways to Use Vanish

### 1. AI Chat Mode (Natural Language)
```bash
npm run start:user:ai

💬 You: Shield 100 HBAR
💬 You: What's the anonymity set size?
💬 You: Generate a stealth address
```
**Requires**: OpenAI key OR Ollama installed  
**Best for**: Conversational interaction, complex questions

---

### 2. Direct Mode (Simple Commands)
```bash
npm run start:user

⚡ Command: shield 100
⚡ Command: status
⚡ Command: stealth
```
**Requires**: Nothing! Works out of the box  
**Best for**: Quick operations, scripts

---

###  3. Programmatic (Your Own Code)
```javascript
const { UserAgent } = require('./agents/user-agent/index.cjs');
const agent = new UserAgent(false);
await agent.shieldFunds(100);
```
**Requires**: Node.js knowledge  
**Best for**: Integration, automation

---

## 🎯 Quick Setup Paths

### Path 1: OpenAI (Fastest)
⏱️ **Time**: 2 minutes  
💰 **Cost**: ~$0.01 per chat  
🔒 **Privacy**: Medium (cloud-based)

```bash
./setup-ai.sh  # Choose option 1
```

---

### Path 2: Ollama (Most Private)
⏱️ **Time**: 10 minutes  
💰 **Cost**: Free  
🔒 **Privacy**: Maximum (local AI)

```bash
./setup-ai.sh  # Choose option 2
```

---

### Path 3: No AI (Simplest)
⏱️ **Time**: 0 minutes  
💰 **Cost**: Free  
🔒 **Privacy**: Maximum

```bash
npm run start:user  # Already works!
```

---

## 📚 Full Documentation

- **AI Setup Guide**: [agents/AI_SETUP.md](agents/AI_SETUP.md)
- **Getting Started**: [agents/GETTING_STARTED.md](agents/GETTING_STARTED.md)
- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 🎬 Demo Commands to Try

Once you start AI mode (`npm run start:user:ai`):

```
1. "Hello" - Test basic response
2. "What can you help me with?" - See capabilities
3. "Check my HBAR balance" - Query blockchain
4. "Shield 10 HBAR" - Generate ZK-proof
5. "What's the pool status?" - Check anonymity set
6. "Explain how stealth addresses work" - Get education
7. "Generate a stealth address for me" - Create one
8. "Send 5 HBAR to 0.0.123456" - Regular transfer
```

---

## 💡 Pro Tips

1. **Start Simple**: Try OpenAI first, switch to Ollama later for privacy
2. **Save Secrets**: AI will give you secrets for withdrawal - SAVE THEM!
3. **Batch Awareness**: Proofs take 5-30 minutes to batch (privacy feature)
4. **Natural Language**: Ask anything - "How does this work?" works!
5. **Fallback**: If AI fails, Direct Mode always works: `npm run start:user`

---

## 🆘 Quick Troubleshooting

**Problem**: "No LLM available"  
**Fix**: Run `./setup-ai.sh` or add OPENAI_API_KEY to .env

**Problem**: AI is slow  
**Fix**: Normal for cloud (OpenAI/Claude). For local speed, use smaller Ollama model: `ollama pull phi3`

**Problem**: Want to try without AI  
**Fix**: `npm run start:user` - Works immediately, no setup!

---

## 🎉 You're Ready!

Choose your path:
```bash
# Easiest (2 min):
./setup-ai.sh → Option 1 → Paste OpenAI key

# Most private (10 min):
./setup-ai.sh → Option 2 → Wait for Ollama install

# No AI needed (0 min):
npm run start:user → Type commands
```

**Happy mixing! 🔒🎭**
