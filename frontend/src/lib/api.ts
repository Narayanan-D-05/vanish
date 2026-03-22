// API service for connecting to Vanish Protocol backend

const USER_AGENT_API = process.env.NEXT_PUBLIC_USER_AGENT_URL || "http://localhost:3001";
const POOL_MANAGER_API = process.env.NEXT_PUBLIC_POOL_MANAGER_URL || "http://localhost:3002";

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

// Helper function for fetch with retry logic
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries: number = MAX_RETRIES
): Promise<Response> {
  try {
    const response = await fetch(url, options);

    // Log for debugging
    if (!response.ok) {
      console.error(`[API Error] ${url} returned ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    if (retries > 0) {
      console.warn(`[API Retry] ${url} failed, retrying in ${RETRY_DELAY}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, options, retries - 1);
    }
    console.error(`[API Failed] ${url} failed after ${MAX_RETRIES} retries:`, error);
    throw error;
  }
}

// Types based on backend response
export interface FragmentResponse {
  success: boolean;
  fragments: Array<{
    id: string;
    amount: number;
    commitment: string;
    nullifier: string;
    secret: string;
    status: "pending" | "shielded" | "spent";
  }>;
}

export interface StealthTransferResponse {
  success: boolean;
  transfers: Array<{
    id: string;
    amount: number;
    from: string;
    stealthAddress: string;
    ephemeralPublicKey: string;
    timestamp: number;
    status: "unclaimed" | "claimed";
  }>;
}

export interface ActionResponse {
  success: boolean;
  actionId: string;
  message: string;
  txHash?: string;
}

export interface AgentThoughtResponse {
  thoughts: Array<{
    id: string;
    type: "analysis" | "decision" | "action" | "observation" | "thought" | "logic";
    message: string;
    timestamp: number;
    agent?: string;
  }>;
}

// User Agent API calls
export async function sendCommand(evmAddress: string, command: string): Promise<ActionResponse> {
  const response = await fetchWithRetry(`${USER_AGENT_API}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evmAddress, command }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || `Command failed: ${response.statusText}`);
  }

  return data;
}

export async function getFragments(accountId: string): Promise<FragmentResponse> {
  const response = await fetchWithRetry(`${USER_AGENT_API}/api/vault/${accountId}/fragments`);

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || `Failed to fetch fragments: ${response.statusText}`);
  }

  return data;
}

export interface BalanceResponse {
  success: boolean;
  accountId: string;
  balance: number;
  tinybars: string;
}

export async function getBalance(accountId: string): Promise<BalanceResponse> {
  const response = await fetchWithRetry(`${USER_AGENT_API}/api/balance/${accountId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch balance: ${response.statusText}`);
  }

  return response.json();
}

export async function getStealthTransfers(accountId: string): Promise<StealthTransferResponse> {
  const response = await fetchWithRetry(`${USER_AGENT_API}/api/vault/${accountId}/stealth`);

  if (!response.ok) {
    throw new Error(`Failed to fetch stealth transfers: ${response.statusText}`);
  }

  return response.json();
}

export async function claimStealthTransfer(
  evmAddress: string, 
  transferId: string
): Promise<ActionResponse> {
  const response = await fetch(`${USER_AGENT_API}/api/stealth/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evmAddress, transferId }),
  });
  
  if (!response.ok) {
    throw new Error(`Claim failed: ${response.statusText}`);
  }
  
  return response.json();
}

// Pool Manager API calls
export async function getMerkleTreeState(): Promise<{
  root: string;
  depth: number;
  leafCount: number;
  pendingCount: number;
}> {
  const response = await fetch(`${POOL_MANAGER_API}/api/merkle-tree`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch merkle tree: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getNetworkStats(): Promise<{
  anonymitySet: number;
  poolSize: number;
  pendingActions: number;
  totalVolume: number;
}> {
  const response = await fetch(`${POOL_MANAGER_API}/api/stats`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getUserAgentThoughts(evmAddress?: string): Promise<AgentThoughtResponse> {
  const url = evmAddress 
    ? `${USER_AGENT_API}/api/ai/thoughts?evmAddress=${evmAddress}`
    : `${USER_AGENT_API}/api/ai/thoughts`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch User Agent thoughts: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getPoolThoughts(): Promise<AgentThoughtResponse> {
  const response = await fetch(`${POOL_MANAGER_API}/api/ai/thoughts`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Pool Manager thoughts: ${response.statusText}`);
  }
  
  return response.json();
}

// HCS Topic monitoring
export async function getRecentTransactions(): Promise<{
  transactions: Array<{
    id: string;
    type: "shield" | "withdraw" | "transfer" | "stealth";
    amount: string;
    timestamp: number;
    hashscanUrl: string;
  }>;
}> {
  const response = await fetch(`${POOL_MANAGER_API}/api/transactions`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.statusText}`);
  }
  
  return response.json();
}
