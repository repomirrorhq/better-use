/**
 * Telemetry service implementation
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { BaseTelemetryEvent, TelemetryConfig, TelemetryEvent } from './types';

/**
 * Simple in-memory telemetry service for browser-use TypeScript
 * 
 * This is a basic implementation that can be extended with external services
 * like PostHog, Mixpanel, or custom analytics endpoints.
 */
export class TelemetryService extends EventEmitter {
  private static instance: TelemetryService | null = null;
  private config: TelemetryConfig & { userIdPath?: string };
  private userId: string | null = null;
  private sessionId: string;
  private eventQueue: TelemetryEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<TelemetryConfig & { userIdPath?: string }> = {}) {
    super();
    
    this.config = {
      enabled: process.env.BROWSER_USE_TELEMETRY !== 'false',
      debug: process.env.BROWSER_USE_DEBUG === 'true',
      endpoint: process.env.BROWSER_USE_TELEMETRY_ENDPOINT,
      apiKey: process.env.BROWSER_USE_TELEMETRY_API_KEY,
      flushInterval: 30000, // 30 seconds
      maxBatchSize: 100,
      ...config,
    };

    this.sessionId = uuidv4();

    if (this.config.enabled) {
      this.initializeUserId();
      this.startFlushTimer();
    }
  }

  /**
   * Get singleton instance of TelemetryService
   */
  static getInstance(config?: Partial<TelemetryConfig & { userIdPath?: string }>): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService(config);
    }
    return TelemetryService.instance;
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugEnabled(): boolean {
    return this.config.debug;
  }

  /**
   * Get the configured endpoint
   */
  getEndpoint(): string | undefined {
    return this.config.endpoint;
  }

  /**
   * Capture a telemetry event
   */
  async capture(event: TelemetryEvent): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Add default properties
    const enhancedEvent: TelemetryEvent = {
      ...event,
      timestamp: event.timestamp || new Date(),
      sessionId: event.sessionId || this.sessionId,
      userId: event.userId || await this.getUserId(),
    };

    if (this.config.debug) {
      console.debug('Telemetry event captured:', enhancedEvent);
    }

    this.eventQueue.push(enhancedEvent);
    this.emit('event', enhancedEvent);

    // Flush if queue is full
    if (this.eventQueue.length >= this.config.maxBatchSize) {
      await this.flush();
    }
  }

  /**
   * Flush all pending events
   */
  async flush(): Promise<void> {
    if (!this.config.enabled || this.eventQueue.length === 0) {
      return;
    }

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await this.sendEvents(events);
      this.emit('flush', events);
      
      if (this.config.debug) {
        console.debug(`Telemetry: Flushed ${events.length} events`);
      }
    } catch (error) {
      // Put events back in queue for retry
      this.eventQueue.unshift(...events);
      this.emit('error', error);
      
      if (this.config.debug) {
        console.error('Telemetry: Failed to flush events:', error);
      }
    }
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get the user ID
   */
  async getUserId(): Promise<string> {
    if (!this.userId) {
      await this.initializeUserId();
    }
    return this.userId || 'anonymous';
  }

  /**
   * Shutdown the telemetry service
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
    this.removeAllListeners();
  }

  /**
   * Initialize or load user ID from disk
   */
  private async initializeUserId(): Promise<void> {
    try {
      let userIdFile: string;
      
      if (this.config.userIdPath) {
        userIdFile = this.config.userIdPath;
      } else {
        const configDir = path.join(os.homedir(), '.config', 'browser-use-ts');
        userIdFile = path.join(configDir, 'device_id');
      }

      try {
        this.userId = await fs.readFile(userIdFile, 'utf-8');
      } catch (error) {
        // Generate new user ID
        this.userId = uuidv4();
        
        // Save to disk
        const dir = path.dirname(userIdFile);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(userIdFile, this.userId, 'utf-8');
      }
    } catch (error) {
      // Fall back to session-only ID
      this.userId = this.sessionId;
    }
  }

  /**
   * Send events to the configured endpoint
   */
  private async sendEvents(events: TelemetryEvent[]): Promise<void> {
    if (!this.config.endpoint) {
      // No endpoint configured - just store locally for debugging
      if (this.config.debug) {
        for (const event of events) {
          // Use stderr to avoid polluting stdout in MCP stdio mode
          console.error('Telemetry Event:', JSON.stringify(event, null, 2));
        }
      }
      return;
    }

    // Send to configured endpoint
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify({
        events,
        timestamp: new Date().toISOString(),
        source: 'browser-use-ts',
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * Start the periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        this.emit('error', error);
      });
    }, this.config.flushInterval);
  }
}

// Global telemetry service instance
let globalTelemetryService: TelemetryService | null = null;

/**
 * Get the global telemetry service instance
 */
export function getTelemetryService(): TelemetryService {
  if (!globalTelemetryService) {
    globalTelemetryService = new TelemetryService();
  }
  return globalTelemetryService;
}

/**
 * Initialize telemetry with custom configuration
 */
export function initializeTelemetry(config: Partial<TelemetryConfig> = {}): TelemetryService {
  if (globalTelemetryService) {
    globalTelemetryService.shutdown();
  }
  
  globalTelemetryService = new TelemetryService(config);
  return globalTelemetryService;
}

/**
 * Capture a telemetry event using the global service
 */
export async function capture(event: TelemetryEvent): Promise<void> {
  const service = getTelemetryService();
  await service.capture(event);
}