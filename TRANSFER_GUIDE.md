# 💸 Fund Transfer Guide

## ✅ What You Can Do Now

Your Vanish agent now supports **full Hedera operations** alongside privacy features:

### 🔓 Regular Operations (Non-Private)
- ✅ Check HBAR balance
- ✅ Transfer HBAR between accounts  
- ✅ Query any account's balance

### 🔐 Privacy Operations
- ✅ Shield funds (deposit into privacy pool)
- ✅ Generate stealth addresses
- ✅ Query anonymity set
- ✅ Withdraw privately (coming soon)

---

## 🎯 Two Ways to Transfer Funds

### 1️⃣ Direct Mode (Simple Commands)

```bash
npm run start:user
```

**Commands:**
```
> balance
💰 Account Balance:
   Account: 0.0.8119040
   HBAR: 975.99 ℏ

> transfer 0.0.123456 10
💸 Transferring 10 HBAR to 0.0.123456...

✅ Transfer Successful!
   From: 0.0.8119040
   To: 0.0.123456
   Amount: 10 HBAR
   Transaction ID: 0.0.8119040@1709899123.456789000
   Status: SUCCESS

> balance
💰 Account Balance:
   Account: 0.0.8119040
   HBAR: 965.99 ℏ
```

### 2️⃣ AI Chat Mode (Natural Language)

```bash
npm run start:user:ai
```

**Natural language:**
```
💬 You: What's my balance?

🤖 AI: You currently have 975.99 HBAR in account 0.0.8119040.

💬 You: Transfer 10 HBAR to account 0.0.123456

🤖 AI: I'll transfer 10 HBAR for you...

✅ Transfer completed! Transaction ID: 0.0.8119040@1709899123.456789000
Your new balance is 965.99 HBAR.

💬 You: Check the balance of 0.0.123456

🤖 AI: Account 0.0.123456 has 1,010 HBAR.
```

---

## 📊 Available Commands

### Direct Mode Commands

| Command | Description | Example |
|---------|-------------|---------|
| `status` | Check privacy pool status | `status` |
| `balance` | Check your HBAR balance | `balance` |
| `balance <id>` | Check any account's balance | `balance 0.0.123456` |
| `transfer <to> <amt>` | Transfer HBAR | `transfer 0.0.123456 10` |
| `stealth` | Generate stealth address | `stealth` |
| `shield <amt>` | Shield into privacy pool | `shield 50` |
| `help` | Show all commands | `help` |
| `exit` | Quit agent | `exit` |

### AI Mode Queries

**Balance queries:**
- "What's my balance?"
- "Check my HBAR balance"
- "How much HBAR do I have?"
- "What's the balance of 0.0.123456?"

**Transfer requests:**
- "Transfer 10 HBAR to 0.0.123456"
- "Send 50 HBAR to account 0.0.987654"
- "I want to transfer 25 HBAR to 0.0.111111"

**Privacy operations:**
- "Shield 100 HBAR into the privacy pool"
- "Generate a stealth address"
- "What's the current anonymity set size?"

---

## 🧪 Test the Demo

Run the transfer demo (safe, no actual transfers):

```bash
node demo-transfers.cjs
```

This shows:
1. Checking your balance
2. Checking another account's balance  
3. Transfer command syntax
4. Interactive mode instructions

---

## ⚡ Quick Examples

### Example 1: Check Balance & Transfer

**Direct Mode:**
```bash
npm run start:user
> balance
> transfer 0.0.123456 10
> balance
> exit
```

**AI Mode:**
```bash
npm run start:user:ai
> What's my balance?
> Transfer 10 HBAR to 0.0.123456
> Check my balance again
> exit
```

### Example 2: Privacy + Regular Operations

```bash
npm run start:user
> balance                    # 975.99 HBAR
> shield 50                  # Shield 50 HBAR (private)
> transfer 0.0.123456 25     # Send 25 HBAR (regular)
> status                     # Check privacy pool
> balance                    # 900.99 HBAR remaining
```

---

## 🔐 Privacy vs Regular Transfers

### Regular Transfer (Public)
```bash
> transfer 0.0.123456 10
```
- ✅ Fast (3 seconds)
- ✅ Immediate confirmation
- ❌ Public on ledger (everyone sees sender/receiver/amount)
- ❌ Links your accounts together

### Privacy Transfer (Shield → Pool → Withdraw)
```bash
> shield 50                  # Deposit into privacy pool
# Wait 5-30 minutes (batching)
# Receiver claims funds using stealth address
```
- ✅ Private (ZK-proofs hide links)
- ✅ Breaks transaction graph
- ✅ Mixes with other users (anonymity set)
- ⏱️ Slower (5-30 min batching delay)

**Use regular transfers when:**
- Speed is important
- Privacy not needed (public payments)
- Small amounts

**Use privacy transfers when:**
- Financial privacy required
- Breaking on-chain patterns
- Receiving from unknown sources

---

## 🛠️ Technical Details

### 7 Tools Available

Your agent now has **7 integrated tools**:

**Privacy Tools:**
1. `generate_shield_proof` - Create ZK-proof for deposit
2. `generate_withdraw_proof` - Create ZK-proof for withdrawal
3. `generate_stealth_address` - One-time receiving address
4. `submit_proof` - Queue proof for batching
5. `query_pool_status` - Check anonymity metrics

**Hedera Tools:**
6. `transfer_hbar` - Send HBAR between accounts
7. `check_balance` - Query account balances

### How Transfers Work

**Behind the scenes:**
```javascript
// When you run: transfer 0.0.123456 10
const tx = new TransferTransaction()
  .addHbarTransfer(yourAccount, Hbar.fromString('-10'))
  .addHbarTransfer(recipientAccount, Hbar.fromString('10'))
  .execute(client);
```

- ✅ Atomic transaction (both transfers succeed or both fail)
- ✅ Signed with your private key (from `.env`)
- ✅ Submits to Hedera Consensus Service
- ✅ Returns transaction ID and receipt

---

## 🚀 Start Transferring Now

**Option 1: Direct Mode (Instant)**
```bash
npm run start:user
```

**Option 2: AI Chat Mode (Conversational)**
```bash
npm run start:user:ai
```

**Option 3: Run Demo First**
```bash
node demo-transfers.cjs
chmod +x demo-transfers.cjs
./demo-transfers.cjs
```

---

## 🔒 Security Notes

**Your private key is used for:**
- ✅ Signing transfer transactions
- ✅ Signing privacy pool deposits
- ✅ Querying your account balance
- ✅ All operations stay local (no cloud APIs)

**Never share:**
- ❌ Your private key (HEDERA_PRIVATE_KEY)
- ❌ Shield secrets (needed for withdrawals)
- ❌ Stealth address view/spend keys

**Safe to share:**
- ✅ Your account ID (0.0.8119040)
- ✅ Stealth address ephemeral keys
- ✅ Transaction IDs (public anyway)

---

## 📈 What's Next?

- ✅ Transfers working ← **YOU ARE HERE**
- ⏭️ Test end-to-end flow (shield → batch → claim)
- ⏭️ Multi-token support (transfer USDC, tokens)
- ⏭️ Scheduled transfers
- ⏭️ Atomic swaps with privacy

**Ready to transfer funds!** 🚀
