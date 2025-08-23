/**
 * Browser profile configuration
 */

import { z } from 'zod';
import { join } from 'path';
import { tmpdir } from 'os';
import { CONFIG } from '../config';

// Chrome debug port - use non-default to avoid conflicts
export const CHROME_DEBUG_PORT = 9242;

// Chrome disabled components (based on Playwright defaults)
export const CHROME_DISABLED_COMPONENTS = [
  'AcceptCHFrame',
  'AutoExpandDetailsElement', 
  'AvoidUnnecessaryBeforeUnloadCheckSync',
  'CertificateTransparencyComponentUpdater',
  'DestroyProfileOnBrowserClose',
  'DialMediaRouteProvider',
  'ExtensionManifestV2Disabled',
  'GlobalMediaControls',
  'HttpsUpgrades',
  'ImprovedCookieControls',
  'LazyFrameLoading',
  'LensOverlay',
  'MediaRouter',
  'PaintHolding',
  'ThirdPartyStoragePartitioning',
  'Translate',
];

// Chrome args for different scenarios
export const CHROME_ARGS_AUTOMATION = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=TranslateUI',
  '--disable-ipc-flooding-protection',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-service-autorun',
  '--password-store=basic',
  '--use-mock-keychain',
];

export const CHROME_ARGS_PERFORMANCE = [
  '--aggressive-cache-discard',
  '--memory-pressure-off',
  '--max_old_space_size=4096',
];

// Proxy configuration schema
export const ProxyConfigSchema = z.object({
  server: z.string().describe('Proxy server URL'),
  bypass: z.string().optional().describe('Comma-separated list of hosts to bypass'),
  username: z.string().optional(),
  password: z.string().optional(),
});

export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;

// Browser profile schema
export const BrowserProfileSchema = z.object({
  // Basic settings
  headless: z.boolean().default(false).describe('Run browser in headless mode'),
  user_data_dir: z.string().optional().describe('Custom user data directory'),
  
  // Network settings
  proxy: ProxyConfigSchema.optional().describe('Proxy configuration'),
  allowed_domains: z.array(z.string()).default([]).describe('Allowed domain patterns'),
  
  // Download settings
  downloads_path: z.string().optional().describe('Custom downloads directory'),
  
  // Viewport settings
  viewport_width: z.number().default(1280).describe('Browser viewport width'),
  viewport_height: z.number().default(720).describe('Browser viewport height'),
  device_scale_factor: z.number().default(1).describe('Device pixel ratio'),
  
  // Chrome-specific settings
  chrome_args: z.array(z.string()).default([]).describe('Additional Chrome arguments'),
  chrome_executable_path: z.string().optional().describe('Custom Chrome executable path'),
  
  // Debug settings
  debug_port: z.number().default(CHROME_DEBUG_PORT).describe('Chrome debug port'),
  slow_mo: z.number().default(0).describe('Slow motion delay in milliseconds'),
  
  // Security settings
  disable_web_security: z.boolean().default(false).describe('Disable web security (dangerous)'),
  ignore_certificate_errors: z.boolean().default(false).describe('Ignore SSL certificate errors'),
  
  // Storage settings
  storage_state_path: z.string().optional().describe('Path to storage state file'),
  
  // DOM settings
  cross_origin_iframes: z.boolean().default(false).describe('Enable cross-origin iframe access (experimental)'),
  
  // Page load timing settings
  minimum_wait_page_load_time: z.number().default(0).describe('Minimum time to wait after page load in seconds'),
  wait_for_network_idle_page_load_time: z.number().default(0).describe('Time to wait for network idle after page load in seconds'),
  
  // Timeout settings
  timeout: z.number().default(30000).describe('Default timeout in milliseconds'),
  navigation_timeout: z.number().default(30000).describe('Navigation timeout in milliseconds'),
  
  // Permission settings
  permissions: z.array(z.string()).default(['clipboardReadWrite', 'notifications']).describe('Browser permissions to grant (CDP Browser.grantPermissions)'),
});

export type BrowserProfileConfig = z.infer<typeof BrowserProfileSchema>;

export class BrowserProfile {
  private config: BrowserProfileConfig;

  constructor(config?: Partial<BrowserProfileConfig>) {
    this.config = BrowserProfileSchema.parse(config || {});
  }

  // Getters for configuration
  get headless(): boolean {
    return this.config.headless;
  }

  get userDataDir(): string {
    return this.config.user_data_dir || CONFIG.BROWSER_USE_DEFAULT_USER_DATA_DIR;
  }

  get proxy(): ProxyConfig | undefined {
    return this.config.proxy;
  }

  get allowedDomains(): string[] {
    return this.config.allowed_domains;
  }

  get downloadsPath(): string {
    return this.config.downloads_path || join(this.userDataDir, 'downloads');
  }

  get viewportWidth(): number {
    return this.config.viewport_width;
  }

  get viewportHeight(): number {
    return this.config.viewport_height;
  }

  get deviceScaleFactor(): number {
    return this.config.device_scale_factor;
  }

  get debugPort(): number {
    return this.config.debug_port;
  }

  get timeout(): number {
    return this.config.timeout;
  }

  get navigationTimeout(): number {
    return this.config.navigation_timeout;
  }

  get permissions(): string[] {
    return this.config.permissions;
  }

  get crossOriginIframes(): boolean {
    return this.config.cross_origin_iframes;
  }

  get minimumWaitPageLoadTime(): number {
    return this.config.minimum_wait_page_load_time;
  }

  get waitForNetworkIdlePageLoadTime(): number {
    return this.config.wait_for_network_idle_page_load_time;
  }

  // Generate Chrome launch arguments
  getChromeArgs(): string[] {
    const args = [
      ...CHROME_ARGS_AUTOMATION,
      ...CHROME_ARGS_PERFORMANCE,
      `--remote-debugging-port=${this.debugPort}`,
      // Note: --user-data-dir is handled by Playwright's userDataDir parameter
      `--disable-component-extensions-with-background-pages`,
      `--disable-background-networking`,
      `--disable-component-update`,
      `--disable-client-side-phishing-detection`,
      `--disable-sync`,
      `--metrics-recording-only`,
      `--no-report-upload`,
      `--disable-extensions`,
      '--disable-default-apps',
      '--mute-audio',
      '--no-first-run',
      '--disable-default-browser-check',
      '--disable-dev-shm-usage', // Helps with Docker
      '--disable-gpu',
      '--no-sandbox', // Required for Docker
    ];

    // Add disabled components
    if (CHROME_DISABLED_COMPONENTS.length > 0) {
      args.push(`--disable-component-extensions=${CHROME_DISABLED_COMPONENTS.join(',')}`);
    }

    // Add proxy settings
    if (this.proxy) {
      args.push(`--proxy-server=${this.proxy.server}`);
      if (this.proxy.bypass) {
        args.push(`--proxy-bypass-list=${this.proxy.bypass}`);
      }
    }

    // Add viewport settings
    args.push(`--window-size=${this.viewportWidth},${this.viewportHeight}`);

    // Add security settings
    if (this.config.disable_web_security) {
      args.push('--disable-web-security');
      args.push('--disable-features=VizDisplayCompositor');
    }

    if (this.config.ignore_certificate_errors) {
      args.push('--ignore-certificate-errors');
      args.push('--ignore-ssl-errors');
    }

    // Add custom args
    args.push(...this.config.chrome_args);

    // Docker-specific optimizations
    if (CONFIG.IN_DOCKER) {
      args.push('--disable-dev-shm-usage');
      args.push('--disable-gpu');
      args.push('--no-sandbox');
    }

    return args.filter((arg, index, array) => array.indexOf(arg) === index); // Remove duplicates
  }

  // Get CDP URL
  getCdpUrl(): string {
    return `http://localhost:${this.debugPort}`;
  }

  // Update configuration
  update(config: Partial<BrowserProfileConfig>): void {
    this.config = BrowserProfileSchema.parse({
      ...this.config,
      ...config,
    });
  }

  // Convert to plain object
  toJSON(): BrowserProfileConfig {
    return this.config;
  }

  // Create from config object
  static fromConfig(config: Partial<BrowserProfileConfig>): BrowserProfile {
    return new BrowserProfile(config);
  }

  // Create default profile
  static createDefault(): BrowserProfile {
    return new BrowserProfile();
  }

  // Create headless profile
  static createHeadless(): BrowserProfile {
    return new BrowserProfile({ headless: true });
  }

  // Create profile with proxy
  static createWithProxy(proxy: ProxyConfig): BrowserProfile {
    return new BrowserProfile({ proxy });
  }
}