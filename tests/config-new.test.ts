/**
 * Tests for configuration system with migration support
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
	CONFIG,
	FlatEnvConfig,
	getDefaultLLM,
	getDefaultProfile,
	loadAndMigrateConfig,
	loadBrowserUseConfig,
} from '../src/config';

describe('TestConfigCreation', () => {
	test('create default config from old format', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
		const configPath = path.join(tmpDir, 'config.json');

		// Write old config format
		const oldConfig = {
			headless: true,
			allowed_domains: ['example.com', 'test.com'],
			api_key: 'sk-test123',
			model: 'gpt-4o',
			temperature: 0.7,
		};
		fs.writeFileSync(configPath, JSON.stringify(oldConfig));

		try {
			// Load - should detect old format and create fresh config
			const dbConfig = loadAndMigrateConfig(configPath);

			// Check fresh config was created
			expect(Object.keys(dbConfig.browser_profile)).toHaveLength(1);
			expect(Object.keys(dbConfig.llm)).toHaveLength(1);
			expect(Object.keys(dbConfig.agent)).toHaveLength(1);

			// Get the default profile
			const profile = Object.values(dbConfig.browser_profile)[0];
			expect(profile.default).toBe(true);
			expect(profile.headless).toBe(false); // Default value, not from old config
			expect(profile.user_data_dir).toBeNull();

			// Get the default LLM config
			const llm = Object.values(dbConfig.llm)[0];
			expect(llm.default).toBe(true);
			expect(llm.api_key).toBe('your-openai-api-key-here'); // Default placeholder
			expect(llm.model).toBe('gpt-4o');

			// Verify file was updated
			const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
			expect(savedConfig.browser_profile).toBeDefined();
			expect(savedConfig.llm).toBeDefined();
			expect(savedConfig.agent).toBeDefined();
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
		}
	});

	test('create config on empty', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
		const configPath = path.join(tmpDir, 'config.json');

		try {
			// Load - should create fresh config
			const dbConfig = loadAndMigrateConfig(configPath);

			// Check fresh config was created
			expect(fs.existsSync(configPath)).toBe(true);
			expect(Object.keys(dbConfig.browser_profile)).toHaveLength(1);
			expect(Object.keys(dbConfig.llm)).toHaveLength(1);
			expect(Object.keys(dbConfig.agent)).toHaveLength(1);

			// Verify defaults
			const profile = Object.values(dbConfig.browser_profile)[0];
			expect(profile.default).toBe(true);
			expect(profile.headless).toBe(false);

			const llm = Object.values(dbConfig.llm)[0];
			expect(llm.default).toBe(true);
			expect(llm.model).toBe('gpt-4o');
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
		}
	});

	test('no migration for new format', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
		const configPath = path.join(tmpDir, 'config.json');

		const newConfig = {
			browser_profile: {
				uuid1: { id: 'uuid1', default: true, created_at: '2024-01-01T00:00:00', headless: true }
			},
			llm: { 
				uuid2: { id: 'uuid2', default: true, created_at: '2024-01-01T00:00:00', api_key: 'sk-new' }
			},
			agent: {},
		};
		fs.writeFileSync(configPath, JSON.stringify(newConfig));

		try {
			// Load without migration
			const dbConfig = loadAndMigrateConfig(configPath);

			// Check it wasn't modified
			expect(Object.keys(dbConfig.browser_profile)).toHaveLength(1);
			expect(dbConfig.browser_profile['uuid1'].id).toBe('uuid1');
			expect(dbConfig.llm['uuid2'].api_key).toBe('sk-new');
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
		}
	});
});

describe('TestConfigLazyLoading', () => {
	test('env vars reload on access', () => {
		const original = process.env.BROWSER_USE_LOGGING_LEVEL;
		
		try {
			// Set initial value
			process.env.BROWSER_USE_LOGGING_LEVEL = 'debug';
			expect(CONFIG.BROWSER_USE_LOGGING_LEVEL).toBe('debug');

			// Change value
			process.env.BROWSER_USE_LOGGING_LEVEL = 'error';
			expect(CONFIG.BROWSER_USE_LOGGING_LEVEL).toBe('error');

			// Remove to test default
			delete process.env.BROWSER_USE_LOGGING_LEVEL;
			expect(CONFIG.BROWSER_USE_LOGGING_LEVEL).toBe('info');
		} finally {
			if (original) {
				process.env.BROWSER_USE_LOGGING_LEVEL = original;
			} else {
				delete process.env.BROWSER_USE_LOGGING_LEVEL;
			}
		}
	});

	test('MCP env vars', () => {
		const originals = {
			BROWSER_USE_HEADLESS: process.env.BROWSER_USE_HEADLESS,
			BROWSER_USE_ALLOWED_DOMAINS: process.env.BROWSER_USE_ALLOWED_DOMAINS,
			BROWSER_USE_LLM_MODEL: process.env.BROWSER_USE_LLM_MODEL,
		};

		try {
			// Test headless
			process.env.BROWSER_USE_HEADLESS = 'true';
			const envConfig1 = new FlatEnvConfig();
			expect(envConfig1.BROWSER_USE_HEADLESS).toBe(true);

			process.env.BROWSER_USE_HEADLESS = 'false';
			const envConfig2 = new FlatEnvConfig();
			expect(envConfig2.BROWSER_USE_HEADLESS).toBe(false);

			// Test allowed domains
			process.env.BROWSER_USE_ALLOWED_DOMAINS = 'example.com,test.com';
			const envConfig3 = new FlatEnvConfig();
			expect(envConfig3.BROWSER_USE_ALLOWED_DOMAINS).toBe('example.com,test.com');

			// Test LLM model
			process.env.BROWSER_USE_LLM_MODEL = 'gpt-4-turbo';
			const envConfig4 = new FlatEnvConfig();
			expect(envConfig4.BROWSER_USE_LLM_MODEL).toBe('gpt-4-turbo');
		} finally {
			Object.entries(originals).forEach(([key, value]) => {
				if (value !== undefined) {
					process.env[key] = value;
				} else {
					delete process.env[key];
				}
			});
		}
	});
});

describe('TestConfigMerging', () => {
	test('load config with env overrides', () => {
		const originals = {
			BROWSER_USE_CONFIG_PATH: process.env.BROWSER_USE_CONFIG_PATH,
			BROWSER_USE_HEADLESS: process.env.BROWSER_USE_HEADLESS,
			OPENAI_API_KEY: process.env.OPENAI_API_KEY,
			BROWSER_USE_LLM_MODEL: process.env.BROWSER_USE_LLM_MODEL,
		};

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
		const configPath = path.join(tmpDir, 'config.json');

		const config = {
			browser_profile: {
				uuid1: { id: 'uuid1', default: true, created_at: '2024-01-01T00:00:00', headless: false }
			},
			llm: {
				uuid2: {
					id: 'uuid2',
					default: true,
					created_at: '2024-01-01T00:00:00',
					api_key: 'sk-config',
					model: 'gpt-3.5-turbo',
				}
			},
			agent: {},
		};
		fs.writeFileSync(configPath, JSON.stringify(config));

		try {
			// Set env vars to override
			process.env.BROWSER_USE_CONFIG_PATH = configPath;
			process.env.BROWSER_USE_HEADLESS = 'true';
			process.env.OPENAI_API_KEY = 'sk-env';
			process.env.BROWSER_USE_LLM_MODEL = 'gpt-4o';

			// Load config
			const mergedConfig = loadBrowserUseConfig();

			// Check overrides
			expect(mergedConfig.browser_profile.headless).toBe(true); // overridden
			expect(mergedConfig.llm.api_key).toBe('sk-env'); // overridden
			expect(mergedConfig.llm.model).toBe('gpt-4o'); // overridden
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
			Object.entries(originals).forEach(([key, value]) => {
				if (value !== undefined) {
					process.env[key] = value;
				} else {
					delete process.env[key];
				}
			});
		}
	});

	test('get default helpers', () => {
		const config = {
			browser_profile: { headless: true, allowed_domains: ['test.com'] },
			llm: { api_key: 'sk-test', model: 'gpt-4o' },
		};

		const profile = getDefaultProfile(config);
		expect(profile).toEqual({ headless: true, allowed_domains: ['test.com'] });

		const llm = getDefaultLLM(config);
		expect(llm).toEqual({ api_key: 'sk-test', model: 'gpt-4o' });

		// Test empty
		expect(getDefaultProfile({})).toEqual({});
		expect(getDefaultLLM({})).toEqual({});
	});
});

describe('TestBackwardCompatibility', () => {
	test('all old config attributes exist', () => {
		// Test all the attributes that exist in the old config
		const attrsToTest = [
			'BROWSER_USE_LOGGING_LEVEL',
			'ANONYMIZED_TELEMETRY',
			'BROWSER_USE_CLOUD_SYNC',
			'BROWSER_USE_CLOUD_API_URL',
			'BROWSER_USE_CLOUD_UI_URL',
			'XDG_CACHE_HOME',
			'XDG_CONFIG_HOME',
			'BROWSER_USE_CONFIG_DIR',
			'BROWSER_USE_CONFIG_FILE',
			'BROWSER_USE_PROFILES_DIR',
			'BROWSER_USE_DEFAULT_USER_DATA_DIR',
			'OPENAI_API_KEY',
			'ANTHROPIC_API_KEY',
			'GOOGLE_API_KEY',
			'DEEPSEEK_API_KEY',
			'GROK_API_KEY',
			'NOVITA_API_KEY',
			'AZURE_OPENAI_ENDPOINT',
			'AZURE_OPENAI_KEY',
			'SKIP_LLM_API_KEY_VERIFICATION',
			'IN_DOCKER',
			'IS_IN_EVALS',
			'WIN_FONT_DIR',
		];

		attrsToTest.forEach(attr => {
			// Should not throw error
			const value = (CONFIG as any)[attr];
			expect(value !== undefined).toBe(true);
		});
	});

	test('computed properties work', () => {
		const telemetryOrig = process.env.ANONYMIZED_TELEMETRY;
		const syncOrig = process.env.BROWSER_USE_CLOUD_SYNC;

		try {
			// Test inheritance
			process.env.ANONYMIZED_TELEMETRY = 'true';
			delete process.env.BROWSER_USE_CLOUD_SYNC;
			expect(CONFIG.BROWSER_USE_CLOUD_SYNC).toBe(true);

			// Test override
			process.env.BROWSER_USE_CLOUD_SYNC = 'false';
			expect(CONFIG.BROWSER_USE_CLOUD_SYNC).toBe(false);
		} finally {
			if (telemetryOrig !== undefined) {
				process.env.ANONYMIZED_TELEMETRY = telemetryOrig;
			} else {
				delete process.env.ANONYMIZED_TELEMETRY;
			}
			if (syncOrig !== undefined) {
				process.env.BROWSER_USE_CLOUD_SYNC = syncOrig;
			} else {
				delete process.env.BROWSER_USE_CLOUD_SYNC;
			}
		}
	});
});