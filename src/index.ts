/**
 * Better-Use TypeScript - Main entry point
 */

export * from './exceptions';
export * from './utils';
export * from './config';
export * from './llm';
export * from './browser';
export * from './dom';
export * from './screenshots';
export * from './tokens';
export * from './filesystem';

// New modules
export * from './mcp';
export * from './telemetry';
export * from './sync';

// Re-export main classes for convenience (avoid conflicts)
export { Agent } from './agent/service';
export { Controller } from './controller/service';
export { BrowserSession } from './browser/session';

// Version info
export { getBetterUseVersion, getBrowserUseVersion } from './utils';