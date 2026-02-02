import { createPublicClient, http } from "viem";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WALLETS_PATH = join(__dirname, "..", "wallets.json");

export interface WalletConfig {
  name: string;
  address: string;
  rpcUrl: string;
  symbol: string;
  explorerUrl: string;
  threshold: number;
  tgChatId: string;
  chainType: "evm" | "filecoin";
}

export interface ChainPreset {
  rpcUrl: string;
  symbol: string;
  explorerUrl: string;
  chainType: "evm" | "filecoin";
}

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
export const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL!;
export const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",").map((id) => id.trim());

// Chain presets - add more as needed
export const CHAIN_PRESETS: Record<string, ChainPreset> = {
  ethereum: {
    rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY,
    symbol: "ETH",
    explorerUrl: "https://etherscan.io/address/",
    chainType: "evm",
  },
  base: {
    rpcUrl: "https://base-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY,
    symbol: "ETH",
    explorerUrl: "https://basescan.org/address/",
    chainType: "evm",
  },
  arbitrum: {
    rpcUrl: "https://arb-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY,
    symbol: "ETH",
    explorerUrl: "https://arbiscan.io/address/",
    chainType: "evm",
  },
  polygon: {
    rpcUrl: "https://polygon-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY,
    symbol: "POL",
    explorerUrl: "https://polygonscan.com/address/",
    chainType: "evm",
  },
  optimism: {
    rpcUrl: "https://opt-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY,
    symbol: "ETH",
    explorerUrl: "https://optimistic.etherscan.io/address/",
    chainType: "evm",
  },
  filecoin: {
    rpcUrl: "https://api.node.glif.io/rpc/v1",
    symbol: "FIL",
    explorerUrl: "https://filfox.info/en/address/",
    chainType: "filecoin",
  },
};

export function getClient(rpcUrl: string) {
  return createPublicClient({
    transport: http(rpcUrl),
  });
}

export function loadWallets(): WalletConfig[] {
  if (!existsSync(WALLETS_PATH)) {
    writeFileSync(WALLETS_PATH, "[]");
    return [];
  }
  const data = readFileSync(WALLETS_PATH, "utf-8");
  return JSON.parse(data);
}

export function saveWallets(wallets: WalletConfig[]): void {
  writeFileSync(WALLETS_PATH, JSON.stringify(wallets, null, 2));
}

export function isAdmin(userId: number): boolean {
  return ADMIN_IDS.includes(String(userId));
}
