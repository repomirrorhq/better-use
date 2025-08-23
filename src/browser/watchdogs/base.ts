/**
 * Base watchdog class for browser monitoring components.
 * 
 * Watchdogs monitor browser state and emit events based on changes.
 * They automatically register event handlers based on method names.
 * 
 * Handler methods should be named: on_EventTypeName(event: EventTypeName)
 */

import { EventEmitter } from 'events';
import { BrowserSession } from '../session';
import { BaseEvent } from '../events';
import { getLogger } from '../../logging';

export interface WatchdogConfig {
  checkIntervalSeconds?: number;
  enabled?: boolean;
}

export abstract class BaseWatchdog extends EventEmitter {
  protected browserSession: BrowserSession;
  protected config: WatchdogConfig;
  private handlers: Map<string, Function> = new Map();
  private monitoringTask?: NodeJS.Timeout;
  protected isAttached = false;

  // Static contract declarations (override in subclasses)
  static LISTENS_TO: string[] = [];
  static EMITS: string[] = [];

  constructor(browserSession: BrowserSession, config: WatchdogConfig = {}) {
    super();
    this.browserSession = browserSession;
    this.config = {
      checkIntervalSeconds: 5.0,
      enabled: true,
      ...config,
    };
  }

  /**
   * Attach watchdog to its browser session and start monitoring.
   * This method handles event listener registration.
   */
  attachToSession(): void {
    if (this.isAttached) {
      throw new Error(`[${this.constructor.name}] Already attached to session`);
    }

    // Register event handlers automatically based on method names
    const eventHandlers = this.findEventHandlers();
    
    for (const [eventName, handler] of eventHandlers) {
      this.attachHandlerToSession(eventName, handler);
    }

    this.isAttached = true;
    this.onAttached();
  }

  /**
   * Detach watchdog from session and cleanup.
   */
  detachFromSession(): void {
    if (!this.isAttached) return;

    // Clear all event handlers
    this.handlers.clear();
    
    // Stop monitoring
    if (this.monitoringTask) {
      clearInterval(this.monitoringTask);
      this.monitoringTask = undefined;
    }

    this.isAttached = false;
    this.onDetached();
  }

  /**
   * Find all handler methods (on_EventName pattern).
   */
  private findEventHandlers(): Map<string, Function> {
    const handlers = new Map<string, Function>();
    const prototype = Object.getPrototypeOf(this);
    
    // Get all method names from the prototype chain
    const methodNames = Object.getOwnPropertyNames(prototype);
    
    for (const methodName of methodNames) {
      if (methodName.startsWith('on_') && typeof this[methodName as keyof this] === 'function') {
        // Extract event name from method name (on_EventName -> EventName)
        const eventName = methodName.slice(3); // Remove 'on_' prefix
        const handler = (this[methodName as keyof this] as Function).bind(this);
        handlers.set(eventName, handler);
      }
    }

    return handlers;
  }

  /**
   * Attach a single event handler to the browser session.
   */
  private attachHandlerToSession(eventName: string, handler: Function): void {
    const uniqueHandlerName = `${this.constructor.name}.on_${eventName}`;
    
    // Check for duplicate handlers
    if (this.handlers.has(uniqueHandlerName)) {
      throw new Error(
        `[${this.constructor.name}] Duplicate handler registration attempted! ` +
        `Handler ${uniqueHandlerName} is already registered for ${eventName}.`
      );
    }

    // Create wrapped handler with error handling and logging
    const wrappedHandler = async (event: BaseEvent) => {
      const startTime = Date.now();
      
      try {
        this.logger.debug(
          `🚌 [${this.constructor.name}.on_${eventName}] ⏳ Starting...`
        );
        
        const result = await handler(event);
        
        const elapsed = Date.now() - startTime;
        this.logger.debug(
          `🚌 [${this.constructor.name}.on_${eventName}] ✅ Succeeded (${elapsed}ms)`
        );
        
        return result;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        this.logger.error(
          `🚌 [${this.constructor.name}.on_${eventName}] ❌ Failed (${elapsed}ms): ${error}`
        );
        
        // Attempt basic recovery
        await this.attemptRecovery(error as Error);
        throw error;
      }
    };

    // Register with browser session event system
    this.browserSession.on(eventName, wrappedHandler);
    this.handlers.set(uniqueHandlerName, wrappedHandler);
  }

  /**
   * Attempt basic recovery when handler fails.
   */
  protected async attemptRecovery(error: Error): Promise<void> {
    // Basic CDP session recovery
    try {
      if (error.message.includes('Connection') || error.message.includes('CDP')) {
        this.logger.debug(`[${this.constructor.name}] Attempting CDP recovery...`);
        // This would need to be implemented based on the session's recovery mechanisms
      }
    } catch (recoveryError) {
      this.logger.error(`[${this.constructor.name}] Recovery failed: ${recoveryError}`);
    }
  }

  /**
   * Start periodic monitoring if supported by the watchdog.
   */
  protected startMonitoring(): void {
    if (this.monitoringTask || !this.config.enabled) return;

    const intervalMs = (this.config.checkIntervalSeconds || 5.0) * 1000;
    this.monitoringTask = setInterval(async () => {
      try {
        await this.onMonitoringTick();
      } catch (error) {
        this.logger.error(`[${this.constructor.name}] Monitoring tick failed: ${error}`);
      }
    }, intervalMs);

    this.logger.debug(`[${this.constructor.name}] Started monitoring (${intervalMs}ms interval)`);
  }

  /**
   * Stop periodic monitoring.
   */
  protected stopMonitoring(): void {
    if (this.monitoringTask) {
      clearInterval(this.monitoringTask);
      this.monitoringTask = undefined;
      this.logger.debug(`[${this.constructor.name}] Stopped monitoring`);
    }
  }

  /**
   * Get logger for this watchdog.
   */
  protected get logger() {
    // Create a logger for the specific watchdog class
    return getLogger(`browser_use.${this.constructor.name}`);
  }

  /**
   * Called when watchdog is attached to session.
   * Override in subclasses to perform initialization.
   */
  protected onAttached(): void {
    // Override in subclasses
  }

  /**
   * Called when watchdog is detached from session.
   * Override in subclasses to perform cleanup.
   */
  protected onDetached(): void {
    // Override in subclasses
  }

  /**
   * Called periodically during monitoring.
   * Override in subclasses to perform health checks.
   */
  protected async onMonitoringTick(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Cleanup resources when watchdog is destroyed.
   */
  destroy(): void {
    this.detachFromSession();
    this.removeAllListeners();
  }
}