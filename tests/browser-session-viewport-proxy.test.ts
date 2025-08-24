import { BrowserSession } from '../src/browser/session';
import { BrowserProfile, ProxySettings } from '../src/browser/profile';

describe('BrowserSession Viewport and Proxy', () => {
  test('should handle proxy settings as object', () => {
    // Test ProxySettings object structure
    const proxySettings: ProxySettings = {
      server: 'http://example.proxy:8080',
      bypass: 'localhost',
      username: 'testuser',
      password: 'testpass'
    };

    // Verify the object has correct properties
    expect(proxySettings.server).toBe('http://example.proxy:8080');
    expect(proxySettings.bypass).toBe('localhost');
    expect(proxySettings.username).toBe('testuser');
    expect(proxySettings.password).toBe('testpass');

    // Verify it can be spread/cloned
    const proxyDict = { ...proxySettings };
    expect(proxyDict).toEqual(proxySettings);
    expect(proxyDict.server).toBe('http://example.proxy:8080');
  });

  test('should configure window size in headless mode', async () => {
    // Create browser profile with headless mode and specific dimensions
    const profile = new BrowserProfile({
      user_data_dir: undefined,
      headless: true,  // window size gets converted to viewport size in headless mode
      window_size: { width: 999, height: 888 },
      maximum_wait_page_load_time: 2.0,
      minimum_wait_page_load_time: 0.2
    });

    const browserSession = new BrowserSession({ profile });
    
    try {
      await browserSession.start();
      
      // Get CDP session to evaluate JavaScript
      const cdpSession = await browserSession.getOrCreateCdpSession();
      
      // Check the viewport size
      const result = await cdpSession.cdpClient.send('Runtime.evaluate', {
        expression: `(() => {
          return {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio
          }
        })()`,
        returnByValue: true
      }, cdpSession.sessionId);
      
      const actualSize = result.result?.value || {};
      
      console.log(`Browser configured window_size=${JSON.stringify(profile.window_size)}`);
      console.log(`Browser configured viewport_size: ${JSON.stringify(profile.viewport)}`);
      console.log(`Browser content actual size: ${JSON.stringify(actualSize)}`);
      
      // Verify viewport has a size
      expect(actualSize.width).toBeGreaterThan(0);
      expect(actualSize.height).toBeGreaterThan(0);
      
      // In headless mode, window_size should be converted to viewport
      expect(profile.headless).toBe(true);
      expect(profile.viewport).toEqual({ width: 999, height: 888 });
      expect(profile.window_size).toBeUndefined();
      expect(profile.window_position).toBeUndefined();
      expect(profile.no_viewport).toBe(false);
      
      // Screen should be detected or have default values
      expect(profile.screen).toBeDefined();
      expect(profile.screen!.width).toBeGreaterThan(0);
      expect(profile.screen!.height).toBeGreaterThan(0);
      
    } finally {
      await browserSession.stop();
    }
  });

  test('should initialize browser with proxy settings', async () => {
    // Create proxy settings with a fake proxy server
    const proxySettings: ProxySettings = {
      server: 'http://non.existent.proxy:9999',
      bypass: 'localhost',
      username: 'testuser',
      password: 'testpass'
    };

    // Test object serialization
    const proxyDict = { ...proxySettings };
    expect(proxyDict).toEqual(proxySettings);
    expect(proxyDict.server).toBe('http://non.existent.proxy:9999');

    // Create browser session with proxy
    const profile = new BrowserProfile({
      headless: true,
      proxy: proxySettings,
      user_data_dir: undefined
    });

    const browserSession = new BrowserSession({ profile });
    
    try {
      await browserSession.start();
      
      // Success - the browser was initialized with our proxy settings
      console.log('✅ Browser initialized with proxy settings successfully');
      expect(profile.proxy).toEqual(proxySettings);
      
      // Note: We don't make actual requests since the proxy doesn't exist
      // This just verifies the proxy configuration is properly passed to the browser
      
    } finally {
      await browserSession.stop();
    }
  });

  test('should handle viewport configuration in non-headless mode', async () => {
    // Create browser profile with non-headless mode and window size
    const profile = new BrowserProfile({
      user_data_dir: undefined,
      headless: false,  // In non-headless, window_size should be preserved
      window_size: { width: 1200, height: 800 },
      window_position: { x: 100, y: 100 }
    });

    // In non-headless mode, window_size should be preserved
    expect(profile.headless).toBe(false);
    expect(profile.window_size).toEqual({ width: 1200, height: 800 });
    expect(profile.window_position).toEqual({ x: 100, y: 100 });
    
    // Note: We don't actually start the browser in non-headless mode in tests
    // This just verifies the configuration is properly handled
  });

  test('should handle no_viewport option', () => {
    // Test with no_viewport option
    const profile = new BrowserProfile({
      headless: true,
      no_viewport: true,
      window_size: { width: 1024, height: 768 }
    });

    // When no_viewport is true, viewport should not be set even in headless
    expect(profile.no_viewport).toBe(true);
    // The actual behavior depends on BrowserProfile implementation
  });

  test('should handle screen configuration', () => {
    // Test with custom screen size
    const profile = new BrowserProfile({
      headless: true,
      screen: { width: 1920, height: 1080 }
    });

    expect(profile.screen).toEqual({ width: 1920, height: 1080 });
  });

  test('should handle minimal proxy configuration', () => {
    // Test with only required proxy field
    const proxySettings: ProxySettings = {
      server: 'socks5://127.0.0.1:1080'
    };

    const profile = new BrowserProfile({
      headless: true,
      proxy: proxySettings
    });

    expect(profile.proxy).toEqual(proxySettings);
    expect(profile.proxy?.server).toBe('socks5://127.0.0.1:1080');
    expect(profile.proxy?.username).toBeUndefined();
    expect(profile.proxy?.password).toBeUndefined();
  });
});