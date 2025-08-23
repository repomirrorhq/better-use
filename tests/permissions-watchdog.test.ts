/**
 * Tests for Permissions Watchdog
 */

import { PermissionsWatchdog } from '../src/browser/watchdogs/permissions';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { BrowserConnectedEvent } from '../src/browser/events';

// Mock BrowserSession
jest.mock('../src/browser/session');

describe('PermissionsWatchdog', () => {
  let mockBrowserSession: jest.Mocked<BrowserSession>;
  let mockBrowserProfile: jest.Mocked<BrowserProfile>;
  let permissionsWatchdog: PermissionsWatchdog;
  let mockPermissions: string[];

  beforeEach(() => {
    mockPermissions = ['clipboardReadWrite', 'notifications'];

    // Create mock browser profile
    mockBrowserProfile = {
      get permissions() { return mockPermissions; }
    } as any;

    // Create mock CDP client
    const mockCdpClient = {
      send: jest.fn().mockResolvedValue({})
    };

    // Create mock browser session
    mockBrowserSession = {
      browserProfile: mockBrowserProfile,
      cdpClient: mockCdpClient,
      on: jest.fn(),
      emit: jest.fn(),
      removeAllListeners: jest.fn()
    } as any;

    // Create permissions watchdog
    permissionsWatchdog = new PermissionsWatchdog(mockBrowserSession);
  });

  describe('constructor', () => {
    it('should initialize correctly', () => {
      expect(permissionsWatchdog).toBeInstanceOf(PermissionsWatchdog);
    });

    it('should have correct event contracts', () => {
      expect(PermissionsWatchdog.LISTENS_TO).toContain('BrowserConnectedEvent');
      expect(PermissionsWatchdog.EMITS).toEqual([]);
    });
  });

  describe('on_BrowserConnectedEvent', () => {
    const mockEvent: BrowserConnectedEvent = {
      cdp_url: 'http://localhost:9222',
      id: 'test-event',
      timestamp: Date.now()
    };

    it('should grant permissions when browser connects', async () => {
      await permissionsWatchdog.on_BrowserConnectedEvent(mockEvent);

      expect(mockBrowserSession.cdpClient.send).toHaveBeenCalledWith(
        'Browser.grantPermissions',
        {
          permissions: ['clipboardReadWrite', 'notifications']
        }
      );
    });

    it('should handle empty permissions list', async () => {
      mockPermissions.length = 0; // Clear the array

      await permissionsWatchdog.on_BrowserConnectedEvent(mockEvent);

      expect(mockBrowserSession.cdpClient.send).not.toHaveBeenCalled();
    });

    it('should handle undefined permissions', async () => {
      // Create a new mock profile with undefined permissions
      const undefinedPermissionsProfile = {
        get permissions() { return undefined as any; }
      } as any;
      
      const undefinedPermissionsSession = {
        browserProfile: undefinedPermissionsProfile,
        cdpClient: mockBrowserSession.cdpClient,
        on: jest.fn(),
        emit: jest.fn(),
        removeAllListeners: jest.fn()
      } as any;
      
      const watchdog = new PermissionsWatchdog(undefinedPermissionsSession);
      await watchdog.on_BrowserConnectedEvent(mockEvent);

      expect(mockBrowserSession.cdpClient.send).not.toHaveBeenCalled();
    });

    it('should handle CDP errors gracefully', async () => {
      const error = new Error('CDP connection failed');
      mockBrowserSession.cdpClient.send = jest.fn().mockRejectedValue(error);

      // Should not throw
      await expect(permissionsWatchdog.on_BrowserConnectedEvent(mockEvent)).resolves.toBeUndefined();
      
      expect(mockBrowserSession.cdpClient.send).toHaveBeenCalledWith(
        'Browser.grantPermissions',
        {
          permissions: ['clipboardReadWrite', 'notifications']
        }
      );
    });

    it('should grant custom permissions', async () => {
      mockPermissions.splice(0, mockPermissions.length, 'camera', 'microphone', 'geolocation');

      await permissionsWatchdog.on_BrowserConnectedEvent(mockEvent);

      expect(mockBrowserSession.cdpClient.send).toHaveBeenCalledWith(
        'Browser.grantPermissions',
        {
          permissions: ['camera', 'microphone', 'geolocation']
        }
      );
    });
  });

  describe('lifecycle', () => {
    it('should attach and detach correctly', () => {
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

      permissionsWatchdog.attachToSession();
      expect(consoleDebugSpy).toHaveBeenCalledWith('[PermissionsWatchdog] Attached to session');

      permissionsWatchdog.detachFromSession();
      expect(consoleDebugSpy).toHaveBeenCalledWith('[PermissionsWatchdog] Detached from session');

      consoleDebugSpy.mockRestore();
    });

    it('should cleanup on destroy', () => {
      const detachSpy = jest.spyOn(permissionsWatchdog, 'detachFromSession');
      
      permissionsWatchdog.destroy();
      
      expect(detachSpy).toHaveBeenCalled();
    });
  });
});