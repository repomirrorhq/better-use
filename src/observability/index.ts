/**
 * Observability module for browser-use
 *
 * This module provides observability decorators that optionally integrate with lmnr (Laminar) for tracing.
 * If lmnr is not installed, it provides no-op wrappers that accept the same parameters.
 *
 * Features:
 * - Optional lmnr integration - works with or without lmnr installed
 * - Debug mode support - observe_debug only traces when in debug mode
 * - Full parameter compatibility with lmnr observe decorator
 * - No-op fallbacks when lmnr is unavailable
 */

import { config } from 'dotenv';

// Load environment variables
config();

// Type definitions
type SpanType = 'DEFAULT' | 'LLM' | 'TOOL';

interface ObserveOptions {
  name?: string;
  ignoreInput?: boolean;
  ignoreOutput?: boolean;
  metadata?: Record<string, any>;
  spanType?: SpanType;
  [key: string]: any;
}

type DecoratorFunction<T extends Function> = (target: T) => T;
type MethodDecorator = <T extends Function>(target: any, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => TypedPropertyDescriptor<T> | void;

// Check if we're in debug mode
function isDebugMode(): boolean {
  const lmnrDebugMode = (process.env.LMNR_LOGGING_LEVEL || '').toLowerCase();
  if (lmnrDebugMode === 'debug') {
    return true;
  }
  return false;
}

// Try to import lmnr observe
let LMNR_AVAILABLE = false;
let lmnrObserve: any = null;

try {
  // Try to dynamically import lmnr
  const lmnr = require('lmnr');
  lmnrObserve = lmnr.observe;
  
  if ((process.env.BROWSER_USE_VERBOSE_OBSERVABILITY || 'false').toLowerCase() === 'true') {
    console.debug('Lmnr is available for observability');
  }
  LMNR_AVAILABLE = true;
} catch (error) {
  if ((process.env.BROWSER_USE_VERBOSE_OBSERVABILITY || 'false').toLowerCase() === 'true') {
    console.debug('Lmnr is not available for observability');
  }
  LMNR_AVAILABLE = false;
}

/**
 * Create a no-op decorator that accepts all lmnr observe parameters but does nothing
 */
function createNoOpDecorator<T extends Function>(options: ObserveOptions = {}): DecoratorFunction<T> {
  return function decorator(target: T): T {
    return target; // Return the function unchanged
  };
}

/**
 * Create a no-op method decorator
 */
function createNoOpMethodDecorator(options: ObserveOptions = {}): MethodDecorator {
  return function <T extends Function>(target: any, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>): TypedPropertyDescriptor<T> {
    return descriptor; // Return descriptor unchanged
  };
}

/**
 * Observability decorator that traces function execution when lmnr is available.
 *
 * This decorator will use lmnr's observe decorator if lmnr is installed,
 * otherwise it will be a no-op that accepts the same parameters.
 *
 * @param options - Observability configuration options
 * @returns Decorated function that may be traced depending on lmnr availability
 *
 * @example
 * ```typescript
 * @observe({ name: "my_function", metadata: { version: "1.0" } })
 * function myFunction(param1: string, param2: number): string {
 *   return param1 + param2;
 * }
 * ```
 */
export function observe(options: ObserveOptions = {}): MethodDecorator {
  const config = {
    name: options.name,
    ignore_input: options.ignoreInput || false,
    ignore_output: options.ignoreOutput || false,
    metadata: options.metadata,
    span_type: options.spanType || 'DEFAULT',
    ...options,
  };

  if (LMNR_AVAILABLE && lmnrObserve) {
    try {
      // Use the real lmnr observe decorator
      return lmnrObserve(config);
    } catch (error) {
      console.warn('Failed to use lmnr observe decorator:', error);
      return createNoOpMethodDecorator(options);
    }
  } else {
    // Use no-op decorator
    return createNoOpMethodDecorator(options);
  }
}

/**
 * Debug-only observability decorator that only traces when in debug mode.
 *
 * This decorator will use lmnr's observe decorator if both lmnr is installed
 * AND we're in debug mode, otherwise it will be a no-op.
 *
 * Debug mode is determined by:
 * - LMNR_LOGGING_LEVEL environment variable set to 'debug'
 *
 * @param options - Observability configuration options
 * @returns Decorated function that may be traced only in debug mode
 *
 * @example
 * ```typescript
 * @observeDebug({ 
 *   name: "debug_function", 
 *   ignoreInput: true, 
 *   ignoreOutput: true,
 *   metadata: { debug: true } 
 * })
 * function debugFunction(param1: string, param2: number): string {
 *   return param1 + param2;
 * }
 * ```
 */
export function observeDebug(options: ObserveOptions = {}): MethodDecorator {
  const config = {
    name: options.name,
    ignore_input: options.ignoreInput || false,
    ignore_output: options.ignoreOutput || false,
    metadata: options.metadata,
    span_type: options.spanType || 'DEFAULT',
    ...options,
  };

  if (LMNR_AVAILABLE && lmnrObserve && isDebugMode()) {
    try {
      // Use the real lmnr observe decorator only in debug mode
      return lmnrObserve(config);
    } catch (error) {
      console.warn('Failed to use lmnr observe decorator in debug mode:', error);
      return createNoOpMethodDecorator(options);
    }
  } else {
    // Use no-op decorator (either not in debug mode or lmnr not available)
    return createNoOpMethodDecorator(options);
  }
}

/**
 * Function-style observability wrapper for non-decorator usage
 *
 * @param fn - Function to wrap
 * @param options - Observability configuration options
 * @returns Wrapped function that may be traced depending on lmnr availability
 */
export function observeFunction<T extends (...args: any[]) => any>(
  fn: T,
  options: ObserveOptions = {}
): T {
  const config = {
    name: options.name || fn.name,
    ignore_input: options.ignoreInput || false,
    ignore_output: options.ignoreOutput || false,
    metadata: options.metadata,
    span_type: options.spanType || 'DEFAULT',
    ...options,
  };

  if (LMNR_AVAILABLE && lmnrObserve) {
    try {
      // Use the real lmnr observe decorator
      return lmnrObserve(config)(fn);
    } catch (error) {
      console.warn('Failed to wrap function with lmnr observe:', error);
      return fn;
    }
  } else {
    // Return function unchanged
    return fn;
  }
}

/**
 * Debug-only function-style observability wrapper
 *
 * @param fn - Function to wrap
 * @param options - Observability configuration options
 * @returns Wrapped function that may be traced only in debug mode
 */
export function observeDebugFunction<T extends (...args: any[]) => any>(
  fn: T,
  options: ObserveOptions = {}
): T {
  const config = {
    name: options.name || fn.name,
    ignore_input: options.ignoreInput || false,
    ignore_output: options.ignoreOutput || false,
    metadata: options.metadata,
    span_type: options.spanType || 'DEFAULT',
    ...options,
  };

  if (LMNR_AVAILABLE && lmnrObserve && isDebugMode()) {
    try {
      // Use the real lmnr observe decorator only in debug mode
      return lmnrObserve(config)(fn);
    } catch (error) {
      console.warn('Failed to wrap function with lmnr observe in debug mode:', error);
      return fn;
    }
  } else {
    // Return function unchanged
    return fn;
  }
}

// Convenience functions for checking availability and debug status

/**
 * Check if lmnr is available for tracing
 */
export function isLmnrAvailable(): boolean {
  return LMNR_AVAILABLE;
}

/**
 * Check if we're currently in debug mode
 */
export function isDebugModeActive(): boolean {
  return isDebugMode();
}

/**
 * Get the current status of observability features
 */
export function getObservabilityStatus(): {
  lmnrAvailable: boolean;
  debugMode: boolean;
  observeActive: boolean;
  observeDebugActive: boolean;
} {
  return {
    lmnrAvailable: LMNR_AVAILABLE,
    debugMode: isDebugMode(),
    observeActive: LMNR_AVAILABLE,
    observeDebugActive: LMNR_AVAILABLE && isDebugMode(),
  };
}

// Export types
export type { ObserveOptions, SpanType };