/**
 * This example requires you to have a Discord bot token and the bot already added to a server.
 * 
 * Five Steps to create and invite a Discord bot:
 * 
 * 1. Create a Discord Application:
 *    * Go to the Discord Developer Portal: https://discord.com/developers/applications
 *    * Log in to the Discord website.
 *    * Click on "New Application".
 *    * Give the application a name and click "Create".
 * 
 * 2. Configure the Bot:
 *    * Navigate to the "Bot" tab on the left side of the screen.
 *    * Make sure "Public Bot" is ticked if you want others to invite your bot.
 *    * Generate your bot token by clicking on "Reset Token", Copy the token and save it securely.
 *    * Do not share the bot token. Treat it like a password. If the token is leaked, regenerate it.
 * 
 * 3. Enable Privileged Intents:
 *    * Scroll down to the "Privileged Gateway Intents" section.
 *    * Enable the necessary intents (e.g., "Server Members Intent" and "Message Content Intent").
 *    * Note: Enabling privileged intents for bots in over 100 guilds requires bot verification. 
 *      You may need to contact Discord support to enable privileged intents for verified bots.
 * 
 * 4. Generate Invite URL:
 *    * Go to "OAuth2" tab and "OAuth2 URL Generator" section.
 *    * Under "scopes", tick the "bot" checkbox.
 *    * Tick the permissions required for your bot to function under "Bot Permissions".
 *    * e.g. "Send Messages", "Send Messages in Threads", "Read Message History", "Mention Everyone".
 *    * Copy the generated URL under the "GENERATED URL" section at the bottom.
 * 
 * 5. Invite the Bot:
 *    * Paste the URL into your browser.
 *    * Choose a server to invite the bot to.
 *    * Click "Authorize".
 *    * Note: The person adding the bot needs "Manage Server" permissions.
 * 
 * 6. Install discord.js: npm install discord.js
 * 
 * 7. Run the code below to start the bot with your bot token.
 * 
 * 8. Write e.g. "$bu what's the weather in Tokyo?" to start a browser-use task and get a response inside the Discord channel.
 */

import * as dotenv from 'dotenv';
import { BrowserProfile } from '../../../src/browser';
import { ChatGoogle } from '../../../src/llm/providers/google';
import { DiscordBot } from './discord_api';

dotenv.config();

// Load credentials from environment variables
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!botToken) {
    throw new Error('Discord bot token not found in .env file.');
}

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not set');
}

const llm = new ChatGoogle({ 
    model: 'gemini-2.0-flash-exp', 
    apiKey: apiKey 
});

const bot = new DiscordBot(llm, {
    prefix: '$bu', // optional; prefix of messages to trigger browser-use, defaults to "$bu"
    ack: true, // optional; whether to acknowledge task receipt with a message, defaults to false
    browserProfile: new BrowserProfile({
        headless: false
    }) // optional; useful for changing headless mode or other browser configs, defaults to headless mode
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    await bot.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Shutting down gracefully...');
    await bot.destroy();
    process.exit(0);
});

// Start the bot
bot.run(botToken).catch(console.error);