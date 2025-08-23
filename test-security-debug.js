const { BrowserProfile } = require('./dist/browser/profile');
const { BrowserSession } = require('./dist/browser/session');
const { SecurityWatchdog } = require('./dist/browser/watchdogs/security');

// Test authentication bypass prevention
const browserProfile = new BrowserProfile({
  allowed_domains: ['example.com'],
  headless: true,
  user_data_dir: undefined,
});

// console.log('Profile config:', browserProfile.config);

const browserSession = new BrowserSession(browserProfile);
const watchdog = new SecurityWatchdog(browserSession, {
  allowedDomains: ['example.com']
});

// Test URLs with authentication credentials that should be blocked
const testUrls = [
  'https://example.com:password@malicious.com',
  'https://example.com@malicious.com',
  'https://user:password@example.com',  // This should be allowed
];

const { URL } = require('url');

console.log('Testing URLs:');
console.log('Profile allowed domains:', browserProfile.allowedDomains);
console.log('Session profile allowed domains:', browserSession.browserProfile.allowedDomains);
console.log('Watchdog config:', watchdog.config);
testUrls.forEach(url => {
  const result = watchdog._isUrlAllowed(url);
  const parsed = new URL(url);
  console.log(`  ${url}`);
  console.log(`    hostname: ${parsed.hostname} => allowed: ${result}`);
});

console.log('\nExpected results:');
console.log('  https://example.com:password@malicious.com => false');
console.log('  https://example.com@malicious.com => false');
console.log('  https://user:password@example.com => true');