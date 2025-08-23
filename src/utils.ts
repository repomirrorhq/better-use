/**
 * Utility functions for browser-use
 */

import { config } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as urlParse } from 'url';
import { minimatch } from 'minimatch';

// Load environment variables
config();

/**
 * Check if a domain pattern has complex wildcards that could match too many domains
 */
export function isUnsafePattern(pattern: string): boolean {
  // Extract domain part if there's a scheme
  if (pattern.includes('://')) {
    pattern = pattern.split('://', 2)[1];
  }

  // Remove safe patterns (*.domain and domain.*)
  const bareDomain = pattern.replace(/\.\*/g, '').replace(/\*\./g, '');

  // If there are still wildcards, it's potentially unsafe
  return bareDomain.includes('*');
}

/**
 * Check if a URL is a new tab page
 */
export function isNewTabPage(url: string): boolean {
  return [
    'about:blank',
    'chrome://new-tab-page/',
    'chrome://new-tab-page',
    'chrome://newtab/',
    'chrome://newtab',
  ].includes(url);
}

/**
 * Check if a URL matches a domain pattern - SECURITY CRITICAL
 */
export function matchUrlWithDomainPattern(
  url: string,
  domainPattern: string,
  logWarnings: boolean = false
): boolean {
  try {
    // New tab pages should be handled at the callsite, not here
    if (isNewTabPage(url)) {
      return false;
    }

    const parsedUrl = urlParse(url);

    // Extract only the hostname and scheme components
    const scheme = parsedUrl.protocol?.replace(':', '').toLowerCase() || '';
    const domain = parsedUrl.hostname?.toLowerCase() || '';

    if (!scheme || !domain) {
      return false;
    }

    // Normalize the domain pattern
    domainPattern = domainPattern.toLowerCase();

    // Handle pattern with scheme
    let patternScheme: string;
    let patternDomain: string;
    
    if (domainPattern.includes('://')) {
      [patternScheme, patternDomain] = domainPattern.split('://', 2);
    } else {
      patternScheme = 'https'; // Default to matching only https for security
      patternDomain = domainPattern;
    }

    // Handle port in pattern (we strip ports from patterns since we already
    // extracted only the hostname from the URL)
    if (patternDomain.includes(':') && !patternDomain.startsWith(':')) {
      patternDomain = patternDomain.split(':', 2)[0];
    }

    // If scheme doesn't match, return False
    if (!minimatch(scheme, patternScheme)) {
      return false;
    }

    // Check for exact match
    if (patternDomain === '*' || domain === patternDomain) {
      return true;
    }

    // Handle glob patterns
    if (patternDomain.includes('*')) {
      // Check for unsafe glob patterns
      if ((patternDomain.match(/\*\./g) || []).length > 1 || 
          (patternDomain.match(/\.\*/g) || []).length > 1) {
        if (logWarnings) {
          console.error(`⛔️ Multiple wildcards in pattern=[${domainPattern}] are not supported`);
        }
        return false; // Don't match unsafe patterns
      }

      // Check for wildcards in TLD part (example.*)
      if (patternDomain.endsWith('.*')) {
        if (logWarnings) {
          console.error(`⛔️ Wildcard TLDs like in pattern=[${domainPattern}] are not supported for security`);
        }
        return false; // Don't match unsafe patterns
      }

      // Then check for embedded wildcards
      const bareDomain = patternDomain.replace(/\*\./g, '');
      if (bareDomain.includes('*')) {
        if (logWarnings) {
          console.error(`⛔️ Only *.domain style patterns are supported, ignoring pattern=[${domainPattern}]`);
        }
        return false; // Don't match unsafe patterns
      }

      // Special handling so that *.google.com also matches bare google.com
      if (patternDomain.startsWith('*.')) {
        const parentDomain = patternDomain.slice(2);
        if (domain === parentDomain || minimatch(domain, parentDomain)) {
          return true;
        }
      }

      // Normal case: match domain against pattern
      if (minimatch(domain, patternDomain)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(`⛔️ Error matching URL ${url} with pattern ${domainPattern}: ${error}`);
    return false;
  }
}

/**
 * Deep merge two objects
 */
export function mergeDicts(a: Record<string, any>, b: Record<string, any>, path: string[] = []): Record<string, any> {
  for (const key in b) {
    if (key in a) {
      if (typeof a[key] === 'object' && typeof b[key] === 'object' && 
          a[key] !== null && b[key] !== null && 
          !Array.isArray(a[key]) && !Array.isArray(b[key])) {
        mergeDicts(a[key], b[key], [...path, key]);
      } else if (Array.isArray(a[key]) && Array.isArray(b[key])) {
        a[key] = [...a[key], ...b[key]];
      } else if (a[key] !== b[key]) {
        throw new Error(`Conflict at ${[...path, key].join('.')}`);
      }
    } else {
      a[key] = b[key];
    }
  }
  return a;
}

/**
 * Get the better-use package version
 */
export function getBetterUseVersion(): string {
  try {
    const packageJsonPath = join(__dirname, '../package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const version = packageJson.version || 'unknown';
      process.env.LIBRARY_VERSION = version;
      return version;
    }
    return 'unknown';
  } catch (error) {
    console.debug(`Error detecting better-use version: ${error}`);
    return 'unknown';
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use getBetterUseVersion instead
 */
export function getBrowserUseVersion(): string {
  return getBetterUseVersion();
}

/**
 * Pretty-print a path, shorten home dir to ~ and cwd to .
 */
export function logPrettyPath(path: string | null | undefined): string {
  if (!path || !path.trim()) {
    return '';
  }

  const homedir = require('os').homedir();
  const cwd = process.cwd();
  
  // Replace home dir and cwd with ~ and .
  let prettyPath = path.replace(homedir, '~').replace(cwd, '.');

  // Wrap in quotes if it contains spaces
  if (prettyPath.trim() && prettyPath.includes(' ')) {
    prettyPath = `"${prettyPath}"`;
  }

  return prettyPath;
}

/**
 * Truncate/pretty-print a URL with a maximum length, removing the protocol and www. prefix
 */
export function logPrettyUrl(s: string, maxLen?: number): string {
  let result = s.replace(/https?:\/\//, '').replace(/^www\./, '');
  if (maxLen !== undefined && result.length > maxLen) {
    return result.slice(0, maxLen) + '…';
  }
  return result;
}

/**
 * Check if all required environment variables are set
 */
export function checkEnvVariables(keys: string[], anyOrAll: 'any' | 'all' = 'all'): boolean {
  const checkFn = anyOrAll === 'any' ? 'some' : 'every';
  return keys[checkFn](key => Boolean(process.env[key]?.trim()));
}

/**
 * Sleep for the specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Time execution decorator for async functions
 */
export function timeExecution(additionalText: string = '') {
  return function<T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const method = descriptor.value!;
    
    descriptor.value = (async function(this: any, ...args: Parameters<T>) {
      const startTime = Date.now();
      const result = await method.apply(this, args);
      const executionTime = (Date.now() - startTime) / 1000;
      
      // Only log if execution takes more than 0.25 seconds
      if (executionTime > 0.25) {
        const logger = this.logger || console;
        logger.debug(`⏳ ${additionalText.replace(/-/g, '')}() took ${executionTime.toFixed(2)}s`);
      }
      return result;
    }) as any;
    
    return descriptor;
  };
}