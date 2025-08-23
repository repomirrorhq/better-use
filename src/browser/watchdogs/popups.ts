/**
 * Popups watchdog for handling JavaScript dialogs (alert, confirm, prompt) automatically.
 * 
 * This implementation uses Playwright's dialog handling instead of CDP.
 */

import { BaseWatchdog, WatchdogConfig } from './base';
import { BrowserSession } from '../session';
import { DialogOpenedEvent, TabCreatedEvent } from '../events';

export interface PopupsWatchdogConfig extends WatchdogConfig {
  // Add any popups-specific config here
  autoAccept?: boolean; // Whether to automatically accept dialogs (default: true)
  delay?: number; // Delay before accepting to look more human (default: 250ms)
}

export class PopupsWatchdog extends BaseWatchdog {
  // Event contracts
  static LISTENS_TO = ['TabCreatedEvent'];
  static EMITS = ['DialogOpenedEvent'];

  // Track which pages have dialog handlers registered
  private dialogListenersRegistered = new Set<string>();
  private popupsConfig: PopupsWatchdogConfig;

  constructor(browserSession: BrowserSession, config: PopupsWatchdogConfig = {}) {
    super(browserSession, config);
    this.popupsConfig = {
      autoAccept: true,
      delay: 250,
      ...config
    };
    this.logger.debug(`[PopupsWatchdog] 🚀 PopupsWatchdog initialized with session=${this.browserSession.id}`);
  }

  protected onAttached(): void {
    this.logger.debug('[PopupsWatchdog] Attached to session');
    this.setupExistingPages();
  }

  protected onDetached(): void {
    this.logger.debug('[PopupsWatchdog] Detached from session');
    this.dialogListenersRegistered.clear();
  }

  /**
   * Set up dialog handlers for all existing pages.
   */
  private async setupExistingPages(): Promise<void> {
    try {
      // Get all current pages and set up dialog handling
      const session = this.browserSession as any;
      if (session.pages && session.pages.size > 0) {
        for (const [pageId] of session.pages) {
          await this.setupDialogHandlerForPage(pageId);
        }
      }
    } catch (error) {
      this.logger.error(`[PopupsWatchdog] Failed to setup existing pages: ${error}`);
    }
  }

  /**
   * Set up JavaScript dialog handling when a new tab is created.
   */
  async on_TabCreatedEvent(event: TabCreatedEvent): Promise<void> {
    const targetId = event.target_id;
    this.logger.debug(`[PopupsWatchdog] 🎯 PopupsWatchdog received TabCreatedEvent for target ${targetId}`);

    await this.setupDialogHandlerForPage(targetId);
  }

  /**
   * Setup dialog handler for a specific page.
   */
  private async setupDialogHandlerForPage(targetId: string): Promise<void> {
    // Skip if we've already registered for this target
    if (this.dialogListenersRegistered.has(targetId)) {
      this.logger.debug(`[PopupsWatchdog] Already registered dialog handlers for target ${targetId}`);
      return;
    }

    this.logger.debug(`[PopupsWatchdog] 📌 Starting dialog handler setup for target ${targetId}`);
    try {
      // Get the page from the session
      const session = this.browserSession as any;
      const page = session.pages?.get(targetId);
      
      if (!page) {
        this.logger.debug(`[PopupsWatchdog] Page not found for target ${targetId}`);
        return;
      }

      // Set up Playwright dialog handler
      const handleDialog = async (dialog: any) => {
        const dialogType = dialog.type(); // 'alert', 'confirm', 'prompt', 'beforeunload'
        const message = dialog.message();
        const url = page.url();

        this.logger.debug(`[PopupsWatchdog] 🔔 JavaScript ${dialogType} dialog detected: '${message.substring(0, 50)}...' - ${this.popupsConfig.autoAccept ? 'accepting' : 'dismissing'} in ${this.popupsConfig.delay}ms`);

        // Emit DialogOpenedEvent
        try {
          this.browserSession.emit('DialogOpenedEvent', {
            frame_id: 'main', // Playwright doesn't expose frame ID directly
            dialog_type: dialogType as any,
            message,
            url,
          } as DialogOpenedEvent);
        } catch (error) {
          this.logger.error(`[PopupsWatchdog] Failed to emit DialogOpenedEvent: ${error}`);
        }

        try {
          // Delay to look more human before auto-closing
          if (this.popupsConfig.delay && this.popupsConfig.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.popupsConfig.delay));
          }

          // Accept or dismiss the dialog
          if (this.popupsConfig.autoAccept) {
            await dialog.accept();
            this.logger.info('[PopupsWatchdog] ✅ Dialog accepted successfully');
          } else {
            await dialog.dismiss();
            this.logger.info('[PopupsWatchdog] ✅ Dialog dismissed successfully');
          }
        } catch (error) {
          this.logger.error(`[PopupsWatchdog] Failed to handle dialog: ${error}`);
        }
      };

      // Register the dialog handler with Playwright
      page.on('dialog', handleDialog);
      
      this.logger.debug(`[PopupsWatchdog] Successfully registered dialog handler for page ${targetId}`);

      // Mark this target as having dialog handling set up
      this.dialogListenersRegistered.add(targetId);

    } catch (error) {
      this.logger.error(`[PopupsWatchdog] Failed to set up dialog handling for tab ${targetId}: ${error}`);
    }
  }
}