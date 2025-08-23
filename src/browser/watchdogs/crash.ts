/**
 * Browser watchdog for monitoring crashes and network timeouts.
 */

import { BaseWatchdog, WatchdogConfig } from './base';
import { BrowserSession } from '../session';
import {
  BrowserConnectedEvent,
  BrowserStoppedEvent,
  BrowserErrorEvent,
  TabCreatedEvent,
} from '../events';

export interface CrashWatchdogConfig extends WatchdogConfig {
  networkTimeoutSeconds?: number;
  checkIntervalSeconds?: number;
}

interface NetworkRequestTracker {
  requestId: string;
  startTime: number;
  url: string;
  method: string;
  resourceType?: string;
}

export class CrashWatchdog extends BaseWatchdog {
  // Event contracts
  static LISTENS_TO = [
    'BrowserConnectedEvent',
    'BrowserStoppedEvent', 
    'TabCreatedEvent',
  ];
  static EMITS = ['BrowserErrorEvent'];

  protected config: CrashWatchdogConfig;
  private activeRequests = new Map<string, NetworkRequestTracker>();
  private lastResponsiveChecks = new Map<string, number>();
  private sessionsWithListeners = new Set<string>();

  constructor(browserSession: BrowserSession, config: CrashWatchdogConfig = {}) {
    super(browserSession, config);
    this.config = {
      networkTimeoutSeconds: 10.0,
      checkIntervalSeconds: 5.0,
      ...config,
    };
  }

  protected onAttached(): void {
    this.logger.debug('[CrashWatchdog] Attached to session');
  }

  protected onDetached(): void {
    this.activeRequests.clear();
    this.lastResponsiveChecks.clear();
    this.sessionsWithListeners.clear();
    this.logger.debug('[CrashWatchdog] Detached from session');
  }

  async on_BrowserConnectedEvent(event: BrowserConnectedEvent): Promise<void> {
    this.logger.debug('[CrashWatchdog] Browser connected event received, beginning monitoring');
    this.startMonitoring();
  }

  async on_BrowserStoppedEvent(event: BrowserStoppedEvent): Promise<void> {
    this.logger.debug('[CrashWatchdog] Browser stopped, ending monitoring');
    this.stopMonitoring();
  }

  async on_TabCreatedEvent(event: TabCreatedEvent): Promise<void> {
    this.logger.debug('[CrashWatchdog] Tab created, attaching to new tab');
    // Attach to new tab if we have target info
    if (event.target_id) {
      await this.attachToTarget(event.target_id);
    }
  }

  /**
   * Set up crash monitoring for a specific target.
   */
  private async attachToTarget(targetId: string): Promise<void> {
    try {
      this.logger.debug(`[CrashWatchdog] Attaching to target: ${targetId}`);
      
      // For now, just log attachment - full CDP integration would require
      // access to the browser session's CDP client
      this.lastResponsiveChecks.set(targetId, Date.now());
      
    } catch (error) {
      console.warn(`[CrashWatchdog] Failed to attach to target ${targetId}: ${error}`);
    }
  }

  /**
   * Periodic monitoring tick to check browser health.
   */
  protected async onMonitoringTick(): Promise<void> {
    await Promise.all([
      this.checkNetworkTimeouts(),
      this.checkBrowserHealth(),
    ]);
  }

  /**
   * Check for network requests exceeding timeout.
   */
  private async checkNetworkTimeouts(): Promise<void> {
    const currentTime = Date.now();
    const timeoutMs = this.config.networkTimeoutSeconds! * 1000;
    const timedOutRequests: [string, NetworkRequestTracker][] = [];

    for (const [requestId, tracker] of this.activeRequests) {
      const elapsed = currentTime - tracker.startTime;
      if (elapsed >= timeoutMs) {
        timedOutRequests.push([requestId, tracker]);
      }
    }

    // Emit events for timed out requests
    for (const [requestId, tracker] of timedOutRequests) {
      const elapsedSeconds = (currentTime - tracker.startTime) / 1000;
      
      console.warn(
        `[CrashWatchdog] Network request timeout after ${this.config.networkTimeoutSeconds}s: ` +
        `${tracker.method} ${tracker.url.slice(0, 100)}...`
      );

      // Emit browser error event
      const errorEvent = {
        errorType: 'NetworkTimeout',
        message: `Network request timed out after ${this.config.networkTimeoutSeconds}s`,
        details: {
          url: tracker.url,
          method: tracker.method,
          resourceType: tracker.resourceType,
          elapsedSeconds,
        },
      };

      this.browserSession.emit('BrowserErrorEvent', errorEvent);

      // Remove from tracking
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Check if browser and targets are still responsive.
   */
  private async checkBrowserHealth(): Promise<void> {
    try {
      // Basic health check - verify browser session is responsive
      if (!this.browserSession.isRunning) {
        this.logger.debug('[CrashWatchdog] Browser session not started, skipping health check');
        return;
      }

      // Try to get current page URL as a simple health check
      const state = await this.browserSession.getBrowserState();
      
      if (!state || !state.url) {
        console.warn('[CrashWatchdog] Browser health check failed - no valid state');
        
        const errorEvent = {
          errorType: 'BrowserUnresponsive',
          message: 'Browser session appears unresponsive',
          details: { timestamp: Date.now() },
        };

        this.browserSession.emit('BrowserErrorEvent', errorEvent);
      } else {
        this.logger.debug(`[CrashWatchdog] Browser health check passed - current URL: ${state.url}`);
      }

    } catch (error) {
      this.logger.error(`[CrashWatchdog] Browser health check failed: ${error}`);
      
      const errorEvent = {
        errorType: 'BrowserHealthCheckFailed',
        message: `Browser health check failed: ${error}`,
        details: { error: String(error), timestamp: Date.now() },
      };

      this.browserSession.emit('BrowserErrorEvent', errorEvent);
    }
  }

  /**
   * Track a new network request.
   */
  public trackRequest(requestId: string, url: string, method: string, resourceType?: string): void {
    this.activeRequests.set(requestId, {
      requestId,
      startTime: Date.now(),
      url,
      method,
      resourceType,
    });

    this.logger.debug(`[CrashWatchdog] Tracking request: ${method} ${url.slice(0, 50)}...`);
  }

  /**
   * Remove request from tracking when completed.
   */
  public completeRequest(requestId: string): void {
    const tracker = this.activeRequests.get(requestId);
    if (tracker) {
      const elapsed = (Date.now() - tracker.startTime) / 1000;
      this.logger.debug(`[CrashWatchdog] Request completed in ${elapsed.toFixed(2)}s: ${tracker.url.slice(0, 50)}...`);
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Get current monitoring statistics.
   */
  public getStats() {
    return {
      activeRequests: this.activeRequests.size,
      trackedTargets: this.lastResponsiveChecks.size,
      isMonitoring: true, // Simplified for now
    };
  }
}