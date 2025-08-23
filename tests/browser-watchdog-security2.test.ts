import { BrowserProfile } from '../src/browser/profile';
import { BrowserSession } from '../src/browser/session';
import { SecurityWatchdog } from '../src/browser/watchdogs/security';

describe('URL Allowlist Security Tests', () => {
  describe('Authentication Bypass Prevention', () => {
    test('URL allowlist cannot be bypassed using authentication credentials', () => {
      // Create a context config with a sample allowed domain
      const browserProfile = new BrowserProfile({
        allowed_domains: ['example.com'],
        headless: true,
        user_data_dir: null,
      });
      const browserSession = new BrowserSession(browserProfile);
      const watchdog = new SecurityWatchdog(browserSession);

      // Security vulnerability test cases
      // These should all be detected as malicious despite containing "example.com"
      expect(watchdog._isUrlAllowed('https://example.com:password@malicious.com')).toBe(false);
      expect(watchdog._isUrlAllowed('https://example.com@malicious.com')).toBe(false);
      expect(watchdog._isUrlAllowed('https://example.com%20@malicious.com')).toBe(false);
      expect(watchdog._isUrlAllowed('https://example.com%3A@malicious.com')).toBe(false);

      // Make sure legitimate auth credentials still work
      expect(watchdog._isUrlAllowed('https://user:password@example.com')).toBe(true);
    });
  });

  describe('Glob Pattern Matching', () => {
    test('glob patterns in allowed_domains work correctly', () => {
      // Test *.example.com pattern (should match subdomains and main domain)
      let browserProfile = new BrowserProfile({
        allowed_domains: ['*.example.com'],
        headless: true,
        user_data_dir: null,
      });
      let browserSession = new BrowserSession(browserProfile);
      let watchdog = new SecurityWatchdog(browserSession);

      // Should match subdomains
      expect(watchdog._isUrlAllowed('https://sub.example.com')).toBe(true);
      expect(watchdog._isUrlAllowed('https://deep.sub.example.com')).toBe(true);

      // Should also match main domain
      expect(watchdog._isUrlAllowed('https://example.com')).toBe(true);

      // Should not match other domains
      expect(watchdog._isUrlAllowed('https://notexample.com')).toBe(false);
      expect(watchdog._isUrlAllowed('https://example.org')).toBe(false);

      // Test more complex glob patterns
      browserProfile = new BrowserProfile({
        allowed_domains: [
          '*.google.com',
          'https://wiki.org',
          'https://good.com',
          'chrome://version',
          'brave://*',
        ],
        headless: true,
        user_data_dir: null,
      });
      browserSession = new BrowserSession(browserProfile);
      watchdog = new SecurityWatchdog(browserSession);

      // Should match domains ending with google.com
      expect(watchdog._isUrlAllowed('https://google.com')).toBe(true);
      expect(watchdog._isUrlAllowed('https://www.google.com')).toBe(true);
      // make sure we dont allow *good.com patterns, only *.good.com
      expect(watchdog._isUrlAllowed('https://evilgood.com')).toBe(false);

      // Should match domains starting with wiki
      expect(watchdog._isUrlAllowed('http://wiki.org')).toBe(false);
      expect(watchdog._isUrlAllowed('https://wiki.org')).toBe(true);

      // Should not match internal domains because scheme was not provided
      expect(watchdog._isUrlAllowed('chrome://google.com')).toBe(false);
      expect(watchdog._isUrlAllowed('chrome://abc.google.com')).toBe(false);

      // Test browser internal URLs
      expect(watchdog._isUrlAllowed('chrome://settings')).toBe(false);
      expect(watchdog._isUrlAllowed('chrome://version')).toBe(true);
      expect(watchdog._isUrlAllowed('chrome-extension://version/')).toBe(false);
      expect(watchdog._isUrlAllowed('brave://anything/')).toBe(true);
      expect(watchdog._isUrlAllowed('about:blank')).toBe(true);
      expect(watchdog._isUrlAllowed('chrome://new-tab-page/')).toBe(true);
      expect(watchdog._isUrlAllowed('chrome://new-tab-page')).toBe(true);

      // Test security for glob patterns (authentication credentials bypass attempts)
      // These should all be detected as malicious despite containing allowed domain patterns
      expect(watchdog._isUrlAllowed('https://allowed.example.com:password@notallowed.com')).toBe(false);
      expect(watchdog._isUrlAllowed('https://subdomain.example.com@evil.com')).toBe(false);
      expect(watchdog._isUrlAllowed('https://sub.example.com%20@malicious.org')).toBe(false);
      expect(watchdog._isUrlAllowed('https://anygoogle.com@evil.org')).toBe(false);
    });

    test('edge cases for glob pattern matching', () => {
      // Test with domains containing glob pattern in the middle
      let browserProfile = new BrowserProfile({
        allowed_domains: ['*.google.com', 'https://wiki.org'],
        headless: true,
        user_data_dir: null,
      });
      let browserSession = new BrowserSession(browserProfile);
      let watchdog = new SecurityWatchdog(browserSession);

      // Verify that 'wiki*' pattern doesn't match domains that merely contain 'wiki' in the middle
      expect(watchdog._isUrlAllowed('https://notawiki.com')).toBe(false);
      expect(watchdog._isUrlAllowed('https://havewikipages.org')).toBe(false);
      expect(watchdog._isUrlAllowed('https://my-wiki-site.com')).toBe(false);

      // Verify that '*google.com' doesn't match domains that have 'google' in the middle
      expect(watchdog._isUrlAllowed('https://mygoogle.company.com')).toBe(false);

      // Create context with potentially risky glob pattern that demonstrates security concerns
      browserProfile = new BrowserProfile({
        allowed_domains: ['*.google.com', '*.google.co.uk'],
        headless: true,
        user_data_dir: null,
      });
      browserSession = new BrowserSession(browserProfile);
      watchdog = new SecurityWatchdog(browserSession);

      // Should match legitimate Google domains
      expect(watchdog._isUrlAllowed('https://www.google.com')).toBe(true);
      expect(watchdog._isUrlAllowed('https://mail.google.co.uk')).toBe(true);

      // Shouldn't match potentially malicious domains with a similar structure
      // This demonstrates why the previous pattern was risky and why it's now rejected
      expect(watchdog._isUrlAllowed('https://www.google.evil.com')).toBe(false);
    });
  });
});