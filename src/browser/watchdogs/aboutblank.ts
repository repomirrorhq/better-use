/**
 * About:blank watchdog for managing about:blank tabs with DVD screensaver.
 * 
 * Ensures there's always exactly one about:blank tab with DVD screensaver
 * when needed to prevent browser closure and provide visual feedback.
 */

import { BaseWatchdog, WatchdogConfig } from './base';
import { BrowserSession } from '../session';
import {
  BrowserStopEvent,
  BrowserStoppedEvent,
  TabCreatedEvent,
  TabClosedEvent,
  AboutBlankDVDScreensaverShownEvent,
} from '../events';

export class AboutBlankWatchdog extends BaseWatchdog {
  // Event contracts
  static LISTENS_TO = [
    'BrowserStopEvent',
    'BrowserStoppedEvent', 
    'TabCreatedEvent',
    'TabClosedEvent',
  ];
  static EMITS = ['AboutBlankDVDScreensaverShownEvent'];

  private stopping = false;

  constructor(browserSession: BrowserSession, config: WatchdogConfig = {}) {
    super(browserSession, config);
  }

  async onBrowserStopEvent(event: BrowserStopEvent): Promise<void> {
    // Handle browser stop request - stop creating new tabs
    this.stopping = true;
  }

  async onBrowserStoppedEvent(event: BrowserStoppedEvent): Promise<void> {
    // Handle browser stopped event
    this.stopping = true;
  }

  async onTabCreatedEvent(event: TabCreatedEvent): Promise<void> {
    if (!event.url) return;

    // If an about:blank tab was created, show DVD screensaver on all about:blank tabs
    if (event.url === 'about:blank') {
      await this.showDVDScreensaverOnAboutBlankTabs();
    }
  }

  async onTabClosedEvent(event: TabClosedEvent): Promise<void> {
    // Don't create new tabs if browser is shutting down
    if (this.stopping) {
      return;
    }

    try {
      // Check if we're about to close the last tab (event happens BEFORE tab closes)
      const pageCount = this.browserSession.getPageCount();
      
      if (pageCount <= 1) {
        // Last tab closing, create new about:blank tab to avoid closing entire browser
        await this.browserSession.createNewPage('about:blank');
        // Show DVD screensaver on the new tab
        await this.showDVDScreensaverOnAboutBlankTabs();
      } else {
        // Multiple tabs exist, check after close
        await this.checkAndEnsureAboutBlankTab();
      }
    } catch (error) {
      console.error('[AboutBlankWatchdog] Error handling tab close:', error);
    }
  }

  /**
   * Check current tabs and ensure exactly one about:blank tab with animation exists
   */
  private async checkAndEnsureAboutBlankTab(): Promise<void> {
    try {
      const pageCount = this.browserSession.getPageCount();
      
      // If no tabs exist at all, create one to keep browser alive
      if (pageCount === 0) {
        await this.browserSession.createNewPage('about:blank');
        // Show DVD screensaver on the new tab
        await this.showDVDScreensaverOnAboutBlankTabs();
      }
      // Otherwise there are tabs, don't create new ones to avoid interfering
    } catch (error) {
      console.error('[AboutBlankWatchdog] Error ensuring about:blank tab:', error);
    }
  }

  /**
   * Show DVD screensaver on all about:blank pages only
   */
  private async showDVDScreensaverOnAboutBlankTabs(): Promise<void> {
    try {
      const browserSessionLabel = this.browserSession.id.slice(-4);

      // For now, we'll emit the event without actually injecting the screensaver
      // TODO: Add proper page access and DVD screensaver injection
      
      // Emit event
      this.browserSession.emit('AboutBlankDVDScreensaverShownEvent', {
        target_id: 'about:blank',
        timestamp: Date.now()
      } as AboutBlankDVDScreensaverShownEvent);
    } catch (error) {
      console.error('[AboutBlankWatchdog] Error showing DVD screensaver:', error);
    }
  }

}