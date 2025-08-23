/**
 * Event definitions for browser communication
 */

import { z } from 'zod';
import { EnhancedDOMTreeNode, EnhancedDOMTreeNodeSchema } from '../dom/views';

// Basic types
export type TargetID = string;
export type SessionID = string;

// Wait conditions for navigation
export const WaitUntilSchema = z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']);
export type WaitUntil = z.infer<typeof WaitUntilSchema>;

// Mouse button types
export const MouseButtonSchema = z.enum(['left', 'right', 'middle']);
export type MouseButton = z.infer<typeof MouseButtonSchema>;

// Scroll directions
export const ScrollDirectionSchema = z.enum(['up', 'down', 'left', 'right']);
export type ScrollDirection = z.infer<typeof ScrollDirectionSchema>;

// Re-export EnhancedDOMTreeNode from dom/views to ensure consistency
export type { EnhancedDOMTreeNode } from '../dom/views';

// Base Event interface
export interface BaseEvent<T = any> {
  id?: string;
  timestamp?: number;
  event_timeout?: number;
}

// ============================================================================
// Agent/Controller -> BrowserSession Events (High-level browser actions)
// ============================================================================

export interface NavigateToUrlEvent extends BaseEvent<void> {
  url: string;
  wait_until?: WaitUntil;
  timeout_ms?: number;
  new_tab?: boolean;
  event_timeout?: number; // 15.0 seconds
}

export interface ClickElementEvent extends BaseEvent<Record<string, any> | null> {
  node: EnhancedDOMTreeNode;
  button?: MouseButton;
  while_holding_ctrl?: boolean;
  event_timeout?: number; // 15.0 seconds
}

export interface TypeTextEvent extends BaseEvent<Record<string, any> | null> {
  node: EnhancedDOMTreeNode;
  text: string;
  clear_existing?: boolean;
  event_timeout?: number; // 15.0 seconds
}

export interface ScrollEvent extends BaseEvent<void> {
  direction: ScrollDirection;
  amount: number; // pixels
  node?: EnhancedDOMTreeNode | null; // null means scroll page
  event_timeout?: number; // 8.0 seconds
}

export interface SwitchTabEvent extends BaseEvent<TargetID> {
  target_id?: TargetID | null; // null means switch to most recently opened tab
  event_timeout?: number; // 10.0 seconds
}

export interface CloseTabEvent extends BaseEvent<void> {
  target_id: TargetID;
  event_timeout?: number; // 10.0 seconds
}

export interface ScreenshotEvent extends BaseEvent<string> {
  full_page?: boolean;
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  event_timeout?: number; // 8.0 seconds
}

export interface BrowserStateRequestEvent extends BaseEvent<any> {
  include_dom?: boolean;
  include_screenshot?: boolean;
  cache_clickable_elements_hashes?: boolean;
  include_recent_events?: boolean;
  event_timeout?: number; // 30.0 seconds
}

export interface GoBackEvent extends BaseEvent<void> {
  event_timeout?: number; // 15.0 seconds
}

export interface GoForwardEvent extends BaseEvent<void> {
  event_timeout?: number; // 15.0 seconds
}

export interface RefreshEvent extends BaseEvent<void> {
  event_timeout?: number; // 15.0 seconds
}

export interface WaitEvent extends BaseEvent<void> {
  seconds?: number; // 3.0 default
  max_seconds?: number; // 10.0 safety cap
  event_timeout?: number; // 60.0 seconds
}

export interface SendKeysEvent extends BaseEvent<void> {
  keys: string; // e.g., "ctrl+a", "cmd+c", "Enter"
  event_timeout?: number; // 15.0 seconds
}

export interface UploadFileEvent extends BaseEvent<void> {
  node: EnhancedDOMTreeNode;
  file_path: string;
  event_timeout?: number; // 30.0 seconds
}

export interface GetDropdownOptionsEvent extends BaseEvent<Record<string, string>> {
  node: EnhancedDOMTreeNode;
  event_timeout?: number; // 15.0 seconds
}

export interface SelectDropdownOptionEvent extends BaseEvent<Record<string, string>> {
  node: EnhancedDOMTreeNode;
  text: string; // The option text to select
  event_timeout?: number; // 8.0 seconds
}

export interface ScrollToTextEvent extends BaseEvent<void> {
  text: string;
  direction?: 'up' | 'down'; // default 'down'
  event_timeout?: number; // 15.0 seconds
}

// ============================================================================
// Browser Lifecycle Events
// ============================================================================

export interface BrowserStartEvent extends BaseEvent {
  cdp_url?: string;
  launch_options?: Record<string, any>;
  event_timeout?: number; // 30.0 seconds
}

export interface BrowserStopEvent extends BaseEvent {
  force?: boolean;
  event_timeout?: number; // 45.0 seconds
}

export interface BrowserLaunchResult {
  cdp_url: string;
}

export interface BrowserLaunchEvent extends BaseEvent<BrowserLaunchResult> {
  event_timeout?: number; // 30.0 seconds
}

export interface BrowserKillEvent extends BaseEvent {
  event_timeout?: number; // 30.0 seconds
}

// ============================================================================
// Browser State Events
// ============================================================================

export interface BrowserConnectedEvent extends BaseEvent {
  cdp_url: string;
  event_timeout?: number; // 30.0 seconds
}

export interface BrowserStoppedEvent extends BaseEvent {
  reason?: string;
  event_timeout?: number; // 30.0 seconds
}

export interface TabCreatedEvent extends BaseEvent {
  target_id: TargetID;
  url: string;
  event_timeout?: number; // 30.0 seconds
}

export interface TabClosedEvent extends BaseEvent {
  target_id: TargetID;
  event_timeout?: number; // 10.0 seconds
}

export interface AgentFocusChangedEvent extends BaseEvent {
  target_id: TargetID;
  url: string;
  event_timeout?: number; // 10.0 seconds
}

export interface TargetCrashedEvent extends BaseEvent {
  target_id: TargetID;
  error: string;
  event_timeout?: number; // 10.0 seconds
}

export interface NavigationStartedEvent extends BaseEvent {
  target_id: TargetID;
  url: string;
  event_timeout?: number; // 30.0 seconds
}

export interface NavigationCompleteEvent extends BaseEvent {
  target_id: TargetID;
  url: string;
  status?: number;
  error_message?: string; // Error/timeout message if navigation had issues
  loading_status?: string; // Detailed loading status
  event_timeout?: number; // 30.0 seconds
}

// ============================================================================
// Error Events
// ============================================================================

export interface BrowserErrorEvent extends BaseEvent {
  error_type: string;
  message: string;
  details?: Record<string, any>;
  event_timeout?: number; // 30.0 seconds
}

// ============================================================================
// Storage State Events
// ============================================================================

export interface SaveStorageStateEvent extends BaseEvent {
  path?: string; // Optional path, uses profile default if not provided
  event_timeout?: number; // 45.0 seconds
}

export interface StorageStateSavedEvent extends BaseEvent {
  path: string;
  cookies_count: number;
  origins_count: number;
  event_timeout?: number; // 30.0 seconds
}

export interface LoadStorageStateEvent extends BaseEvent {
  path?: string; // Optional path, uses profile default if not provided
  event_timeout?: number; // 45.0 seconds
}

export interface StorageStateLoadedEvent extends BaseEvent {
  path: string;
  cookies_count: number;
  origins_count: number;
  event_timeout?: number; // 30.0 seconds
}

// ============================================================================
// File Download Events
// ============================================================================

export interface FileDownloadedEvent extends BaseEvent {
  url: string;
  path: string;
  file_name: string;
  file_size: number;
  file_type?: string; // e.g., 'pdf', 'zip', 'docx'
  mime_type?: string; // e.g., 'application/pdf'
  from_cache?: boolean;
  auto_download?: boolean; // Whether this was an automatic download
  event_timeout?: number; // 30.0 seconds
}

// ============================================================================
// Dialog Events
// ============================================================================

export interface AboutBlankDVDScreensaverShownEvent extends BaseEvent {
  target_id: TargetID;
  error?: string;
}

export interface DialogOpenedEvent extends BaseEvent {
  dialog_type: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
  message: string;
  url: string;
  frame_id: string;
}

// ============================================================================
// Event Schema Definitions
// ============================================================================

export const NavigateToUrlEventSchema = z.object({
  url: z.string(),
  wait_until: WaitUntilSchema.default('load'),
  timeout_ms: z.number().optional(),
  new_tab: z.boolean().default(false),
  event_timeout: z.number().default(15.0),
});

export const ClickElementEventSchema = z.object({
  node: EnhancedDOMTreeNodeSchema,
  button: MouseButtonSchema.default('left'),
  while_holding_ctrl: z.boolean().default(false),
  event_timeout: z.number().default(15.0),
});

export const TypeTextEventSchema = z.object({
  node: EnhancedDOMTreeNodeSchema,
  text: z.string(),
  clear_existing: z.boolean().default(true),
  event_timeout: z.number().default(15.0),
});

export const ScrollEventSchema = z.object({
  direction: ScrollDirectionSchema,
  amount: z.number(),
  node: EnhancedDOMTreeNodeSchema.optional(),
  event_timeout: z.number().default(8.0),
});

// Factory functions for creating events
export function createNavigateToUrlEvent(url: string, options?: Partial<NavigateToUrlEvent>): NavigateToUrlEvent {
  return NavigateToUrlEventSchema.parse({
    url,
    ...options,
  });
}

export function createClickElementEvent(node: EnhancedDOMTreeNode, options?: Partial<ClickElementEvent>): ClickElementEvent {
  return ClickElementEventSchema.parse({
    node,
    ...options,
  });
}

export function createTypeTextEvent(node: EnhancedDOMTreeNode, text: string, options?: Partial<TypeTextEvent>): TypeTextEvent {
  return TypeTextEventSchema.parse({
    node,
    text,
    ...options,
  });
}

export function createScrollEvent(direction: ScrollDirection, amount: number, options?: Partial<ScrollEvent>): ScrollEvent {
  return ScrollEventSchema.parse({
    direction,
    amount,
    ...options,
  });
}

// Factory function for SwitchTabEvent
export function createSwitchTabEvent(options: { targetId?: TargetID | null } = {}): SwitchTabEvent {
  return {
    target_id: options.targetId || null,
    event_timeout: 10.0,
    id: `switch_tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
}

// Factory function for GoBackEvent
export function createGoBackEvent(options: Partial<GoBackEvent> = {}): GoBackEvent {
  return {
    event_timeout: options.event_timeout || 15.0,
    id: `go_back_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
}

// Additional factory functions for remaining events
export function createUploadFileEvent(node: EnhancedDOMTreeNode, file_path: string, options: Partial<UploadFileEvent> = {}): UploadFileEvent {
  return {
    node,
    file_path,
    event_timeout: options.event_timeout || 30.0,
    id: `upload_file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
}

export function createCloseTabEvent(target_id: TargetID, options: Partial<CloseTabEvent> = {}): CloseTabEvent {
  return {
    target_id,
    event_timeout: options.event_timeout || 10.0,
    id: `close_tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
}

export function createSendKeysEvent(keys: string, options: Partial<SendKeysEvent> = {}): SendKeysEvent {
  return {
    keys,
    event_timeout: options.event_timeout || 15.0,
    id: `send_keys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
}

export function createScrollToTextEvent(text: string, options: Partial<ScrollToTextEvent> = {}): ScrollToTextEvent {
  return {
    text,
    direction: options.direction || 'down',
    event_timeout: options.event_timeout || 15.0,
    id: `scroll_to_text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
}

export function createGetDropdownOptionsEvent(node: EnhancedDOMTreeNode, options: Partial<GetDropdownOptionsEvent> = {}): GetDropdownOptionsEvent {
  return {
    node,
    event_timeout: options.event_timeout || 15.0,
    id: `get_dropdown_options_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
}

export function createSelectDropdownOptionEvent(node: EnhancedDOMTreeNode, text: string, options: Partial<SelectDropdownOptionEvent> = {}): SelectDropdownOptionEvent {
  return {
    node,
    text,
    event_timeout: options.event_timeout || 8.0,
    id: `select_dropdown_option_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
}