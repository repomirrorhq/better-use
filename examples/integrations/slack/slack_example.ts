import express from 'express';
import * as dotenv from 'dotenv';
import { BrowserProfile } from '../../../src/browser';
import { ChatGoogle } from '../../../src/llm/providers/google';
import { SlackBot } from './slack_api';

dotenv.config();

// Load credentials from environment variables
const botToken = process.env.SLACK_BOT_TOKEN;
if (!botToken) {
    throw new Error('Slack bot token not found in .env file.');
}

const signingSecret = process.env.SLACK_SIGNING_SECRET;
if (!signingSecret) {
    throw new Error('Slack signing secret not found in .env file.');
}

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not set');
}

const llm = new ChatGoogle({ 
    model: 'gemini-2.0-flash-exp', 
    apiKey: apiKey 
});

const slackBot = new SlackBot(
    llm, // required; instance of BaseChatModel
    botToken, // required; Slack bot token
    signingSecret, // required; Slack signing secret
    {
        ack: true, // optional; whether to acknowledge task receipt with a message, defaults to false
        browserProfile: new BrowserProfile({
            headless: true
        }) // optional; useful for changing headless mode or other browser configs, defaults to headless mode
    }
);

const app = express();
app.use(express.json());
app.use(slackBot.createExpressHandler());

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Slack bot server listening on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Shutting down gracefully...');
    process.exit(0);
});