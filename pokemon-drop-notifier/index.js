// Pokémon TCG Drop Notifier
// Main entry point - tracks drops across retailers

const express = require('express');
const DropTracker = require('./retailers');
const Notifier = require('./notifier');
const path = require('path');

const app = express();
const PORT = 3000;

// Initialize trackers
const dropTracker = new DropTracker();
const notifier = new Notifier();

// Store active drops in memory
let activeDrop = null;
let dropCount = 0;

console.log('🚀 Pokémon Drop Notifier Started');
console.log('📊 Dashboard: http://localhost:3000');

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// API endpoint for drop data
app.get('/api/drops', (req, res) => {
  res.json({
    dropCount: dropCount,
    activeDrop: activeDrop,
    retailers: dropTracker.getTrackedRetailers()
  });
});

// Check for drops every 30 seconds
setInterval(async () => {
  const drops = await dropTracker.checkAllRetailers();
  
  if (drops.length > 0) {
    drops.forEach(drop => {
      if (!activeDrop || activeDrop.id !== drop.id) {
        activeDrop = drop;
        dropCount++;
        console.log(`\n⏰ NEW DROP DETECTED: ${drop.product} at ${drop.retailer}`);
        console.log(`📍 Time: ${drop.dropTime}`);
        console.log(`💰 Price: ${drop.price}`);
        
        // Send Discord notification
        notifier.sendAlert(drop);
      }
    });
  }
}, 30000);

app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
