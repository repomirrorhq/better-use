/**
 * DOM views and data structures for browser-use TypeScript
 * 
 * This module contains TypeScript equivalents of the Python DOM views,
 * using Zod schemas for validation and TypeScript types for safety.
 */

import { z } from 'zod';

// Default attributes to include in serialization
export const DEFAULT_INCLUDE_ATTRIBUTES = [
  'title',
  'type', 
  'checked',
  'name',
  'role',
  'value',
  'placeholder',
  'data-date-format',
  'alt',
  'aria-label',
  'aria-expanded',
  'data-state',
  'aria-checked',
  // Accessibility properties from ax_node (ordered by importance for automation)
  'checked',
  'selected', 
  'expanded',
  'pressed',
  'disabled',
  'valuenow',
  'keyshortcuts',
  'haspopup',
  'multiselectable',
  'required',
  'valuetext',
  'level',
  'busy',
  'live',
  // Accessibility name (contains text content for StaticText elements)
  'ax_name',
] as const;

// Node types based on DOM specification
export enum NodeType {
  ELEMENT_NODE = 1,
  ATTRIBUTE_NODE = 2,
  TEXT_NODE = 3,
  CDATA_SECTION_NODE = 4,
  ENTITY_REFERENCE_NODE = 5,
  ENTITY_NODE = 6,
  PROCESSING_INSTRUCTION_NODE = 7,
  COMMENT_NODE = 8,
  DOCUMENT_NODE = 9,
  DOCUMENT_TYPE_NODE = 10,
  DOCUMENT_FRAGMENT_NODE = 11,
  NOTATION_NODE = 12,
}

// Basic rectangle structure
export const DOMRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export type DOMRect = z.infer<typeof DOMRectSchema>;

// Accessibility property
export const EnhancedAXPropertySchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.boolean(), z.null()]).optional(),
});

export type EnhancedAXProperty = z.infer<typeof EnhancedAXPropertySchema>;

// Accessibility node
export const EnhancedAXNodeSchema = z.object({
  ax_node_id: z.string().describe('Not to be confused the DOM node_id. Only useful for AX node tree'),
  ignored: z.boolean(),
  role: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  properties: z.array(EnhancedAXPropertySchema).nullable(),
});

export type EnhancedAXNode = z.infer<typeof EnhancedAXNodeSchema>;

// Snapshot node data
export const EnhancedSnapshotNodeSchema = z.object({
  is_clickable: z.boolean().nullable(),
  cursor_style: z.string().nullable(),
  bounds: DOMRectSchema.nullable().describe('Document coordinates (origin = top-left of the page, ignores current scroll)'),
  clientRects: DOMRectSchema.nullable().describe('Viewport coordinates (origin = top-left of the visible scrollport)'),
  scrollRects: DOMRectSchema.nullable().describe('Scrollable area of the element'),
  computed_styles: z.record(z.string()).nullable().describe('Computed styles from the layout tree'),
  paint_order: z.number().nullable().describe('Paint order from the layout tree'),
  stacking_contexts: z.number().nullable().describe('Stacking contexts from the layout tree'),
});

export type EnhancedSnapshotNode = z.infer<typeof EnhancedSnapshotNodeSchema>;

// Enhanced DOM tree node (main structure)
export const EnhancedDOMTreeNodeSchema: z.ZodType<EnhancedDOMTreeNode> = z.lazy(() => z.object({
  // DOM Node data
  node_id: z.number(),
  backend_node_id: z.number(),
  node_type: z.nativeEnum(NodeType),
  node_name: z.string().describe('Only applicable for NodeType.ELEMENT_NODE'),
  node_value: z.string().describe('this is where the value from NodeType.TEXT_NODE is stored usually'),
  attributes: z.record(z.string()).describe('slightly changed from the original attributes to be more readable'),
  is_scrollable: z.boolean().nullable().describe('Whether the node is scrollable'),
  is_visible: z.boolean().nullable().describe('Whether the node is visible according to the upper most frame node'),
  absolute_position: DOMRectSchema.nullable().describe('Absolute position of the node in the document according to the top-left of the page'),

  // Frame data
  target_id: z.string(),
  frame_id: z.string().nullable(),
  session_id: z.string().nullable(),
  content_document: EnhancedDOMTreeNodeSchema.nullable().describe('Content document is the document inside a new iframe'),

  // Shadow DOM
  shadow_root_type: z.string().nullable(),
  shadow_roots: z.array(EnhancedDOMTreeNodeSchema).nullable().describe('Shadow roots are the shadow DOMs of the element'),

  // Navigation
  parent_node: EnhancedDOMTreeNodeSchema.nullable(),
  children_nodes: z.array(EnhancedDOMTreeNodeSchema).nullable(),

  // AX Node data
  ax_node: EnhancedAXNodeSchema.nullable(),

  // Snapshot Node data
  snapshot_node: EnhancedSnapshotNodeSchema.nullable(),

  // Interactive element index
  element_index: z.number().nullable(),
  
  // Unique identifier
  uuid: z.string(),
}));

export type EnhancedDOMTreeNode = {
  // DOM Node data
  node_id: number;
  backend_node_id: number;
  node_type: NodeType;
  node_name: string;
  node_value: string;
  attributes: Record<string, string>;
  is_scrollable: boolean | null;
  is_visible: boolean | null;
  absolute_position: DOMRect | null;

  // Frame data
  target_id: string;
  frame_id: string | null;
  session_id: string | null;
  content_document: EnhancedDOMTreeNode | null;

  // Shadow DOM
  shadow_root_type: string | null;
  shadow_roots: EnhancedDOMTreeNode[] | null;

  // Navigation
  parent_node: EnhancedDOMTreeNode | null;
  children_nodes: EnhancedDOMTreeNode[] | null;

  // AX Node data
  ax_node: EnhancedAXNode | null;

  // Snapshot Node data
  snapshot_node: EnhancedSnapshotNode | null;

  // Interactive element index
  element_index: number | null;
  
  // Unique identifier
  uuid: string;
};

// Current page targets
export const CurrentPageTargetsSchema = z.object({
  page_session: z.any(), // TargetInfo type would be defined elsewhere
  iframe_sessions: z.array(z.any()), // Array of TargetInfo
});

export type CurrentPageTargets = z.infer<typeof CurrentPageTargetsSchema>;

// Target all trees
export const TargetAllTreesSchema = z.object({
  snapshot: z.any(), // CaptureSnapshotReturns
  dom_tree: z.any(), // GetDocumentReturns
  ax_tree: z.any(), // GetFullAXTreeReturns
  device_pixel_ratio: z.number(),
  cdp_timing: z.record(z.number()),
});

export type TargetAllTrees = z.infer<typeof TargetAllTreesSchema>;

// Propagating bounds for bounding box filtering
export const PropagatingBoundsSchema = z.object({
  tag: z.string().describe('The tag that started propagation'),
  bounds: DOMRectSchema.describe('The bounding box'),
  node_id: z.number().describe('Node ID for debugging'),
  depth: z.number().describe('How deep in tree this started'),
});

export type PropagatingBounds = z.infer<typeof PropagatingBoundsSchema>;

// Simplified node for tree optimization
export const SimplifiedNodeSchema: z.ZodType<SimplifiedNode> = z.lazy(() => z.object({
  original_node: EnhancedDOMTreeNodeSchema,
  children: z.array(SimplifiedNodeSchema),
  should_display: z.boolean(),
  interactive_index: z.number().nullable(),
  is_new: z.boolean(),
  excluded_by_parent: z.boolean(),
}));

export type SimplifiedNode = {
  original_node: EnhancedDOMTreeNode;
  children: SimplifiedNode[];
  should_display: boolean;
  interactive_index: number | null;
  is_new: boolean;
  excluded_by_parent: boolean;
};

// DOM selector map
export type DOMSelectorMap = Map<number, EnhancedDOMTreeNode>;

// Serialized DOM state
export const SerializedDOMStateSchema = z.object({
  _root: SimplifiedNodeSchema.nullable(),
  selector_map: z.any(), // We'll use Map directly in TypeScript
});

export type SerializedDOMState = z.infer<typeof SerializedDOMStateSchema>;

// DOM interacted element
export const DOMInteractedElementSchema = z.object({
  node_id: z.number(),
  backend_node_id: z.number(),
  frame_id: z.string().nullable(),
  node_type: z.nativeEnum(NodeType),
  node_value: z.string(),
  node_name: z.string(),
  attributes: z.record(z.string()).nullable(),
  bounds: DOMRectSchema.nullable(),
  x_path: z.string(),
  element_hash: z.number(),
});

export type DOMInteractedElement = z.infer<typeof DOMInteractedElementSchema>;

// Factory functions
export function createDOMRect(x: number, y: number, width: number, height: number): DOMRect {
  return DOMRectSchema.parse({ x, y, width, height });
}

export function createEnhancedAXProperty(name: string, value?: string | boolean | null): EnhancedAXProperty {
  return EnhancedAXPropertySchema.parse({ name, value });
}

export function createEnhancedAXNode(
  ax_node_id: string,
  ignored: boolean,
  options?: Partial<EnhancedAXNode>
): EnhancedAXNode {
  return EnhancedAXNodeSchema.parse({
    ax_node_id,
    ignored,
    role: null,
    name: null,
    description: null,
    properties: null,
    ...options,
  });
}

export function createEnhancedSnapshotNode(options?: Partial<EnhancedSnapshotNode>): EnhancedSnapshotNode {
  return EnhancedSnapshotNodeSchema.parse({
    is_clickable: null,
    cursor_style: null,
    bounds: null,
    clientRects: null,
    scrollRects: null,
    computed_styles: null,
    paint_order: null,
    stacking_contexts: null,
    ...options,
  });
}

// Utility functions for DOM manipulation
export class DOMTreeNodeUtils {
  /**
   * Get tag name in lowercase
   */
  static getTagName(node: EnhancedDOMTreeNode): string {
    return node.node_name.toLowerCase();
  }

  /**
   * Get all children including shadow roots
   */
  static getChildrenAndShadowRoots(node: EnhancedDOMTreeNode): EnhancedDOMTreeNode[] {
    const children = node.children_nodes || [];
    if (node.shadow_roots) {
      children.push(...node.shadow_roots);
    }
    return children;
  }

  /**
   * Get all children text content
   */
  static getAllChildrenText(node: EnhancedDOMTreeNode, maxDepth = -1): string {
    const textParts: string[] = [];

    const collectText = (node: EnhancedDOMTreeNode, currentDepth: number) => {
      if (maxDepth !== -1 && currentDepth > maxDepth) {
        return;
      }

      if (node.node_type === NodeType.TEXT_NODE) {
        textParts.push(node.node_value);
      } else if (node.node_type === NodeType.ELEMENT_NODE) {
        const children = this.getChildrenAndShadowRoots(node);
        for (const child of children) {
          collectText(child, currentDepth + 1);
        }
      }
    };

    collectText(node, 0);
    return textParts.join('\n').trim();
  }

  /**
   * Generate XPath for this DOM node
   */
  static generateXPath(node: EnhancedDOMTreeNode): string {
    const segments: string[] = [];
    let currentElement: EnhancedDOMTreeNode | null = node;

    while (currentElement && 
           (currentElement.node_type === NodeType.ELEMENT_NODE || 
            currentElement.node_type === NodeType.DOCUMENT_FRAGMENT_NODE)) {
      
      // Pass through shadow roots
      if (currentElement.node_type === NodeType.DOCUMENT_FRAGMENT_NODE) {
        currentElement = currentElement.parent_node;
        continue;
      }

      // Stop if we hit iframe
      if (currentElement.parent_node && 
          this.getTagName(currentElement.parent_node) === 'iframe') {
        break;
      }

      const position = this.getElementPosition(currentElement);
      const tagName = this.getTagName(currentElement);
      const xpathIndex = position > 0 ? `[${position}]` : '';
      segments.unshift(`${tagName}${xpathIndex}`);

      currentElement = currentElement.parent_node;
    }

    return segments.join('/');
  }

  /**
   * Get element position among siblings with same tag name
   */
  private static getElementPosition(element: EnhancedDOMTreeNode): number {
    if (!element.parent_node?.children_nodes) {
      return 0;
    }

    const sameTagSiblings = element.parent_node.children_nodes.filter(
      child => 
        child.node_type === NodeType.ELEMENT_NODE && 
        this.getTagName(child) === this.getTagName(element)
    );

    if (sameTagSiblings.length <= 1) {
      return 0; // No index needed if it's the only one
    }

    try {
      // XPath is 1-indexed
      const position = sameTagSiblings.indexOf(element) + 1;
      return position;
    } catch {
      return 0;
    }
  }

  /**
   * Check if element is actually scrollable with enhanced detection
   */
  static isActuallyScrollable(node: EnhancedDOMTreeNode): boolean {
    // First check if CDP already detected it as scrollable
    if (node.is_scrollable) {
      return true;
    }

    // Enhanced detection for elements CDP missed
    if (!node.snapshot_node) {
      return false;
    }

    // Check scroll vs client rects - this is the most reliable indicator
    const scrollRects = node.snapshot_node.scrollRects;
    const clientRects = node.snapshot_node.clientRects;

    if (scrollRects && clientRects) {
      // Content is larger than visible area = scrollable
      const hasVerticalScroll = scrollRects.height > clientRects.height + 1; // +1 for rounding
      const hasHorizontalScroll = scrollRects.width > clientRects.width + 1;

      if (hasVerticalScroll || hasHorizontalScroll) {
        // Also check CSS to make sure scrolling is allowed
        if (node.snapshot_node.computed_styles) {
          const styles = node.snapshot_node.computed_styles;
          
          const overflow = (styles['overflow'] || 'visible').toLowerCase();
          const overflowX = (styles['overflow-x'] || overflow).toLowerCase();
          const overflowY = (styles['overflow-y'] || overflow).toLowerCase();

          // Only allow scrolling if overflow is explicitly set to auto, scroll, or overlay
          const allowsScroll = (
            ['auto', 'scroll', 'overlay'].includes(overflow) ||
            ['auto', 'scroll', 'overlay'].includes(overflowX) ||
            ['auto', 'scroll', 'overlay'].includes(overflowY)
          );

          return allowsScroll;
        } else {
          // No CSS info, but content overflows - be more conservative
          // Only consider it scrollable if it's a common scrollable container element
          const scrollableTags = new Set(['div', 'main', 'section', 'article', 'aside', 'body', 'html']);
          return scrollableTags.has(this.getTagName(node));
        }
      }
    }

    return false;
  }

  /**
   * Check if we should show scroll information for this node
   */
  static shouldShowScrollInfo(node: EnhancedDOMTreeNode): boolean {
    // Special case: Always show scroll info for iframe elements
    if (this.getTagName(node) === 'iframe') {
      return true;
    }

    // Must be scrollable first for non-iframe elements
    if (!(node.is_scrollable || this.isActuallyScrollable(node))) {
      return false;
    }

    // Always show for iframe content documents (body/html)
    if (['body', 'html'].includes(this.getTagName(node))) {
      return true;
    }

    // Don't show if parent is already scrollable (avoid nested spam)
    if (node.parent_node && 
        (node.parent_node.is_scrollable || this.isActuallyScrollable(node.parent_node))) {
      return false;
    }

    return true;
  }

  /**
   * Get scroll information for this element
   */
  static getScrollInfo(node: EnhancedDOMTreeNode): Record<string, any> | null {
    if (!this.isActuallyScrollable(node) || !node.snapshot_node) {
      return null;
    }

    const scrollRects = node.snapshot_node.scrollRects;
    const clientRects = node.snapshot_node.clientRects;

    if (!scrollRects || !clientRects) {
      return null;
    }

    // Calculate scroll position and percentages
    const scrollTop = scrollRects.y;
    const scrollLeft = scrollRects.x;

    // Total scrollable dimensions
    const scrollableHeight = scrollRects.height;
    const scrollableWidth = scrollRects.width;

    // Visible (client) dimensions
    const visibleHeight = clientRects.height;
    const visibleWidth = clientRects.width;

    // Calculate content above/below/left/right of current view
    const contentAbove = Math.max(0, scrollTop);
    const contentBelow = Math.max(0, scrollableHeight - visibleHeight - scrollTop);
    const contentLeft = Math.max(0, scrollLeft);
    const contentRight = Math.max(0, scrollableWidth - visibleWidth - scrollLeft);

    // Calculate scroll percentages
    let verticalScrollPercentage = 0;
    let horizontalScrollPercentage = 0;

    if (scrollableHeight > visibleHeight) {
      const maxScrollTop = scrollableHeight - visibleHeight;
      verticalScrollPercentage = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * 100 : 0;
    }

    if (scrollableWidth > visibleWidth) {
      const maxScrollLeft = scrollableWidth - visibleWidth;
      horizontalScrollPercentage = maxScrollLeft > 0 ? (scrollLeft / maxScrollLeft) * 100 : 0;
    }

    // Calculate pages equivalent (using visible height as page unit)
    const pagesAbove = visibleHeight > 0 ? contentAbove / visibleHeight : 0;
    const pagesBelow = visibleHeight > 0 ? contentBelow / visibleHeight : 0;
    const totalPages = visibleHeight > 0 ? scrollableHeight / visibleHeight : 1;

    return {
      scroll_top: scrollTop,
      scroll_left: scrollLeft,
      scrollable_height: scrollableHeight,
      scrollable_width: scrollableWidth,
      visible_height: visibleHeight,
      visible_width: visibleWidth,
      content_above: contentAbove,
      content_below: contentBelow,
      content_left: contentLeft,
      content_right: contentRight,
      vertical_scroll_percentage: Math.round(verticalScrollPercentage * 10) / 10,
      horizontal_scroll_percentage: Math.round(horizontalScrollPercentage * 10) / 10,
      pages_above: Math.round(pagesAbove * 10) / 10,
      pages_below: Math.round(pagesBelow * 10) / 10,
      total_pages: Math.round(totalPages * 10) / 10,
      can_scroll_up: contentAbove > 0,
      can_scroll_down: contentBelow > 0,
      can_scroll_left: contentLeft > 0,
      can_scroll_right: contentRight > 0,
    };
  }

  /**
   * Get human-readable scroll information text
   */
  static getScrollInfoText(node: EnhancedDOMTreeNode): string {
    // Special case for iframes: check content document for scroll info
    if (this.getTagName(node) === 'iframe') {
      if (node.content_document) {
        // Look for HTML element in content document
        const htmlElement = this.findHtmlInContentDocument(node);
        if (htmlElement) {
          const info = this.getScrollInfo(htmlElement);
          if (info) {
            const pagesBelow = info.pages_below || 0;
            const pagesAbove = info.pages_above || 0;
            const vPct = Math.round(info.vertical_scroll_percentage || 0);

            if (pagesBelow > 0 || pagesAbove > 0) {
              return `scroll: ${pagesAbove.toFixed(1)}↑ ${pagesBelow.toFixed(1)}↓ ${vPct}%`;
            }
          }
        }
      }
      return 'scroll';
    }

    const scrollInfo = this.getScrollInfo(node);
    if (!scrollInfo) {
      return '';
    }

    const parts: string[] = [];

    // Vertical scroll info (concise format)
    if (scrollInfo.scrollable_height > scrollInfo.visible_height) {
      parts.push(`${scrollInfo.pages_above.toFixed(1)} pages above, ${scrollInfo.pages_below.toFixed(1)} pages below`);
    }

    // Horizontal scroll info (concise format)  
    if (scrollInfo.scrollable_width > scrollInfo.visible_width) {
      parts.push(`horizontal ${scrollInfo.horizontal_scroll_percentage.toFixed(0)}%`);
    }

    return parts.join(' ');
  }

  /**
   * Find HTML element in iframe content document
   */
  private static findHtmlInContentDocument(node: EnhancedDOMTreeNode): EnhancedDOMTreeNode | null {
    if (!node.content_document) {
      return null;
    }

    // Check if content document itself is HTML
    if (this.getTagName(node.content_document) === 'html') {
      return node.content_document;
    }

    // Look through children for HTML element
    if (node.content_document.children_nodes) {
      for (const child of node.content_document.children_nodes) {
        if (this.getTagName(child) === 'html') {
          return child;
        }
      }
    }

    return null;
  }
}