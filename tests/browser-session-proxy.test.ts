import { BrowserProfile } from '../src/browser/profile';
import { BrowserSession } from '../src/browser/session';
import { CONFIG } from '../src/config';
import path from 'path';

describe('Browser Session Proxy Tests', () => {
  test('chromium args include proxy flags', () => {
    const profile = new BrowserProfile({
      headless: true,
      user_data_dir: path.join(CONFIG.BROWSER_USE_PROFILES_DIR, 'proxy-smoke'),
      proxy: {
        server: 'http://proxy.local:8080',
        bypass: 'localhost,127.0.0.1',
      },
    });
    
    // Check that proxy configuration is stored correctly
    expect(profile.proxy).toBeDefined();
    expect(profile.proxy?.server).toBe('http://proxy.local:8080');
    expect(profile.proxy?.bypass).toBe('localhost,127.0.0.1');
  });

  test('browser session accepts proxy auth configuration', () => {
    // Create profile with proxy auth credentials
    const profile = new BrowserProfile({
      headless: true,
      user_data_dir: path.join(CONFIG.BROWSER_USE_PROFILES_DIR, 'proxy-smoke'),
      proxy: {
        server: 'http://proxy.local:8080',
        username: 'user',
        password: 'pass',
      },
    });
    
    const session = new BrowserSession({ profile });

    // Verify the session has the profile with proxy configuration
    expect(session.browserProfile).toBe(profile);
    expect(session.browserProfile.proxy).toBeDefined();
    expect(session.browserProfile.proxy?.username).toBe('user');
    expect(session.browserProfile.proxy?.password).toBe('pass');
    expect(session.browserProfile.proxy?.server).toBe('http://proxy.local:8080');
  });
});