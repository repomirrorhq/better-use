/**
 * Browser module exports
 */

export * from './events';
export * from './views';
export * from './profile';
export * from './session';

// Re-export commonly used types and classes
export type {
  NavigateToUrlEvent,
  ClickElementEvent,
  TypeTextEvent,
  ScreenshotEvent,
  BrowserStateRequestEvent,
  TargetID,
  EnhancedDOMTreeNode,
} from './events';

export type {
  TabInfo,
  PageInfo,
  BrowserStateSummary,
} from './views';

export {
  BrowserProfile,
} from './profile';

export {
  BrowserSession,
} from './session';