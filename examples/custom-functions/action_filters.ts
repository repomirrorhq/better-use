/**
 * Action filters (domains) let you limit actions available to the Agent on a step-by-step/page-by-page basis.
 * 
 * controller.action(..., { domains: ['*'] })
 * async function some_action(browser_session: BrowserSession) {
 *     ...
 * }
 * 
 * This helps prevent the LLM from deciding to use an action that is not compatible with the current page.
 * It helps limit decision fatigue by scoping actions only to pages where they make sense.
 * It also helps prevent mis-triggering stateful actions or actions that could break other programs or leak secrets.
 * 
 * For example:
 *     - only run on certain domains with domains: ['example.com', '*.example.com', 'example.co.*'] (supports globs, but no regex)
 *     - only fill in a password on a specific login page url
 *     - only run if this action has not run before on this page (e.g. by looking up the url in a file on disk)
 * 
 * During each step, the agent recalculates the actions available specifically for that page, and informs the LLM.
 */

import { Agent } from '../../src/agent';
import { Controller } from '../../src/controller';
import { BrowserSession } from '../../src/browser/session';
import { ChatOpenAI } from '../../src/llm/providers/openai';

// Initialize controller
const controller = new Controller();

// Action will only be available to Agent on Google domains because of the domain filter
controller.action(
  'Trigger disco mode',
  async (params: { browser_session: BrowserSession }) => {
    const { browser_session } = params;
    
    // Execute JavaScript using CDP
    const cdpSession = await browser_session.getOrCreateCdpSession();
    await cdpSession.send('Runtime.evaluate', {
      expression: `(() => { 
        // define the wiggle animation
        document.styleSheets[0].insertRule('@keyframes wiggle { 0% { transform: rotate(0deg); } 50% { transform: rotate(10deg); } 100% { transform: rotate(0deg); } }');
        
        document.querySelectorAll("*").forEach(element => {
          element.style.animation = "wiggle 0.5s infinite";
        });
      })()`
    });
  },
  { domains: ['google.com', '*.google.com'] }
);

// Custom filter function that checks URL
async function isLoginPage(browserSession: BrowserSession): Promise<boolean> {
  /**Check if current page is a login page.*/
  try {
    // Get current URL using CDP
    const cdpSession = await browserSession.getOrCreateCdpSession();
    const result = await cdpSession.send('Runtime.evaluate', {
      expression: 'window.location.href',
      returnByValue: true
    });
    const url = result.result?.value || '';
    return url.toLowerCase().includes('login') || url.toLowerCase().includes('signin');
  } catch (error) {
    return false;
  }
}

// Note: page_filter is not directly supported anymore, so we'll just use domains
// and check the condition inside the function
controller.action(
  'Use the force, luke',
  async (params: { browser_session: BrowserSession }) => {
    const { browser_session } = params;
    
    // Check if it's a login page
    if (!await isLoginPage(browser_session)) {
      return; // Skip if not a login page
    }

    // Execute JavaScript using CDP
    const cdpSession = await browser_session.getOrCreateCdpSession();
    await cdpSession.send('Runtime.evaluate', {
      expression: `(() => { 
        document.querySelector('body').innerHTML = 'These are not the droids you are looking for';
      })()`
    });
  },
  { domains: ['*'] }
);

async function main() {
  /**Main function to run the example*/
  const browserSession = new BrowserSession();
  await browserSession.start();
  
  const llm = new ChatOpenAI({
    model: 'gpt-4-turbo',
    apiKey: process.env.OPENAI_API_KEY!
  });

  // Create the agent
  const agent = new Agent({
    // disco mode will not be triggered on apple.com because the LLM won't be able to see that action available, 
    // it should work on Google.com though.
    task: `
      Go to apple.com and trigger disco mode (if don't know how to do that, then just move on).
      Then go to google.com and trigger disco mode.
      After that, go to the Google login page and Use the force, luke.
    `,
    llm,
    browserSession,
    controller,
  });

  // Run the agent
  await agent.run(10);

  // Cleanup
  await browserSession.kill();
}

if (require.main === module) {
  main().catch(console.error);
}