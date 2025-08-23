/**
 * Browser watchdogs for monitoring and handling browser events.
 */

export { BaseWatchdog, type WatchdogConfig } from './base';
export { CrashWatchdog, type CrashWatchdogConfig } from './crash';
export { SecurityWatchdog, type SecurityWatchdogConfig } from './security';
export { DownloadsWatchdog, type DownloadsWatchdogConfig } from './downloads';
export { PermissionsWatchdog, type PermissionsWatchdogConfig } from './permissions';
export { PopupsWatchdog, type PopupsWatchdogConfig } from './popups';
export { AboutBlankWatchdog } from './aboutblank';
export { StorageStateWatchdog, type StorageStateWatchdogConfig } from './storagestate';
export { DefaultActionWatchdog, type DefaultActionConfig } from './defaultaction';
// Note: DOMWatchdog, and LocalBrowserWatchdog are work in progress

// Watchdog registry for easy initialization
import { BrowserSession } from '../session';
import { BaseWatchdog, WatchdogConfig } from './base';
import { CrashWatchdog, CrashWatchdogConfig } from './crash';
import { SecurityWatchdog, SecurityWatchdogConfig } from './security';
import { DownloadsWatchdog, DownloadsWatchdogConfig } from './downloads';
import { PermissionsWatchdog, PermissionsWatchdogConfig } from './permissions';
import { PopupsWatchdog, PopupsWatchdogConfig } from './popups';
import { AboutBlankWatchdog } from './aboutblank';
import { StorageStateWatchdog, StorageStateWatchdogConfig } from './storagestate';
import { DefaultActionWatchdog, DefaultActionConfig } from './defaultaction';
// Note: DOMWatchdog, and LocalBrowserWatchdog imports removed

export interface WatchdogRegistry {
  crash?: CrashWatchdogConfig | boolean;
  security?: SecurityWatchdogConfig | boolean;
  downloads?: DownloadsWatchdogConfig | boolean;
  permissions?: PermissionsWatchdogConfig | boolean;
  popups?: PopupsWatchdogConfig | boolean;
  aboutblank?: WatchdogConfig | boolean;
  storagestate?: StorageStateWatchdogConfig | boolean;
  defaultaction?: DefaultActionConfig | boolean;
  // Note: dom, localbrowser watchdogs are work in progress
}

/**
 * Create and attach watchdogs to a browser session.
 */
export function createWatchdogs(
  browserSession: BrowserSession, 
  config: WatchdogRegistry = {}
): BaseWatchdog[] {
  const watchdogs: BaseWatchdog[] = [];

  // Create enabled watchdogs
  if (config.crash !== false) {
    const crashConfig = config.crash === true ? {} : config.crash || {};
    const crashWatchdog = new CrashWatchdog(browserSession, crashConfig);
    watchdogs.push(crashWatchdog);
  }

  if (config.security !== false) {
    const securityConfig = config.security === true ? {} : config.security || {};
    const securityWatchdog = new SecurityWatchdog(browserSession, securityConfig);
    watchdogs.push(securityWatchdog);
  }

  if (config.downloads !== false) {
    const downloadsConfig = config.downloads === true ? {} : config.downloads || {};
    const downloadsWatchdog = new DownloadsWatchdog(browserSession, downloadsConfig);
    watchdogs.push(downloadsWatchdog);
  }

  if (config.permissions !== false) {
    const permissionsConfig = config.permissions === true ? {} : config.permissions || {};
    const permissionsWatchdog = new PermissionsWatchdog(browserSession, permissionsConfig);
    watchdogs.push(permissionsWatchdog);
  }

  if (config.popups !== false) {
    const popupsConfig = config.popups === true ? {} : config.popups || {};
    const popupsWatchdog = new PopupsWatchdog(browserSession, popupsConfig);
    watchdogs.push(popupsWatchdog);
  }

  if (config.aboutblank !== false) {
    const aboutblankConfig = config.aboutblank === true ? {} : config.aboutblank || {};
    const aboutblankWatchdog = new AboutBlankWatchdog(browserSession, aboutblankConfig);
    watchdogs.push(aboutblankWatchdog);
  }

  if (config.storagestate !== false) {
    const storagestateConfig = config.storagestate === true ? {} : config.storagestate || {};
    const storagestateWatchdog = new StorageStateWatchdog(browserSession, storagestateConfig);
    watchdogs.push(storagestateWatchdog);
  }

  if (config.defaultaction !== false) {
    const defaultactionConfig = config.defaultaction === true ? {} : config.defaultaction || {};
    const defaultactionWatchdog = new DefaultActionWatchdog(browserSession, defaultactionConfig);
    watchdogs.push(defaultactionWatchdog);
  }

  // Note: dom, localbrowser watchdogs are work in progress
  // They have been temporarily disabled due to compilation issues

  // Attach all watchdogs to the session
  watchdogs.forEach(watchdog => {
    try {
      watchdog.attachToSession();
    } catch (error) {
      console.error(`Failed to attach watchdog ${watchdog.constructor.name}:`, error);
    }
  });

  return watchdogs;
}

/**
 * Detach and destroy all watchdogs.
 */
export function destroyWatchdogs(watchdogs: BaseWatchdog[]): void {
  watchdogs.forEach(watchdog => {
    try {
      watchdog.destroy();
    } catch (error) {
      console.error(`Failed to destroy watchdog ${watchdog.constructor.name}:`, error);
    }
  });
}