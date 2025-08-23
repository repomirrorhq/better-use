/**
 * DOM Service for getting the DOM tree and other DOM-related information.
 * 
 * This service provides comprehensive DOM tree extraction and serialization capabilities
 * for browser automation, including accessibility information and visual layout data.
 */

import { BrowserSession } from '../browser/session';
import { 
  EnhancedDOMTreeNode, 
  EnhancedAXNode, 
  EnhancedSnapshotNode,
  CurrentPageTargets, 
  TargetAllTrees,
  NodeType,
  DOMRect,
  SerializedDOMState,
  createDOMRect,
  createEnhancedAXNode,
  DOMTreeNodeUtils
} from './views';
import { buildSnapshotLookup, REQUIRED_COMPUTED_STYLES } from './enhanced_snapshot';
import { v7 as uuidv7 } from 'uuid';

// CDP types (these would ideally come from a CDP types package)
interface AXProperty {
  name: string;
  value?: {
    value?: any;
  };
}

interface AXNode {
  nodeId: string;
  ignored: boolean;
  backendDOMNodeId?: number;
  role?: {
    value?: string;
  };
  name?: {
    value?: string;
  };
  description?: {
    value?: string;
  };
  properties?: AXProperty[];
}

interface GetFullAXTreeReturns {
  nodes: AXNode[];
}

interface DOMNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  nodeValue: string;
  attributes?: string[];
  frameId?: string;
  parentId?: number;
  isScrollable?: boolean;
  shadowRootType?: string;
  contentDocument?: DOMNode;
  shadowRoots?: DOMNode[];
  children?: DOMNode[];
}

interface GetDocumentReturns {
  root: DOMNode;
}

interface CaptureSnapshotReturns {
  documents: any[];
  strings: string[];
}

interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
  title: string;
}

interface GetTargetsReturns {
  targetInfos: TargetInfo[];
}

interface GetLayoutMetricsReturns {
  visualViewport?: {
    clientWidth?: number;
    clientHeight?: number;
  };
  cssVisualViewport?: {
    clientWidth?: number;
    clientHeight?: number;
  };
  cssLayoutViewport?: {
    clientWidth?: number;
    clientHeight?: number;
  };
}

interface GetFrameTreeReturns {
  frameTree: {
    frame: {
      id: string;
    };
    childFrames?: any[];
  };
}

interface EvaluateReturns {
  result?: {
    value?: any;
  };
}

interface CDPSession {
  send: (method: string, params?: any) => Promise<any>;
}

/**
 * Service for getting the DOM tree and other DOM-related information.
 * 
 * Either browser or page must be provided.
 * 
 * TODO: currently we start a new websocket connection PER STEP, we should definitely keep this persistent
 */
export class DomService {
  private browserSession: BrowserSession;
  private logger: any; // Logger interface would be defined elsewhere
  private crossOriginIframes: boolean;

  constructor(
    browserSession: BrowserSession,
    logger?: any,
    crossOriginIframes: boolean = false
  ) {
    this.browserSession = browserSession;
    this.logger = logger || browserSession.logger;
    this.crossOriginIframes = crossOriginIframes;
  }

  /**
   * Get the target info for a specific page.
   */
  private async getTargetsForPage(targetId?: string): Promise<CurrentPageTargets> {
    // This would need to be implemented using the actual CDP client
    // For now, returning a mock structure
    throw new Error('getTargetsForPage not implemented - needs CDP client integration');
  }

  /**
   * Build enhanced accessibility node from CDP AX node data
   */
  private buildEnhancedAXNode(axNode: AXNode): EnhancedAXNode {
    let properties = null;
    
    if (axNode.properties) {
      properties = [];
      for (const property of axNode.properties) {
        try {
          properties.push({
            name: property.name,
            value: property.value?.value || null,
          });
        } catch (error) {
          // Skip invalid properties
        }
      }
    }

    return createEnhancedAXNode(axNode.nodeId, axNode.ignored, {
      role: axNode.role?.value || null,
      name: axNode.name?.value || null,
      description: axNode.description?.value || null,
      properties,
    });
  }

  /**
   * Get viewport dimensions, device pixel ratio, and scroll position using CDP.
   */
  private async getViewportRatio(targetId: string): Promise<number> {
    try {
      // This would need CDP client integration
      // For now returning default ratio
      return 1.0;
    } catch (error) {
      this.logger?.debug(`Viewport size detection failed: ${error}`);
      return 1.0;
    }
  }

  /**
   * Check if the element is visible according to all its parent HTML frames.
   */
  static isElementVisibleAccordingToAllParents(
    node: EnhancedDOMTreeNode,
    htmlFrames: EnhancedDOMTreeNode[]
  ): boolean {
    if (!node.snapshot_node) {
      return false;
    }

    const computedStyles = node.snapshot_node.computed_styles || {};
    
    const display = (computedStyles.display || '').toLowerCase();
    const visibility = (computedStyles.visibility || '').toLowerCase();
    const opacity = computedStyles.opacity || '1';

    if (display === 'none' || visibility === 'hidden') {
      return false;
    }

    try {
      if (parseFloat(opacity) <= 0) {
        return false;
      }
    } catch {
      // Continue if opacity parsing fails
    }

    // Start with the element's local bounds (in its own frame's coordinate system)
    let currentBounds = node.snapshot_node.bounds;

    if (!currentBounds) {
      return false; // If there are no bounds, the element is not visible
    }

    // Create a copy of bounds to avoid modifying the original
    currentBounds = createDOMRect(
      currentBounds.x,
      currentBounds.y,
      currentBounds.width,
      currentBounds.height
    );

    // Reverse iterate through the html frames
    for (let i = htmlFrames.length - 1; i >= 0; i--) {
      const frame = htmlFrames[i];
      
      if (
        frame.node_type === NodeType.ELEMENT_NODE &&
        DOMTreeNodeUtils.getTagName(frame) === 'iframe' &&
        frame.snapshot_node &&
        frame.snapshot_node.bounds
      ) {
        const iframeBounds = frame.snapshot_node.bounds;
        
        // Negate the values added in constructEnhancedNode
        currentBounds.x += iframeBounds.x;
        currentBounds.y += iframeBounds.y;
      }

      if (
        frame.node_type === NodeType.ELEMENT_NODE &&
        frame.node_name === 'HTML' &&
        frame.snapshot_node &&
        frame.snapshot_node.scrollRects &&
        frame.snapshot_node.clientRects
      ) {
        // For iframe content, we need to check visibility within the iframe's viewport
        const viewportLeft = 0;
        const viewportTop = 0;
        const viewportRight = frame.snapshot_node.clientRects.width;
        const viewportBottom = frame.snapshot_node.clientRects.height;

        // Adjust element bounds by the scroll offset to get position relative to viewport
        const adjustedX = currentBounds.x - frame.snapshot_node.scrollRects.x;
        const adjustedY = currentBounds.y - frame.snapshot_node.scrollRects.y;

        const frameIntersects = (
          adjustedX < viewportRight &&
          adjustedX + currentBounds.width > viewportLeft &&
          adjustedY < viewportBottom &&
          adjustedY + currentBounds.height > viewportTop
        );

        if (!frameIntersects) {
          return false;
        }

        // Keep the original coordinate adjustment to maintain consistency
        currentBounds.x -= frame.snapshot_node.scrollRects.x;
        currentBounds.y -= frame.snapshot_node.scrollRects.y;
      }
    }

    // If we reach here, element is visible in main viewport and all containing iframes
    return true;
  }

  /**
   * Recursively collect all frames and merge their accessibility trees into a single array.
   */
  private async getAXTreeForAllFrames(targetId: string): Promise<GetFullAXTreeReturns> {
    // This would need CDP client integration
    // For now returning empty tree
    return { nodes: [] };
  }

  /**
   * Get DOM tree, accessibility tree, and snapshot data for a target.
   */
  private async getAllTrees(targetId: string): Promise<TargetAllTrees> {
    // This would need full CDP client integration
    // For now returning mock data structure
    const mockTiming = { cdp_calls_total: 0 };
    
    return {
      snapshot: { documents: [], strings: [] },
      dom_tree: { root: {} as DOMNode },
      ax_tree: { nodes: [] },
      device_pixel_ratio: 1.0,
      cdp_timing: mockTiming,
    };
  }

  /**
   * Recursively construct enhanced DOM tree nodes.
   */
  private async constructEnhancedNode(
    node: DOMNode,
    htmlFrames: EnhancedDOMTreeNode[] | null,
    totalFrameOffset: DOMRect | null,
    axTreeLookup: Map<number, AXNode>,
    snapshotLookup: Map<number, EnhancedSnapshotNode>,
    enhancedDOMTreeNodeLookup: Map<number, EnhancedDOMTreeNode>,
    targetId: string
  ): Promise<EnhancedDOMTreeNode> {
    // Initialize lists if not provided
    if (!htmlFrames) {
      htmlFrames = [];
    }

    // Create copy of frame offset to avoid pointer references
    if (!totalFrameOffset) {
      totalFrameOffset = createDOMRect(0, 0, 0, 0);
    } else {
      totalFrameOffset = createDOMRect(
        totalFrameOffset.x,
        totalFrameOffset.y,
        totalFrameOffset.width,
        totalFrameOffset.height
      );
    }

    // Check memoization
    if (enhancedDOMTreeNodeLookup.has(node.nodeId)) {
      return enhancedDOMTreeNodeLookup.get(node.nodeId)!;
    }

    // Get AX node data
    const axNode = axTreeLookup.get(node.backendNodeId);
    const enhancedAXNode = axNode ? this.buildEnhancedAXNode(axNode) : null;

    // Process attributes
    let attributes: Record<string, string> = {};
    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i += 2) {
        attributes[node.attributes[i]] = node.attributes[i + 1] || '';
      }
    }

    // Get shadow root type
    let shadowRootType: string | null = null;
    if (node.shadowRootType) {
      shadowRootType = node.shadowRootType;
    }

    // Get snapshot data and calculate absolute position
    const snapshotData = snapshotLookup.get(node.backendNodeId) || null;
    let absolutePosition: DOMRect | null = null;
    
    if (snapshotData && snapshotData.bounds) {
      absolutePosition = createDOMRect(
        snapshotData.bounds.x + totalFrameOffset.x,
        snapshotData.bounds.y + totalFrameOffset.y,
        snapshotData.bounds.width,
        snapshotData.bounds.height
      );
    }

    // Create the enhanced DOM tree node
    const domTreeNode: EnhancedDOMTreeNode = {
      node_id: node.nodeId,
      backend_node_id: node.backendNodeId,
      node_type: node.nodeType as NodeType,
      node_name: node.nodeName,
      node_value: node.nodeValue,
      attributes,
      is_scrollable: node.isScrollable || null,
      frame_id: node.frameId || null,
      session_id: null, // Would be set from browser session
      target_id: targetId,
      content_document: null,
      shadow_root_type: shadowRootType,
      shadow_roots: null,
      parent_node: null,
      children_nodes: null,
      ax_node: enhancedAXNode,
      snapshot_node: snapshotData,
      is_visible: null, // Will be set later
      absolute_position: absolutePosition,
      element_index: null,
      uuid: uuidv7(),
    };

    // Memoize the node
    enhancedDOMTreeNodeLookup.set(node.nodeId, domTreeNode);

    // Set parent reference
    if (node.parentId) {
      const parentNode = enhancedDOMTreeNodeLookup.get(node.parentId);
      if (parentNode) {
        domTreeNode.parent_node = parentNode;
      }
    }

    // Check if this is an HTML frame node and add it to the list
    const updatedHtmlFrames = [...htmlFrames];
    if (
      node.nodeType === NodeType.ELEMENT_NODE &&
      node.nodeName === 'HTML' &&
      node.frameId
    ) {
      updatedHtmlFrames.push(domTreeNode);

      // Adjust the total frame offset by scroll
      if (snapshotData && snapshotData.scrollRects) {
        totalFrameOffset.x -= snapshotData.scrollRects.x;
        totalFrameOffset.y -= snapshotData.scrollRects.y;
        
        this.logger?.debug(
          `HTML frame scroll - scrollY=${snapshotData.scrollRects.y}, scrollX=${snapshotData.scrollRects.x}, frameId=${node.frameId}, nodeId=${node.nodeId}`
        );
      }
    }

    // Calculate new iframe offset for content documents
    if (
      DOMTreeNodeUtils.getTagName(domTreeNode) === 'iframe' &&
      snapshotData &&
      snapshotData.bounds
    ) {
      updatedHtmlFrames.push(domTreeNode);
      totalFrameOffset.x += snapshotData.bounds.x;
      totalFrameOffset.y += snapshotData.bounds.y;
    }

    // Process content document
    if (node.contentDocument) {
      domTreeNode.content_document = await this.constructEnhancedNode(
        node.contentDocument,
        updatedHtmlFrames,
        totalFrameOffset,
        axTreeLookup,
        snapshotLookup,
        enhancedDOMTreeNodeLookup,
        targetId
      );
      domTreeNode.content_document.parent_node = domTreeNode;
    }

    // Process shadow roots
    if (node.shadowRoots) {
      domTreeNode.shadow_roots = [];
      for (const shadowRoot of node.shadowRoots) {
        const shadowRootNode = await this.constructEnhancedNode(
          shadowRoot,
          updatedHtmlFrames,
          totalFrameOffset,
          axTreeLookup,
          snapshotLookup,
          enhancedDOMTreeNodeLookup,
          targetId
        );
        shadowRootNode.parent_node = domTreeNode;
        domTreeNode.shadow_roots.push(shadowRootNode);
      }
    }

    // Process children
    if (node.children) {
      domTreeNode.children_nodes = [];
      for (const child of node.children) {
        const childNode = await this.constructEnhancedNode(
          child,
          updatedHtmlFrames,
          totalFrameOffset,
          axTreeLookup,
          snapshotLookup,
          enhancedDOMTreeNodeLookup,
          targetId
        );
        domTreeNode.children_nodes.push(childNode);
      }
    }

    // Set visibility using the collected HTML frames
    domTreeNode.is_visible = DomService.isElementVisibleAccordingToAllParents(
      domTreeNode,
      updatedHtmlFrames
    );

    // Handle cross-origin iframe recursion
    if (
      this.crossOriginIframes &&
      DOMTreeNodeUtils.getTagName(domTreeNode) === 'iframe' &&
      !node.contentDocument
    ) {
      // Cross-origin iframe handling would go here
      // This would need browser session integration to get iframe targets
    }

    return domTreeNode;
  }

  /**
   * Get the DOM tree for a specific target.
   */
  async getDOMTree(
    targetId: string,
    initialHtmlFrames?: EnhancedDOMTreeNode[],
    initialTotalFrameOffset?: DOMRect
  ): Promise<EnhancedDOMTreeNode> {
    const trees = await this.getAllTrees(targetId);

    const domTree = trees.dom_tree;
    const axTree = trees.ax_tree;
    const snapshot = trees.snapshot;
    const devicePixelRatio = trees.device_pixel_ratio;

    // Build lookup tables
    const axTreeLookup = new Map<number, AXNode>();
    for (const axNode of axTree.nodes) {
      if (axNode.backendDOMNodeId) {
        axTreeLookup.set(axNode.backendDOMNodeId, axNode);
      }
    }

    const enhancedDOMTreeNodeLookup = new Map<number, EnhancedDOMTreeNode>();
    const snapshotLookup = buildSnapshotLookup(snapshot, devicePixelRatio);

    const enhancedDOMTreeNode = await this.constructEnhancedNode(
      domTree.root,
      initialHtmlFrames || null,
      initialTotalFrameOffset || null,
      axTreeLookup,
      snapshotLookup,
      enhancedDOMTreeNodeLookup,
      targetId
    );

    return enhancedDOMTreeNode;
  }

  /**
   * Get the serialized DOM tree representation for LLM consumption.
   * 
   * Returns tuple of (serialized_dom_state, enhanced_dom_tree_root, timing_info)
   */
  async getSerializedDOMTree(
    previousCachedState?: SerializedDOMState
  ): Promise<[SerializedDOMState, EnhancedDOMTreeNode, Record<string, number>]> {
    // This would need browser session integration to get current target
    const currentTargetId = this.browserSession.getCurrentTargetId();
    if (!currentTargetId) {
      throw new Error('No current target ID set in browser session');
    }

    const enhancedDOMTree = await this.getDOMTree(currentTargetId);

    const start = Date.now();
    
    // TODO: Implement DOM tree serializer
    // const serializedDOMState = DOMTreeSerializer.serialize(enhancedDOMTree, previousCachedState);
    const serializedDOMState: SerializedDOMState = {
      _root: null,
      selector_map: new Map(),
    };

    const end = Date.now();
    const serializeTotalTiming = { serialize_dom_tree_total: end - start };

    // Combine all timing info
    const allTiming = { ...serializeTotalTiming };

    return [serializedDOMState, enhancedDOMTree, allTiming];
  }
}