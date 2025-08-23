/**
 * Configuration system for browser-use with automatic migration support
 */

import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { v4 as uuid4 } from 'uuid';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

/**
 * Detect if we are running in a docker container
 */
function isRunningInDocker(): boolean {
  try {
    if (existsSync('/.dockerenv')) {
      return true;
    }
    
    if (existsSync('/proc/1/cgroup')) {
      const cgroup = readFileSync('/proc/1/cgroup', 'utf-8');
      if (cgroup.toLowerCase().includes('docker')) {
        return true;
      }
    }
  } catch {
    // Ignore errors
  }
  
  return false;
}

/**
 * Environment variable configuration schema
 */
const FlatEnvConfigSchema = z.object({
  // Logging and telemetry
  BROWSER_USE_LOGGING_LEVEL: z.string().default('info'),
  CDP_LOGGING_LEVEL: z.string().default('WARNING'),
  ANONYMIZED_TELEMETRY: z.boolean().default(true),
  BROWSER_USE_CLOUD_SYNC: z.boolean().nullable().default(null),
  BROWSER_USE_CLOUD_API_URL: z.string().default('https://api.browser-use.com'),
  BROWSER_USE_CLOUD_UI_URL: z.string().default(''),

  // Path configuration
  XDG_CACHE_HOME: z.string().default('~/.cache'),
  XDG_CONFIG_HOME: z.string().default('~/.config'),
  BROWSER_USE_CONFIG_DIR: z.string().nullable().default(null),

  // LLM API keys
  OPENAI_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  GOOGLE_API_KEY: z.string().default(''),
  DEEPSEEK_API_KEY: z.string().default(''),
  GROK_API_KEY: z.string().default(''),
  NOVITA_API_KEY: z.string().default(''),
  AZURE_OPENAI_ENDPOINT: z.string().default(''),
  AZURE_OPENAI_KEY: z.string().default(''),
  SKIP_LLM_API_KEY_VERIFICATION: z.boolean().default(false),

  // Runtime hints
  IN_DOCKER: z.boolean().nullable().default(null),
  IS_IN_EVALS: z.boolean().default(false),
  WIN_FONT_DIR: z.string().default('C:\\Windows\\Fonts'),

  // MCP-specific env vars
  BROWSER_USE_CONFIG_PATH: z.string().nullable().default(null),
  BROWSER_USE_HEADLESS: z.boolean().nullable().default(null),
  BROWSER_USE_ALLOWED_DOMAINS: z.string().nullable().default(null),
  BROWSER_USE_LLM_MODEL: z.string().nullable().default(null),

  // Proxy env vars
  BROWSER_USE_PROXY_URL: z.string().nullable().default(null),
  BROWSER_USE_NO_PROXY: z.string().nullable().default(null),
  BROWSER_USE_PROXY_USERNAME: z.string().nullable().default(null),
  BROWSER_USE_PROXY_PASSWORD: z.string().nullable().default(null),
});

type FlatEnvConfig = z.infer<typeof FlatEnvConfigSchema>;

/**
 * Database-style entry base schema
 */
const DBStyleEntrySchema = z.object({
  id: z.string().default(() => uuid4()),
  default: z.boolean().default(false),
  created_at: z.string().default(() => new Date().toISOString()),
});

/**
 * Browser profile configuration entry
 */
const BrowserProfileEntrySchema = DBStyleEntrySchema.extend({
  headless: z.boolean().nullable().default(null),
  user_data_dir: z.string().nullable().default(null),
  allowed_domains: z.array(z.string()).nullable().default(null),
  downloads_path: z.string().nullable().default(null),
}).passthrough(); // Allow additional fields

/**
 * LLM configuration entry
 */
const LLMEntrySchema = DBStyleEntrySchema.extend({
  api_key: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  temperature: z.number().nullable().default(null),
  max_tokens: z.number().nullable().default(null),
});

/**
 * Agent configuration entry
 */
const AgentEntrySchema = DBStyleEntrySchema.extend({
  max_steps: z.number().nullable().default(null),
  use_vision: z.boolean().nullable().default(null),
  system_prompt: z.string().nullable().default(null),
});

/**
 * Database-style configuration format
 */
const DBStyleConfigJSONSchema = z.object({
  browser_profile: z.record(z.string(), BrowserProfileEntrySchema).default({}),
  llm: z.record(z.string(), LLMEntrySchema).default({}),
  agent: z.record(z.string(), AgentEntrySchema).default({}),
});

type DBStyleConfigJSON = z.infer<typeof DBStyleConfigJSONSchema>;
type BrowserProfileEntry = z.infer<typeof BrowserProfileEntrySchema>;
type LLMEntry = z.infer<typeof LLMEntrySchema>;
type AgentEntry = z.infer<typeof AgentEntrySchema>;

/**
 * Create a fresh default configuration
 */
function createDefaultConfig(): DBStyleConfigJSON {
  console.debug('Creating fresh default config.json');

  const config = DBStyleConfigJSONSchema.parse({});

  // Generate default IDs
  const profileId = uuid4();
  const llmId = uuid4();
  const agentId = uuid4();

  // Create default browser profile entry
  config.browser_profile[profileId] = BrowserProfileEntrySchema.parse({
    id: profileId,
    default: true,
    headless: false,
    user_data_dir: null,
  });

  // Create default LLM entry
  config.llm[llmId] = LLMEntrySchema.parse({
    id: llmId,
    default: true,
    model: 'gpt-4o',
    api_key: 'your-openai-api-key-here',
  });

  // Create default agent entry
  config.agent[agentId] = AgentEntrySchema.parse({
    id: agentId,
    default: true,
  });

  return config;
}

/**
 * Load config.json or create fresh one if old format detected
 */
function loadAndMigrateConfig(configPath: string): DBStyleConfigJSON {
  if (!existsSync(configPath)) {
    // Create fresh config with defaults
    const configDir = resolve(configPath, '..');
    mkdirSync(configDir, { recursive: true });
    const newConfig = createDefaultConfig();
    writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    return newConfig;
  }

  try {
    const data = JSON.parse(readFileSync(configPath, 'utf-8'));

    // Check if it's already in DB-style format
    if (
      ['browser_profile', 'llm', 'agent'].every(key => key in data) &&
      ['browser_profile', 'llm', 'agent'].every(key => typeof data[key] === 'object')
    ) {
      // Check if the values are DB-style entries (have UUIDs as keys)
      const browserProfiles = data.browser_profile || {};
      if (Object.values(browserProfiles).every((v: any) => typeof v === 'object' && 'id' in v)) {
        // Already in new format
        return DBStyleConfigJSONSchema.parse(data);
      }
    }

    // Old format detected - delete it and create fresh config
    console.debug(`Old config format detected at ${configPath}, creating fresh config`);
    const newConfig = createDefaultConfig();

    // Overwrite with new config
    writeFileSync(configPath, JSON.stringify(newConfig, null, 2));

    console.debug(`Created fresh config.json at ${configPath}`);
    return newConfig;
  } catch (error) {
    console.error(`Failed to load config from ${configPath}: ${error}, creating fresh config`);
    // On any error, create fresh config
    const newConfig = createDefaultConfig();
    try {
      writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    } catch (writeError) {
      console.error(`Failed to write fresh config: ${writeError}`);
    }
    return newConfig;
  }
}

/**
 * Configuration class that merges all config sources
 */
export class Config {
  private _dirsCreated = false;

  private _getEnvConfig(): FlatEnvConfig {
    // Parse environment variables with defaults
    const envConfig: any = {};
    for (const [key, schema] of Object.entries(FlatEnvConfigSchema.shape)) {
      const envValue = process.env[key];
      if (envValue !== undefined) {
        if (schema instanceof z.ZodBoolean) {
          envConfig[key] = ['true', 'yes', '1', 'y'].includes(envValue.toLowerCase());
        } else if (schema instanceof z.ZodNumber) {
          envConfig[key] = Number(envValue);
        } else {
          envConfig[key] = envValue;
        }
      }
    }
    return FlatEnvConfigSchema.parse(envConfig);
  }

  private _ensureDirs(): void {
    if (!this._dirsCreated) {
      const configDir = this._getConfigDir();
      mkdirSync(configDir, { recursive: true });
      mkdirSync(join(configDir, 'profiles'), { recursive: true });
      mkdirSync(join(configDir, 'extensions'), { recursive: true });
      this._dirsCreated = true;
    }
  }

  private _getConfigDir(): string {
    const envConfig = this._getEnvConfig();
    if (envConfig.BROWSER_USE_CONFIG_DIR) {
      return resolve(envConfig.BROWSER_USE_CONFIG_DIR.replace('~', homedir()));
    }
    const xdgConfigHome = envConfig.XDG_CONFIG_HOME.replace('~', homedir());
    return join(xdgConfigHome, 'browseruse');
  }

  private _getConfigPath(): string {
    const envConfig = this._getEnvConfig();
    if (envConfig.BROWSER_USE_CONFIG_PATH) {
      return resolve(envConfig.BROWSER_USE_CONFIG_PATH.replace('~', homedir()));
    }
    return join(this._getConfigDir(), 'config.json');
  }

  private _getDBConfig(): DBStyleConfigJSON {
    const configPath = this._getConfigPath();
    return loadAndMigrateConfig(configPath);
  }

  // Environment variable accessors
  get BROWSER_USE_LOGGING_LEVEL(): string {
    return this._getEnvConfig().BROWSER_USE_LOGGING_LEVEL;
  }

  get CDP_LOGGING_LEVEL(): string {
    return this._getEnvConfig().CDP_LOGGING_LEVEL;
  }

  get ANONYMIZED_TELEMETRY(): boolean {
    return this._getEnvConfig().ANONYMIZED_TELEMETRY;
  }

  get BROWSER_USE_CLOUD_SYNC(): boolean {
    const config = this._getEnvConfig();
    return config.BROWSER_USE_CLOUD_SYNC ?? config.ANONYMIZED_TELEMETRY;
  }

  get BROWSER_USE_CLOUD_API_URL(): string {
    const url = this._getEnvConfig().BROWSER_USE_CLOUD_API_URL;
    if (!url.includes('://')) {
      throw new Error('BROWSER_USE_CLOUD_API_URL must be a valid URL');
    }
    return url;
  }

  get BROWSER_USE_CLOUD_UI_URL(): string {
    const url = this._getEnvConfig().BROWSER_USE_CLOUD_UI_URL;
    if (url && !url.includes('://')) {
      throw new Error('BROWSER_USE_CLOUD_UI_URL must be a valid URL if set');
    }
    return url;
  }

  get BROWSER_USE_CONFIG_DIR(): string {
    this._ensureDirs();
    return this._getConfigDir();
  }

  get BROWSER_USE_CONFIG_FILE(): string {
    return this._getConfigPath();
  }

  get BROWSER_USE_PROFILES_DIR(): string {
    this._ensureDirs();
    return join(this.BROWSER_USE_CONFIG_DIR, 'profiles');
  }

  get BROWSER_USE_DEFAULT_USER_DATA_DIR(): string {
    return join(this.BROWSER_USE_PROFILES_DIR, 'default');
  }

  get BROWSER_USE_EXTENSIONS_DIR(): string {
    this._ensureDirs();
    return join(this.BROWSER_USE_CONFIG_DIR, 'extensions');
  }

  // LLM API key configuration
  get OPENAI_API_KEY(): string {
    return this._getEnvConfig().OPENAI_API_KEY;
  }

  get ANTHROPIC_API_KEY(): string {
    return this._getEnvConfig().ANTHROPIC_API_KEY;
  }

  get GOOGLE_API_KEY(): string {
    return this._getEnvConfig().GOOGLE_API_KEY;
  }

  get DEEPSEEK_API_KEY(): string {
    return this._getEnvConfig().DEEPSEEK_API_KEY;
  }

  get GROK_API_KEY(): string {
    return this._getEnvConfig().GROK_API_KEY;
  }

  get NOVITA_API_KEY(): string {
    return this._getEnvConfig().NOVITA_API_KEY;
  }

  get AZURE_OPENAI_ENDPOINT(): string {
    return this._getEnvConfig().AZURE_OPENAI_ENDPOINT;
  }

  get AZURE_OPENAI_KEY(): string {
    return this._getEnvConfig().AZURE_OPENAI_KEY;
  }

  get SKIP_LLM_API_KEY_VERIFICATION(): boolean {
    return this._getEnvConfig().SKIP_LLM_API_KEY_VERIFICATION;
  }

  // Runtime hints
  get IN_DOCKER(): boolean {
    const config = this._getEnvConfig();
    return config.IN_DOCKER ?? isRunningInDocker();
  }

  get IS_IN_EVALS(): boolean {
    return this._getEnvConfig().IS_IN_EVALS;
  }

  get WIN_FONT_DIR(): string {
    return this._getEnvConfig().WIN_FONT_DIR;
  }

  // Configuration methods
  getDefaultProfile(): Partial<BrowserProfileEntry> {
    const dbConfig = this._getDBConfig();
    for (const profile of Object.values(dbConfig.browser_profile)) {
      if (profile.default) {
        const { id, created_at, ...rest } = profile;
        return rest;
      }
    }

    // Return first profile if no default
    const profiles = Object.values(dbConfig.browser_profile);
    if (profiles.length > 0) {
      const { id, created_at, ...rest } = profiles[0];
      return rest;
    }

    return {};
  }

  getDefaultLLM(): Partial<LLMEntry> {
    const dbConfig = this._getDBConfig();
    for (const llm of Object.values(dbConfig.llm)) {
      if (llm.default) {
        const { id, created_at, ...rest } = llm;
        return rest;
      }
    }

    // Return first LLM if no default
    const llms = Object.values(dbConfig.llm);
    if (llms.length > 0) {
      const { id, created_at, ...rest } = llms[0];
      return rest;
    }

    return {};
  }

  getDefaultAgent(): Partial<AgentEntry> {
    const dbConfig = this._getDBConfig();
    for (const agent of Object.values(dbConfig.agent)) {
      if (agent.default) {
        const { id, created_at, ...rest } = agent;
        return rest;
      }
    }

    // Return first agent if no default
    const agents = Object.values(dbConfig.agent);
    if (agents.length > 0) {
      const { id, created_at, ...rest } = agents[0];
      return rest;
    }

    return {};
  }

  loadConfig(): Record<string, any> {
    const config = {
      browser_profile: this.getDefaultProfile(),
      llm: this.getDefaultLLM(),
      agent: this.getDefaultAgent(),
    };

    const envConfig = this._getEnvConfig();

    // Apply MCP-specific env var overrides
    if (envConfig.BROWSER_USE_HEADLESS !== null) {
      config.browser_profile.headless = envConfig.BROWSER_USE_HEADLESS;
    }

    if (envConfig.BROWSER_USE_ALLOWED_DOMAINS) {
      const domains = envConfig.BROWSER_USE_ALLOWED_DOMAINS
        .split(',')
        .map(d => d.trim())
        .filter(d => d);
      config.browser_profile.allowed_domains = domains;
    }

    // Proxy settings
    const proxyDict: Record<string, any> = {};
    if (envConfig.BROWSER_USE_PROXY_URL) {
      proxyDict.server = envConfig.BROWSER_USE_PROXY_URL;
    }
    if (envConfig.BROWSER_USE_NO_PROXY) {
      proxyDict.bypass = envConfig.BROWSER_USE_NO_PROXY
        .split(',')
        .map(d => d.trim())
        .filter(d => d)
        .join(',');
    }
    if (envConfig.BROWSER_USE_PROXY_USERNAME) {
      proxyDict.username = envConfig.BROWSER_USE_PROXY_USERNAME;
    }
    if (envConfig.BROWSER_USE_PROXY_PASSWORD) {
      proxyDict.password = envConfig.BROWSER_USE_PROXY_PASSWORD;
    }
    if (Object.keys(proxyDict).length > 0) {
      config.browser_profile.proxy = proxyDict;
    }

    if (envConfig.OPENAI_API_KEY) {
      config.llm.api_key = envConfig.OPENAI_API_KEY;
    }

    if (envConfig.BROWSER_USE_LLM_MODEL) {
      config.llm.model = envConfig.BROWSER_USE_LLM_MODEL;
    }

    return config;
  }
}

// Create singleton instance
export const CONFIG = new Config();

// Helper functions for MCP components
export function loadBrowserUseConfig(): Record<string, any> {
  return CONFIG.loadConfig();
}

export function getDefaultProfile(config: Record<string, any>): Record<string, any> {
  return config.browser_profile || {};
}

export function getDefaultLLM(config: Record<string, any>): Record<string, any> {
  return config.llm || {};
}