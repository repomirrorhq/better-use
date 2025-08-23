/**
 * Enhanced snapshot processing for browser-use DOM tree extraction.
 * 
 * This module provides stateless functions for parsing Chrome DevTools Protocol (CDP) DOMSnapshot data
 * to extract visibility, clickability, cursor styles, and other layout information.
 */

import { DOMRect, EnhancedSnapshotNode, createDOMRect, createEnhancedSnapshotNode } from './views';

// Only the ESSENTIAL computed styles for interactivity and visibility detection
export const REQUIRED_COMPUTED_STYLES = [
  // Essential for visibility
  'display',
  'visibility', 
  'opacity',
  'position',
  'z-index',
  'pointer-events',
  'cursor',
  'overflow',
  'overflow-x',
  'overflow-y',
  'width',
  'height',
  'top',
  'left',
  'right',
  'bottom',
  'transform',
  'clip',
  'clip-path',
  'user-select',
  'background-color',
  'color',
  'border',
  'margin',
  'padding',
] as const;

// Types for CDP data structures (these would ideally come from a CDP types package)
interface RareBooleanData {
  index: number[];
}

interface NodeTreeSnapshot {
  backendNodeId?: number[];
  isClickable?: RareBooleanData;
}

interface LayoutTreeSnapshot {
  nodeIndex?: number[];
  bounds?: number[][];
  styles?: number[][];
  paintOrders?: number[];
  clientRects?: number[][];
  scrollRects?: number[][];
  stackingContexts?: {
    index: number[];
  };
}

interface SnapshotDocument {
  nodes: NodeTreeSnapshot;
  layout: LayoutTreeSnapshot;
}

interface CaptureSnapshotReturns {
  documents: SnapshotDocument[];
  strings: string[];
}

/**
 * Parse rare boolean data from snapshot - returns True if index is in the rare data.
 */
function parseRareBooleanData(rareData: RareBooleanData, index: number): boolean | null {
  return rareData.index.includes(index);
}

/**
 * Parse computed styles from layout tree using string indices.
 */
function parseComputedStyles(strings: string[], styleIndices: number[]): Record<string, string> {
  const styles: Record<string, string> = {};
  
  for (let i = 0; i < styleIndices.length; i++) {
    const styleIndex = styleIndices[i];
    if (i < REQUIRED_COMPUTED_STYLES.length && styleIndex >= 0 && styleIndex < strings.length) {
      styles[REQUIRED_COMPUTED_STYLES[i]] = strings[styleIndex];
    }
  }
  
  return styles;
}

/**
 * Build a lookup table of backend node ID to enhanced snapshot data with everything calculated upfront.
 */
export function buildSnapshotLookup(
  snapshot: CaptureSnapshotReturns,
  devicePixelRatio: number = 1.0
): Map<number, EnhancedSnapshotNode> {
  const snapshotLookup = new Map<number, EnhancedSnapshotNode>();

  if (!snapshot.documents) {
    return snapshotLookup;
  }

  const strings = snapshot.strings;

  for (const document of snapshot.documents) {
    const nodes: NodeTreeSnapshot = document.nodes;
    const layout: LayoutTreeSnapshot = document.layout;

    // Build backend node id to snapshot index lookup
    const backendNodeToSnapshotIndex = new Map<number, number>();
    if (nodes.backendNodeId) {
      for (let i = 0; i < nodes.backendNodeId.length; i++) {
        const backendNodeId = nodes.backendNodeId[i];
        backendNodeToSnapshotIndex.set(backendNodeId, i);
      }
    }

    // Build snapshot lookup for each backend node id
    for (const [backendNodeId, snapshotIndex] of backendNodeToSnapshotIndex) {
      let isClickable: boolean | null = null;
      if (nodes.isClickable) {
        isClickable = parseRareBooleanData(nodes.isClickable, snapshotIndex);
      }

      // Find corresponding layout node
      let cursorStyle: string | null = null;
      let boundingBox: DOMRect | null = null;
      let computedStyles: Record<string, string> = {};
      let paintOrder: number | null = null;
      let clientRects: DOMRect | null = null;
      let scrollRects: DOMRect | null = null;
      let stackingContexts: number | null = null;

      // Look for layout tree node that corresponds to this snapshot node
      const nodeIndices = layout.nodeIndex || [];
      const bounds = layout.bounds || [];
      
      for (let layoutIdx = 0; layoutIdx < nodeIndices.length; layoutIdx++) {
        const nodeIndex = nodeIndices[layoutIdx];
        
        if (nodeIndex === snapshotIndex && layoutIdx < bounds.length) {
          // Parse bounding box
          const boundsArray = bounds[layoutIdx];
          if (boundsArray && boundsArray.length >= 4) {
            // IMPORTANT: CDP coordinates are in device pixels, convert to CSS pixels
            // by dividing by the device pixel ratio
            const [rawX, rawY, rawWidth, rawHeight] = boundsArray;

            // Apply device pixel ratio scaling to convert device pixels to CSS pixels
            boundingBox = createDOMRect(
              rawX / devicePixelRatio,
              rawY / devicePixelRatio,
              rawWidth / devicePixelRatio,
              rawHeight / devicePixelRatio
            );
          }

          // Parse computed styles for this layout node
          const styles = layout.styles || [];
          if (layoutIdx < styles.length) {
            const styleIndices = styles[layoutIdx];
            computedStyles = parseComputedStyles(strings, styleIndices);
            cursorStyle = computedStyles['cursor'] || null;
          }

          // Extract paint order if available
          const paintOrders = layout.paintOrders || [];
          if (layoutIdx < paintOrders.length) {
            paintOrder = paintOrders[layoutIdx];
          }

          // Extract client rects if available
          const clientRectsData = layout.clientRects || [];
          if (layoutIdx < clientRectsData.length) {
            const clientRectData = clientRectsData[layoutIdx];
            if (clientRectData && clientRectData.length >= 4) {
              clientRects = createDOMRect(
                clientRectData[0],
                clientRectData[1], 
                clientRectData[2],
                clientRectData[3]
              );
            }
          }

          // Extract scroll rects if available
          const scrollRectsData = layout.scrollRects || [];
          if (layoutIdx < scrollRectsData.length) {
            const scrollRectData = scrollRectsData[layoutIdx];
            if (scrollRectData && scrollRectData.length >= 4) {
              scrollRects = createDOMRect(
                scrollRectData[0],
                scrollRectData[1],
                scrollRectData[2], 
                scrollRectData[3]
              );
            }
          }

          // Extract stacking contexts if available
          const stackingContextsData = layout.stackingContexts;
          if (stackingContextsData && layoutIdx < stackingContextsData.index.length) {
            stackingContexts = stackingContextsData.index[layoutIdx];
          }

          break;
        }
      }

      snapshotLookup.set(backendNodeId, createEnhancedSnapshotNode({
        is_clickable: isClickable,
        cursor_style: cursorStyle,
        bounds: boundingBox,
        clientRects: clientRects,
        scrollRects: scrollRects,
        computed_styles: Object.keys(computedStyles).length > 0 ? computedStyles : null,
        paint_order: paintOrder,
        stacking_contexts: stackingContexts,
      }));
    }
  }

  return snapshotLookup;
}