/**
 * Gmail API Service for Browser Use
 * Handles Gmail API authentication, email reading, and 2FA code extraction.
 * This service provides a clean interface for agents to interact with Gmail.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import type { OAuth2Client, Credentials } from 'google-auth-library';
// Simple logger for Gmail integration
const logger = {
  info: (message: string) => console.log(message),
  error: (message: string) => console.error(message),
  debug: (message: string) => console.debug(message),
  warn: (message: string) => console.warn(message),
};

export interface EmailData {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  timestamp: number;
  body: string;
  rawMessage: gmail_v1.Schema$Message;
}

export class GmailService {
  /**
   * Gmail API scopes for reading emails
   */
  private static readonly SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

  private credentialsFile: string;
  private tokenFile: string;
  private configDir: string;
  private accessToken?: string;
  private service?: gmail_v1.Gmail;
  private oauth2Client?: OAuth2Client;
  private authenticated = false;

  constructor(options?: {
    credentialsFile?: string;
    tokenFile?: string;
    configDir?: string;
    accessToken?: string;
  }) {
    // Set up configuration directory using browser-use config patterns
    this.configDir = options?.configDir || path.join(process.env.HOME || process.env.USERPROFILE || '', '.browser-use');
    
    // Set up credential paths
    this.credentialsFile = options?.credentialsFile || path.join(this.configDir, 'gmail_credentials.json');
    this.tokenFile = options?.tokenFile || path.join(this.configDir, 'gmail_token.json');
    
    // Direct access token support
    this.accessToken = options?.accessToken;
  }

  /**
   * Check if Gmail service is authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated && !!this.service;
  }

  /**
   * Handle OAuth authentication and token management
   */
  async authenticate(): Promise<boolean> {
    try {
      logger.info('🔐 Authenticating with Gmail API...');

      // Check if using direct access token
      if (this.accessToken) {
        logger.info('🔑 Using provided access token');
        
        // Create OAuth2 client with access token
        this.oauth2Client = new google.auth.OAuth2();
        this.oauth2Client.setCredentials({
          access_token: this.accessToken,
        });

        // Test token validity by building service
        this.service = google.gmail({ version: 'v1', auth: this.oauth2Client });
        this.authenticated = true;
        logger.info('✅ Gmail API ready with access token!');
        return true;
      }

      // Ensure config directory exists for file-based authentication
      await fs.mkdir(this.configDir, { recursive: true });

      // Try to load existing tokens
      let credentials: Credentials | null = null;
      try {
        const tokenContent = await fs.readFile(this.tokenFile, 'utf8');
        credentials = JSON.parse(tokenContent);
        logger.debug('📁 Loaded existing tokens');
      } catch {
        // Token file doesn't exist or is invalid
      }

      // Set up OAuth2 client
      let clientId: string;
      let clientSecret: string;
      let redirectUri: string;

      try {
        const credentialsContent = await fs.readFile(this.credentialsFile, 'utf8');
        const credentialsJson = JSON.parse(credentialsContent);
        
        // Handle both web and installed app credential formats
        const clientData = credentialsJson.web || credentialsJson.installed;
        if (!clientData) {
          throw new Error('Invalid credentials file format');
        }

        clientId = clientData.client_id;
        clientSecret = clientData.client_secret;
        redirectUri = clientData.redirect_uris?.[0] || 'http://localhost:8080';
      } catch (error) {
        logger.error(
          `❌ Gmail credentials file not found or invalid: ${this.credentialsFile}\n` +
          'Please download it from Google Cloud Console:\n' +
          '1. Go to https://console.cloud.google.com/\n' +
          '2. APIs & Services > Credentials\n' +
          '3. Download OAuth 2.0 Client JSON\n' +
          `4. Save as 'gmail_credentials.json' in ${this.configDir}/`
        );
        return false;
      }

      this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

      // Check if we have valid credentials
      if (credentials) {
        this.oauth2Client.setCredentials(credentials);

        // Check if token is expired and refresh if possible
        if (credentials.expiry_date && credentials.expiry_date <= Date.now()) {
          if (credentials.refresh_token) {
            logger.info('🔄 Refreshing expired tokens...');
            try {
              const { credentials: newCredentials } = await this.oauth2Client.refreshAccessToken();
              this.oauth2Client.setCredentials(newCredentials);
              
              // Save refreshed tokens
              await fs.writeFile(this.tokenFile, JSON.stringify(newCredentials, null, 2));
              logger.info('💾 Refreshed tokens saved');
            } catch (refreshError) {
              logger.error('❌ Token refresh failed, need to re-authenticate');
              credentials = null; // Force re-auth
            }
          } else {
            logger.info('🔄 Token expired and no refresh token available, need to re-authenticate');
            credentials = null; // Force re-auth
          }
        }
      }

      // If no valid credentials, run OAuth flow
      if (!credentials || !this.oauth2Client.credentials.access_token) {
        logger.info('🌐 Starting OAuth flow...');
        
        const authUrl = this.oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: GmailService.SCOPES,
        });

        console.log('\n🔗 Please visit the following URL to authorize this application:');
        console.log(authUrl);
        console.log('\nAfter authorization, you will be redirected. Copy the authorization code from the URL.');
        
        // In a real implementation, you might want to:
        // 1. Start a local server to capture the callback
        // 2. Open the URL in the user's browser automatically
        // 3. Handle the callback to get the authorization code
        
        // For now, we'll throw an error asking for manual setup
        throw new Error(
          'OAuth flow requires manual intervention. Please:\n' +
          '1. Visit the URL above\n' +
          '2. Complete authorization\n' +
          '3. Implement callback handling or provide access_token directly'
        );
      }

      // Build Gmail service
      this.service = google.gmail({ version: 'v1', auth: this.oauth2Client });
      this.authenticated = true;
      logger.info('✅ Gmail API ready!');
      return true;

    } catch (error) {
      logger.error(`❌ Gmail authentication failed: ${error}`);
      return false;
    }
  }

  /**
   * Get recent emails with optional query filter
   */
  async getRecentEmails(options: {
    maxResults?: number;
    query?: string;
    timeFilter?: string;
  } = {}): Promise<EmailData[]> {
    const { maxResults = 10, query = '', timeFilter = '1h' } = options;

    if (!this.isAuthenticated() || !this.service) {
      logger.error('❌ Gmail service not authenticated. Call authenticate() first.');
      return [];
    }

    try {
      // Add time filter to query if provided
      let searchQuery = query;
      if (timeFilter && !query.includes('newer_than:')) {
        searchQuery = `newer_than:${timeFilter} ${query}`.trim();
      }

      logger.info(`📧 Fetching ${maxResults} recent emails...`);
      if (searchQuery) {
        logger.debug(`🔍 Query: ${searchQuery}`);
      }

      // Get message list
      const listResponse = await this.service.users.messages.list({
        userId: 'me',
        maxResults,
        q: searchQuery,
      });

      const messages = listResponse.data.messages || [];
      if (messages.length === 0) {
        logger.info('📭 No messages found');
        return [];
      }

      logger.info(`📨 Found ${messages.length} messages, fetching details...`);

      // Get full message details
      const emails: EmailData[] = [];
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        logger.debug(`📖 Reading email ${i + 1}/${messages.length}...`);

        if (!message.id) continue;

        const fullMessageResponse = await this.service.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full',
        });

        const emailData = this.parseEmail(fullMessageResponse.data);
        emails.push(emailData);
      }

      return emails;

    } catch (error: any) {
      if (error.code) {
        logger.error(`❌ Gmail API error: ${error.message}`);
      } else {
        logger.error(`❌ Unexpected error fetching emails: ${error}`);
      }
      return [];
    }
  }

  /**
   * Parse Gmail message into readable format
   */
  private parseEmail(message: gmail_v1.Schema$Message): EmailData {
    const headers = message.payload?.headers || [];
    const headerMap = new Map(headers.map(h => [h.name || '', h.value || '']));

    return {
      id: message.id || '',
      threadId: message.threadId || '',
      subject: headerMap.get('Subject') || '',
      from: headerMap.get('From') || '',
      to: headerMap.get('To') || '',
      date: headerMap.get('Date') || '',
      timestamp: parseInt(message.internalDate || '0', 10),
      body: this.extractBody(message.payload),
      rawMessage: message,
    };
  }

  /**
   * Extract email body from payload
   */
  private extractBody(payload?: gmail_v1.Schema$MessagePart): string {
    if (!payload) return '';

    let body = '';

    if (payload.body?.data) {
      // Simple email body
      body = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    } else if (payload.parts) {
      // Multi-part email
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          const partBody = Buffer.from(part.body.data, 'base64url').toString('utf-8');
          body += partBody;
        } else if (part.mimeType === 'text/html' && !body && part.body?.data) {
          // Fallback to HTML if no plain text
          body = Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }
      }
    }

    return body;
  }
}