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

const COMMANDS = ["add", "remove", "list", "chains", "help", "start"] as const;
type CommandName = (typeof COMMANDS)[number];

function parseCommand(text: string): { cmd: CommandName | "unknown"; args: string[] } | null {
  if (!text.startsWith("/")) return null;
  const [raw, ...args] = text.trim().split(/\s+/);
  const withoutSlash = raw.slice(1);
  const cmdOnly = withoutSlash.split("@")[0].toLowerCase();
  const cmd = (COMMANDS as readonly string[]).includes(cmdOnly) ? (cmdOnly as CommandName) : "unknown";
  return { cmd, args };
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function suggestCommand(cmd: string): string | null {
  let best: { name: string; score: number } | null = null;
  for (const c of COMMANDS) {
    const score = levenshtein(cmd, c);
    if (!best || score < best.score) best = { name: c, score };
  }
  if (!best) return null;
  return best.score <= 2 ? best.name : null;
}

async function ensureBotCommands(token: string) {
  const commands = [
    { command: "add", description: "Add a wallet to track" },
    { command: "remove", description: "Remove a tracked wallet" },
    { command: "list", description: "List tracked wallets" },
    { command: "chains", description: "Show available chains" },
    { command: "help", description: "Show help and commands" },
    { command: "start", description: "Show help and commands" },
  ];

  await sendTelegram(token, "setMyCommands", { commands });
  await sendTelegram(token, "setMyCommands", {
    commands,
    scope: { type: "all_group_chats" },
  });
  await sendTelegram(token, "setMyCommands", {
    commands,
    scope: { type: "all_private_chats" },
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
  const parsed = parseCommand(text);

  const reply = (msg: string) =>
    sendTelegram(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: msg,
      parse_mode: "Markdown",
    });

  // /add <address> <chain> [threshold] [name]
  if (parsed?.cmd === "add") {
    if (!isAdmin(userId, env.ADMIN_IDS)) {
      await reply("❌ You're not authorized.");
      return c.text("ok");
    }

    const chainPresets = getChainPresets(env.ALCHEMY_API_KEY);
    const args = parsed.args;
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
      (w) =>
        w.address.toLowerCase() === address.toLowerCase() &&
        w.chain.toLowerCase() === chainLower &&
        w.tgChatId === String(chatId)
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

  // /remove <address> [chain]
  if (parsed?.cmd === "remove") {
    if (!isAdmin(userId, env.ADMIN_IDS)) {
      await reply("❌ You're not authorized.");
      return c.text("ok");
    }

    const [address, chain] = parsed.args;
    if (!address) {
      await reply("Usage: `/remove <address> [chain]`");
      return c.text("ok");
    }

    const { wallets, sha } = await getWalletsFromGitHub(env);
    const addressLower = address.toLowerCase();
    const chainLower = chain?.toLowerCase();
    const matching = wallets.filter(
      (w) => w.tgChatId === String(chatId) && w.address.toLowerCase() === addressLower
    );

    if (matching.length === 0) {
      await reply("❌ Address not found in this group.");
      return c.text("ok");
    }

    if (!chainLower && matching.length > 1) {
      const chains = [...new Set(matching.map((w) => w.chain))].join(", ");
      await reply(
        `❌ Multiple chains found for this address. Please specify one of: ${chains}\n` +
          "Usage: `/remove <address> [chain]`"
      );
      return c.text("ok");
    }

    const filtered = wallets.filter(
      (w) =>
        !(
          w.tgChatId === String(chatId) &&
          w.address.toLowerCase() === addressLower &&
          (chainLower ? w.chain.toLowerCase() === chainLower : true)
        )
    );

    await saveWalletsToGitHub(env, filtered, sha, `Remove wallet: ${address.slice(0, 10)}...`);
    await reply(`✅ Removed \`${address.slice(0, 10)}...${address.slice(-6)}\``);
    return c.text("ok");
  }

  // /list
  if (parsed?.cmd === "list") {
    const { wallets } = await getWalletsFromGitHub(env);
    const groupWallets = wallets.filter((w) => w.tgChatId === String(chatId));

    if (groupWallets.length === 0) {
      await reply("No wallets tracked. Use `/add` to add one.");
      return c.text("ok");
    }

    const chainPresets = getChainPresets(env.ALCHEMY_API_KEY);
    const list = groupWallets
      .map((w, i) => {
        const symbol = chainPresets[w.chain]?.symbol || "";
        return (
          `${i + 1}. *${w.name}*\n` +
          `   \`${w.address.slice(0, 10)}...${w.address.slice(-6)}\`\n` +
          `   Chain: ${w.chain} | Threshold: ${w.threshold} ${symbol}`
        );
      })
      .join("\n\n");

    await reply(`📋 *Tracked Wallets*\n\n${list}`);
    return c.text("ok");
  }

  // /chains
  if (parsed?.cmd === "chains") {
    const chainPresets = getChainPresets(env.ALCHEMY_API_KEY);
    const chains = Object.entries(chainPresets)
      .map(([name, p]) => `• \`${name}\` (${p.symbol})`)
      .join("\n");
    await reply(`🔗 *Available Chains*\n\n${chains}`);
    return c.text("ok");
  }

  // /help or /start
  if (parsed?.cmd === "help" || parsed?.cmd === "start") {
    await ensureBotCommands(env.TELEGRAM_BOT_TOKEN);
    await reply(
      `🤖 *Address Monitor Bot*\n\n` +
        `/add <address> <chain> [threshold] [name]\n` +
        `/remove <address> [chain]\n` +
        `/list - Show tracked wallets\n` +
        `/chains - List available chains\n\n` +
        `_Only admins can add/remove._`
    );
    return c.text("ok");
  }

  if (parsed?.cmd === "unknown") {
    const rawCmd = text.trim().split(/\s+/)[0].slice(1);
    const suggestion = suggestCommand(rawCmd.toLowerCase());
    const suggestText = suggestion ? ` Did you mean \`/${suggestion}\`?` : "";
    await reply(`❌ Unknown command \`/${rawCmd}\`.${suggestText}\n\nUse /help to see commands.`);
    return c.text("ok");
  }

  return c.text("ok");
});

app.get("/", (c) => c.text("Address Monitor Bot 🤖"));

export default app;
