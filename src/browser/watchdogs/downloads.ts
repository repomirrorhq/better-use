/**
 * Downloads watchdog for monitoring and handling file downloads.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseWatchdog, WatchdogConfig } from './base';
import { BrowserSession } from '../session';
import {
  BrowserLaunchEvent,
  BrowserStoppedEvent,
  TabCreatedEvent,
  TabClosedEvent,
  NavigationCompleteEvent,
  FileDownloadedEvent,
} from '../events';

export interface DownloadsWatchdogConfig extends WatchdogConfig {
  downloadsPath?: string;
  autoAcceptDownloads?: boolean;
  maxDownloadTimeoutMs?: number;
}

interface ActiveDownload {
  url: string;
  filename: string;
  startTime: number;
  expectedBytes?: number;
  downloadedBytes?: number;
  targetId: string;
}

export class DownloadsWatchdog extends BaseWatchdog {
  // Event contracts
  static LISTENS_TO = [
    'BrowserLaunchEvent',
    'BrowserStoppedEvent',
    'TabCreatedEvent', 
    'TabClosedEvent',
    'NavigationCompleteEvent',
  ];
  static EMITS = ['FileDownloadedEvent'];

  protected config: DownloadsWatchdogConfig;
  private activeDownloads = new Map<string, ActiveDownload>();
  private sessionsWithListeners = new Set<string>();
  private pdfViewerCache = new Map<string, boolean>();

  constructor(browserSession: BrowserSession, config: DownloadsWatchdogConfig = {}) {
    super(browserSession, config);
    this.config = {
      autoAcceptDownloads: true,
      maxDownloadTimeoutMs: 30000, // 30 seconds
      ...config,
    };
  }

  protected onAttached(): void {
    this.logger.debug('[DownloadsWatchdog] Attached to session');
  }

  protected onDetached(): void {
    this.activeDownloads.clear();
    this.sessionsWithListeners.clear();
    this.pdfViewerCache.clear();
    this.logger.debug('[DownloadsWatchdog] Detached from session');
  }

  async on_BrowserLaunchEvent(event: BrowserLaunchEvent): Promise<void> {
    this.logger.debug('[DownloadsWatchdog] Received BrowserLaunchEvent');
    
    // Ensure downloads directory exists
    const downloadsPath = this.getDownloadsPath();
    if (downloadsPath) {
      try {
        await fs.mkdir(downloadsPath, { recursive: true });
        this.logger.debug(`[DownloadsWatchdog] Ensured downloads directory exists: ${downloadsPath}`);
      } catch (error) {
        this.logger.error(`[DownloadsWatchdog] Failed to create downloads directory: ${error}`);
      }
    }
  }

  async on_BrowserStoppedEvent(event: BrowserStoppedEvent): Promise<void> {
    this.logger.debug('[DownloadsWatchdog] Browser stopped, clearing download state');
    this.activeDownloads.clear();
    this.sessionsWithListeners.clear();
    this.pdfViewerCache.clear();
  }

  async on_TabCreatedEvent(event: TabCreatedEvent): Promise<void> {
    this.logger.debug(`[DownloadsWatchdog] TabCreatedEvent received: ${event.url}`);
    
    if (event.target_id) {
      await this.attachToTarget(event.target_id);
    } else {
      console.warn('[DownloadsWatchdog] No target found for new tab');
    }
  }

  async on_TabClosedEvent(event: TabClosedEvent): Promise<void> {
    // Clean up any downloads associated with closed tab
    if (event.target_id) {
      for (const [downloadId, download] of this.activeDownloads) {
        if (download.targetId === event.target_id) {
          this.logger.debug(`[DownloadsWatchdog] Cleaning up download for closed tab: ${downloadId}`);
          this.activeDownloads.delete(downloadId);
        }
      }
    }
  }

  async on_NavigationCompleteEvent(event: NavigationCompleteEvent): Promise<void> {
    // Check if this is a PDF file that might be displayed inline
    if (event.url.toLowerCase().endsWith('.pdf')) {
      this.logger.debug(`[DownloadsWatchdog] PDF navigation detected: ${event.url}`);
      
      // Cache that this URL is a PDF for potential download handling
      this.pdfViewerCache.set(event.url, true);
      
      // In a real implementation, you might want to check if the PDF
      // should be downloaded instead of displayed inline
    }
  }

  /**
   * Set up download monitoring for a specific target.
   */
  private async attachToTarget(targetId: string): Promise<void> {
    try {
      this.logger.debug(`[DownloadsWatchdog] Attaching to target: ${targetId}`);
      
      // In a full implementation, this would set up CDP event listeners
      // for Browser.downloadWillBegin and Browser.downloadProgress events
      
      // For now, we'll simulate the setup
      if (!this.sessionsWithListeners.has(targetId)) {
        this.sessionsWithListeners.add(targetId);
        this.logger.debug(`[DownloadsWatchdog] Set up download listeners for target: ${targetId}`);
      }
      
    } catch (error) {
      console.warn(`[DownloadsWatchdog] Failed to attach to target ${targetId}: ${error}`);
    }
  }

  /**
   * Handle download beginning event (would be called by CDP event handler).
   */
  public async handleDownloadWillBegin(
    downloadId: string,
    url: string,
    filename: string,
    targetId: string
  ): Promise<void> {
    // Initialize variables to prevent scope issues
    let download: ActiveDownload | null = null;
    
    try {
      this.logger.info(`[DownloadsWatchdog] Download beginning: ${filename} from ${url}`);
      
      download = {
        url,
        filename,
        startTime: Date.now(),
        targetId,
      };
      
      this.activeDownloads.set(downloadId, download);
      
      // Set up timeout to clean up stale downloads
      setTimeout(() => {
        if (this.activeDownloads.has(downloadId)) {
          this.logger.warn(`[DownloadsWatchdog] Download timeout for: ${filename}`);
          this.activeDownloads.delete(downloadId);
        }
      }, this.config.maxDownloadTimeoutMs);
      
    } catch (error) {
      this.logger.error(`[DownloadsWatchdog] Error handling download will begin: ${error}`);
      // Clean up on error
      if (download) {
        this.activeDownloads.delete(downloadId);
      }
    }
  }

  /**
   * Handle download progress event (would be called by CDP event handler).
   */
  public async handleDownloadProgress(
    downloadId: string,
    receivedBytes: number,
    totalBytes?: number
  ): Promise<void> {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return;

    download.downloadedBytes = receivedBytes;
    download.expectedBytes = totalBytes;

    const progress = totalBytes ? (receivedBytes / totalBytes * 100).toFixed(1) : 'unknown';
    this.logger.debug(`[DownloadsWatchdog] Download progress for ${download.filename}: ${progress}%`);
  }

  /**
   * Handle download completed event.
   */
  public async handleDownloadCompleted(
    downloadId: string,
    filePath: string,
    success: boolean = true
  ): Promise<void> {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return;

    // Initialize variables used across try blocks to prevent UnboundLocal errors
    let stats: fs.Stats | null = null;
    let elapsedMs = 0;
    let fileExists = false;

    try {
      if (success && filePath) {
        try {
          // Verify file exists and get stats
          stats = await fs.stat(filePath);
          fileExists = true;
          elapsedMs = Date.now() - download.startTime;
          
          this.logger.info(
            `[DownloadsWatchdog] Download completed: ${download.filename} ` +
            `(${stats.size} bytes, ${elapsedMs}ms)`
          );

          // Only emit FileDownloadedEvent after successful file verification
          const event = {
            filename: download.filename,
            filePath,
            url: download.url,
            sizeBytes: stats.size,
            elapsedMs,
          };

          this.browserSession.emit('FileDownloadedEvent', event);
          
        } catch (statError) {
          this.logger.error(`[DownloadsWatchdog] Failed to verify downloaded file: ${statError}`);
          success = false;
        }
      }
      
      if (!success || !fileExists) {
        this.logger.error(`[DownloadsWatchdog] Download failed: ${download.filename}`);
      }
    } catch (error) {
      this.logger.error(`[DownloadsWatchdog] Error handling download completion: ${error}`);
    } finally {
      // Clean up tracking
      this.activeDownloads.delete(downloadId);
    }
  }

  /**
   * Get the configured downloads path.
   */
  private getDownloadsPath(): string | undefined {
    return this.config.downloadsPath || 
           process.env.BROWSER_DOWNLOADS_PATH;
  }

  /**
   * Get current download statistics.
   */
  public getDownloadStats() {
    const active = Array.from(this.activeDownloads.values()).map(download => ({
      filename: download.filename,
      url: download.url,
      progress: download.expectedBytes 
        ? (download.downloadedBytes || 0) / download.expectedBytes 
        : undefined,
      elapsedMs: Date.now() - download.startTime,
    }));

    return {
      activeDownloads: active.length,
      downloads: active,
      trackedTargets: this.sessionsWithListeners.size,
    };
  }

  /**
   * Cancel all active downloads.
   */
  public cancelAllDownloads(): void {
    const count = this.activeDownloads.size;
    this.activeDownloads.clear();
    this.logger.info(`[DownloadsWatchdog] Cancelled ${count} active downloads`);
  }

  /**
   * Check if a URL is likely a PDF file.
   */
  public isPdfUrl(url: string): boolean {
    return this.pdfViewerCache.has(url) || url.toLowerCase().endsWith('.pdf');
  }
}