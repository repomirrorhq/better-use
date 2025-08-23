/**
 * Storage state watchdog for managing browser cookies and storage persistence.
 * 
 * Monitors and persists browser storage state including cookies and localStorage.
 * Provides automatic saving and loading of browser session state.
 */

import { BaseWatchdog, WatchdogConfig } from './base';
import { BrowserSession } from '../session';
import {
  BrowserConnectedEvent,
  SaveStorageStateEvent,
  LoadStorageStateEvent,
  StorageStateSavedEvent,
  StorageStateLoadedEvent,
} from '../events';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface StorageStateWatchdogConfig extends WatchdogConfig {
  autoSaveInterval?: number; // Auto-save interval in seconds (default: 30)
  saveOnChange?: boolean; // Save immediately when storage changes (default: true)
  storageStatePath?: string; // Path to storage state file
}

export class StorageStateWatchdog extends BaseWatchdog {
  // Event contracts
  static LISTENS_TO = [
    'BrowserConnectedEvent',
    'SaveStorageStateEvent',
    'LoadStorageStateEvent',
  ];
  static EMITS = [
    'StorageStateSavedEvent',
    'StorageStateLoadedEvent',
  ];

  protected config: StorageStateWatchdogConfig;
  private monitoringInterval?: NodeJS.Timeout;
  private lastCookieState: any[] = [];
  private saveLock = false;

  constructor(browserSession: BrowserSession, config: StorageStateWatchdogConfig = {}) {
    super(browserSession, config);
    this.config = {
      autoSaveInterval: 30, // 30 seconds
      saveOnChange: true,
      ...config,
    };
  }

  async onBrowserConnectedEvent(event: BrowserConnectedEvent): Promise<void> {
    // Start monitoring when browser starts
    console.debug('[StorageStateWatchdog] 🍪 Initializing auth/cookies sync <-> with storage_state.json file');

    // Start monitoring
    await this.startStorageMonitoring();

    // Automatically load storage state after browser start
    this.browserSession.emit('LoadStorageStateEvent', {
      timestamp: Date.now()
    } as LoadStorageStateEvent);
  }

  async onSaveStorageStateEvent(event: SaveStorageStateEvent): Promise<void> {
    // Handle storage state save request
    const filePath = event.path || this.getDefaultStorageStatePath();
    await this.saveStorageState(filePath);
  }

  async onLoadStorageStateEvent(event: LoadStorageStateEvent): Promise<void> {
    // Handle storage state load request
    const filePath = event.path || this.getDefaultStorageStatePath();
    await this.loadStorageState(filePath);
  }

  /**
   * Start monitoring storage state changes
   */
  private async startStorageMonitoring(): Promise<void> {
    if (this.config.autoSaveInterval && this.config.autoSaveInterval > 0) {
      this.monitoringInterval = setInterval(async () => {
        try {
          await this.checkAndSaveIfChanged();
        } catch (error) {
          console.error('[StorageStateWatchdog] Error during auto-save:', error);
        }
      }, this.config.autoSaveInterval * 1000);
    }
  }

  /**
   * Stop monitoring storage state changes
   */
  private stopStorageMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Check if storage state changed and save if needed
   */
  private async checkAndSaveIfChanged(): Promise<void> {
    if (this.saveLock || !this.config.saveOnChange) {
      return;
    }

    try {
      const currentState = await this.getCurrentStorageState();
      const currentCookies = currentState.cookies || [];

      // Simple comparison - in a full implementation, this would be more sophisticated
      if (JSON.stringify(currentCookies) !== JSON.stringify(this.lastCookieState)) {
        this.lastCookieState = currentCookies;
        await this.saveStorageState(this.getDefaultStorageStatePath());
      }
    } catch (error) {
      console.error('[StorageStateWatchdog] Error checking storage state:', error);
    }
  }

  /**
   * Save storage state to file
   */
  private async saveStorageState(filePath: string): Promise<void> {
    if (this.saveLock) {
      return; // Already saving
    }

    this.saveLock = true;
    try {
      const storageState = await this.getCurrentStorageState();
      
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Save to file
      await fs.writeFile(filePath, JSON.stringify(storageState, null, 2), 'utf8');
      
      console.debug(`[StorageStateWatchdog] Storage state saved to ${filePath}`);
      
      // Emit success event
      this.browserSession.emit('StorageStateSavedEvent', {
        path: filePath,
        timestamp: Date.now()
      } as StorageStateSavedEvent);
    } catch (error) {
      console.error(`[StorageStateWatchdog] Failed to save storage state: ${error}`);
      throw error;
    } finally {
      this.saveLock = false;
    }
  }

  /**
   * Load storage state from file
   */
  private async loadStorageState(filePath: string): Promise<void> {
    try {
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        console.debug(`[StorageStateWatchdog] No storage state file found at ${filePath}, skipping load`);
        return;
      }

      // Read and parse file
      const data = await fs.readFile(filePath, 'utf8');
      const storageState = JSON.parse(data);
      
      // For now, just emit the loaded event since we can't directly access context
      // TODO: Add public methods to BrowserSession for storage state management
      console.debug(`[StorageStateWatchdog] Storage state loaded from ${filePath} (placeholder implementation)`);
      
      // Update our cache
      this.lastCookieState = storageState.cookies || [];
      
      // Emit success event
      this.browserSession.emit('StorageStateLoadedEvent', {
        path: filePath,
        timestamp: Date.now()
      } as StorageStateLoadedEvent);
    } catch (error) {
      console.error(`[StorageStateWatchdog] Failed to load storage state: ${error}`);
      // Don't throw - loading failure shouldn't break the session
    }
  }

  /**
   * Get current storage state from browser
   */
  private async getCurrentStorageState(): Promise<any> {
    // TODO: Add public method to BrowserSession to get storage state
    // For now, return a placeholder
    return { cookies: [], origins: [] };
  }

  /**
   * Get default storage state file path
   */
  private getDefaultStorageStatePath(): string {
    if (this.config.storageStatePath) {
      return this.config.storageStatePath;
    }

    // Use profile path if available, otherwise use a default location
    const profilePath = this.browserSession.browserProfile?.userDataDir || './browser-data';
    return path.join(profilePath, 'storage_state.json');
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    this.stopStorageMonitoring();
    super.destroy();
  }
}