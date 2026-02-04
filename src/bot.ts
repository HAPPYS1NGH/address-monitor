import { Bot } from "grammy";
import {
  TELEGRAM_BOT_TOKEN,
  CHAIN_PRESETS,
  loadWallets,
  saveWallets,
  isAdmin,
  getChainPreset,
  type WalletConfig,
} from "./config.js";

const bot = new Bot(TELEGRAM_BOT_TOKEN);

// /add <address> <chain> [threshold] [name]
// Example: /add 0x123... base 0.1 "My Wallet"
bot.command("add", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    return ctx.reply("❌ You're not authorized to manage wallets.");
  }

  const args = ctx.message?.text?.split(" ").slice(1) || [];
  if (args.length < 2) {
    return ctx.reply(
      "Usage: `/add <address> <chain> [threshold] [name]`\n\n" +
        "Chains: " + Object.keys(CHAIN_PRESETS).join(", ") + "\n\n" +
        "Example: `/add 0x123... base 0.1 Sponsor`",
      { parse_mode: "Markdown" }
    );
  }

  const [address, chain, thresholdStr, ...nameParts] = args;
  const chainLower = chain.toLowerCase();

  if (!CHAIN_PRESETS[chainLower]) {
    return ctx.reply(
      `❌ Unknown chain: ${chain}\n\nAvailable: ${Object.keys(CHAIN_PRESETS).join(", ")}`
    );
  }

  const preset = CHAIN_PRESETS[chainLower];
  const threshold = parseFloat(thresholdStr) || 0.1;
  const name = nameParts.join(" ") || `${chainLower} wallet`;
  const chatId = String(ctx.chat.id);

  const wallet: WalletConfig = {
    name,
    address,
    chain: chainLower,
    threshold,
    tgChatId: chatId,
  };

  const wallets = loadWallets();
  
  // Check if already exists (same address + chain in this group)
  const exists = wallets.some(
    (w) =>
      w.address.toLowerCase() === address.toLowerCase() &&
      w.chain.toLowerCase() === chainLower &&
      w.tgChatId === chatId
  );
  if (exists) {
    return ctx.reply("❌ This address is already being tracked in this group.");
  }

  wallets.push(wallet);
  saveWallets(wallets);

  return ctx.reply(
    `✅ *Wallet Added*\n\n` +
      `📛 Name: ${name}\n` +
      `🔗 Chain: ${chainLower}\n` +
      `📍 Address: \`${address.slice(0, 10)}...${address.slice(-6)}\`\n` +
      `📉 Threshold: ${threshold} ${preset.symbol}`,
    { parse_mode: "Markdown" }
  );
});

// /remove <address> [chain]
bot.command("remove", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    return ctx.reply("❌ You're not authorized to manage wallets.");
  }

  const args = ctx.message?.text?.split(" ").slice(1) || [];
  const [address, chain] = args;
  if (!address) {
    return ctx.reply("Usage: `/remove <address> [chain]`", { parse_mode: "Markdown" });
  }

  const chatId = String(ctx.chat.id);
  const wallets = loadWallets();
  const addressLower = address.toLowerCase();
  const chainLower = chain?.toLowerCase();
  const matching = wallets.filter(
    (w) => w.tgChatId === chatId && w.address.toLowerCase() === addressLower
  );

  if (matching.length === 0) {
    return ctx.reply("❌ Address not found in this group.");
  }

  if (!chainLower && matching.length > 1) {
    const chains = [...new Set(matching.map((w) => w.chain))].join(", ");
    return ctx.reply(
      `❌ Multiple chains found for this address. Please specify one of: ${chains}\n` +
        "Usage: `/remove <address> [chain]`",
      { parse_mode: "Markdown" }
    );
  }

  const filtered = wallets.filter(
    (w) =>
      !(
        w.tgChatId === chatId &&
        w.address.toLowerCase() === addressLower &&
        (chainLower ? w.chain.toLowerCase() === chainLower : true)
      )
  );

  saveWallets(filtered);
  return ctx.reply(`✅ Removed \`${address.slice(0, 10)}...${address.slice(-6)}\``, {
    parse_mode: "Markdown",
  });
});

// /list - show all wallets for this group
bot.command("list", async (ctx) => {
  const chatId = String(ctx.chat.id);
  const wallets = loadWallets().filter((w) => w.tgChatId === chatId);

  if (wallets.length === 0) {
    return ctx.reply("No wallets tracked in this group.\n\nUse `/add` to add one.", {
      parse_mode: "Markdown",
    });
  }

  const list = wallets
    .map(
      (w, i) => {
        const preset = getChainPreset(w.chain);
        return `${i + 1}. *${w.name}*\n` +
          `   \`${w.address.slice(0, 10)}...${w.address.slice(-6)}\`\n` +
          `   Chain: ${w.chain} | Threshold: ${w.threshold} ${preset?.symbol}`;
      }
    )
    .join("\n\n");

  return ctx.reply(`📋 *Tracked Wallets*\n\n${list}`, { parse_mode: "Markdown" });
});

// /chains - list available chains
bot.command("chains", async (ctx) => {
  const chains = Object.entries(CHAIN_PRESETS)
    .map(([name, preset]) => `• \`${name}\` (${preset.symbol})`)
    .join("\n");

  return ctx.reply(`🔗 *Available Chains*\n\n${chains}`, { parse_mode: "Markdown" });
});

// /help
bot.command(["help", "start"], async (ctx) => {
  return ctx.reply(
    `🤖 *Address Monitor Bot*\n\n` +
      `*Commands:*\n` +
      `/add <address> <chain> [threshold] [name]\n` +
      `/remove <address> [chain]\n` +
      `/list - Show tracked wallets\n` +
      `/chains - List available chains\n\n` +
      `_Only admins can add/remove wallets._`,
    { parse_mode: "Markdown" }
  );
});

export async function startBot() {
  console.log("🤖 Starting Telegram bot...");
  // Register commands so they show in the Telegram UI menu.
  await bot.api.setMyCommands([
    { command: "add", description: "Add a wallet to track" },
    { command: "remove", description: "Remove a tracked wallet" },
    { command: "list", description: "List tracked wallets in this group" },
    { command: "chains", description: "Show available chains" },
    { command: "help", description: "Show help and commands" },
  ]);
  await bot.start();
}

export { bot };
