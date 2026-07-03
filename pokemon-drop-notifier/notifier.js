// Discord Notification System
// Sends alerts when drops are detected

const axios = require('axios');
require('dotenv').config();

class Notifier {
  constructor() {
    this.webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!this.webhookUrl) {
      console.warn('⚠️ DISCORD_WEBHOOK_URL not set. Notifications disabled.');
    }
  }

  async sendAlert(drop) {
    if (!this.webhookUrl) return;

    const embed = {
      title: `🎉 ${drop.retailer} - DROP DETECTED!`,
      description: `${drop.product}`,
      color: 16711680, // Red
      fields: [
        {
          name: '💰 Price',
          value: drop.price,
          inline: true
        },
        {
          name: '⏰ Time',
          value: drop.dropTime,
          inline: true
        },
        {
          name: '🔗 Link',
          value: `[Visit ${drop.retailer}](${drop.url})`,
          inline: false
        }
      ],
      thumbnail: {
        url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png'
      },
      footer: {
        text: 'Pokémon Drop Notifier',
        icon_url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png'
      }
    };

    try {
      await axios.post(this.webhookUrl, {
        content: '@here **POKÉMON DROP ALERT**',
        embeds: [embed]
      });
      console.log(`✅ Discord notification sent for ${drop.retailer}`);
    } catch (error) {
      console.error('❌ Failed to send Discord notification:', error.message);
    }
  }

  async sendCountdown(retailer, minutesUntilDrop) {
    if (!this.webhookUrl) return;

    const embed = {
      title: `⏳ Countdown: ${retailer}`,
      description: `Drop in ${minutesUntilDrop} minutes`,
      color: 16776960, // Yellow
      timestamp: new Date()
    };

    try {
      await axios.post(this.webhookUrl, { embeds: [embed] });
    } catch (error) {
      console.error('Failed to send countdown:', error.message);
    }
  }
}

module.exports = Notifier;
