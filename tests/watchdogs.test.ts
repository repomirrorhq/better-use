/**
 * Test watchdog functionality
 */

import { BrowserSession } from '../src/browser/session';
import { createWatchdogs, destroyWatchdogs } from '../src/browser/watchdogs';

describe('Watchdog Tests', () => {
  let browserSession: BrowserSession;

  beforeEach(async () => {
    browserSession = new BrowserSession();
  });

  afterEach(async () => {
    try {
      await browserSession.stop();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Watchdog Creation', () => {
    it('should create default watchdogs', () => {
      const watchdogs = createWatchdogs(browserSession);
      
      expect(watchdogs).toHaveLength(5); // crash, security, downloads, permissions, popups
      expect(watchdogs[0].constructor.name).toBe('CrashWatchdog');
      expect(watchdogs[1].constructor.name).toBe('SecurityWatchdog'); 
      expect(watchdogs[2].constructor.name).toBe('DownloadsWatchdog');
      expect(watchdogs[3].constructor.name).toBe('PermissionsWatchdog');
      expect(watchdogs[4].constructor.name).toBe('PopupsWatchdog');
      
      destroyWatchdogs(watchdogs);
    });

    it('should create selective watchdogs', () => {
      const watchdogs = createWatchdogs(browserSession, {
        crash: true,
        security: false,
        downloads: true,
        permissions: false,
        popups: false,
      });
      
      expect(watchdogs).toHaveLength(2); // crash and downloads only
      expect(watchdogs[0].constructor.name).toBe('CrashWatchdog');
      expect(watchdogs[1].constructor.name).toBe('DownloadsWatchdog');
      
      destroyWatchdogs(watchdogs);
    });

    it('should create watchdogs with custom config', () => {
      const watchdogs = createWatchdogs(browserSession, {
        crash: {
          networkTimeoutSeconds: 5.0,
          checkIntervalSeconds: 2.0,
        },
        security: {
          allowedDomains: ['example.com', '*.trusted.com'],
        },
        downloads: {
          downloadsPath: '/tmp/test-downloads',
          maxDownloadTimeoutMs: 60000,
        },
        permissions: false,
        popups: false,
      });
      
      expect(watchdogs).toHaveLength(3);
      
      destroyWatchdogs(watchdogs);
    });
  });

  describe('Crash Watchdog', () => {
    it('should track network requests', () => {
      const watchdogs = createWatchdogs(browserSession, {
        crash: true,
        security: false,
        downloads: false,
        permissions: false,
        popups: false,
      });
      
      const crashWatchdog = watchdogs[0] as any;
      
      // Test request tracking
      crashWatchdog.trackRequest('req1', 'https://example.com', 'GET');
      expect(crashWatchdog.getStats().activeRequests).toBe(1);
      
      crashWatchdog.completeRequest('req1');
      expect(crashWatchdog.getStats().activeRequests).toBe(0);
      
      destroyWatchdogs(watchdogs);
    });
  });

  describe('Security Watchdog', () => {
    it('should validate URLs against allowed domains', () => {
      const watchdogs = createWatchdogs(browserSession, {
        crash: false,
        security: {
          allowedDomains: ['example.com', '*.trusted.com'],
        },
        downloads: false,
        permissions: false,
        popups: false,
      });
      
      const securityWatchdog = watchdogs[0] as any;
      
      expect(securityWatchdog.getSecurityConfig().allowedDomains).toEqual([
        'example.com',
        '*.trusted.com',
      ]);
      
      destroyWatchdogs(watchdogs);
    });
  });

  describe('Downloads Watchdog', () => {
    it('should track download statistics', () => {
      const watchdogs = createWatchdogs(browserSession, {
        crash: false,
        security: false,
        downloads: {
          downloadsPath: '/tmp/test-downloads',
        },
        permissions: false,
        popups: false,
      });
      
      const downloadsWatchdog = watchdogs[0] as any;
      
      const stats = downloadsWatchdog.getDownloadStats();
      expect(stats.activeDownloads).toBe(0);
      expect(stats.downloads).toEqual([]);
      
      destroyWatchdogs(watchdogs);
    });

    it('should detect PDF URLs', () => {
      const watchdogs = createWatchdogs(browserSession, {
        crash: false,
        security: false,  
        downloads: true,
        permissions: false,
        popups: false,
      });
      
      const downloadsWatchdog = watchdogs[0] as any;
      
      expect(downloadsWatchdog.isPdfUrl('https://example.com/document.pdf')).toBe(true);
      expect(downloadsWatchdog.isPdfUrl('https://example.com/page.html')).toBe(false);
      
      destroyWatchdogs(watchdogs);
    });
  });

  describe('Popups Watchdog', () => {
    it('should handle dialog configuration', () => {
      const watchdogs = createWatchdogs(browserSession, {
        crash: false,
        security: false,
        downloads: false,
        permissions: false,
        popups: {
          autoAccept: true,
          delay: 500,
        },
      });
      
      const popupsWatchdog = watchdogs[0] as any;
      
      expect(popupsWatchdog.popupsConfig.autoAccept).toBe(true);
      expect(popupsWatchdog.popupsConfig.delay).toBe(500);
      
      destroyWatchdogs(watchdogs);
    });

    it('should use default configuration when none provided', () => {
      const watchdogs = createWatchdogs(browserSession, {
        crash: false,
        security: false,
        downloads: false,
        permissions: false,
        popups: true,
      });
      
      const popupsWatchdog = watchdogs[0] as any;
      
      expect(popupsWatchdog.popupsConfig.autoAccept).toBe(true);
      expect(popupsWatchdog.popupsConfig.delay).toBe(250);
      
      destroyWatchdogs(watchdogs);
    });
  });
});