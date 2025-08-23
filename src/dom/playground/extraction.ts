/**
 * DOM Extraction Playground
 * 
 * Interactive testing tool for DOM extraction and serialization capabilities.
 * This tool provides comprehensive testing across diverse websites with varying complexity levels.
 */

import { BrowserSession } from '../../browser/session';
import { BrowserProfile } from '../../browser/profile';
import { DomService } from '../service';
// import { injectHighlightingScript, removeHighlightingScript } from '../debug/highlights';
import * as readline from 'readline';

const TIMEOUT = 60000; // 60 seconds

export interface ViewportSize {
  width: number;
  height: number;
}

export interface PlaygroundConfig {
  headless?: boolean;
  viewportSize?: ViewportSize;
  disableSecurity?: boolean;
  waitForNetworkIdle?: number;
}

export interface WebsiteTestResult {
  url: string;
  processingTime: number;
  elementCount: number;
  interactiveElements: number;
  tokenCount: number;
  success: boolean;
  error?: string;
}

export class DOMPlayground {
  private browserSession: BrowserSession;
  private currentWebsiteIndex: number = 0;
  
  // 12 Sample websites with various interactive elements
  private readonly sampleWebsites = [
    'https://browser-use.github.io/stress-tests/challenges/iframe-inception-level1.html',
    'https://browser-use.github.io/stress-tests/challenges/angular-form.html',
    'https://www.google.com/travel/flights',
    'https://www.amazon.com/s?k=laptop',
    'https://github.com/trending',
    'https://www.reddit.com',
    'https://www.ycombinator.com/companies',
    'https://www.kayak.com/flights',
    'https://www.booking.com',
    'https://www.airbnb.com',
    'https://www.linkedin.com/jobs',
    'https://stackoverflow.com/questions',
  ];

  // 7 Difficult websites with complex elements (iframes, canvas, dropdowns, etc.)
  private readonly difficultWebsites = [
    'https://www.w3schools.com/html/tryit.asp?filename=tryhtml_iframe',  // Nested iframes
    'https://semantic-ui.com/modules/dropdown.html',  // Complex dropdowns
    'https://www.dezlearn.com/nested-iframes-example/',  // Cross-origin nested iframes
    'https://codepen.io/towc/pen/mJzOWJ',  // Canvas elements with interactions
    'https://jqueryui.com/accordion/',  // Complex accordion/dropdown widgets
    'https://v0-simple-landing-page-seven-xi.vercel.app/',  // Simple landing page with iframe
    'https://www.unesco.org/en',
  ];

  // Descriptions for difficult websites
  private readonly difficultDescriptions: Record<string, string> = {
    'https://www.w3schools.com/html/tryit.asp?filename=tryhtml_iframe': '🔸 NESTED IFRAMES: Multiple iframe layers',
    'https://semantic-ui.com/modules/dropdown.html': '🔸 COMPLEX DROPDOWNS: Custom dropdown components',
    'https://www.dezlearn.com/nested-iframes-example/': '🔸 CROSS-ORIGIN IFRAMES: Different domain iframes',
    'https://codepen.io/towc/pen/mJzOWJ': '🔸 CANVAS ELEMENTS: Interactive canvas graphics',
    'https://jqueryui.com/accordion/': '🔸 ACCORDION WIDGETS: Collapsible content sections',
  };

  private readonly allWebsites: string[];

  constructor(config: PlaygroundConfig = {}) {
    this.allWebsites = [...this.sampleWebsites, ...this.difficultWebsites];
    
    const viewportSize = config.viewportSize || { width: 1100, height: 1000 };
    this.browserSession = new BrowserSession(
      new BrowserProfile({
        viewport_width: viewportSize.width,
        viewport_height: viewportSize.height,
        disable_web_security: config.disableSecurity || false,
        headless: config.headless || false,
        chrome_args: ['--incognito'],
      })
    );
  }

  /**
   * Get a compact website list for display
   */
  private getWebsiteListForPrompt(): string {
    const lines: string[] = [];
    lines.push('📋 Websites:');

    // Sample websites (1-12)
    this.sampleWebsites.forEach((site, i) => {
      const current = (i === this.currentWebsiteIndex) ? ' ←' : '';
      const domain = site.replace('https://', '').split('/')[0];
      lines.push(`  ${(i + 1).toString().padStart(2)}.${domain.substring(0, 15).padEnd(15)}${current}`);
    });

    // Difficult websites (13-19)
    this.difficultWebsites.forEach((site, i) => {
      const index = i + this.sampleWebsites.length;
      const current = (index === this.currentWebsiteIndex) ? ' ←' : '';
      const domain = site.replace('https://', '').split('/')[0];
      const desc = this.difficultDescriptions[site] || '';
      const challenge = desc.includes(': ') ? desc.split(': ')[1].substring(0, 15) : '';
      lines.push(`  ${(index + 1).toString().padStart(2)}.${domain.substring(0, 15).padEnd(15)} (${challenge})${current}`);
    });

    return lines.join('\n');
  }

  /**
   * Start the interactive playground
   */
  async start(): Promise<void> {
    await this.browserSession.start();

    console.log('\n🌐 BROWSER-USE DOM EXTRACTION TESTER');
    console.log(`📊 ${this.allWebsites.length} websites total: ${this.sampleWebsites.length} standard + ${this.difficultWebsites.length} complex`);
    console.log('🔧 Controls: Type 1-19 to jump | Enter to re-run | "n" next | "q" quit');
    console.log('🔍 Features: DOM analysis | Performance timing | Token counting | Interactive elements');
    console.log('');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    while (true) {
      try {
        const result = await this.runCurrentWebsite();
        this.displayResult(result);

        console.log('\n' + this.getWebsiteListForPrompt());
        console.log(`\nCurrent: ${this.currentWebsiteIndex + 1}/${this.allWebsites.length} - ${this.allWebsites[this.currentWebsiteIndex]}`);

        const userInput = await this.getUserInput(rl, '\n🔧 Command (1-19/Enter/n/q): ');
        
        if (userInput === 'q') {
          break;
        } else if (userInput === 'n') {
          this.currentWebsiteIndex = (this.currentWebsiteIndex + 1) % this.allWebsites.length;
        } else if (userInput === '') {
          // Re-run current website
        } else {
          const websiteNumber = parseInt(userInput);
          if (websiteNumber >= 1 && websiteNumber <= this.allWebsites.length) {
            this.currentWebsiteIndex = websiteNumber - 1;
          } else {
            console.log('❌ Invalid input. Use 1-19, Enter, "n", or "q"');
            continue;
          }
        }
      } catch (error) {
        console.error('Error running playground:', error);
      }
    }

    rl.close();
    await this.browserSession.stop();
  }

  /**
   * Run DOM extraction test on current website
   */
  async runCurrentWebsite(): Promise<WebsiteTestResult> {
    const url = this.allWebsites[this.currentWebsiteIndex];
    const startTime = Date.now();

    try {
      // Navigate to website
      await this.browserSession.createNewPage(url);
      
      // Wait a bit for the page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create DOM service
      const domService = new DomService(this.browserSession, this.browserSession.logger);
      
      // Get DOM state
      const [domState, enhancedTree, timing] = await domService.getSerializedDOMTree();
      const processingTime = Date.now() - startTime;

      // Count elements and interactive elements
      const elementCount = this.countElements(domState);
      const interactiveElements = this.countInteractiveElements(domState);
      
      // Estimate token count (rough approximation)
      const serializedSize = JSON.stringify(domState).length;
      const tokenCount = Math.ceil(serializedSize / 4); // Rough token estimation

      return {
        url,
        processingTime,
        elementCount,
        interactiveElements,
        tokenCount,
        success: true
      };

    } catch (error) {
      return {
        url,
        processingTime: Date.now() - startTime,
        elementCount: 0,
        interactiveElements: 0,
        tokenCount: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Count total elements in DOM state
   */
  private countElements(domState: any): number {
    let count = 0;
    
    const countNode = (node: any): void => {
      count++;
      if (node.children) {
        node.children.forEach(countNode);
      }
    };

    if (domState.dom_tree) {
      countNode(domState.dom_tree);
    }

    return count;
  }

  /**
   * Count interactive elements in DOM state
   */
  private countInteractiveElements(domState: any): number {
    let count = 0;
    
    const countInteractiveNode = (node: any): void => {
      if (node.isInteractive || node.clickable || node.type === 'input' || node.type === 'button') {
        count++;
      }
      if (node.children) {
        node.children.forEach(countInteractiveNode);
      }
    };

    if (domState.dom_tree) {
      countInteractiveNode(domState.dom_tree);
    }

    return count;
  }

  /**
   * Display test result
   */
  private displayResult(result: WebsiteTestResult): void {
    console.log('\n' + '='.repeat(80));
    
    if (result.success) {
      console.log(`✅ ${result.url}`);
      console.log(`⏱️  Processing Time: ${result.processingTime}ms`);
      console.log(`📊 Elements: ${result.elementCount} total, ${result.interactiveElements} interactive`);
      console.log(`🪙 Estimated Tokens: ${result.tokenCount.toLocaleString()}`);
      
      // Add challenge description for difficult websites
      const description = this.difficultDescriptions[result.url];
      if (description) {
        console.log(`🎯 Challenge: ${description}`);
      }
    } else {
      console.log(`❌ FAILED: ${result.url}`);
      console.log(`🚫 Error: ${result.error}`);
      console.log(`⏱️  Failed after: ${result.processingTime}ms`);
    }
    
    console.log('='.repeat(80));
  }

  /**
   * Get user input from readline
   */
  private getUserInput(rl: readline.Interface, prompt: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Export test results to JSON
   */
  async exportResults(filePath: string): Promise<void> {
    const results: WebsiteTestResult[] = [];
    
    for (let i = 0; i < this.allWebsites.length; i++) {
      this.currentWebsiteIndex = i;
      const result = await this.runCurrentWebsite();
      results.push(result);
      console.log(`Tested ${i + 1}/${this.allWebsites.length}: ${result.success ? '✅' : '❌'} ${result.url}`);
    }
    
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Results exported to: ${filePath}`);
  }

  /**
   * Run automated performance analysis on all websites
   */
  async runPerformanceAnalysis(): Promise<void> {
    console.log('\n🚀 Running automated performance analysis...');
    
    const results: WebsiteTestResult[] = [];
    const startTime = Date.now();
    
    for (let i = 0; i < this.allWebsites.length; i++) {
      this.currentWebsiteIndex = i;
      console.log(`\n[${i + 1}/${this.allWebsites.length}] Testing: ${this.allWebsites[i]}`);
      
      const result = await this.runCurrentWebsite();
      results.push(result);
      
      console.log(`${result.success ? '✅' : '❌'} ${result.processingTime}ms, ${result.elementCount} elements, ${result.tokenCount} tokens`);
    }
    
    const totalTime = Date.now() - startTime;
    
    // Generate summary
    const successful = results.filter(r => r.success).length;
    const avgProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
    const avgElements = results.reduce((sum, r) => sum + r.elementCount, 0) / results.length;
    const avgTokens = results.reduce((sum, r) => sum + r.tokenCount, 0) / results.length;
    
    console.log('\n📊 PERFORMANCE ANALYSIS SUMMARY');
    console.log('='.repeat(80));
    console.log(`🎯 Success Rate: ${successful}/${results.length} (${Math.round(successful/results.length*100)}%)`);
    console.log(`⏱️  Average Processing: ${Math.round(avgProcessingTime)}ms`);
    console.log(`📊 Average Elements: ${Math.round(avgElements)}`);
    console.log(`🪙 Average Tokens: ${Math.round(avgTokens).toLocaleString()}`);
    console.log(`🕐 Total Test Time: ${Math.round(totalTime/1000)}s`);
    console.log('='.repeat(80));
  }
}

/**
 * CLI entry point for the DOM playground
 */
export async function runDOMPlayground(): Promise<void> {
  const args = process.argv.slice(2);
  const config: PlaygroundConfig = {
    headless: args.includes('--headless'),
    viewportSize: { width: 1100, height: 1000 }
  };
  
  const playground = new DOMPlayground(config);
  
  if (args.includes('--export')) {
    const exportPath = args[args.indexOf('--export') + 1] || 'dom-test-results.json';
    await playground.exportResults(exportPath);
  } else if (args.includes('--analyze')) {
    await playground.start();
    await playground.runPerformanceAnalysis();
  } else {
    await playground.start();
  }
}

// If running as main module
if (require.main === module) {
  runDOMPlayground().catch(console.error);
}