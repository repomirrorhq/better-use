/**
 * Sensitive data handling example.
 * 
 * This demonstrates how to securely handle credentials and sensitive information
 * with domain-specific access controls and data filtering.
 */

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { BrowserSession } from '../../src/browser/session';

// Initialize the model
const llm = new ChatOpenAI({
  model: 'gpt-4-turbo',
  temperature: 0.0,
  apiKey: process.env.OPENAI_API_KEY!
});

// Simple case: the model will see x_name and x_password, but never the actual values.
// const sensitiveData = { 'x_name': 'my_x_name', 'x_password': 'my_x_password' };

// Advanced case: domain-specific credentials with reusable data
// Define a single credential set that can be reused
const companyCredentials = { 
  company_username: 'user@example.com', 
  company_password: 'securePassword123' 
};

// Map the same credentials to multiple domains for secure access control
const sensitiveData: Record<string, string | Record<string, string>> = {
  'https://example.com': companyCredentials,
  'https://admin.example.com': companyCredentials,
  'https://*.example-staging.com': companyCredentials,
  'http*://test.example.com': companyCredentials,
  // You can also add domain-specific credentials
  'https://*.google.com': { g_email: 'user@gmail.com', g_pass: 'google_password' },
};

// Update task to use one of the credentials above
const task = 'Go to google.com and put the login information in the search bar.';

// Always set allowed_domains when using sensitive_data for security
const browserSession = new BrowserSession({
  browserProfile: {
    allowedDomains: [
      ...Object.keys(sensitiveData),
      'https://*.trusted-partner.com' // Domain patterns from sensitive_data + additional allowed domains
    ]
  }
});

const agent = new Agent({ 
  task, 
  llm, 
  sensitiveData, 
  browserSession 
});

async function main() {
  await agent.run();
}

if (require.main === module) {
  main().catch(console.error);
}