/**
 * Security watchdog for enforcing URL access policies.
 */

import { BaseWatchdog, WatchdogConfig } from './base';
import { BrowserSession } from '../session';
import {
  NavigateToUrlEvent,
  NavigationCompleteEvent,
  TabCreatedEvent,
  BrowserErrorEvent,
} from '../events';
import { URL } from 'url';
import { minimatch } from 'minimatch';

export interface SecurityWatchdogConfig extends WatchdogConfig {
  allowedDomains?: string[];
  blockRedirects?: boolean;
}

// Track if we've shown the glob warning
let globWarningShown = false;

export class SecurityWatchdog extends BaseWatchdog {
  // Event contracts
  static LISTENS_TO = [
    'NavigateToUrlEvent',
    'NavigationCompleteEvent', 
    'TabCreatedEvent',
  ];
  static EMITS = ['BrowserErrorEvent'];

  protected config: SecurityWatchdogConfig;

  constructor(browserSession: BrowserSession, config: SecurityWatchdogConfig = {}) {
    super(browserSession, config);
    this.config = {
      blockRedirects: false,
      ...config,
    };
  }

  protected onAttached(): void {
    this.logger.debug('[SecurityWatchdog] Security policies attached');
  }

  async on_NavigateToUrlEvent(event: NavigateToUrlEvent): Promise<void> {
    // Security check BEFORE navigation
    if (!this.isUrlAllowed(event.url)) {
      console.warn(`⛔️ Blocking navigation to disallowed URL: ${event.url}`);
      
      const errorEvent = {
        errorType: 'NavigationBlocked',
        message: `Navigation blocked to disallowed URL: ${event.url}`,
        details: { 
          url: event.url, 
          reason: 'not_in_allowed_domains' 
        },
      };

      this.browserSession.emit('BrowserErrorEvent', errorEvent);
      
      // Stop event propagation by throwing exception
      throw new Error(`Navigation to ${event.url} blocked by security policy`);
    }
  }

  async on_NavigationCompleteEvent(event: NavigationCompleteEvent): Promise<void> {
    // Check if the navigated URL is allowed (in case of redirects)
    if (!this.isUrlAllowed(event.url)) {
      console.warn(`⛔️ Navigation to non-allowed URL detected: ${event.url}`);

      // Dispatch browser error
      const errorEvent = {
        errorType: 'NavigationBlocked',
        message: `Navigation to non-allowed URL: ${event.url}`,
        details: { 
          url: event.url, 
          targetId: event.target_id 
        },
      };

      this.browserSession.emit('BrowserErrorEvent', errorEvent);

      // Try to close the tab that navigated to disallowed URL
      try {
        if (event.target_id) {
          await this.browserSession.closeTab(event.target_id);
          console.info(`⛔️ Closed target with non-allowed URL: ${event.url}`);
        }
      } catch (error) {
        console.error(`⛔️ Failed to close target with non-allowed URL: ${error}`);
      }
    }
  }

  async on_TabCreatedEvent(event: TabCreatedEvent): Promise<void> {
    if (!this.isUrlAllowed(event.url)) {
      console.warn(`⛔️ New tab created with disallowed URL: ${event.url}`);

      // Dispatch error and try to close the tab
      const errorEvent = {
        errorType: 'TabCreationBlocked',
        message: `Tab created with non-allowed URL: ${event.url}`,
        details: { 
          url: event.url, 
          targetId: event.target_id 
        },
      };

      this.browserSession.emit('BrowserErrorEvent', errorEvent);

      // Try to close the offending tab
      try {
        if (event.target_id) {
          await this.browserSession.closeTab(event.target_id);
          console.info(`⛔️ Closed new tab with non-allowed URL: ${event.url}`);
        }
      } catch (error) {
        console.error(`⛔️ Failed to close new tab with non-allowed URL: ${error}`);
      }
    }
  }

  private logGlobWarning(): void {
    if (!globWarningShown) {
      globWarningShown = true;
      console.warn(
        '⚠️ Using glob patterns in allowed_domains. ' +
        'Note: Patterns like "*.example.com" will match both subdomains AND the main domain.'
      );
    }
  }

  /**
   * Check if a URL is allowed based on the allowed_domains configuration.
   */
  private isUrlAllowed(url: string): boolean {
    // Get allowed domains from browser profile or config
    const allowedDomains = this.config.allowedDomains;
    
    // If no allowed_domains specified, allow all URLs
    if (!allowedDomains || allowedDomains.length === 0) {
      return true;
    }

    // Always allow internal browser targets
    if (this.isInternalUrl(url)) {
      return true;
    }

    // Parse the URL to extract components
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (error) {
      // Invalid URL
      this.logger.debug(`[SecurityWatchdog] Invalid URL format: ${url}`);
      return false;
    }

    // Get the actual host (domain)
    const host = parsed.hostname;
    if (!host) {
      return false;
    }

    // Check each allowed domain pattern
    for (const pattern of allowedDomains) {
      if (this.matchesPattern(url, host, pattern, parsed)) {
        return true;
      }
    }

    return false;
  }

  private isInternalUrl(url: string): boolean {
    return [
      'about:blank',
      'chrome://new-tab-page/',
      'chrome://new-tab-page',
      'chrome://newtab/',
    ].includes(url);
  }

  private matchesPattern(url: string, host: string, pattern: string, parsed: URL): boolean {
    // Handle glob patterns
    if (pattern.includes('*')) {
      this.logGlobWarning();

      if (pattern.startsWith('*.')) {
        // Pattern like *.example.com should match subdomains and main domain
        const domainPart = pattern.slice(2); // Remove *.
        if (host === domainPart || host.endsWith('.' + domainPart)) {
          // Only match http/https URLs for domain-only patterns
          return ['http:', 'https:'].includes(parsed.protocol);
        }
      } else if (pattern.endsWith('/*')) {
        // Pattern like brave://* should match any brave:// URL
        const prefix = pattern.slice(0, -1); // Remove the * at the end
        return url.startsWith(prefix);
      } else {
        // Use minimatch for other glob patterns
        return minimatch(host, pattern);
      }
    } else {
      // Exact match
      if (pattern.startsWith('http://') || pattern.startsWith('https://') || 
          pattern.startsWith('chrome://') || pattern.startsWith('brave://') || 
          pattern.startsWith('file://')) {
        // Full URL pattern
        return url.startsWith(pattern);
      } else {
        // Domain-only pattern
        return host === pattern;
      }
    }

    return false;
  }

  /**
   * Get current security configuration.
   */
  public getSecurityConfig() {
    return {
      allowedDomains: this.config.allowedDomains || [],
      blockRedirects: this.config.blockRedirects,
    };
  }

  /**
   * Update allowed domains configuration.
   */
  public updateAllowedDomains(domains: string[]): void {
    this.config.allowedDomains = domains;
    this.logger.info(`[SecurityWatchdog] Updated allowed domains: ${domains.join(', ')}`);
  }
}