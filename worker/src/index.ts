import { Hono } from "hono";

type Env = {
  TELEGRAM_BOT_TOKEN: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  WALLETS_PATH: string;
  ADMIN_IDS: string;
  ALCHEMY_API_KEY: string;
};

interface WalletConfig {
  name: string;
  address: string;
  chain: string;
  threshold: number;
  tgChatId: string;
}

interface ChainPreset {
  rpcUrl: string;
  symbol: string;
  explorerUrl: string;
  chainType: "evm" | "filecoin";
}

function getChainPresets(alchemyKey: string): Record<string, ChainPreset> {
  return {
    ethereum: {
      rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      symbol: "ETH",
      explorerUrl: "https://etherscan.io/address/",
      chainType: "evm",
    },
    base: {
      rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      symbol: "ETH",
      explorerUrl: "https://basescan.org/address/",
      chainType: "evm",
    },
    arbitrum: {
      rpcUrl: `https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      symbol: "ETH",
      explorerUrl: "https://arbiscan.io/address/",
      chainType: "evm",
    },
    polygon: {
      rpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      symbol: "POL",
      explorerUrl: "https://polygonscan.com/address/",
      chainType: "evm",
    },
    optimism: {
      rpcUrl: `https://opt-mainnet.g.alchemy.com/v2/${alchemyKey}`,
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
}

const app = new Hono<{ Bindings: Env }>();

async function sendTelegram(token: string, method: string, body: object) {
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getWalletsFromGitHub(env: Env): Promise<{ wallets: WalletConfig[]; sha: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${env.WALLETS_PATH}`,
    { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, "User-Agent": "address-monitor-bot" } }
  );
  const data: any = await res.json();
  const content = atob(data.content);
  return { wallets: JSON.parse(content), sha: data.sha };
}

async function saveWalletsToGitHub(env: Env, wallets: WalletConfig[], sha: string, message: string) {
  await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${env.WALLETS_PATH}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "address-monitor-bot",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: btoa(JSON.stringify(wallets, null, 2)),
      sha,
    }),
  });
}

function isAdmin(userId: number, adminIds: string): boolean {
  return adminIds.split(",").map((id) => id.trim()).includes(String(userId));
}

app.post("/webhook", async (c) => {
  const env = c.env;
  const update = await c.req.json();

  const message = update.message;
  if (!message?.text) return c.text("ok");

  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = message.text;

  const reply = (msg: string) =>
    sendTelegram(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: msg,
      parse_mode: "Markdown",
    });

  // /add <address> <chain> [threshold] [name]
  if (text.startsWith("/add")) {
    if (!isAdmin(userId, env.ADMIN_IDS)) {
      await reply("❌ You're not authorized.");
      return c.text("ok");
    }

    const chainPresets = getChainPresets(env.ALCHEMY_API_KEY);
    const args = text.split(" ").slice(1);
    if (args.length < 2) {
      await reply(
        `Usage: \`/add <address> <chain> [threshold] [name]\`\n\nChains: ${Object.keys(chainPresets).join(", ")}`
      );
      return c.text("ok");
    }

    const [address, chain, thresholdStr, ...nameParts] = args;
    const chainLower = chain.toLowerCase();

    if (!chainPresets[chainLower]) {
      await reply(`❌ Unknown chain. Available: ${Object.keys(chainPresets).join(", ")}`);
      return c.text("ok");
    }

    const preset = chainPresets[chainLower];
    const threshold = parseFloat(thresholdStr) || 0.1;
    const name = nameParts.join(" ") || `${chainLower} wallet`;

    const wallet: WalletConfig = {
      name,
      address,
      chain: chainLower,
      threshold,
      tgChatId: String(chatId),
    };

    const { wallets, sha } = await getWalletsFromGitHub(env);

    const exists = wallets.some(
      (w) => w.address.toLowerCase() === address.toLowerCase() && w.tgChatId === String(chatId)
    );
    if (exists) {
      await reply("❌ Already tracking this address in this group.");
      return c.text("ok");
    }

    wallets.push(wallet);
    await saveWalletsToGitHub(env, wallets, sha, `Add wallet: ${name}`);

    await reply(
      `✅ *Wallet Added*\n\n📛 ${name}\n🔗 ${chainLower}\n📍 \`${address.slice(0, 10)}...${address.slice(-6)}\`\n📉 Threshold: ${threshold} ${preset.symbol}`
    );
    return c.text("ok");
  }

  // /remove <address>
  if (text.startsWith("/remove")) {
    if (!isAdmin(userId, env.ADMIN_IDS)) {
      await reply("❌ You're not authorized.");
      return c.text("ok");
    }

    const address = text.split(" ")[1];
    if (!address) {
      await reply("Usage: `/remove <address>`");
      return c.text("ok");
    }

    const { wallets, sha } = await getWalletsFromGitHub(env);
    const filtered = wallets.filter(
      (w) => !(w.address.toLowerCase() === address.toLowerCase() && w.tgChatId === String(chatId))
    );

    if (filtered.length === wallets.length) {
      await reply("❌ Address not found in this group.");
      return c.text("ok");
    }

    await saveWalletsToGitHub(env, filtered, sha, `Remove wallet: ${address.slice(0, 10)}...`);
    await reply(`✅ Removed \`${address.slice(0, 10)}...${address.slice(-6)}\``);
    return c.text("ok");
  }

  // /list
  if (text.startsWith("/list")) {
    const { wallets } = await getWalletsFromGitHub(env);
    const groupWallets = wallets.filter((w) => w.tgChatId === String(chatId));

    if (groupWallets.length === 0) {
      await reply("No wallets tracked. Use `/add` to add one.");
      return c.text("ok");
    }

    const list = groupWallets
      .map((w, i) => `${i + 1}. *${w.name}*\n   \`${w.address.slice(0, 10)}...${w.address.slice(-6)}\`\n   Threshold: ${w.threshold} ${w.symbol}`)
      .join("\n\n");

    await reply(`📋 *Tracked Wallets*\n\n${list}`);
    return c.text("ok");
  }

  // /chains
  if (text.startsWith("/chains")) {
    const chainPresets = getChainPresets(env.ALCHEMY_API_KEY);
    const chains = Object.entries(chainPresets)
      .map(([name, p]) => `• \`${name}\` (${p.symbol})`)
      .join("\n");
    await reply(`🔗 *Available Chains*\n\n${chains}`);
    return c.text("ok");
  }

  // /help or /start
  if (text.startsWith("/help") || text.startsWith("/start")) {
    await reply(
      `🤖 *Address Monitor Bot*\n\n` +
        `/add <address> <chain> [threshold] [name]\n` +
        `/remove <address>\n` +
        `/list - Show tracked wallets\n` +
        `/chains - List available chains\n\n` +
        `_Only admins can add/remove._`
    );
    return c.text("ok");
  }

  return c.text("ok");
});

app.get("/", (c) => c.text("Address Monitor Bot 🤖"));

export default app;
