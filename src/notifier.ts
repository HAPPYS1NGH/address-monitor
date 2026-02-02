import { bot } from "./bot.js";
import { DISCORD_WEBHOOK_URL } from "./config.js";
import type { BalanceResult } from "./checker.js";

export async function sendTelegramAlert(result: BalanceResult): Promise<void> {
  const { wallet, balance } = result;
  const explorer = wallet.explorerUrl + wallet.address;

  const message =
    `⚠️ *Low Balance Alert*\n\n` +
    `🏷️ *${wallet.name}*\n` +
    `💰 Balance: \`${balance.toFixed(4)} ${wallet.symbol}\`\n` +
    `📉 Threshold: \`${wallet.threshold} ${wallet.symbol}\`\n\n` +
    `[View on Explorer](${explorer})\n\n` +
    `Top up your sponsor wallet!`;

  await bot.api.sendMessage(wallet.tgChatId, message, { parse_mode: "Markdown" });
}

export async function sendDiscordDigest(lowBalanceResults: BalanceResult[]): Promise<void> {
  if (lowBalanceResults.length === 0 || !DISCORD_WEBHOOK_URL) return;

  const fields = lowBalanceResults.map((r) => ({
    name: r.wallet.name,
    value:
      `Balance: \`${r.balance.toFixed(4)} ${r.wallet.symbol}\`\n` +
      `Threshold: \`${r.wallet.threshold}\`\n` +
      `[Explorer](${r.wallet.explorerUrl}${r.wallet.address})`,
    inline: true,
  }));

  const embed = {
    title: "⚠️ Low Balance Digest",
    description: `**${lowBalanceResults.length}** wallet(s) need attention`,
    color: 0xff6b6b,
    fields,
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
