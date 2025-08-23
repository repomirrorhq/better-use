/**
 * Browser-Use TypeScript - Main entry point
 */

export * from './exceptions';
export * from './utils';
export * from './config';
export * from './llm';
export * from './browser';
export * from './agent';

// Re-export main classes
export { Agent } from './agent';
export { BrowserSession } from './browser';
// export { DomService } from './dom';
// export { Controller } from './controller';

// Version info
export { getBrowserUseVersion } from './utils';