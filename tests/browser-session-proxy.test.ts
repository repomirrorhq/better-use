import { BrowserProfile } from '../src/browser/profile';
import { BrowserSession } from '../src/browser/session';
import { CONFIG } from '../src/config';
import path from 'path';

describe('Browser Session Proxy Tests', () => {
  test('chromium args include proxy flags', () => {
    const profile = new BrowserProfile({
      headless: true,
      userDataDir: path.join(CONFIG.BROWSER_USE_PROFILES_DIR, 'proxy-smoke'),
      proxy: {
        server: 'http://proxy.local:8080',
        bypass: 'localhost,127.0.0.1',
      },
    });
    
    const args = profile.getArgs();
    expect(args).toContain('--proxy-server=http://proxy.local:8080');
    expect(args).toContain('--proxy-bypass-list=localhost,127.0.0.1');
  });

  test('CDP proxy auth handler registers and responds', async () => {
    // Create profile with proxy auth credentials
    const profile = new BrowserProfile({
      headless: true,
      userDataDir: path.join(CONFIG.BROWSER_USE_PROFILES_DIR, 'proxy-smoke'),
      proxy: {
        username: 'user',
        password: 'pass',
      },
    });
    
    const session = new BrowserSession(profile);

    // Stub CDP client with minimal Fetch support
    class StubCDP {
      enabled = false;
      lastAuth: any = null;
      lastDefault: any = null;
      authCallback: any = null;
      requestPausedCallback: any = null;

      send = {
        Fetch: {
          enable: async (params: any, sessionId?: string) => {
            this.enabled = true;
          },
          continueWithAuth: async (params: any, sessionId?: string) => {
            this.lastAuth = { params, sessionId };
          },
          continueRequest: async (params: any, sessionId?: string) => {
            // no-op; included to mirror CDP API surface used by impl
          },
        },
      };

      register = {
        Fetch: {
          authRequired: (callback: any) => {
            this.authCallback = callback;
          },
          requestPaused: (callback: any) => {
            this.requestPausedCallback = callback;
          },
        },
      };
    }

    const root = new StubCDP();

    // Attach stubs to session
    (session as any)._cdpClientRoot = root;

    // Should register Fetch handler and enable auth handling without raising
    await (session as any)._setupProxyAuth();

    expect(root.enabled).toBe(true);
    expect(typeof root.authCallback).toBe('function');

    // Simulate proxy auth required event
    const ev = { requestId: 'r1', authChallenge: { source: 'Proxy' } };
    root.authCallback(ev, 's1');

    // Let scheduled task run
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(root.lastAuth).not.toBeNull();
    const params = root.lastAuth.params;
    expect(params.authChallengeResponse.response).toBe('ProvideCredentials');
    expect(params.authChallengeResponse.username).toBe('user');
    expect(params.authChallengeResponse.password).toBe('pass');
    expect(root.lastAuth.sessionId).toBe('s1');

    // Now simulate a non-proxy auth challenge and ensure default handling
    const ev2 = { requestId: 'r2', authChallenge: { source: 'Server' } };
    root.authCallback(ev2, 's2');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // After non-proxy challenge, lastAuth should reflect Default response
    expect(root.lastAuth).not.toBeNull();
    const params2 = root.lastAuth.params;
    expect(params2.requestId).toBe('r2');
    expect(params2.authChallengeResponse.response).toBe('Default');
  });
});