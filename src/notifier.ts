import { Bot } from "grammy";
import { TELEGRAM_BOT_TOKEN, DISCORD_WEBHOOK_URL, getChainPreset } from "./config.js";
import type { BalanceResult } from "./checker.js";

const bot = new Bot(TELEGRAM_BOT_TOKEN);

export async function sendTelegramAlert(result: BalanceResult): Promise<void> {
  const { wallet, balance } = result;
  const preset = getChainPreset(wallet.chain);
  if (!preset) return;

  const explorer = preset.explorerUrl + wallet.address;

  const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
  const displayName = result.ensName || shortAddr;
  
  const message =
    `⚠️ *Low Balance Alert*\n\n` +
    `*${wallet.name}* is running low on *${wallet.chain.toUpperCase()}*\n\n` +
    `📍 Wallet: \`${displayName}\`\n` +
    `💰 Current: *${balance.toFixed(4)} ${preset.symbol}*\n` +
    `📉 Minimum: *${wallet.threshold} ${preset.symbol}*\n\n` +
    `👉 *Action Required:* Send funds to ${result.ensName ? `\`${result.ensName}\`` : `\`${wallet.address}\``}\n\n` +
    `[View Wallet](${explorer})`;

  await bot.api.sendMessage(wallet.tgChatId, message, { parse_mode: "Markdown" });
}

export async function sendDiscordDigest(lowBalanceResults: BalanceResult[]): Promise<void> {
  if (lowBalanceResults.length === 0 || !DISCORD_WEBHOOK_URL) return;

  const fields = lowBalanceResults.map((r) => {
    const preset = getChainPreset(r.wallet.chain);
    const shortAddr = `${r.wallet.address.slice(0, 6)}...${r.wallet.address.slice(-4)}`;
    const displayAddr = r.ensName || shortAddr;
    return {
      name: `🔴 ${r.wallet.name} (${r.wallet.chain.toUpperCase()})`,
      value:
        `**Wallet:** \`${displayAddr}\`\n` +
        `**Balance:** ${r.balance.toFixed(4)} ${preset?.symbol}\n` +
        `**Minimum:** ${r.wallet.threshold} ${preset?.symbol}\n` +
        `**Send to:** \`${r.ensName || r.wallet.address}\`\n` +
        `[View Wallet](${preset?.explorerUrl}${r.wallet.address})`,
      inline: false,
    };
  });

  const embed = {
    title: "⚠️ Sponsor Wallets Need Funding",
    description: `**${lowBalanceResults.length}** wallet(s) are running low on funds and require immediate attention.`,
    color: 0xff6b6b,
    fields,
    footer: { text: "Top up these wallets to continue operations" },
    timestamp: new Date().toISOString(),
  };

  await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

export async function notifyAll(results: BalanceResult[]): Promise<void> {
  const lowBalances = results.filter((r) => r.isLow);

  for (const result of lowBalances) {
    try {
      await sendTelegramAlert(result);
      console.log(`✅ TG alert sent: ${result.wallet.name}`);
    } catch (e) {
      console.error(`❌ TG alert failed: ${result.wallet.name}`, e);
    }
  }

  if (lowBalances.length > 0) {
    try {
      await sendDiscordDigest(lowBalances);
      console.log(`✅ Discord digest sent (${lowBalances.length} wallets)`);
    } catch (e) {
      console.error("❌ Discord digest failed", e);
    }
  }
}
