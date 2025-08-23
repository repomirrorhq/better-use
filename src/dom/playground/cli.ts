#!/usr/bin/env ts-node

/**
 * DOM Playground CLI
 * 
 * Interactive command-line tool for testing DOM extraction and analysis.
 * 
 * Usage:
 *   ts-node src/dom/playground/cli.ts                 # Interactive mode
 *   ts-node src/dom/playground/cli.ts --headless      # Run in headless mode
 *   ts-node src/dom/playground/cli.ts --export results.json  # Export results
 *   ts-node src/dom/playground/cli.ts --analyze       # Run performance analysis
 */

import { runDOMPlayground } from './extraction';

console.log('🚀 Starting Browser-Use DOM Playground...');
console.log('');

runDOMPlayground().catch((error) => {
  console.error('❌ Error running DOM playground:', error);
  process.exit(1);
});