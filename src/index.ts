import { loadWallets } from "./config.js";
import { checkAllBalances } from "./checker.js";
import { notifyAll } from "./notifier.js";
import "./bot.js"; // Initialize bot instance

async function main() {
  console.log("🔍 Starting balance check...\n");

  const wallets = loadWallets();
  
  if (wallets.length === 0) {
    console.log("No wallets configured. Use the bot /add command to add wallets.");
    return;
  }

  console.log(`Checking ${wallets.length} wallet(s)...\n`);

  const results = await checkAllBalances(wallets);

  for (const r of results) {
    const status = r.isLow ? "⚠️ LOW" : "✅ OK";
    console.log(`${status} ${r.wallet.name}: ${r.balance.toFixed(4)} ${r.wallet.symbol}`);
  }

  const lowCount = results.filter((r) => r.isLow).length;
  console.log(`\n${lowCount} wallet(s) below threshold`);

  if (lowCount > 0) {
    await notifyAll(results);
  }

  console.log("\n✅ Done");
}

main().catch(console.error);
