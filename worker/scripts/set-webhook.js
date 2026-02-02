// Run: TELEGRAM_BOT_TOKEN=xxx WORKER_URL=xxx node scripts/set-webhook.js
import dotenv from "dotenv";
dotenv.config();
const token = process.env.TELEGRAM_BOT_TOKEN;
const workerUrl = process.env.WORKER_URL;

if (!token || !workerUrl) {
  console.error("Set TELEGRAM_BOT_TOKEN and WORKER_URL env vars");
  process.exit(1);
}

fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: `${workerUrl}/webhook` }),
})
  .then((r) => r.json())
  .then(console.log);
