import { formatEther, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { getClient, getChainPreset, type WalletConfig, CHAIN_PRESETS } from "./config.js";

export interface BalanceResult {
  wallet: WalletConfig;
  balance: number;
  isLow: boolean;
  ensName?: string;
}

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(CHAIN_PRESETS.ethereum.rpcUrl),
});

export async function getEnsName(address: string): Promise<string | null> {
  try {
    const name = await ensClient.getEnsName({ address: address as `0x${string}` });
    return name;
  } catch {
    return null;
  }
}

async function getEvmBalance(rpcUrl: string, address: string): Promise<number> {
  const client = getClient(rpcUrl);
  const balanceWei = await client.getBalance({ address: address as `0x${string}` });
  return parseFloat(formatEther(balanceWei));
}

async function getFilecoinBalance(rpcUrl: string, address: string): Promise<number> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "Filecoin.WalletBalance",
      params: [address],
      id: 1,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }
  return parseFloat(data.result) / 1e18;
}

export async function checkBalance(wallet: WalletConfig): Promise<BalanceResult> {
  const preset = getChainPreset(wallet.chain);
  if (!preset) {
    throw new Error(`Unknown chain: ${wallet.chain}`);
  }

  let balance: number;

  if (preset.chainType === "filecoin" && !wallet.address.startsWith("0x")) {
    balance = await getFilecoinBalance(preset.rpcUrl, wallet.address);
  } else {
    balance = await getEvmBalance(preset.rpcUrl, wallet.address);
  }

  // Try to get ENS name for 0x addresses
  let ensName: string | null = null;
  if (wallet.address.startsWith("0x")) {
    ensName = await getEnsName(wallet.address);
  }

  return {
    wallet,
    balance,
    isLow: balance < wallet.threshold,
    ensName: ensName || undefined,
  };
}

export async function checkAllBalances(wallets: WalletConfig[]): Promise<BalanceResult[]> {
  const results = await Promise.allSettled(wallets.map(checkBalance));

  return results
    .filter((r): r is PromiseFulfilledResult<BalanceResult> => r.status === "fulfilled")
    .map((r) => r.value);
}
