/**
 * Permissions watchdog for granting browser permissions on connection.
 */

import { BaseWatchdog, WatchdogConfig } from './base';
import { BrowserSession } from '../session';
import { BrowserConnectedEvent } from '../events';

export interface PermissionsWatchdogConfig extends WatchdogConfig {
  // Add any permissions-specific config here
}

export class PermissionsWatchdog extends BaseWatchdog {
  // Event contracts
  static LISTENS_TO = ['BrowserConnectedEvent'];
  static EMITS: string[] = [];

  constructor(browserSession: BrowserSession, config: PermissionsWatchdogConfig = {}) {
    super(browserSession, config);
  }

  protected onAttached(): void {
    this.logger.debug('[PermissionsWatchdog] Attached to session');
  }

  protected onDetached(): void {
    this.logger.debug('[PermissionsWatchdog] Detached from session');
  }

  /**
   * Grant permissions when browser connects.
   */
  async on_BrowserConnectedEvent(event: BrowserConnectedEvent): Promise<void> {
    const permissions = this.browserSession.browserProfile.permissions;

    if (!permissions || permissions.length === 0) {
      this.logger.debug('[PermissionsWatchdog] No permissions to grant');
      return;
    }

    this.logger.debug(`[PermissionsWatchdog] 🔓 Granting browser permissions: ${permissions.join(', ')}`);

    try {
      // Grant permissions using CDP Browser.grantPermissions
      // origin=null means grant to all origins  
      // Browser domain commands don't use session_id
      const cdpClient = this.browserSession.cdpClient;
      
      if (!cdpClient) {
        throw new Error('CDP client not available - no active browser page');
      }
      
      await cdpClient.send('Browser.grantPermissions', {
        permissions: permissions as any // CDP permissions are a specific enum
      });
      
      this.logger.debug(`[PermissionsWatchdog] ✅ Successfully granted permissions: ${permissions.join(', ')}`);
    } catch (error: any) {
      this.logger.error(`[PermissionsWatchdog] ❌ Failed to grant permissions: ${error.message || error}`);
      // Don't raise - permissions are not critical to browser operation
    }
  }
}