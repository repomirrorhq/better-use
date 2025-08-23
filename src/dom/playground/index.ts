/**
 * DOM Playground - Development and debugging tools
 * 
 * This module exports all DOM playground utilities for:
 * - Interactive DOM extraction testing
 * - Performance analysis and optimization
 * - Multi-website compatibility testing
 * - Element interaction debugging
 */

export * from './extraction';

// Re-export commonly used types and constants
export {
  SAMPLE_WEBSITES,
  DIFFICULT_WEBSITES,
  DOMExtractionPlayground,
  runDOMExtractionPlayground
} from './extraction';

export type {
  DOMExtractionTiming,
  TestWebsite,
  PlaygroundConfig
} from './extraction';