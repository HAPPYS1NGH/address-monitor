# Address Monitor

Monitor wallet balances across multiple chains. Get alerts via Telegram and Discord when balances drop below threshold.

## Architecture

```
┌─────────────────────────────────────────┐
│     Cloudflare Worker (TG Bot)          │
│     - /add, /remove, /list commands     │
│     - Updates wallets.json via GitHub   │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           wallets.json (GitHub)         │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│     GitHub Actions (every 4 hours)      │
│     - Checks all wallet balances        │
│     - Sends TG alerts per group         │
│     - Sends Discord digest              │
└─────────────────────────────────────────┘
```

## Supported Chains

- Ethereum
- Base
- Arbitrum
- Polygon
- Optimism
- Filecoin (native + FEVM)

## Setup

### 1. Deploy TG Bot to Cloudflare Workers

```bash
cd worker
npm install
npx wrangler login

# Add secrets
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ADMIN_IDS
npx wrangler secret put ALCHEMY_API_KEY

# Update wrangler.toml with your GitHub repo name

# Deploy
npm run deploy
```

### 2. Set Telegram Webhook

```bash
TELEGRAM_BOT_TOKEN=xxx WORKER_URL=https://your-worker.workers.dev node scripts/set-webhook.js
```

### 3. Add GitHub Secrets

Go to repo Settings → Secrets → Actions:

- `ALCHEMY_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `DISCORD_WEBHOOK_URL`

### 4. Get Your Telegram User ID

Message [@userinfobot](https://t.me/userinfobot) to get your user ID for `ADMIN_IDS`.

## Bot Commands

| Command | Description |
|---------|-------------|
| `/add <address> <chain> [threshold] [name]` | Add wallet to monitor |
| `/remove <address>` | Remove wallet |
| `/list` | Show tracked wallets in this group |
| `/chains` | List available chains |
| `/help` | Show help |

### Examples

```
/add 0x123...abc base 0.1 Sponsor Wallet
/add f1abc...xyz filecoin 5 FIL Sponsor
/remove 0x123...abc
```

## Local Development

```bash
# Install deps
npm install

# Copy env
cp .env.example .env
# Fill in values

# Run balance check
npm run dev
```
