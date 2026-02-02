import { formatEther } from "viem";
import { getClient, type WalletConfig } from "./config.js";

export interface BalanceResult {
  wallet: WalletConfig;
  balance: number;
  isLow: boolean;
}

async function getEvmBalance(wallet: WalletConfig): Promise<number> {
  const client = getClient(wallet.rpcUrl);
  const balanceWei = await client.getBalance({ address: wallet.address as `0x${string}` });
  return parseFloat(formatEther(balanceWei));
}

async function getFilecoinBalance(wallet: WalletConfig): Promise<number> {
  // Filecoin JSON-RPC for native addresses (f0, f1, f2, f3, f4)
  const response = await fetch(wallet.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "Filecoin.WalletBalance",
      params: [wallet.address],
      id: 1,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }
  // Balance is in attoFIL (10^-18)
  return parseFloat(data.result) / 1e18;
}

export async function checkBalance(wallet: WalletConfig): Promise<BalanceResult> {
  let balance: number;

  if (wallet.chainType === "filecoin" && !wallet.address.startsWith("0x")) {
    balance = await getFilecoinBalance(wallet);
  } else {
    balance = await getEvmBalance(wallet);
  }

  return {
    wallet,
    balance,
    isLow: balance < wallet.threshold,
  };
}

export async function checkAllBalances(wallets: WalletConfig[]): Promise<BalanceResult[]> {
  const results = await Promise.allSettled(wallets.map(checkBalance));
  
  return results
    .filter((r): r is PromiseFulfilledResult<BalanceResult> => r.status === "fulfilled")
    .map((r) => r.value);
}
