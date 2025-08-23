/**
 * Sync service for browser-use TypeScript
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { SyncConfig, SyncDataType, SyncItem, SyncOperation, SyncStatus } from './types';
import { AuthService } from './auth';

/**
 * Sync service for synchronizing data with cloud
 */
export class SyncService extends EventEmitter {
  private config: SyncConfig;
  private authService: AuthService;
  private pendingOperations: SyncOperation[] = [];
  private syncTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private lastSyncTime: Date | null = null;

  constructor(config: Partial<SyncConfig> = {}) {
    super();
    
    this.config = {
      enabled: process.env.BROWSER_USE_SYNC_ENABLED === 'true',
      endpoint: process.env.BROWSER_USE_SYNC_ENDPOINT,
      apiKey: process.env.BROWSER_USE_SYNC_API_KEY,
      userId: process.env.BROWSER_USE_SYNC_USER_ID,
      syncInterval: 300000, // 5 minutes
      maxRetries: 3,
      debug: process.env.BROWSER_USE_DEBUG === 'true',
      ...config,
    };

    this.authService = new AuthService();

    if (this.config.enabled) {
      this.initialize();
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return {
      enabled: this.config.enabled,
      connected: this.connected,
      lastSyncTime: this.lastSyncTime || undefined,
      pendingOperations: this.pendingOperations.length,
      failedOperations: 0, // TODO: track failed operations
      error: undefined,
    };
  }

  /**
   * Create a sync item
   */
  async createItem(type: SyncDataType, data: Record<string, any>): Promise<string> {
    const authInfo = await this.authService.getAuthInfo();
    if (!authInfo) {
      throw new Error('Not authenticated');
    }

    const item: SyncItem = {
      id: uuidv4(),
      type,
      data,
      timestamp: new Date(),
      userId: authInfo.userId,
      version: 1,
    };

    const operation: SyncOperation = {
      operation: 'create',
      item,
      timestamp: new Date(),
    };

    this.pendingOperations.push(operation);
    this.emit('item_created', item);

    if (this.config.debug) {
      console.debug('Sync: Item created', { type, id: item.id });
    }

    // Trigger immediate sync if connected
    if (this.connected) {
      this.syncNow().catch(error => this.emit('error', error));
    }

    return item.id;
  }

  /**
   * Update a sync item
   */
  async updateItem(id: string, type: SyncDataType, data: Record<string, any>): Promise<void> {
    const authInfo = await this.authService.getAuthInfo();
    if (!authInfo) {
      throw new Error('Not authenticated');
    }

    const item: SyncItem = {
      id,
      type,
      data,
      timestamp: new Date(),
      userId: authInfo.userId,
      version: 1, // TODO: implement proper versioning
    };

    const operation: SyncOperation = {
      operation: 'update',
      item,
      timestamp: new Date(),
    };

    this.pendingOperations.push(operation);
    this.emit('item_updated', item);

    if (this.config.debug) {
      console.debug('Sync: Item updated', { type, id });
    }

    // Trigger immediate sync if connected
    if (this.connected) {
      this.syncNow().catch(error => this.emit('error', error));
    }
  }

  /**
   * Delete a sync item
   */
  async deleteItem(id: string, type: SyncDataType): Promise<void> {
    const authInfo = await this.authService.getAuthInfo();
    if (!authInfo) {
      throw new Error('Not authenticated');
    }

    const item: SyncItem = {
      id,
      type,
      data: {},
      timestamp: new Date(),
      userId: authInfo.userId,
      version: 1,
    };

    const operation: SyncOperation = {
      operation: 'delete',
      item,
      timestamp: new Date(),
    };

    this.pendingOperations.push(operation);
    this.emit('item_deleted', item);

    if (this.config.debug) {
      console.debug('Sync: Item deleted', { type, id });
    }

    // Trigger immediate sync if connected
    if (this.connected) {
      this.syncNow().catch(error => this.emit('error', error));
    }
  }

  /**
   * Authenticate with the sync service
   */
  async authenticate(apiKey?: string, userId?: string): Promise<void> {
    const key = apiKey || this.config.apiKey;
    if (!key) {
      throw new Error('API key required for authentication');
    }

    await this.authService.authenticate(key, userId || this.config.userId);
    
    // Test connection
    await this.testConnection();
    this.connected = true;
    this.emit('authenticated');

    if (this.config.debug) {
      console.debug('Sync: Authenticated successfully');
    }
  }

  /**
   * Perform immediate sync
   */
  async syncNow(): Promise<void> {
    if (!this.config.enabled || !this.connected) {
      return;
    }

    if (this.pendingOperations.length === 0) {
      return;
    }

    try {
      const operations = [...this.pendingOperations];
      this.pendingOperations = [];

      await this.sendOperations(operations);
      
      this.lastSyncTime = new Date();
      this.emit('sync_completed', { operationCount: operations.length });

      if (this.config.debug) {
        console.debug(`Sync: Completed with ${operations.length} operations`);
      }

    } catch (error) {
      // Put operations back for retry
      this.pendingOperations.unshift(...this.pendingOperations);
      this.emit('sync_failed', error);
      throw error;
    }
  }

  /**
   * Start sync service
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Try to authenticate if API key is available
    if (this.config.apiKey) {
      try {
        await this.authenticate();
      } catch (error) {
        if (this.config.debug) {
          console.debug('Sync: Auto-authentication failed:', error);
        }
      }
    }

    this.startSyncTimer();
    this.emit('started');
  }

  /**
   * Stop sync service
   */
  async stop(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Perform final sync
    if (this.connected && this.pendingOperations.length > 0) {
      try {
        await this.syncNow();
      } catch (error) {
        if (this.config.debug) {
          console.debug('Sync: Final sync failed:', error);
        }
      }
    }

    this.connected = false;
    this.emit('stopped');
  }

  /**
   * Initialize the sync service
   */
  private async initialize(): Promise<void> {
    // Check if we have existing auth
    const isAuthenticated = await this.authService.isAuthenticated();
    if (isAuthenticated) {
      try {
        await this.testConnection();
        this.connected = true;
      } catch (error) {
        if (this.config.debug) {
          console.debug('Sync: Connection test failed:', error);
        }
      }
    }
  }

  /**
   * Test connection to sync service
   */
  private async testConnection(): Promise<void> {
    if (!this.config.endpoint) {
      throw new Error('Sync endpoint not configured');
    }

    const authInfo = await this.authService.getAuthInfo();
    if (!authInfo) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${this.config.endpoint}/health`, {
      headers: {
        'Authorization': `Bearer ${authInfo.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Connection test failed: ${response.status}`);
    }
  }

  /**
   * Send operations to sync service
   */
  private async sendOperations(operations: SyncOperation[]): Promise<void> {
    if (!this.config.endpoint) {
      // No endpoint configured - just log for debugging
      if (this.config.debug) {
        console.log('Sync operations (no endpoint):', operations);
      }
      return;
    }

    const authInfo = await this.authService.getAuthInfo();
    if (!authInfo) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${this.config.endpoint}/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authInfo.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operations,
        timestamp: new Date().toISOString(),
        source: 'browser-use-ts',
      }),
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Start the periodic sync timer
   */
  private startSyncTimer(): void {
    if (this.syncTimer) {
      return;
    }

    this.syncTimer = setInterval(() => {
      if (this.connected && this.pendingOperations.length > 0) {
        this.syncNow().catch(error => {
          this.emit('error', error);
        });
      }
    }, this.config.syncInterval);
  }
}

// Global sync service instance
let globalSyncService: SyncService | null = null;

/**
 * Get the global sync service instance
 */
export function getSyncService(): SyncService {
  if (!globalSyncService) {
    globalSyncService = new SyncService();
  }
  return globalSyncService;
}

/**
 * Initialize sync service with custom configuration
 */
export function initializeSync(config: Partial<SyncConfig> = {}): SyncService {
  if (globalSyncService) {
    globalSyncService.stop();
  }
  
  globalSyncService = new SyncService(config);
  return globalSyncService;
}