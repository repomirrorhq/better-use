/**
 * Test sensitive data masking and replacement functionality
 */

import { MessageManager } from '../src/agent/messageManager';
import { MessageManagerState } from '../src/agent/views';
import { Registry } from '../src/controller/registry';
import { FileSystem } from '../src/filesystem';
import { SystemMessage, UserMessage } from '../src/llm/messages';
import { isNewTabPage, matchUrlWithDomainPattern } from '../src/utils';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

interface SensitiveParams {
	text: string;
}

describe('Sensitive Data Tests', () => {
	let registry: Registry;
	let messageManager: MessageManager;

	beforeEach(() => {
		registry = new Registry();
		
		// Create message manager with file system
		const baseTmp = os.tmpdir();
		const fileSystemPath = path.join(baseTmp, uuidv4());
		messageManager = new MessageManager({
			task: 'Test task',
			systemMessage: new SystemMessage({ content: 'System message' }),
			state: new MessageManagerState(),
			fileSystem: new FileSystem(fileSystemPath),
		});
	});

	describe('replaceSensitiveData', () => {
		test('handles missing keys gracefully', () => {
			// Create a simple object with sensitive data placeholders
			const params: SensitiveParams = { 
				text: 'Please enter <secret>username</secret> and <secret>password</secret>' 
			};

			// Case 1: All keys present - both placeholders should be replaced
			let sensitiveData = { username: 'user123', password: 'pass456' };
			let result = registry['_replaceSensitiveData'](params, sensitiveData);
			expect(result.text).toBe('Please enter user123 and pass456');
			expect(result.text).not.toContain('<secret>');

			// Case 2: One key missing - only available key should be replaced
			sensitiveData = { username: 'user123' } as any; // password is missing
			result = registry['_replaceSensitiveData'](params, sensitiveData);
			expect(result.text).toBe('Please enter user123 and <secret>password</secret>');
			expect(result.text).toContain('user123');
			expect(result.text).toContain('<secret>password</secret>');

			// Case 3: Multiple keys missing - all tags should be preserved
			sensitiveData = {}; // both keys missing
			result = registry['_replaceSensitiveData'](params, sensitiveData);
			expect(result.text).toBe('Please enter <secret>username</secret> and <secret>password</secret>');
			expect(result.text).toContain('<secret>username</secret>');
			expect(result.text).toContain('<secret>password</secret>');

			// Case 4: One key empty - empty values are treated as missing
			sensitiveData = { username: 'user123', password: '' };
			result = registry['_replaceSensitiveData'](params, sensitiveData);
			expect(result.text).toBe('Please enter user123 and <secret>password</secret>');
			expect(result.text).toContain('user123');
			expect(result.text).toContain('<secret>password</secret>');
		});

		test('domain-specific sensitive data replacement', () => {
			// Create a simple object with sensitive data placeholders
			const params: SensitiveParams = { 
				text: 'Please enter <secret>username</secret> and <secret>password</secret>' 
			};

			// Simple test with domain-specific values
			const sensitiveData = {
				'example.com': { username: 'example_user' },
				'other_data': 'non_secret_value', // Old format mixed with new
			};

			// Without a URL, domain-specific secrets should NOT be exposed
			let result = registry['_replaceSensitiveData'](params, sensitiveData);
			expect(result.text).toBe('Please enter <secret>username</secret> and <secret>password</secret>');
			expect(result.text).toContain('<secret>username</secret>');
			expect(result.text).toContain('<secret>password</secret>');
			expect(result.text).not.toContain('example_user');

			// Test with a matching URL - domain-specific secrets should be exposed
			result = registry['_replaceSensitiveData'](params, sensitiveData, 'https://example.com/login');
			expect(result.text).toBe('Please enter example_user and <secret>password</secret>');
			expect(result.text).toContain('example_user');
			expect(result.text).toContain('<secret>password</secret>');
			expect(result.text).not.toContain('<secret>username</secret>');
		});
	});

	describe('matchUrlWithDomainPattern', () => {
		test('exact domain matches', () => {
			expect(matchUrlWithDomainPattern('https://example.com', 'example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('http://example.com', 'example.com')).toBe(false); // Default scheme is https
			expect(matchUrlWithDomainPattern('https://google.com', 'example.com')).toBe(false);
		});

		test('subdomain pattern matches', () => {
			expect(matchUrlWithDomainPattern('https://sub.example.com', '*.example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('https://example.com', '*.example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('https://sub.sub.example.com', '*.example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('https://example.org', '*.example.com')).toBe(false);
		});

		test('protocol pattern matches', () => {
			expect(matchUrlWithDomainPattern('https://example.com', 'http*://example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('http://example.com', 'http*://example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('ftp://example.com', 'http*://example.com')).toBe(false);
		});

		test('explicit http protocol', () => {
			expect(matchUrlWithDomainPattern('http://example.com', 'http://example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('https://example.com', 'http://example.com')).toBe(false);
		});

		test('chrome extension pattern', () => {
			expect(matchUrlWithDomainPattern('chrome-extension://abcdefghijkl', 'chrome-extension://*')).toBe(true);
			expect(matchUrlWithDomainPattern('chrome-extension://mnopqrstuvwx', 'chrome-extension://abcdefghijkl')).toBe(false);
		});

		test('new tab page handling', () => {
			expect(matchUrlWithDomainPattern('about:blank', 'example.com')).toBe(false);
			expect(matchUrlWithDomainPattern('about:blank', '*://*')).toBe(false);
			expect(matchUrlWithDomainPattern('chrome://new-tab-page/', 'example.com')).toBe(false);
			expect(matchUrlWithDomainPattern('chrome://new-tab-page/', '*://*')).toBe(false);
			expect(matchUrlWithDomainPattern('chrome://new-tab-page', 'example.com')).toBe(false);
			expect(matchUrlWithDomainPattern('chrome://new-tab-page', '*://*')).toBe(false);
		});
	});

	describe('unsafe domain patterns', () => {
		test('rejects unsafe patterns', () => {
			// These are unsafe patterns that could match too many domains
			expect(matchUrlWithDomainPattern('https://evil.com', '*google.com')).toBe(false);
			expect(matchUrlWithDomainPattern('https://google.com.evil.com', '*.*.com')).toBe(false);
			expect(matchUrlWithDomainPattern('https://google.com', '**google.com')).toBe(false);
			expect(matchUrlWithDomainPattern('https://google.com', 'g*e.com')).toBe(false);
			expect(matchUrlWithDomainPattern('https://google.com', '*com*')).toBe(false);

			// Test with patterns that have multiple asterisks in different positions
			expect(matchUrlWithDomainPattern('https://subdomain.example.com', '*domain*example*')).toBe(false);
			expect(matchUrlWithDomainPattern('https://sub.domain.example.com', '*.*.example.com')).toBe(false);

			// Test patterns with wildcards in TLD part
			expect(matchUrlWithDomainPattern('https://example.com', 'example.*')).toBe(false);
			expect(matchUrlWithDomainPattern('https://example.org', 'example.*')).toBe(false);
		});
	});

	describe('malformed URLs and patterns', () => {
		test('handles malformed URLs', () => {
			expect(matchUrlWithDomainPattern('not-a-url', 'example.com')).toBe(false);
			expect(matchUrlWithDomainPattern('http://', 'example.com')).toBe(false);
			expect(matchUrlWithDomainPattern('https://', 'example.com')).toBe(false);
			expect(matchUrlWithDomainPattern('ftp:/example.com', 'example.com')).toBe(false);
		});

		test('handles empty URLs or patterns', () => {
			expect(matchUrlWithDomainPattern('', 'example.com')).toBe(false);
			expect(matchUrlWithDomainPattern('https://example.com', '')).toBe(false);
		});

		test('handles URLs with no hostname', () => {
			expect(matchUrlWithDomainPattern('file:///path/to/file.txt', 'example.com')).toBe(false);
		});

		test('handles invalid pattern formats', () => {
			expect(matchUrlWithDomainPattern('https://example.com', '..example.com')).toBe(false);
			expect(matchUrlWithDomainPattern('https://example.com', '.*.example.com')).toBe(false);
			expect(matchUrlWithDomainPattern('https://example.com', '**')).toBe(false);
		});

		test('handles nested URL attacks', () => {
			// These should match example.com, not evil.com
			expect(matchUrlWithDomainPattern('https://example.com/redirect?url=https://evil.com', 'example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('https://example.com/path/https://evil.com', 'example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('https://example.com#https://evil.com', 'example.com')).toBe(true);
		});

		test('handles complex URL obfuscation attempts', () => {
			expect(matchUrlWithDomainPattern('https://example.com/path?next=//evil.com/attack', 'example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('https://example.com@evil.com', 'example.com')).toBe(false);
			expect(matchUrlWithDomainPattern('https://evil.com?example.com', 'example.com')).toBe(false);
			expect(matchUrlWithDomainPattern('https://user:example.com@evil.com', 'example.com')).toBe(false);
		});
	});

	describe('URL components', () => {
		test('handles URLs with credentials', () => {
			expect(matchUrlWithDomainPattern('https://user:pass@example.com', 'example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('https://user:pass@example.com', '*.example.com')).toBe(true);
		});

		test('handles URLs with ports', () => {
			expect(matchUrlWithDomainPattern('https://example.com:8080', 'example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('https://example.com:8080', 'example.com:8080')).toBe(true);
		});

		test('handles URLs with paths', () => {
			expect(matchUrlWithDomainPattern('https://example.com/path/to/page', 'example.com')).toBe(true);
			expect(matchUrlWithDomainPattern('https://example.com/path/to/page', 'example.com/path')).toBe(false);
		});

		test('handles URLs with query parameters', () => {
			expect(matchUrlWithDomainPattern('https://example.com?param=value', 'example.com')).toBe(true);
		});

		test('handles URLs with fragments', () => {
			expect(matchUrlWithDomainPattern('https://example.com#section', 'example.com')).toBe(true);
		});

		test('handles URLs with all components', () => {
			expect(matchUrlWithDomainPattern(
				'https://user:pass@example.com:8080/path?query=val#fragment', 
				'example.com'
			)).toBe(true);
		});
	});

	describe('filterSensitiveData', () => {
		test('handles all sensitive data scenarios', () => {
			// Set up a message with sensitive information
			const message = new UserMessage({ content: 'My username is admin and password is secret123' });

			// Case 1: No sensitive data provided
			messageManager.sensitiveData = undefined;
			let result = messageManager['_filterSensitiveData'](message);
			expect(result.content).toBe('My username is admin and password is secret123');

			// Case 2: All sensitive data is properly replaced
			messageManager.sensitiveData = { username: 'admin', password: 'secret123' };
			result = messageManager['_filterSensitiveData'](message);
			expect(result.content).toContain('<secret>username</secret>');
			expect(result.content).toContain('<secret>password</secret>');

			// Case 3: Test with empty values
			messageManager.sensitiveData = { username: 'admin', password: '' };
			result = messageManager['_filterSensitiveData'](message);
			expect(result.content).toContain('<secret>username</secret>');
			// Only username should be replaced since password is empty

			// Case 4: Test with domain-specific sensitive data format
			messageManager.sensitiveData = {
				'example.com': { username: 'admin', password: 'secret123' },
				'google.com': { email: 'user@example.com', password: 'google_pass' },
			};
			// The message manager needs to know about the URL context for domain-specific replacements
			// This would require setting up the state with current URL
		});
	});
});