# Address Monitor

Monitor sponsor wallet balances across multiple chains. Get alerts via Telegram and Discord when balances drop below threshold.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GitHub Repository                           │
│                                                                     │
│  wallets.json ◄──────────────────────┐                              │
│       │                              │                              │
│       ▼                              │                              │
│  GitHub Actions (every 4 hours)      │                              │
│       │                              │                              │
│       ├─► Check balances via Alchemy │                              │
│       │                              │                              │
│       ├─► Send TG alerts (per group) │                              │
│       │                              │                              │
│       └─► Send Discord digest        │                              │
│                                      │                              │
└──────────────────────────────────────│──────────────────────────────┘
                                       │
┌──────────────────────────────────────│──────────────────────────────┐
│              Cloudflare Worker (24/7)│                              │
│                                      │                              │
│  TG Bot receives commands ───────────┘                              │
│    /add 0x... base 0.1 Name                                         │
│    /remove 0x...                                                    │
│    /list                                                            │
│    /chains                                                          │
│                                                                     │
│  Updates wallets.json via GitHub API                                │
└─────────────────────────────────────────────────────────────────────┘
```

## Supported Chains

- Ethereum
- Base
- Arbitrum
- Polygon
- Optimism
- Filecoin (native + FEVM)

---

## Deployment Guide

### Prerequisites

You need these before starting:

| Item | Where to get it |
|------|-----------------|
| Telegram Bot Token | Message [@BotFather](https://t.me/BotFather), create bot, copy token |
| Your Telegram User ID | Message [@userinfobot](https://t.me/userinfobot) |
| Alchemy API Key | [alchemy.com/dashboard](https://dashboard.alchemy.com/) |
| Discord Webhook URL | Discord channel → Settings → Integrations → Webhooks |
| GitHub Personal Access Token | [github.com/settings/tokens](https://github.com/settings/tokens) → Classic → `repo` scope |
| Cloudflare Account | [cloudflare.com](https://cloudflare.com) (free) |

---

### Step 1: Push to GitHub

```bash
cd address-monitor

# Initialize git (if not done)
git init
git add -A
git commit -m "Initial commit"

# Create repo and push
gh repo create address-monitor --private --source=. --push

# Or manually:
# 1. Create repo on GitHub
# 2. git remote add origin git@github.com:YOUR_USERNAME/address-monitor.git
# 3. git push -u origin main
```

---

### Step 2: Add GitHub Secrets (for scheduled balance checks)

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `ALCHEMY_API_KEY` | Your Alchemy API key |
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL |

GitHub Actions will now run every 4 hours automatically.

---

### Step 3: Deploy TG Bot to Cloudflare Workers

```bash
# Go to worker folder
cd worker

# Install dependencies
npm install

# Login to Cloudflare (opens browser)
npx wrangler login

# Update wrangler.toml with your GitHub repo
# Edit the line: GITHUB_REPO = "YOUR_USERNAME/address-monitor"
```

#### Add secrets to Cloudflare:

```bash
# Telegram bot token
npx wrangler secret put TELEGRAM_BOT_TOKEN
# Paste your bot token when prompted

# GitHub token (for updating wallets.json)
npx wrangler secret put GITHUB_TOKEN
# Paste your GitHub PAT when prompted

# Your Telegram user ID (admin access)
npx wrangler secret put ADMIN_IDS
# Paste: 5734473182 (or comma-separated IDs for multiple admins)

# Alchemy API key
npx wrangler secret put ALCHEMY_API_KEY
# Paste your Alchemy key when prompted
```

#### Deploy:

```bash
npx wrangler deploy
```

You'll see output like:
```
Published address-monitor-bot (1.0.0)
  https://address-monitor-bot.YOUR-SUBDOMAIN.workers.dev
```

**Copy this URL** - you need it for the next step.

---

### Step 4: Set Telegram Webhook

```bash
# Replace with your values
TELEGRAM_BOT_TOKEN=your_bot_token \
WORKER_URL=https://address-monitor-bot.YOUR-SUBDOMAIN.workers.dev \
node scripts/set-webhook.js
```

You should see: `{ ok: true, result: true }`

---

### Step 5: Test Everything

#### Test bot commands (in Telegram):
```
/start
/chains
/add 0x123...abc base 0.1 Test Wallet
/list
/remove 0x123...abc
```

#### Test balance checker locally:
```bash
cd ..  # back to address-monitor root
npm install
cp .env.example .env
# Fill in .env with your keys

npm run dev
```

#### Manually trigger GitHub Action:
Go to repo → **Actions** → **Balance Monitor** → **Run workflow**

---

## Configuration

### wallets.json

Wallets are stored in `wallets.json`:

```json
[
  {
    "name": "ETH Sponsor",
    "address": "0x123...",
    "chain": "ethereum",
    "threshold": 0.1,
    "tgChatId": "5734473182"
  }
]
```

| Field | Description |
|-------|-------------|
| `name` | Display name for alerts |
| `address` | Wallet address (0x... or f1...) |
| `chain` | ethereum, base, arbitrum, polygon, optimism, filecoin |
| `threshold` | Alert when balance drops below this |
| `tgChatId` | Telegram chat/group ID to send alerts |

### Adding wallets

**Option 1: Bot command** (after deploying worker)
```
/add 0x123...abc base 0.05 My Sponsor Wallet
```

**Option 2: Edit wallets.json directly**
Edit the file on GitHub or locally and push.

---

## Schedule

Balance checks run automatically:

| Time (UTC) | 
|------------|
| 00:00 |
| 04:00 |
| 08:00 |
| 12:00 |
| 16:00 |
| 20:00 |

To change frequency, edit `.github/workflows/balance-check.yml`:

```yaml
schedule:
  - cron: "0 */4 * * *"  # Every 4 hours
  - cron: "0 * * * *"    # Every hour
  - cron: "0 0 * * *"    # Once daily at midnight
```

---

## Local Development

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env
# Fill in: ALCHEMY_API_KEY, TELEGRAM_BOT_TOKEN, DISCORD_WEBHOOK_URL

# Run balance check
npm run dev

# Build
npm run build
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| TG bot not responding | Check webhook: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo` |
| "chat not found" error | Bot must be in the group, or send `/start` to bot first |
| GitHub Action failing | Check secrets are set correctly in repo settings |
| Worker deploy fails | Run `npx wrangler login` again |

---

## Costs

| Service | Cost |
|---------|------|
| GitHub Actions | Free (2000 mins/month) |
| Cloudflare Workers | Free (100k requests/day) |
| Alchemy | Free tier sufficient |
| **Total** | **$0** |
