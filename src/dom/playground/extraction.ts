/**
 * DOM Playground - Interactive DOM extraction testing tool
 * 
 * This module provides interactive DOM extraction testing capabilities:
 * - Performance timing analysis for DOM extraction
 * - Element highlighting and interaction testing  
 * - Multi-website testing with complex challenges
 * - Token count analysis for prompt optimization
 * - Clipboard integration for debugging
 * - Export functionality for analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getLogger } from '../../logging';
import { BrowserSession } from '../../browser/session';
import { BrowserProfile } from '../../browser/profile';

const logger = getLogger('browser_use.dom.playground.extraction');

// Performance timing interface
export interface DOMExtractionTiming {
  get_state_summary_total: number;
  clickable_detection_time?: number;
  dom_serialization_time?: number;
  element_processing_time?: number;
  [key: string]: number | undefined;
}

// Website test configuration
export interface TestWebsite {
  url: string;
  description?: string;
  category: 'sample' | 'difficult';
  challenges?: string[];
}

// Test session configuration
export interface PlaygroundConfig {
  outputDir?: string;
  timeout?: number;
  headless?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  enableHighlighting?: boolean;
}

const DEFAULT_PLAYGROUND_CONFIG: Required<PlaygroundConfig> = {
  outputDir: './tmp',
  timeout: 60000,
  headless: false,
  viewportWidth: 1100,
  viewportHeight: 1000,
  enableHighlighting: true
};

/**
 * Sample websites for testing various interactive elements
 */
export const SAMPLE_WEBSITES: TestWebsite[] = [
  {
    url: 'https://browser-use.github.io/stress-tests/challenges/iframe-inception-level1.html',
    description: 'Iframe inception test',
    category: 'sample'
  },
  {
    url: 'https://browser-use.github.io/stress-tests/challenges/angular-form.html', 
    description: 'Angular form test',
    category: 'sample'
  },
  {
    url: 'https://www.google.com/travel/flights',
    description: 'Google flights interface',
    category: 'sample'
  },
  {
    url: 'https://www.amazon.com/s?k=laptop',
    description: 'Amazon search results',
    category: 'sample'
  },
  {
    url: 'https://github.com/trending',
    description: 'GitHub trending page',
    category: 'sample'
  },
  {
    url: 'https://www.reddit.com',
    description: 'Reddit homepage',
    category: 'sample'
  },
  {
    url: 'https://www.ycombinator.com/companies',
    description: 'YCombinator companies',
    category: 'sample'
  },
  {
    url: 'https://www.kayak.com/flights',
    description: 'Kayak flights search',
    category: 'sample'
  },
  {
    url: 'https://www.booking.com',
    description: 'Booking.com homepage',
    category: 'sample'
  },
  {
    url: 'https://www.airbnb.com',
    description: 'Airbnb homepage',
    category: 'sample'
  },
  {
    url: 'https://www.linkedin.com/jobs',
    description: 'LinkedIn jobs',
    category: 'sample'
  },
  {
    url: 'https://stackoverflow.com/questions',
    description: 'StackOverflow questions',
    category: 'sample'
  }
];

/**
 * Difficult websites with complex elements for advanced testing
 */
export const DIFFICULT_WEBSITES: TestWebsite[] = [
  {
    url: 'https://www.w3schools.com/html/tryit.asp?filename=tryhtml_iframe',
    description: 'Nested iframes test',
    category: 'difficult',
    challenges: ['Multiple iframe layers', 'Cross-frame DOM access']
  },
  {
    url: 'https://semantic-ui.com/modules/dropdown.html',
    description: 'Complex dropdowns test', 
    category: 'difficult',
    challenges: ['Custom dropdown components', 'Dynamic content generation']
  },
  {
    url: 'https://www.dezlearn.com/nested-iframes-example/',
    description: 'Cross-origin nested iframes',
    category: 'difficult',
    challenges: ['Cross-origin iframe access', 'Security restrictions']
  },
  {
    url: 'https://codepen.io/towc/pen/mJzOWJ',
    description: 'Canvas elements test',
    category: 'difficult',
    challenges: ['Interactive canvas graphics', 'JavaScript-heavy interactions']
  },
  {
    url: 'https://jqueryui.com/accordion/',
    description: 'Accordion widgets test',
    category: 'difficult',
    challenges: ['Collapsible content sections', 'Dynamic show/hide']
  },
  {
    url: 'https://v0-simple-landing-page-seven-xi.vercel.app/',
    description: 'Simple landing page with iframe',
    category: 'difficult',
    challenges: ['Embedded iframe content', 'Modern web framework']
  },
  {
    url: 'https://www.unesco.org/en',
    description: 'UNESCO website',
    category: 'difficult',
    challenges: ['Complex international site', 'Multi-language content']
  }
];

/**
 * DOM Extraction Playground - Interactive testing tool
 */
export class DOMExtractionPlayground {
  private browserSession: BrowserSession;
  private config: Required<PlaygroundConfig>;
  private currentWebsiteIndex = 0;
  private websites: TestWebsite[];

  constructor(config: Partial<PlaygroundConfig> = {}) {
    this.config = { ...DEFAULT_PLAYGROUND_CONFIG, ...config };
    
    // Create browser session with appropriate profile
    const profile = new BrowserProfile({
      headless: this.config.headless,
      viewport_width: this.config.viewportWidth,
      viewport_height: this.config.viewportHeight,
      disable_web_security: false,
      timeout: 30000,
      chrome_args: ['--incognito']
    });

    this.browserSession = new BrowserSession({ profile });
    this.websites = [...SAMPLE_WEBSITES, ...DIFFICULT_WEBSITES];

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Start the interactive playground session
   */
  async start(): Promise<void> {
    logger.info('🌐 BROWSER-USE DOM EXTRACTION TESTER');
    logger.info(`📊 ${this.websites.length} websites total: ${SAMPLE_WEBSITES.length} standard + ${DIFFICULT_WEBSITES.length} complex`);
    logger.info('🔧 Controls: Type 1-' + this.websites.length + ' to jump | Enter to re-run | "n" next | "q" quit');
    logger.info(`💾 Outputs: ${this.config.outputDir}/user_message.txt & ${this.config.outputDir}/element_tree.json\n`);

    await this.browserSession.start();

    try {
      await this.runInteractiveLoop();
    } finally {
      await this.browserSession.stop();
    }
  }

  /**
   * Main interactive loop for testing websites
   */
  private async runInteractiveLoop(): Promise<void> {
    while (true) {
      // Cycle through websites
      if (this.currentWebsiteIndex >= this.websites.length) {
        this.currentWebsiteIndex = 0;
        logger.info('Cycled back to first website!');
      }

      const website = this.websites[this.currentWebsiteIndex];
      
      try {
        // Navigate to website using event system (placeholder - would use actual navigation)
        logger.info(`Navigating to: ${website.url}`);
        await this.sleep(1000); // Allow page to load
        
        await this.testWebsite(website);
        
      } catch (error) {
        logger.error(`Error testing website ${website.url}:`, error);
      }
    }
  }

  /**
   * Test a specific website and analyze its DOM
   */
  private async testWebsite(website: TestWebsite): Promise<void> {
    const websiteType = website.category.toUpperCase();
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`[${this.currentWebsiteIndex + 1}/${this.websites.length}] [${websiteType}] Testing: ${website.url}`);
    
    if (website.description) {
      logger.info(`📝 ${website.description}`);
    }
    
    if (website.challenges && website.challenges.length > 0) {
      logger.info(`🔸 Challenges: ${website.challenges.join(', ')}`);
    }
    
    logger.info(`${'='.repeat(60)}`);

    while (true) {
      try {
        logger.info('\nGetting page state...');

        // Time the DOM extraction
        const startTime = Date.now();
        const browserState = await this.browserSession.getBrowserState();
        const endTime = Date.now();
        
        const getStateTime = (endTime - startTime) / 1000;
        logger.info(`get_state_summary took ${getStateTime.toFixed(2)} seconds`);

        // Analyze the extracted DOM
        await this.analyzeDOMState(browserState, website, { get_state_summary_total: getStateTime });

        // Interactive prompt for user actions
        const action = await this.promptUserAction(browserState, website);
        
        if (!action) {
          break; // Exit to next website
        }

        if (action === 'next') {
          this.currentWebsiteIndex++;
          break;
        } else if (action === 'quit') {
          process.exit(0);
        }
        // If action is 'continue', the loop will continue to re-extract DOM

      } catch (error) {
        logger.error('Error in website test loop:', error);
        await this.sleep(1000); // Wait before retrying
      }
    }
  }

  /**
   * Analyze the DOM state and generate outputs
   */
  private async analyzeDOMState(browserState: any, website: TestWebsite, timing: DOMExtractionTiming): Promise<void> {
    try {
      // Extract key metrics
      const totalElements = browserState.dom_state?.selector_map ? 
        Object.keys(browserState.dom_state.selector_map).length : 0;

      logger.info(`Total number of elements: ${totalElements}`);

      // Create user message content (would normally use AgentMessagePrompt)
      const userMessage = this.createUserMessage(browserState, website);
      
      // Save outputs for analysis
      await this.saveAnalysisOutputs(userMessage, browserState, website, timing, totalElements);

    } catch (error) {
      logger.error('Error analyzing DOM state:', error);
    }
  }

  /**
   * Create user message content for analysis
   */
  private createUserMessage(browserState: any, website: TestWebsite): string {
    const lines: string[] = [];
    lines.push(`# DOM Analysis for ${website.url}`);
    lines.push(`Description: ${website.description || 'No description'}`);
    lines.push(`Category: ${website.category}`);
    lines.push('');
    
    if (website.challenges) {
      lines.push('## Challenges:');
      website.challenges.forEach(challenge => lines.push(`- ${challenge}`));
      lines.push('');
    }

    lines.push('## Page State:');
    lines.push(`URL: ${browserState.url || 'Unknown'}`);
    lines.push(`Title: ${browserState.title || 'Unknown'}`);
    lines.push('');

    // Add DOM elements summary
    if (browserState.dom_state?.selector_map) {
      const elements = Object.values(browserState.dom_state.selector_map) as any[];
      lines.push('## Interactive Elements:');
      
      elements.slice(0, 20).forEach((element: any, index: number) => {
        const tag = element.tag_name || element.tagName || 'unknown';
        const text = (element.text || '').substring(0, 50);
        lines.push(`${index + 1}. <${tag}>${text ? ` "${text}"` : ''}`);
      });
      
      if (elements.length > 20) {
        lines.push(`... and ${elements.length - 20} more elements`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Save analysis outputs to files
   */
  private async saveAnalysisOutputs(
    userMessage: string,
    browserState: any,
    website: TestWebsite,
    timing: DOMExtractionTiming,
    totalElements: number
  ): Promise<void> {
    try {
      // Save user message
      const userMessagePath = path.join(this.config.outputDir, 'user_message.txt');
      fs.writeFileSync(userMessagePath, userMessage, 'utf-8');

      // Save element tree (simplified)
      if (browserState.dom_state?._root) {
        const elementTreePath = path.join(this.config.outputDir, 'simplified_element_tree.json');
        fs.writeFileSync(elementTreePath, JSON.stringify(browserState.dom_state._root, null, 2), 'utf-8');
        
        if (browserState.dom_state._root.original_node) {
          const originalTreePath = path.join(this.config.outputDir, 'original_element_tree.json'); 
          fs.writeFileSync(originalTreePath, JSON.stringify(browserState.dom_state._root.original_node, null, 2), 'utf-8');
        }
      }

      // Estimate token count (rough approximation)
      const tokenCount = Math.ceil(userMessage.length / 4); // Rough estimate: 4 chars per token

      // Create timing analysis
      const timingAnalysis = this.createTimingAnalysis(website, timing, totalElements, tokenCount);
      const timingPath = path.join(this.config.outputDir, 'timing_analysis.txt');
      fs.writeFileSync(timingPath, timingAnalysis, 'utf-8');

      logger.info(`Token count: ${tokenCount}`);
      logger.info('User message written to ./tmp/user_message.txt');
      logger.info('Element tree written to ./tmp/simplified_element_tree.json');
      logger.info('Timing analysis written to ./tmp/timing_analysis.txt');

    } catch (error) {
      logger.error('Error saving analysis outputs:', error);
    }
  }

  /**
   * Create detailed timing analysis
   */
  private createTimingAnalysis(
    website: TestWebsite,
    timing: DOMExtractionTiming,
    totalElements: number,
    tokenCount: number
  ): string {
    const lines: string[] = [];
    
    lines.push('🔍 DOM EXTRACTION PERFORMANCE ANALYSIS');
    lines.push('='.repeat(50));
    lines.push('');
    lines.push(`📄 Website: ${website.url}`);
    lines.push(`📝 Description: ${website.description || 'No description'}`);
    lines.push(`📊 Category: ${website.category}`);
    lines.push(`📊 Total Elements: ${totalElements}`);
    lines.push(`🎯 Token Count: ${tokenCount}`);
    lines.push('');

    lines.push('⏱️  TIMING BREAKDOWN:');
    lines.push('─'.repeat(30));
    
    Object.entries(timing).forEach(([key, value]) => {
      if (value !== undefined) {
        lines.push(`${key.padEnd(35)}: ${(value * 1000).toFixed(2).padStart(8)} ms`);
      }
    });

    // Calculate percentages
    const totalTime = timing.get_state_summary_total;
    if (totalTime > 0) {
      lines.push('');
      lines.push('📈 PERCENTAGE BREAKDOWN:');
      lines.push('─'.repeat(30));
      
      Object.entries(timing).forEach(([key, value]) => {
        if (key !== 'get_state_summary_total' && value !== undefined) {
          const percentage = (value / totalTime) * 100;
          lines.push(`${key.padEnd(35)}: ${percentage.toFixed(1).padStart(7)}%`);
        }
      });
    }

    // Add performance insights
    lines.push('');
    lines.push('🎯 PERFORMANCE INSIGHTS:');
    lines.push('─'.repeat(35));
    
    if (totalElements > 0 && timing.clickable_detection_time) {
      const avgPerElement = (timing.clickable_detection_time / totalElements) * 1000000; // microseconds
      lines.push(`Average per element: ${avgPerElement.toFixed(2)} μs`);
    }
    
    if (totalTime < 1) {
      lines.push('✅ Fast extraction (< 1 second)');
    } else if (totalTime < 3) {
      lines.push('⚡ Moderate extraction (1-3 seconds)');
    } else {
      lines.push('⚠️  Slow extraction (> 3 seconds)');
    }
    
    if (tokenCount < 10000) {
      lines.push('✅ Token count within normal range');
    } else if (tokenCount < 25000) {
      lines.push('⚡ High token count - consider optimization');
    } else {
      lines.push('⚠️  Very high token count - optimization recommended');
    }

    return lines.join('\n');
  }

  /**
   * Prompt user for next action
   */
  private async promptUserAction(browserState: any, website: TestWebsite): Promise<string | null> {
    // In a real implementation, this would use readline or inquirer
    // For now, we'll simulate different actions based on the website
    
    logger.info('\n🎮 Actions available:');
    logger.info('- Enter: Re-run extraction');
    logger.info('- "n": Next website');
    logger.info('- "q": Quit');
    logger.info('- number: Click element by index');
    
    // Simulate different behaviors for testing
    if (website.category === 'sample') {
      return 'continue'; // Re-run extraction
    } else {
      return 'next'; // Move to next website
    }
  }

  /**
   * Get website list for display
   */
  getWebsiteListForPrompt(): string {
    const lines: string[] = [];
    lines.push('📋 Websites:');

    // Sample websites (1-N)
    SAMPLE_WEBSITES.forEach((site, index) => {
      const current = (index === this.currentWebsiteIndex) ? ' ←' : '';
      const domain = site.url.replace('https://', '').split('/')[0];
      lines.push(`  ${(index + 1).toString().padStart(2)}.${domain.substring(0, 15).padEnd(15)}${current}`);
    });

    // Difficult websites (N+1-M)
    DIFFICULT_WEBSITES.forEach((site, index) => {
      const globalIndex = SAMPLE_WEBSITES.length + index;
      const current = (globalIndex === this.currentWebsiteIndex) ? ' ←' : '';
      const domain = site.url.replace('https://', '').split('/')[0];
      const challenge = site.challenges?.[0]?.substring(0, 15) || '';
      lines.push(`  ${(globalIndex + 1).toString().padStart(2)}.${domain.substring(0, 15).padEnd(15)} (${challenge})${current}`);
    });

    return lines.join('\n');
  }

  /**
   * Utility function for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.browserSession.stop();
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }
}

/**
 * Standalone function to run the DOM extraction playground
 */
export async function runDOMExtractionPlayground(config?: Partial<PlaygroundConfig>): Promise<void> {
  const playground = new DOMExtractionPlayground(config);
  
  try {
    await playground.start();
  } catch (error) {
    logger.error('Error running DOM extraction playground:', error);
  } finally {
    await playground.cleanup();
  }
}