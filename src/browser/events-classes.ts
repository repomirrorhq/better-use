/**
 * Event classes for constructor usage
 * 
 * These classes implement the event interfaces and can be instantiated.
 */

import { 
  BrowserErrorEvent, 
  BrowserKillEvent, 
  BrowserLaunchEvent, 
  BrowserStateRequestEvent,
  BrowserStopEvent,
  ScreenshotEvent,
  TabCreatedEvent,
  TargetID 
} from './events';

export class TabCreatedEventClass implements TabCreatedEvent {
  target_id: TargetID;
  url: string;
  id?: string;
  timestamp?: number;
  event_timeout?: number;

  constructor(data: Partial<TabCreatedEvent> = {}) {
    this.target_id = data.target_id || '';
    this.url = data.url || '';
    this.id = data.id || `tab_created_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = data.timestamp || Date.now();
    this.event_timeout = data.event_timeout;
  }
}

export class BrowserStateRequestEventClass implements BrowserStateRequestEvent {
  include_dom: boolean;
  include_screenshot: boolean;
  include_recent_events: boolean;
  id?: string;
  timestamp?: number;
  event_timeout?: number;

  constructor(data: Partial<BrowserStateRequestEvent> = {}) {
    this.include_dom = data.include_dom ?? true;
    this.include_screenshot = data.include_screenshot ?? true;
    this.include_recent_events = data.include_recent_events ?? false;
    this.id = data.id || `browser_state_request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = data.timestamp || Date.now();
    this.event_timeout = data.event_timeout;
  }
}

export class ScreenshotEventClass implements ScreenshotEvent {
  full_page?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
  id?: string;
  timestamp?: number;
  event_timeout?: number;

  constructor(data: Partial<ScreenshotEvent> = {}) {
    this.full_page = data.full_page;
    this.clip = data.clip;
    this.id = data.id || `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = data.timestamp || Date.now();
    this.event_timeout = data.event_timeout;
  }
}

export class BrowserErrorEventClass implements BrowserErrorEvent {
  error_type: string;
  message: string;
  target_id?: TargetID;
  id?: string;
  timestamp?: number;
  event_timeout?: number;

  constructor(data: Partial<BrowserErrorEvent>) {
    this.error_type = data.error_type || 'unknown';
    this.message = data.message || '';
    this.target_id = data.target_id;
    this.id = data.id || `browser_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = data.timestamp || Date.now();
    this.event_timeout = data.event_timeout;
  }
}

export class BrowserLaunchEventClass implements BrowserLaunchEvent {
  id?: string;
  timestamp?: number;
  event_timeout?: number;

  constructor(data: Partial<BrowserLaunchEvent> = {}) {
    this.id = data.id || `browser_launch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = data.timestamp || Date.now();
    this.event_timeout = data.event_timeout;
  }
}

export class BrowserKillEventClass implements BrowserKillEvent {
  id?: string;
  timestamp?: number;
  event_timeout?: number;

  constructor(data: Partial<BrowserKillEvent> = {}) {
    this.id = data.id || `browser_kill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = data.timestamp || Date.now();
    this.event_timeout = data.event_timeout;
  }
}

export class BrowserStopEventClass implements BrowserStopEvent {
  id?: string;
  timestamp?: number;
  event_timeout?: number;

  constructor(data: Partial<BrowserStopEvent> = {}) {
    this.id = data.id || `browser_stop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = data.timestamp || Date.now();
    this.event_timeout = data.event_timeout;
  }
}

// Export with original names for easier usage
export { TabCreatedEventClass as TabCreatedEvent };
export { BrowserStateRequestEventClass as BrowserStateRequestEvent };
export { ScreenshotEventClass as ScreenshotEvent };
export { BrowserErrorEventClass as BrowserErrorEvent };
export { BrowserLaunchEventClass as BrowserLaunchEvent };
export { BrowserKillEventClass as BrowserKillEvent };
export { BrowserStopEventClass as BrowserStopEvent };