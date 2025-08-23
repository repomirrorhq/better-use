const { URL } = require('url');

const testUrls = [
  'https://example.com:password@malicious.com',
  'https://example.com@malicious.com',
  'https://user:password@example.com',
];

console.log('URL parsing test:');
testUrls.forEach(urlStr => {
  try {
    const parsed = new URL(urlStr);
    console.log(`\n${urlStr}`);
    console.log(`  hostname: ${parsed.hostname}`);
    console.log(`  username: ${parsed.username}`);
    console.log(`  password: ${parsed.password}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
});