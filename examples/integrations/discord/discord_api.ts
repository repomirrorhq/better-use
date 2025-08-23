import { Client, GatewayIntentBits, Message } from 'discord.js';
import { Agent } from '../../../src/agent';
import { BrowserProfile, BrowserSession } from '../../../src/browser';
import { BaseChatModel } from '../../../src/llm/base';

/**
 * Discord bot implementation for Browser-Use tasks.
 * 
 * This bot allows users to run browser automation tasks through Discord messages.
 * Processes tasks asynchronously and sends the result back to the user in response to the message.
 * Messages must start with the configured prefix (default: "$bu") followed by the task description.
 * 
 * @param llm Language model instance to use for task processing
 * @param prefix Command prefix for triggering browser tasks. Defaults to "$bu"
 * @param ack Whether to acknowledge task receipt with a message. Defaults to false
 * @param browserProfile Browser profile settings. Defaults to headless mode
 * 
 * @example
 * ```typescript
 * import { ChatOpenAI } from '../../src/llm/providers/openai';
 * 
 * const llm = new ChatOpenAI();
 * const bot = new DiscordBot(llm, { prefix: '$bu', ack: true });
 * bot.run('YOUR_DISCORD_TOKEN');
 * ```
 * 
 * Discord Usage:
 * Send messages starting with the prefix:
 * "$bu search for python tutorials"
 */
export class DiscordBot {
    private client: Client;
    private llm: BaseChatModel;
    private prefix: string;
    private ack: boolean;
    private browserProfile: BrowserProfile;

    constructor(
        llm: BaseChatModel,
        options: {
            prefix?: string;
            ack?: boolean;
            browserProfile?: BrowserProfile;
        } = {}
    ) {
        this.llm = llm;
        this.prefix = options.prefix?.trim() ?? '$bu';
        this.ack = options.ack ?? false;
        this.browserProfile = options.browserProfile ?? new BrowserProfile({ headless: true });

        // Initialize Discord client with required intents
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.client.once('ready', () => {
            console.log(`We have logged in as ${this.client.user?.tag}`);
        });

        this.client.on('messageCreate', async (message: Message) => {
            try {
                // Ignore bot's own messages
                if (message.author.bot) {
                    return;
                }

                // Check if message starts with prefix
                if (message.content.trim().startsWith(`${this.prefix} `)) {
                    if (this.ack) {
                        try {
                            await message.reply({
                                content: 'Starting browser use task...',
                                allowedMentions: { repliedUser: true }
                            });
                        } catch (error) {
                            console.error('Error sending start message:', error);
                        }
                    }

                    try {
                        const task = message.content.replace(`${this.prefix} `, '').trim();
                        const agentMessage = await this.runAgent(task);
                        await message.reply({
                            content: agentMessage,
                            allowedMentions: { repliedUser: true }
                        });
                    } catch (error) {
                        await message.reply({
                            content: `Error during task execution: ${error}`,
                            allowedMentions: { repliedUser: true }
                        });
                    }
                }
            } catch (error) {
                console.error('Error in message handling:', error);
            }
        });
    }

    private async runAgent(task: string): Promise<string> {
        try {
            const browserSession = new BrowserSession({ browserProfile: this.browserProfile });
            const agent = new Agent(task, this.llm, { browserSession });
            const result = await agent.run();

            let agentMessage: string | null = null;
            if (result.isDone()) {
                const lastResult = result.history[result.history.length - 1];
                if (lastResult?.result?.[0]?.extractedContent) {
                    agentMessage = lastResult.result[0].extractedContent;
                }
            }

            if (agentMessage === null) {
                agentMessage = 'Oops! Something went wrong while running Browser-Use.';
            }

            return agentMessage;
        } catch (error) {
            throw new Error(`Browser-use task failed: ${error}`);
        }
    }

    /**
     * Start the Discord bot with the provided token
     * @param token Discord bot token
     */
    async run(token: string): Promise<void> {
        try {
            await this.client.login(token);
        } catch (error) {
            console.error('Error logging in to Discord:', error);
            throw error;
        }
    }

    /**
     * Destroy the Discord bot connection
     */
    async destroy(): Promise<void> {
        await this.client.destroy();
    }
}