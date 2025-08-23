/**
 * Gmail 2FA Integration Example with Grant Mechanism
 * 
 * This example demonstrates how to use the Gmail integration for handling 2FA codes
 * during web automation with a robust credential grant and re-authentication system.
 * 
 * Features:
 * - Automatic credential validation and setup
 * - Interactive OAuth grant flow when credentials are missing/invalid
 * - Fallback re-authentication mechanisms
 * - Clear error handling and user guidance
 * 
 * Setup:
 * 1. Enable Gmail API in Google Cloud Console
 * 2. Create OAuth 2.0 credentials and download JSON
 * 3. Save credentials as ~/.config/browseruse/gmail_credentials.json
 * 4. Run this example - it will guide you through OAuth setup if needed
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { Agent } from '../../src/agent/index.js';
import { Controller } from '../../src/controller/index.js';
import { ChatOpenAI } from '../../src/llm/providers/openai.js';
import { GmailService, registerGmailActions } from '../../src/integrations/gmail/index.js';

interface CredentialsFile {
  web: {
    client_id: string;
    client_secret: string;
    auth_uri: string;
    token_uri: string;
    redirect_uris: string[];
  };
}

class GmailGrantManager {
  private configDir: string;
  private credentialsFile: string;
  private tokenFile: string;
  private rl: readline.Interface;

  constructor() {
    this.configDir = path.join(os.homedir(), '.config', 'browseruse');
    this.credentialsFile = path.join(this.configDir, 'gmail_credentials.json');
    this.tokenFile = path.join(this.configDir, 'gmail_token.json');
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log(`GmailGrantManager initialized with config_dir: ${this.configDir}`);
    console.log(`GmailGrantManager initialized with credentials_file: ${this.credentialsFile}`);
    console.log(`GmailGrantManager initialized with token_file: ${this.tokenFile}`);
  }

  private async question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  close(): void {
    this.rl.close();
  }

  checkCredentialsExist(): boolean {
    return fs.existsSync(this.credentialsFile);
  }

  checkTokenExists(): boolean {
    return fs.existsSync(this.tokenFile);
  }

  validateCredentialsFormat(): [boolean, string] {
    if (!this.checkCredentialsExist()) {
      return [false, 'Credentials file not found'];
    }

    try {
      const credentialsContent = fs.readFileSync(this.credentialsFile, 'utf8');
      const credentials: CredentialsFile = JSON.parse(credentialsContent);

      if (!credentials.web) {
        return [false, "Invalid credentials format - missing 'web' section"];
      }

      const requiredFields = ['client_id', 'client_secret', 'auth_uri', 'token_uri'];
      for (const field of requiredFields) {
        if (!credentials.web[field as keyof typeof credentials.web]) {
          return [false, `Missing required field: ${field}`];
        }
      }

      return [true, 'Credentials file is valid'];

    } catch (error) {
      if (error instanceof SyntaxError) {
        return [false, 'Credentials file is not valid JSON'];
      }
      return [false, `Error reading credentials file: ${error}`];
    }
  }

  async setupOAuthCredentials(): Promise<boolean> {
    console.log('\n🔐 Gmail OAuth Credentials Setup Required');
    console.log('='.repeat(50));

    if (!this.checkCredentialsExist()) {
      console.log('❌ Gmail credentials file not found');
    } else {
      const [isValid, error] = this.validateCredentialsFormat();
      if (!isValid) {
        console.log(`❌ Gmail credentials file is invalid: ${error}`);
      }
    }

    console.log('\n📋 To set up Gmail API access:');
    console.log('1. Go to https://console.cloud.google.com/');
    console.log('2. Create a new project or select an existing one');
    console.log('3. Enable the Gmail API:');
    console.log('   - Go to "APIs & Services" > "Library"');
    console.log('   - Search for "Gmail API" and enable it');
    console.log('4. Create OAuth 2.0 credentials:');
    console.log('   - Go to "APIs & Services" > "Credentials"');
    console.log('   - Click "Create Credentials" > "OAuth client ID"');
    console.log('   - Choose "Desktop application"');
    console.log('   - Download the JSON file');
    console.log(`5. Save the JSON file as: ${this.credentialsFile}`);
    console.log(`6. Ensure the directory exists: ${this.configDir}`);

    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
      console.log(`\n✅ Created config directory: ${this.configDir}`);
    }

    // Wait for user to set up credentials
    while (true) {
      const userInput = await this.question('\n❓ Have you saved the credentials file? (y/n/skip): ');
      const input = userInput.toLowerCase().trim();

      if (input === 'skip') {
        console.log('⏭️  Skipping credential validation for now');
        return false;
      } else if (input === 'y') {
        if (this.checkCredentialsExist()) {
          const [isValid, error] = this.validateCredentialsFormat();
          if (isValid) {
            console.log('✅ Credentials file found and validated!');
            return true;
          } else {
            console.log(`❌ Credentials file is invalid: ${error}`);
            console.log('Please check the file format and try again.');
          }
        } else {
          console.log(`❌ Credentials file still not found at: ${this.credentialsFile}`);
        }
      } else if (input === 'n') {
        console.log('⏳ Please complete the setup steps above and try again.');
      } else {
        console.log('Please enter y, n, or skip');
      }
    }
  }

  async testAuthentication(gmailService: GmailService): Promise<[boolean, string]> {
    try {
      console.log('🔍 Testing Gmail authentication...');
      const success = await gmailService.authenticate();

      if (success && gmailService.isAuthenticated()) {
        console.log('✅ Gmail authentication successful!');
        return [true, 'Authentication successful'];
      } else {
        return [false, 'Authentication failed - invalid credentials or OAuth flow failed'];
      }
    } catch (error) {
      return [false, `Authentication error: ${error}`];
    }
  }

  async handleAuthenticationFailure(gmailService: GmailService, errorMsg: string): Promise<boolean> {
    console.log(`\n❌ Gmail authentication failed: ${errorMsg}`);
    console.log('\n🔧 Attempting recovery...');

    // Option 1: Try removing old token file
    if (this.checkTokenExists()) {
      console.log('🗑️  Removing old token file to force re-authentication...');
      try {
        fs.unlinkSync(this.tokenFile);
        console.log('✅ Old token file removed');

        // Try authentication again
        const success = await gmailService.authenticate();
        if (success) {
          console.log('✅ Re-authentication successful!');
          return true;
        }
      } catch (error) {
        console.log(`❌ Failed to remove token file: ${error}`);
      }
    }

    // Option 2: Validate and potentially re-setup credentials
    const [isValid, credError] = this.validateCredentialsFormat();
    if (!isValid) {
      console.log(`\n❌ Credentials file issue: ${credError}`);
      console.log('🔧 Initiating credential re-setup...');

      return await this.setupOAuthCredentials();
    }

    // Option 3: Provide manual troubleshooting steps
    console.log('\n🔧 Manual troubleshooting steps:');
    console.log('1. Check that Gmail API is enabled in Google Cloud Console');
    console.log('2. Verify OAuth consent screen is configured');
    console.log('3. Ensure redirect URIs include http://localhost:8080');
    console.log('4. Check if credentials file is for the correct project');
    console.log('5. Try regenerating OAuth credentials in Google Cloud Console');

    const retry = await this.question('\n❓ Would you like to retry authentication? (y/n): ');
    if (retry.toLowerCase().trim() === 'y') {
      const success = await gmailService.authenticate();
      return success;
    }

    return false;
  }
}

async function main(): Promise<void> {
  console.log('🚀 Gmail 2FA Integration Example with Grant Mechanism');
  console.log('='.repeat(60));

  // Initialize grant manager
  const grantManager = new GmailGrantManager();

  try {
    // Step 1: Check and validate credentials
    console.log('🔍 Step 1: Validating Gmail credentials...');

    if (!grantManager.checkCredentialsExist()) {
      console.log('❌ No Gmail credentials found');
      const setupSuccess = await grantManager.setupOAuthCredentials();
      if (!setupSuccess) {
        console.log('⏹️  Setup cancelled or failed. Exiting...');
        return;
      }
    } else {
      const [isValid, error] = grantManager.validateCredentialsFormat();
      if (!isValid) {
        console.log(`❌ Invalid credentials: ${error}`);
        const setupSuccess = await grantManager.setupOAuthCredentials();
        if (!setupSuccess) {
          console.log('⏹️  Setup cancelled or failed. Exiting...');
          return;
        }
      } else {
        console.log('✅ Gmail credentials file found and validated');
      }
    }

    // Step 2: Initialize Gmail service and test authentication
    console.log('\n🔍 Step 2: Testing Gmail authentication...');

    const gmailService = new GmailService();
    const [authSuccess, authMessage] = await grantManager.testAuthentication(gmailService);

    if (!authSuccess) {
      console.log(`❌ Initial authentication failed: ${authMessage}`);
      const recoverySuccess = await grantManager.handleAuthenticationFailure(gmailService, authMessage);

      if (!recoverySuccess) {
        console.log('❌ Failed to recover Gmail authentication. Please check your setup.');
        return;
      }
    }

    // Step 3: Initialize controller with authenticated service
    console.log('\n🔍 Step 3: Registering Gmail actions...');

    const controller = new Controller();
    registerGmailActions(controller, gmailService);

    console.log('✅ Gmail actions registered with controller');
    console.log('Available Gmail actions:');
    console.log('- get_recent_emails: Get recent emails with filtering');
    console.log();

    // Initialize LLM
    const llm = new ChatOpenAI({
      model: 'gpt-4.1-mini',
      apiKey: process.env.OPENAI_API_KEY!
    });

    // Step 4: Test Gmail functionality
    console.log('🔍 Step 4: Testing Gmail email retrieval...');

    const agent = new Agent({
      task: 'Get recent emails from Gmail to test the integration is working properly',
      llm,
      controller
    });

    try {
      const result = await agent.run();
      console.log('✅ Gmail email retrieval test completed');
    } catch (error) {
      console.log(`❌ Gmail email retrieval test failed: ${error}`);
      // Try one more recovery attempt
      console.log('🔧 Attempting final recovery...');
      const recoverySuccess = await grantManager.handleAuthenticationFailure(gmailService, String(error));
      if (recoverySuccess) {
        console.log('✅ Recovery successful, re-running test...');
        const result = await agent.run();
      } else {
        console.log('❌ Final recovery failed. Please check your Gmail API setup.');
        return;
      }
    }

    console.log('\n' + '='.repeat(60));

    // Step 5: Demonstrate 2FA code finding
    console.log('🔍 Step 5: Testing 2FA code detection...');

    const agent2 = new Agent({
      task: 'Search for any 2FA verification codes or OTP codes in recent Gmail emails from the last 30 minutes',
      llm,
      controller,
    });

    const result2 = await agent2.run();
    console.log('✅ 2FA code search completed');

    console.log('\n' + '='.repeat(60));

    // Step 6: Simulate complete login flow
    console.log('🔍 Step 6: Demonstrating complete 2FA login flow...');

    const agent3 = new Agent({
      task: `
        Demonstrate a complete 2FA-enabled login flow:
        1. Check for any existing 2FA codes in recent emails
        2. Explain how the agent would handle a typical login:
           - Navigate to a login page
           - Enter credentials
           - Wait for 2FA prompt
           - Use get_recent_emails to find the verification code
           - Extract and enter the 2FA code
        3. Show what types of emails and codes can be detected
      `,
      llm,
      controller,
    });

    const result3 = await agent3.run();
    console.log('✅ Complete 2FA flow demonstration completed');

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Gmail 2FA Integration with Grant Mechanism completed successfully!');
    console.log('\n💡 Key features demonstrated:');
    console.log('- ✅ Automatic credential validation and setup');
    console.log('- ✅ Robust error handling and recovery mechanisms');
    console.log('- ✅ Interactive OAuth grant flow');
    console.log('- ✅ Token refresh and re-authentication');
    console.log('- ✅ 2FA code detection and extraction');
    console.log('\n🔧 Grant mechanism benefits:');
    console.log('- Handles missing or invalid credentials gracefully');
    console.log('- Provides clear setup instructions');
    console.log('- Automatically recovers from authentication failures');
    console.log('- Validates credential format before use');
    console.log('- Offers multiple fallback options');

  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    grantManager.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Failed to run Gmail 2FA integration example:', error);
    process.exit(1);
  });
}