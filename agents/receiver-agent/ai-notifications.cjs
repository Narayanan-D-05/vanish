/**
 * Optional AI-Powered Notifications for Receiver Agent
 * 
 * This adds intelligent notifications when funds are received,
 * with anomaly detection and smart alerts.
 */

require('dotenv').config();

class AINotificationService {
  constructor(receiverAgent) {
    this.agent = receiverAgent;
    
    // Only initialize if AI is available
    if (process.env.OPENAI_API_KEY) {
      const { ChatOpenAI } = require('@langchain/openai');
      this.llm = new ChatOpenAI({
        modelName: 'gpt-3.5-turbo', // Cheaper for notifications
        temperature: 0.3,
      });
      this.enabled = true;
      console.log('✅ AI Notifications enabled');
    } else {
      this.enabled = false;
    }
  }
  
  /**
   * Generate smart notification for detected transfer
   */
  async notifyDetection(stealthAddress, amount, token) {
    if (!this.enabled) {
      // Simple notification
      console.log(`💰 ${amount} ${token} detected at ${stealthAddress}`);
      return;
    }
    
    try {
      // AI generates contextual notification
      const prompt = `A privacy-preserving stealth transfer was detected:
Amount: ${amount} ${token}
Address: ${stealthAddress}

Generate a brief, friendly notification message (1-2 sentences) for the user.`;
      
      const response = await this.llm.invoke(prompt);
      console.log(`\n🤖 ${response.content}\n`);
      
    } catch (error) {
      console.log(`💰 ${amount} ${token} detected at ${stealthAddress}`);
    }
  }
  
  /**
   * Detect anomalies in transfer patterns
   */
  async detectAnomaly(transfers) {
    if (!this.enabled || transfers.length < 5) return null;
    
    try {
      const prompt = `Analyze these stealth transfers for unusual patterns:
${transfers.map(t => `- ${t.amount} ${t.token} at ${t.timestamp}`).join('\n')}

Are there any suspicious patterns? (Brief summary)`;
      
      const response = await this.llm.invoke(prompt);
      
      if (response.content.toLowerCase().includes('suspicious') || 
          response.content.toLowerCase().includes('unusual')) {
        console.log(`\n⚠️  Anomaly Alert: ${response.content}\n`);
      }
      
    } catch (error) {
      // Silent fail for anomaly detection
    }
  }
}

module.exports = { AINotificationService };
