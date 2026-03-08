/**
 * Vanish User Agent - AI Mode using Hedera Agent Kit
 * 
 * This mode uses Hedera's official AI Agent Kit with LangChain
 * to provide natural language interaction with the privacy layer.
 * 
 * Supports:
 * - OpenAI GPT models (cloud, requires API key)
 * - Ollama (local, privacy-preserving, optional)
 * - Anthropic Claude (cloud, requires API key, optional)
 */

require('dotenv').config();
const readline = require('readline');
const { AccountId, PrivateKey, Client } = require('@hashgraph/sdk');
const { HederaLangchainToolkit, HederaBuilder } = require('hedera-agent-kit');
const crypto = require('crypto');

// Try to load LLM providers (optional)
let ChatOpenAI, ChatOllama, ChatAnthropic;
try {
  ChatOpenAI = require('@langchain/openai').ChatOpenAI;
} catch (e) {}
try {
  ChatOllama = require('@langchain/ollama').ChatOllama;
} catch (e) {}
try {
  ChatAnthropic = require('@langchain/anthropic').ChatAnthropic;
} catch (e) {}

class AIUserAgent {
  constructor() {
    console.log('🤖 Initializing Vanish AI Agent...\n');
    
    // Initialize Hedera client
    this.accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
    this.privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
    this.client = Client.forTestnet();
    this.client.setOperator(this.accountId, this.privateKey);
    
    // Determine which LLM to use
    this.llm = this.initializeLLM();
    
    if (!this.llm) {
      console.error('❌ No LLM available. Please set one of:');
      console.error('   - OPENAI_API_KEY for OpenAI GPT');
      console.error('   - Run Ollama locally (ollama serve)');
      console.error('   - ANTHROPIC_API_KEY for Claude');
      process.exit(1);
    }
    
    // User secrets storage
    this.userSecrets = new Map();
  }
  
  /**
   * Async initialization
   */
  async initialize() {
    // Initialize Hedera Agent Kit
    await this.initializeHederaKit();
    
    console.log('✅ AI Agent Ready\n');
    this.showWelcome();
  }
  
  /**
   * Initialize LLM (Try multiple providers in order of preference)
   */
  initializeLLM() {
    // 1. Try Ollama (local, privacy-first)
    if (ChatOllama) {
      try {
        const llm = new ChatOllama({
          model: 'llama3.2',
          baseUrl: 'http://localhost:11434',
          temperature: 0.1,
        });
        console.log('✅ Using Ollama (Local AI - Privacy Mode)');
        return llm;
      } catch (e) {
        console.log('⚠️  Ollama not available, trying other providers...');
      }
    }
    
    // 2. Try OpenAI (cloud)
    if (process.env.OPENAI_API_KEY && ChatOpenAI) {
      console.log('✅ Using OpenAI GPT-4');
      return new ChatOpenAI({
        modelName: 'gpt-4',
        temperature: 0.1,
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    
    // 3. Try Anthropic Claude (cloud)
    if (process.env.ANTHROPIC_API_KEY && ChatAnthropic) {
      console.log('✅ Using Anthropic Claude');
      return new ChatAnthropic({
        modelName: 'claude-3-sonnet-20240229',
        temperature: 0.1,
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
    
    return null;
  }
  
  /**
   * Initialize Hedera Agent Kit with custom privacy tools
   */
  async initializeHederaKit() {
    // Load Vanish privacy tools (always available)
    const { tools: vanishTools } = require('../plugins/vanish-tools.cjs');
    
    try {
      // Try to add Hedera core tools (optional enhancement)
      const builder = new HederaBuilder(
        this.accountId.toString(),
        this.privateKey.toString(),
        'testnet'
      );
      
      this.toolkit = new HederaLangchainToolkit(builder);
      await this.toolkit.loadCoreTools();
      
      // Merge with Vanish tools
      this.toolkit.tools = [...this.toolkit.tools, ...vanishTools];
      console.log(`✅ Loaded ${this.toolkit.tools.length} tools (Hedera + Vanish Privacy)`);
      
    } catch (error) {
      // Hedera Kit failed - just use Vanish tools
      this.toolkit = { tools: vanishTools };
      console.log(`✅ Loaded ${vanishTools.length} privacy tools`);
    }
  }
  
  /**
   * Show welcome message
   */
  showWelcome() {
    console.log('💬 Vanish AI Privacy Agent');
    console.log('   Account:', this.accountId.toString());
    console.log('\n📖 What you can do:');
    console.log('\n   🔐 PRIVACY OPERATIONS:');
    console.log('   • "Shield 100 HBAR into the privacy pool"');
    console.log('   • "Generate a stealth address for receiving funds"');
    console.log('   • "What\'s the current anonymity set size?"');
    console.log('\n   💰 HEDERA OPERATIONS:');
    console.log('   • "Check my HBAR balance"');
    console.log('   • "Transfer 50 HBAR to 0.0.123456"');
    console.log('   • "What\'s the balance of 0.0.8119040?"');
    console.log('\n   • Type "exit" to quit\n');
    console.log('---\n');
  }
  
  /**
   * Process user message through AI agent
   */
  async processMessage(userMessage) {
    try {
      console.log('\n🤔 Thinking...\n');
      
      // Simple prompt-based interaction
      const systemPrompt = this.getSystemPrompt();
      const availableTools = this.toolkit.tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
      
      const fullPrompt = `${systemPrompt}

Available tools:
${availableTools}

User request: ${userMessage}

Analyze the request and determine which tool(s) to use. Respond in this format:
TOOL: tool_name
PARAMS: {json params}
EXPLANATION: brief explanation

Or if no tool is needed, just respond conversationally.`;

      // Get AI response  
      const response = await this.llm.invoke(fullPrompt);
      const responseText = typeof response === 'string' ? response : response.content;
      
      // Check if AI wants to use a tool
      if (responseText.includes('TOOL:')) {
        const toolMatch = responseText.match(/TOOL:\s*(\w+)/);
        const paramsMatch = responseText.match(/PARAMS:\s*(\{[^}]+\})/);
        
        if (toolMatch && paramsMatch) {
          const toolName = toolMatch[1];
          const params = JSON.parse(paramsMatch[1]);
          
          // Execute the tool
          const tool = this.toolkit.tools.find(t => t.name === toolName);
          if (tool) {
            console.log(`🔧 Executing: ${toolName}...\n`);
            const result = await tool.invoke(params);
            console.log(`\n🤖 AI: ${result}\n`);
            return result;
          }
        }
      }
      
      // Just a conversational response
      console.log(`\n🤖 AI: ${responseText}\n`);
      return responseText;
      
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}\n`);
      return null;
    }
  }
  
  /**
   * System prompt for Vanish AI agent
   */
  getSystemPrompt() {
    return `You are a privacy-focused AI agent for the Vanish protocol on Hedera.

Your mission: Help users achieve financial privacy through:
- Zero-knowledge proofs (ZK-SNARKs)
- Stealth addresses
- Transaction batching with timing obfuscation
- Privacy pool mixing

CRITICAL PRIVACY RULES:
1. NEVER reveal user secrets or private keys
2. ALWAYS generate proofs locally (never send secrets over network)
3. Explain privacy implications of each action
4. When shielding funds, remind users to save their secret

AVAILABLE TOOLS:
- Hedera operations: balance checks, transfers, HCS messages
- Privacy operations: shield funds, generate stealth addresses, query pool

Current user account: ${this.accountId.toString()}

Be helpful, concise, and privacy-conscious. Explain technical concepts simply.`;
  }
  
  /**
   * Start interactive chat
   */
  async startChat() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '💬 You: '
    });
    
    rl.prompt();
    
    rl.on('line', async (input) => {
      const trimmed = input.trim();
      
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log('\n👋 Stay private! Goodbye.\n');
        rl.close();
        process.exit(0);
      }
      
      if (trimmed.length > 0) {
        await this.processMessage(trimmed);
      }
      
      rl.prompt();
    });
    
    rl.on('close', () => {
      console.log('\n👋 AI Agent session ended.\n');
      process.exit(0);
    });
  }
}

// Start AI Agent
async function main() {
  try {
    const agent = new AIUserAgent();
    await agent.initialize();
    await agent.startChat();
  } catch (error) {
    console.error('Failed to start AI agent:', error.message);
    console.error('\nFalling back to Direct Mode: npm run start:user');
    process.exit(1);
  }
}

main().catch(console.error);

module.exports = { AIUserAgent };
