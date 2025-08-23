/**
 * Browser views and data structures
 */

import { z } from 'zod';

// Known placeholder image data for about:blank pages - a 4x4 white PNG
export const PLACEHOLDER_4PX_SCREENSHOT = 
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP8//8/AwwwMSAB3BwAlm4DBfIlvvkAAAAASUVORK5CYII=';

export const TabInfoSchema = z.object({
  url: z.string(),
  title: z.string(),
  target_id: z.string().describe('Tab/Target ID'),
  parent_target_id: z.string().optional().describe('Parent page that contains this popup or iframe'),
});

export type TabInfo = z.infer<typeof TabInfoSchema>;

export const PageInfoSchema = z.object({
  // Current viewport dimensions
  viewport_width: z.number(),
  viewport_height: z.number(),
  
  // Full page dimensions
  page_width: z.number(),
  page_height: z.number(),
  
  // Current scroll position
  scroll_x: z.number(),
  scroll_y: z.number(),
  
  // Calculated scroll information
  pixels_above: z.number(),
  pixels_below: z.number(),
  pixels_left: z.number(),
  pixels_right: z.number(),
  
  // Scrollable range
  max_scroll_x: z.number(),
  max_scroll_y: z.number(),
  
  // Device pixel ratio
  device_pixel_ratio: z.number().default(1),
  
  // Page zoom level
  zoom_level: z.number().default(1),
});

export type PageInfo = z.infer<typeof PageInfoSchema>;

export const BrowserStateSummarySchema = z.object({
  url: z.string().describe('Current page URL'),
  title: z.string().describe('Page title'),
  screenshot: z.string().describe('Base64 encoded screenshot'),
  
  // Tab information
  tabs: z.array(TabInfoSchema).describe('List of open tabs'),
  current_tab_id: z.string().describe('Current active tab ID'),
  
  // Page information
  page_info: PageInfoSchema.describe('Page dimensions and scroll info'),
  
  // DOM information (will be populated when DOM module is ported)
  dom_state: z.any().optional().describe('DOM state information'),
  
  // Recent events
  recent_events: z.string().nullable().optional().describe('Text summary of recent browser events'),
  
  // Timestamp
  timestamp: z.number().describe('Unix timestamp when state was captured'),
  
  // Legacy compatibility fields
  pixels_above: z.number().default(0).describe('Legacy: pixels above viewport'),
  pixels_below: z.number().default(0).describe('Legacy: pixels below viewport'),
  browser_errors: z.array(z.string()).default([]).describe('Browser error messages'),
  is_pdf_viewer: z.boolean().default(false).describe('Whether the current page is a PDF viewer'),
  
  // PDF viewer status (legacy)
  isPdfViewer: z.boolean().default(false).describe('Legacy: Whether the current page is a PDF viewer'),
});

export type BrowserStateSummary = z.infer<typeof BrowserStateSummarySchema>;

// Factory functions
export function createTabInfo(
  url: string,
  title: string,
  target_id: string,
  options?: Partial<TabInfo>
): TabInfo {
  return TabInfoSchema.parse({
    url,
    title,
    target_id,
    ...options,
  });
}

export function createPageInfo(
  viewport_width: number,
  viewport_height: number,
  page_width: number,
  page_height: number,
  options?: Partial<PageInfo>
): PageInfo {
  return PageInfoSchema.parse({
    viewport_width,
    viewport_height,
    page_width,
    page_height,
    scroll_x: 0,
    scroll_y: 0,
    pixels_above: 0,
    pixels_below: 0,
    pixels_left: 0,
    pixels_right: 0,
    max_scroll_x: Math.max(0, page_width - viewport_width),
    max_scroll_y: Math.max(0, page_height - viewport_height),
    ...options,
  });
}

export function createBrowserStateSummary(
  url: string,
  title: string,
  screenshot: string,
  tabs: TabInfo[],
  current_tab_id: string,
  page_info: PageInfo,
  options?: Partial<BrowserStateSummary>
): BrowserStateSummary {
  return BrowserStateSummarySchema.parse({
    url,
    title,
    screenshot,
    tabs,
    current_tab_id,
    page_info,
    timestamp: Date.now(),
    ...options,
  });
}

// Re-export BrowserError from exceptions for compatibility
export { BrowserException as BrowserError } from '../exceptions';