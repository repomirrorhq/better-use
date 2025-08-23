/**
 * Browser module exports
 */

// Export events
export * from './events';

// Export views
export type { TabInfo, PageInfo, BrowserStateSummary } from './views';
export { 
  TabInfoSchema, 
  PageInfoSchema, 
  BrowserStateSummarySchema, 
  createTabInfo, 
  createPageInfo, 
  createBrowserStateSummary,
  PLACEHOLDER_4PX_SCREENSHOT 
} from './views';

// Export profile
export { BrowserProfile, CHROME_DEBUG_PORT, CHROME_DISABLED_COMPONENTS } from './profile';

// Export session
export { BrowserSession } from './session';