# Pokémon TCG Drop Notifier

A simple, legal notification system that tracks Pokémon Trading Card Game drops across multiple retailers.

## Features
- 📅 Tracks official drop schedules from Pokémon Center, Target, Walmart, GameStop
- 🔔 Real-time notifications via Discord webhook
- ⏰ Countdown timers to upcoming drops
- 🌐 Multi-retailer monitoring
- 📊 Visual dashboard showing active drops

## Legal Notice
This tool **only monitors public drop information** and sends notifications. It does NOT:
- Bypass retailer security systems
- Use proxies to hide requests
- Automate purchases
- Violate terms of service

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Discord Webhook
1. Create a Discord server and channel
2. Get webhook URL from channel settings
3. Add to `.env`:
```
DISCORD_WEBHOOK_URL=https://discordapp.com/api/webhooks/YOUR_ID/YOUR_TOKEN
```

### 3. Run the Notifier
```bash
npm start
```

## Configuration

Edit `config.json` to customize retailers and products:
```json
{
  "retailers": [
    {
      "name": "Pokemon Center",
      "url": "https://www.pokemoncenter.com",
      "checkInterval": 60000
    }
  ]
}
```

## Files
- `index.js` - Main notification engine
- `retailers.js` - Retailer tracking logic
- `notifier.js` - Discord webhook integration
- `dashboard.html` - Visual drop tracker
