# Setup Instructions for Pokémon Drop Notifier

## ✅ What This Tool Does
- Monitors public retailer websites for Pokémon TCG drops
- Sends Discord notifications when drops are detected
- Provides a beautiful real-time dashboard
- **100% Legal** - respects all terms of service

## ⚠️ What This Tool Does NOT Do
- ❌ Automate purchases
- ❌ Bypass security systems
- ❌ Use proxy rotation or IP spoofing
- ❌ Violate retailer terms of service
- ❌ Access protected information

---

## Prerequisites
- **Node.js 14+** ([Download](https://nodejs.org/))
- **Discord Server** (free, takes 2 minutes)
- Internet connection

---

## 1️⃣ Installation

```bash
# Navigate to the project folder
cd pokemon-drop-notifier

# Install dependencies
npm install
```

---

## 2️⃣ Discord Setup (5 minutes)

### Step 1: Create a Discord Server
1. Open Discord and click the "+" icon to create a new server
2. Name it "Pokémon Alerts" (or whatever you want)
3. Skip the onboarding

### Step 2: Create a Webhook
1. Right-click on any channel (or create a new one called #drops)
2. Select "Edit Channel"
3. Go to **Integrations** → **Webhooks**
4. Click **New Webhook**
5. Name it "Pokemon Notifier"
6. Click **Copy Webhook URL**

### Step 3: Add to .env
1. In the `pokemon-drop-notifier` folder, rename `.env.example` to `.env`
2. Paste the webhook URL:
   ```
   DISCORD_WEBHOOK_URL=https://discordapp.com/api/webhooks/YOUR_ID/YOUR_TOKEN
   ```
3. Save the file

---

## 3️⃣ Run the Notifier

```bash
npm start
```

**Expected output:**
```
🚀 Pokémon Drop Notifier Started
📊 Dashboard: http://localhost:3000
✅ Server running on http://localhost:3000
Press Ctrl+C to stop
```

---

## 4️⃣ View Dashboard

1. Open your browser
2. Go to **http://localhost:3000**
3. You should see the beautiful drop tracker dashboard

---

## How It Works

### Check Cycle (Every 30 seconds)
1. ✅ Checks Pokémon Center, Target, Walmart, GameStop
2. 🔍 Looks for Pokémon TCG products in stock
3. 🔔 If drop detected, sends Discord notification
4. 📊 Updates dashboard in real-time

### Retailers Monitored
- Pokémon Center (official)
- Target
- Walmart
- GameStop

---

## Customization

### Add More Retailers
Edit `retailers.js` and add to the `retailers` array:
```javascript
{
  name: 'Best Buy',
  url: 'https://www.bestbuy.com',
  searchTerm: 'pokemon tcg',
  lastChecked: null,
  status: 'monitoring'
}
```

### Change Check Interval
Edit `index.js`, change the interval (in milliseconds):
```javascript
// Check every 60 seconds instead of 30
setInterval(async () => {
  // ...
}, 60000); // 60000ms = 60 seconds
```

---

## Troubleshooting

### "Discord notifications not working"
- ❌ Check if `.env` file exists
- ❌ Verify webhook URL is correct
- ❌ Make sure Discord server is still accessible
- ✅ Restart the app: `npm start`

### "Port 3000 already in use"
```bash
# Use a different port
PORT=3001 npm start
```

### "Module not found"
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## Deployment (Optional)

To run this 24/7:

### Option 1: Heroku
```bash
heroku create your-app-name
git push heroku main
```

### Option 2: Replit
- Upload files to Replit
- Configure `.env` with webhook
- Click "Run"

### Option 3: VPS/Server
Run on any server with Node.js installed

---

## Legal & Ethical

This tool is completely legal because it:
- ✅ Only monitors **public** information
- ✅ Respects `robots.txt` and rate limits
- ✅ Uses only official APIs when available
- ✅ Does NOT automate purchases
- ✅ Does NOT bypass security
- ✅ Does NOT violate terms of service

**This is a notification tool only** — you make all purchasing decisions yourself.

---

## Support

Having issues? Check:
1. Node.js is installed: `node --version`
2. `.env` file exists and has correct webhook URL
3. Discord webhook is still valid
4. No error messages in console

---

**Happy hunting! Good luck with the drops! 🎴**
