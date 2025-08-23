/**
 * Serializes enhanced DOM trees to string format for LLM consumption
 */

import { ClickableElementDetector } from './clickable_elements';
import { capTextLength } from '../utils';
import {
  DOMRect,
  DOMSelectorMap,
  EnhancedDOMTreeNode,
  NodeType,
  PropagatingBounds,
  SerializedDOMState,
  SimplifiedNode,
  DOMTreeNodeUtils,
  DEFAULT_INCLUDE_ATTRIBUTES,
} from '../views';

const DISABLED_ELEMENTS = new Set(['style', 'script', 'head', 'meta', 'link', 'title']);

export class DOMTreeSerializer {
  // Configuration - elements that propagate bounds to their children
  private static readonly PROPAGATING_ELEMENTS = [
    { tag: 'a', role: null }, // Any <a> tag
    { tag: 'button', role: null }, // Any <button> tag
    { tag: 'div', role: 'button' }, // <div role="button">
    { tag: 'div', role: 'combobox' }, // <div role="combobox"> - dropdowns/selects
    { tag: 'span', role: 'button' }, // <span role="button">
    { tag: 'span', role: 'combobox' }, // <span role="combobox">
    { tag: 'input', role: 'combobox' }, // <input role="combobox"> - autocomplete inputs
    { tag: 'input', role: 'combobox' }, // <input type="text"> - text inputs with suggestions
  ];

  private static readonly DEFAULT_CONTAINMENT_THRESHOLD = 0.99; // 99% containment by default

  private rootNode: EnhancedDOMTreeNode;
  private interactiveCounter = 1;
  private selectorMap: DOMSelectorMap = new Map();
  private previousCachedSelectorMap?: DOMSelectorMap;
  private timingInfo: Record<string, number> = {};
  private clickableCache: Map<number, boolean> = new Map();
  private enableBboxFiltering: boolean;
  private containmentThreshold: number;

  constructor(
    rootNode: EnhancedDOMTreeNode,
    previousCachedState?: SerializedDOMState,
    enableBboxFiltering: boolean = true,
    containmentThreshold?: number
  ) {
    this.rootNode = rootNode;
    this.previousCachedSelectorMap = previousCachedState?.selector_map;
    this.enableBboxFiltering = enableBboxFiltering;
    this.containmentThreshold = containmentThreshold || DOMTreeSerializer.DEFAULT_CONTAINMENT_THRESHOLD;
  }

  serializeAccessibleElements(): [SerializedDOMState, Record<string, number>] {
    const startTotal = Date.now();

    // Reset state
    this.interactiveCounter = 1;
    this.selectorMap = new Map();
    this.clickableCache = new Map(); // Clear cache for new serialization

    // Step 1: Create simplified tree (includes clickable element detection)
    const startStep1 = Date.now();
    const simplifiedTree = this.createSimplifiedTree(this.rootNode);
    const endStep1 = Date.now();
    this.timingInfo.create_simplified_tree = endStep1 - startStep1;

    // Step 2: Optimize tree (remove unnecessary parents)
    const startStep2 = Date.now();
    const optimizedTree = this.optimizeTree(simplifiedTree);
    const endStep2 = Date.now();
    this.timingInfo.optimize_tree = endStep2 - startStep2;

    // Step 3: Apply bounding box filtering (NEW)
    let filteredTree = optimizedTree;
    if (this.enableBboxFiltering && optimizedTree) {
      const startStep3 = Date.now();
      filteredTree = this.applyBoundingBoxFiltering(optimizedTree);
      const endStep3 = Date.now();
      this.timingInfo.bbox_filtering = endStep3 - startStep3;
    }

    // Step 4: Assign interactive indices to clickable elements
    const startStep4 = Date.now();
    this.assignInteractiveIndicesAndMarkNewNodes(filteredTree);
    const endStep4 = Date.now();
    this.timingInfo.assign_interactive_indices = endStep4 - startStep4;

    const endTotal = Date.now();
    this.timingInfo.serialize_accessible_elements_total = endTotal - startTotal;

    const serializedState: SerializedDOMState = {
      _root: filteredTree,
      selector_map: this.selectorMap,
    };

    return [serializedState, this.timingInfo];
  }

  /**
   * Cached version of clickable element detection to avoid redundant calls.
   */
  private isInteractiveCached(node: EnhancedDOMTreeNode): boolean {
    if (!this.clickableCache.has(node.node_id)) {
      const startTime = Date.now();
      const result = ClickableElementDetector.isInteractive(node);
      const endTime = Date.now();

      if (!this.timingInfo.clickable_detection_time) {
        this.timingInfo.clickable_detection_time = 0;
      }
      this.timingInfo.clickable_detection_time += endTime - startTime;

      this.clickableCache.set(node.node_id, result);
    }

    return this.clickableCache.get(node.node_id)!;
  }

  /**
   * Step 1: Create a simplified tree with enhanced element detection.
   */
  private createSimplifiedTree(node: EnhancedDOMTreeNode): SimplifiedNode | null {
    if (node.node_type === NodeType.DOCUMENT_NODE) {
      // For all children including shadow roots
      for (const child of DOMTreeNodeUtils.getChildrenAndShadowRoots(node)) {
        const simplifiedChild = this.createSimplifiedTree(child);
        if (simplifiedChild) {
          return simplifiedChild;
        }
      }
      return null;
    }

    if (node.node_type === NodeType.DOCUMENT_FRAGMENT_NODE) {
      // Super simple pass-through for shadow DOM elements
      const simplified: SimplifiedNode = {
        original_node: node,
        children: [],
        should_display: true,
        interactive_index: null,
        is_new: false,
        excluded_by_parent: false,
      };

      for (const child of DOMTreeNodeUtils.getChildrenAndShadowRoots(node)) {
        const simplifiedChild = this.createSimplifiedTree(child);
        if (simplifiedChild) {
          simplified.children.push(simplifiedChild);
        }
      }
      return simplified;
    } else if (node.node_type === NodeType.ELEMENT_NODE) {
      // Skip non-content elements
      if (DISABLED_ELEMENTS.has(DOMTreeNodeUtils.getTagName(node))) {
        return null;
      }

      if (node.node_name === 'IFRAME') {
        if (node.content_document) {
          const simplified: SimplifiedNode = {
            original_node: node,
            children: [],
            should_display: true,
            interactive_index: null,
            is_new: false,
            excluded_by_parent: false,
          };

          const contentChildren = node.content_document.children_nodes || [];
          for (const child of contentChildren) {
            const simplifiedChild = this.createSimplifiedTree(child);
            if (simplifiedChild) {
              simplified.children.push(simplifiedChild);
            }
          }
          return simplified;
        }
      }

      // Use enhanced scoring for inclusion decision
      const isInteractive = this.isInteractiveCached(node);
      const isVisible = node.snapshot_node && node.is_visible;
      const isScrollable = DOMTreeNodeUtils.isActuallyScrollable(node);

      // Include if interactive (regardless of visibility), or scrollable, or has children to process
      const shouldInclude = 
        (isInteractive && isVisible) || 
        isScrollable || 
        DOMTreeNodeUtils.getChildrenAndShadowRoots(node).length > 0;

      if (shouldInclude) {
        const simplified: SimplifiedNode = {
          original_node: node,
          children: [],
          should_display: true,
          interactive_index: null,
          is_new: false,
          excluded_by_parent: false,
        };

        // Process children
        for (const child of DOMTreeNodeUtils.getChildrenAndShadowRoots(node)) {
          const simplifiedChild = this.createSimplifiedTree(child);
          if (simplifiedChild) {
            simplified.children.push(simplifiedChild);
          }
        }

        // Return if meaningful or has meaningful children
        if ((isInteractive && isVisible) || isScrollable || simplified.children.length > 0) {
          return simplified;
        }
      }
    } else if (node.node_type === NodeType.TEXT_NODE) {
      // Include meaningful text nodes
      const isVisible = node.snapshot_node && node.is_visible;
      if (
        isVisible &&
        node.node_value &&
        node.node_value.trim() &&
        node.node_value.trim().length > 1
      ) {
        return {
          original_node: node,
          children: [],
          should_display: true,
          interactive_index: null,
          is_new: false,
          excluded_by_parent: false,
        };
      }
    }

    return null;
  }

  /**
   * Step 2: Optimize tree structure.
   */
  private optimizeTree(node: SimplifiedNode | null): SimplifiedNode | null {
    if (!node) {
      return null;
    }

    // Process children
    const optimizedChildren: SimplifiedNode[] = [];
    for (const child of node.children) {
      const optimizedChild = this.optimizeTree(child);
      if (optimizedChild) {
        optimizedChildren.push(optimizedChild);
      }
    }

    node.children = optimizedChildren;

    // Keep meaningful nodes
    const isInteractiveOpt = this.isInteractiveCached(node.original_node);
    const isVisible = node.original_node.snapshot_node && node.original_node.is_visible;

    if (
      (isInteractiveOpt && isVisible) || // Only keep interactive nodes that are visible
      DOMTreeNodeUtils.isActuallyScrollable(node.original_node) ||
      node.original_node.node_type === NodeType.TEXT_NODE ||
      node.children.length > 0
    ) {
      return node;
    }

    return null;
  }

  /**
   * Assign interactive indices to clickable elements that are also visible.
   */
  private assignInteractiveIndicesAndMarkNewNodes(node: SimplifiedNode | null): void {
    if (!node) {
      return;
    }

    // Skip assigning index to excluded nodes
    if (!node.excluded_by_parent) {
      // Assign index to clickable elements that are also visible
      const isInteractiveAssign = this.isInteractiveCached(node.original_node);
      const isVisible = node.original_node.snapshot_node && node.original_node.is_visible;

      // Only add to selector map if element is both interactive AND visible
      if (isInteractiveAssign && isVisible) {
        node.interactive_index = this.interactiveCounter;
        node.original_node.element_index = this.interactiveCounter;
        // Set in selector map (handle both Map and Record types)
        if (this.selectorMap instanceof Map) {
          this.selectorMap.set(this.interactiveCounter, node.original_node);
        } else {
          this.selectorMap[this.interactiveCounter] = node.original_node;
        }
        this.interactiveCounter++;

        // Check if node is new
        if (this.previousCachedSelectorMap) {
          // Handle both Map and Record types for previous cache
          const previousValues = this.previousCachedSelectorMap instanceof Map
            ? Array.from(this.previousCachedSelectorMap.values())
            : Object.values(this.previousCachedSelectorMap);
          const previousBackendNodeIds = new Set(
            previousValues.map((n: any) => n.backend_node_id)
          );
          if (!previousBackendNodeIds.has(node.original_node.backend_node_id)) {
            node.is_new = true;
          }
        }
      }
    }

    // Process children
    for (const child of node.children) {
      this.assignInteractiveIndicesAndMarkNewNodes(child);
    }
  }

  /**
   * Filter children contained within propagating parent bounds.
   */
  private applyBoundingBoxFiltering(node: SimplifiedNode | null): SimplifiedNode | null {
    if (!node) {
      return null;
    }

    // Start with no active bounds
    this.filterTreeRecursive(node, null, 0);

    // Log statistics
    const excludedCount = this.countExcludedNodes(node);
    if (excludedCount > 0) {
      console.debug(`BBox filtering excluded ${excludedCount} nodes`);
    }

    return node;
  }

  /**
   * Recursively filter tree with bounding box propagation.
   * Bounds propagate to ALL descendants until overridden.
   */
  private filterTreeRecursive(
    node: SimplifiedNode,
    activeBounds: PropagatingBounds | null = null,
    depth: number = 0
  ): void {
    // Check if this node should be excluded by active bounds
    if (activeBounds && this.shouldExcludeChild(node, activeBounds)) {
      node.excluded_by_parent = true;
      // Important: Still check if this node starts NEW propagation
    }

    // Check if this node starts new propagation (even if excluded!)
    let newBounds: PropagatingBounds | null = null;
    const tag = DOMTreeNodeUtils.getTagName(node.original_node);
    const role = node.original_node.attributes?.role || null;
    const attributes = { tag, role };

    // Check if this element matches any propagating element pattern
    if (this.isPropagatingElement(attributes)) {
      // This node propagates bounds to ALL its descendants
      if (node.original_node.snapshot_node && node.original_node.snapshot_node.bounds) {
        newBounds = {
          tag,
          bounds: node.original_node.snapshot_node.bounds,
          node_id: node.original_node.node_id,
          depth,
        };
      }
    }

    // Propagate to ALL children
    // Use new_bounds if this node starts propagation, otherwise continue with active_bounds
    const propagateBounds = newBounds || activeBounds;

    for (const child of node.children) {
      this.filterTreeRecursive(child, propagateBounds, depth + 1);
    }
  }

  /**
   * Determine if child should be excluded based on propagating bounds.
   */
  private shouldExcludeChild(node: SimplifiedNode, activeBounds: PropagatingBounds): boolean {
    // Never exclude text nodes - we always want to preserve text content
    if (node.original_node.node_type === NodeType.TEXT_NODE) {
      return false;
    }

    // Get child bounds
    if (!node.original_node.snapshot_node || !node.original_node.snapshot_node.bounds) {
      return false; // No bounds = can't determine containment
    }

    const childBounds = node.original_node.snapshot_node.bounds;

    // Check containment with configured threshold
    if (!this.isContained(childBounds, activeBounds.bounds, this.containmentThreshold)) {
      return false; // Not sufficiently contained
    }

    // EXCEPTION RULES - Keep these even if contained:
    const childTag = DOMTreeNodeUtils.getTagName(node.original_node);
    const childRole = node.original_node.attributes?.role || null;
    const childAttributes = { tag: childTag, role: childRole };

    // 1. Never exclude form elements (they need individual interaction)
    if (['input', 'select', 'textarea', 'label'].includes(childTag)) {
      return false;
    }

    // 2. Keep if child is also a propagating element
    // (might have stopPropagation, e.g., button in button)
    if (this.isPropagatingElement(childAttributes)) {
      return false;
    }

    // 3. Keep if has explicit onclick handler
    if (node.original_node.attributes && 'onclick' in node.original_node.attributes) {
      return false;
    }

    // 4. Keep if has aria-label suggesting it's independently interactive
    if (node.original_node.attributes) {
      const ariaLabel = node.original_node.attributes['aria-label'];
      if (ariaLabel && ariaLabel.trim()) {
        // Has meaningful aria-label, likely interactive
        return false;
      }
    }

    // 5. Keep if has role suggesting interactivity
    if (node.original_node.attributes) {
      const role = node.original_node.attributes.role;
      if (role && ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem'].includes(role)) {
        return false;
      }
    }

    // Default: exclude this child
    return true;
  }

  /**
   * Check if child is contained within parent bounds.
   */
  private isContained(child: DOMRect, parent: DOMRect, threshold: number): boolean {
    // Calculate intersection
    const xOverlap = Math.max(
      0,
      Math.min(child.x + child.width, parent.x + parent.width) - Math.max(child.x, parent.x)
    );
    const yOverlap = Math.max(
      0,
      Math.min(child.y + child.height, parent.y + parent.height) - Math.max(child.y, parent.y)
    );

    const intersectionArea = xOverlap * yOverlap;
    const childArea = child.width * child.height;

    if (childArea === 0) {
      return false; // Zero-area element
    }

    const containmentRatio = intersectionArea / childArea;
    return containmentRatio >= threshold;
  }

  /**
   * Count how many nodes were excluded (for debugging).
   */
  private countExcludedNodes(node: SimplifiedNode, count: number = 0): number {
    if (node.excluded_by_parent) {
      count++;
    }
    for (const child of node.children) {
      count = this.countExcludedNodes(child, count);
    }
    return count;
  }

  /**
   * Check if an element should propagate bounds based on attributes.
   * If the element satisfies one of the patterns, it propagates bounds to all its children.
   */
  private isPropagatingElement(attributes: { tag: string; role: string | null }): boolean {
    for (const pattern of DOMTreeSerializer.PROPAGATING_ELEMENTS) {
      // Check if the element satisfies the pattern
      const tagMatches = pattern.tag === attributes.tag;
      const roleMatches = pattern.role === null || pattern.role === attributes.role;
      
      if (tagMatches && roleMatches) {
        return true;
      }
    }
    return false;
  }

  /**
   * Serialize the optimized tree to string format.
   */
  static serializeTree(
    node: SimplifiedNode | null,
    includeAttributes: string[],
    depth: number = 0
  ): string {
    if (!node) {
      return '';
    }

    // Skip rendering excluded nodes, but process their children
    if (node.excluded_by_parent) {
      const formattedText: string[] = [];
      for (const child of node.children) {
        const childText = DOMTreeSerializer.serializeTree(child, includeAttributes, depth);
        if (childText) {
          formattedText.push(childText);
        }
      }
      return formattedText.join('\n');
    }

    const formattedText: string[] = [];
    const depthStr = '\t'.repeat(depth);
    let nextDepth = depth;

    if (node.original_node.node_type === NodeType.ELEMENT_NODE) {
      // Skip displaying nodes marked as should_display=false
      if (!node.should_display) {
        for (const child of node.children) {
          const childText = DOMTreeSerializer.serializeTree(child, includeAttributes, depth);
          if (childText) {
            formattedText.push(childText);
          }
        }
        return formattedText.join('\n');
      }

      // Add element with interactive_index if clickable, scrollable, or iframe
      const isAnyScrollable = 
        DOMTreeNodeUtils.isActuallyScrollable(node.original_node) || 
        node.original_node.is_scrollable;
      const shouldShowScroll = DOMTreeNodeUtils.shouldShowScrollInfo(node.original_node);
      
      if (
        node.interactive_index !== null ||
        isAnyScrollable ||
        DOMTreeNodeUtils.getTagName(node.original_node) === 'iframe'
      ) {
        nextDepth++;

        // Build attributes string
        const attributesHtmlStr = DOMTreeSerializer.buildAttributesString(
          node.original_node,
          includeAttributes,
          ''
        );

        // Build the line
        let line: string;
        if (shouldShowScroll && node.interactive_index === null) {
          // Scrollable container but not clickable
          line = `${depthStr}|SCROLL|<${node.original_node.node_name}`;
        } else if (node.interactive_index !== null) {
          // Clickable (and possibly scrollable)
          const newPrefix = node.is_new ? '*' : '';
          const scrollPrefix = shouldShowScroll ? '|SCROLL+' : '[';
          line = `${depthStr}${newPrefix}${scrollPrefix}${node.interactive_index}]<${node.original_node.node_name}`;
        } else if (DOMTreeNodeUtils.getTagName(node.original_node) === 'iframe') {
          // Iframe element (not interactive)
          line = `${depthStr}|IFRAME|<${node.original_node.node_name}`;
        } else {
          line = `${depthStr}<${node.original_node.node_name}`;
        }

        if (attributesHtmlStr) {
          line += ` ${attributesHtmlStr}`;
        }

        line += ' />';

        // Add scroll information only when we should show it
        if (shouldShowScroll) {
          const scrollInfoText = DOMTreeNodeUtils.getScrollInfoText(node.original_node);
          if (scrollInfoText) {
            line += ` (${scrollInfoText})`;
          }
        }

        formattedText.push(line);
      }
    } else if (node.original_node.node_type === NodeType.TEXT_NODE) {
      // Include visible text
      const isVisible = node.original_node.snapshot_node && node.original_node.is_visible;
      if (
        isVisible &&
        node.original_node.node_value &&
        node.original_node.node_value.trim() &&
        node.original_node.node_value.trim().length > 1
      ) {
        const cleanText = node.original_node.node_value.trim();
        formattedText.push(`${depthStr}${cleanText}`);
      }
    }

    // Process children
    for (const child of node.children) {
      const childText = DOMTreeSerializer.serializeTree(child, includeAttributes, nextDepth);
      if (childText) {
        formattedText.push(childText);
      }
    }

    return formattedText.join('\n');
  }

  /**
   * Build the attributes string for an element.
   */
  static buildAttributesString(
    node: EnhancedDOMTreeNode,
    includeAttributes: string[],
    text: string
  ): string {
    const attributesToInclude: Record<string, string> = {};

    // Include HTML attributes
    if (node.attributes) {
      for (const [key, value] of Object.entries(node.attributes)) {
        if (includeAttributes.includes(key) && value.trim() !== '') {
          attributesToInclude[key] = value.trim();
        }
      }
    }

    // Include accessibility properties
    if (node.ax_node && node.ax_node.properties) {
      for (const prop of node.ax_node.properties) {
        try {
          if (includeAttributes.includes(prop.name) && prop.value !== null && prop.value !== undefined) {
            // Convert boolean to lowercase string, keep others as-is
            if (typeof prop.value === 'boolean') {
              attributesToInclude[prop.name] = prop.value.toString().toLowerCase();
            } else {
              const propValueStr = prop.value.toString().trim();
              if (propValueStr) {
                attributesToInclude[prop.name] = propValueStr;
              }
            }
          }
        } catch {
          continue;
        }
      }
    }

    if (Object.keys(attributesToInclude).length === 0) {
      return '';
    }

    // Remove duplicate values
    const orderedKeys = includeAttributes.filter(key => key in attributesToInclude);

    if (orderedKeys.length > 1) {
      const keysToRemove = new Set<string>();
      const seenValues: Record<string, string> = {};

      for (const key of orderedKeys) {
        const value = attributesToInclude[key];
        if (value.length > 5) {
          if (value in seenValues) {
            keysToRemove.add(key);
          } else {
            seenValues[value] = key;
          }
        }
      }

      for (const key of keysToRemove) {
        delete attributesToInclude[key];
      }
    }

    // Remove attributes that duplicate accessibility data
    const role = node.ax_node?.role;
    if (role && node.node_name === role) {
      delete attributesToInclude.role;
    }

    const attrsToRemoveIfTextMatches = ['aria-label', 'placeholder', 'title'];
    for (const attr of attrsToRemoveIfTextMatches) {
      if (
        attributesToInclude[attr] &&
        attributesToInclude[attr].trim().toLowerCase() === text.trim().toLowerCase()
      ) {
        delete attributesToInclude[attr];
      }
    }

    if (Object.keys(attributesToInclude).length > 0) {
      return Object.entries(attributesToInclude)
        .map(([key, value]) => `${key}=${capTextLength(value, 100)}`)
        .join(' ');
    }

    return '';
  }
}

/**
 * Utility function to create SerializedDOMState with LLM representation
 */
export function createSerializedDOMStateWithLLMRepresentation(
  root: SimplifiedNode | null,
  selectorMap: DOMSelectorMap
): SerializedDOMState & { llmRepresentation: (includeAttributes?: string[]) => string } {
  const state: SerializedDOMState = {
    _root: root,
    selector_map: selectorMap,
  };

  return {
    ...state,
    llmRepresentation: (includeAttributes?: string[]) => {
      if (!root) {
        return 'Empty DOM tree (you might have to wait for the page to load)';
      }

      const attrs = includeAttributes || [...DEFAULT_INCLUDE_ATTRIBUTES];
      return DOMTreeSerializer.serializeTree(root, attrs);
    }
  };
}