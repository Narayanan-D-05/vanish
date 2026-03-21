# 🎭 Vanish Protocol Showcase: Internal Transfer Demo

This guide explains how to demonstrate **Account-to-Account privacy** using Vanish's "Internal Transfer" (Pool-to-Pool) feature.

## 🛠️ The Showcase Architecture
- **Sender (Tab 1)**: Logic for fragmentation and ZK-proof generation.
- **Vanish Pool**: The HCS-10 privacy layer where funds are mixed.
- **Receiver (Tab 2)**: Real-time detection of stealth transfers from the HCS network.

---

## 🏗️ Setup: Side-by-Side Accounts

Because of Vanish's **Graceful Sync** update, you can now have two tabs open on different accounts simultaneously.

1.  **Open Tab 1**: Connect **Account A** (The Sender).
2.  **Open Tab 2**: Connect **Account A** (initially).
3.  **Switch MetaMask**: Open the MetaMask extension and switch to **Account B** (The Receiver).
4.  **Sync Tab 2**: 
    - You will see a ⚠️ **Account Mismatch** banner in Tab 2.
    - Click **[Sync Tab]** in Tab 2.
    - Now **Tab 1** is locked to Account A, and **Tab 2** is locked to Account B!

---

## 💸 The Demo: Internal Private Send

### 1. The Sender (Tab 1)
- Ensure Account A has some **Shielded Balance** (if not, use `shield 10` first).
- In the "AI Command Console", type:
  `internal-transfer <Account_B_Address> 5`
- **What's Happening?**:
  - The AI Agent selects Account A's fragments.
  - It generates a ZK proof proving ownership without revealing the secret.
  - It generates a **Stealth Address** for Account B.
  - It sends an encrypted message to the Pool Manager.

### 2. The Network (Console/Dashboard)
- Watch the **AI Thought History** console.
- You'll see both the User Agent and Pool Manager reasoning through the batching process.

### 3. The Receiver (Tab 2)
- In a few moments, the **Shielded Vault** card in Tab 2 will update.
- The **Stealth Inbox** (bottom of the vault) will show an "Unclaimed" transfer for **5 HBAR**.
- **Click [Claim]**:
  - Account B's Agent will scan the HCS message, derive the one-time private key, and move the funds into its own private vault.
  - **Result**: Funds transferred from A to B with **Zero On-Chain Link**.

---

## 💡 Troubleshooting
- **No Fragments?**: If Account A has none, run `shield 10` and wait for the "Batch Completed" thought in the console.
- **Not Syncing?**: If the banner doesn't appear, refresh the page once; MetaMask sometimes delays the `accountsChanged` event on localhost.
- **Build Error?**: Run `Remove-Item -Path frontend\.next -Recurse -Force` if you see Webpack cache issues.

---
*Vanish Protocol provides absolute privacy. The chain only sees ZK-proofs and HCS messages—your financial relationships remain your own.*
