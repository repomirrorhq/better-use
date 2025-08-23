/**
 * Clickable element detection logic for DOM serialization
 */

import { EnhancedDOMTreeNode, NodeType, DOMTreeNodeUtils } from '../views';

export class ClickableElementDetector {
  /**
   * Check if this node is clickable/interactive using enhanced scoring.
   */
  static isInteractive(node: EnhancedDOMTreeNode): boolean {
    // Skip non-element nodes
    if (node.node_type !== NodeType.ELEMENT_NODE) {
      return false;
    }

    const tagName = DOMTreeNodeUtils.getTagName(node);

    // Remove html and body nodes
    if (['html', 'body'].includes(tagName)) {
      return false;
    }

    // IFRAME elements should be interactive if they're large enough to potentially need scrolling
    // Small iframes (< 100px width or height) are unlikely to have scrollable content
    if (tagName === 'iframe') {
      if (node.snapshot_node && node.snapshot_node.bounds) {
        const width = node.snapshot_node.bounds.width;
        const height = node.snapshot_node.bounds.height;
        // Only include iframes larger than 100x100px
        if (width > 100 && height > 100) {
          return true;
        }
      }
    }

    // RELAXED SIZE CHECK: Allow all elements including size 0 (they might be interactive overlays, etc.)
    // Note: Size 0 elements can still be interactive (e.g., invisible clickable overlays)
    // Visibility is determined separately by CSS styles, not just bounding box size

    // SEARCH ELEMENT DETECTION: Check for search-related classes and attributes
    if (node.attributes) {
      const searchIndicators = new Set([
        'search',
        'magnify',
        'glass',
        'lookup',
        'find',
        'query',
        'search-icon',
        'search-btn',
        'search-button',
        'searchbox',
      ]);

      // Check class names for search indicators
      const classList = (node.attributes.class || '').toLowerCase().split();
      const classString = classList.join(' ');
      if (Array.from(searchIndicators).some(indicator => classString.includes(indicator))) {
        return true;
      }

      // Check id for search indicators
      const elementId = (node.attributes.id || '').toLowerCase();
      if (Array.from(searchIndicators).some(indicator => elementId.includes(indicator))) {
        return true;
      }

      // Check data attributes for search functionality
      for (const [attrName, attrValue] of Object.entries(node.attributes)) {
        if (attrName.startsWith('data-') && 
            Array.from(searchIndicators).some(indicator => 
              attrValue.toLowerCase().includes(indicator))) {
          return true;
        }
      }
    }

    // Enhanced accessibility property checks - direct clear indicators only
    if (node.ax_node && node.ax_node.properties) {
      for (const prop of node.ax_node.properties) {
        try {
          // aria disabled
          if (prop.name === 'disabled' && prop.value) {
            return false;
          }

          // aria hidden
          if (prop.name === 'hidden' && prop.value) {
            return false;
          }

          // Direct interactiveness indicators
          if (['focusable', 'editable', 'settable'].includes(prop.name) && prop.value) {
            return true;
          }

          // Interactive state properties (presence indicates interactive widget)
          if (['checked', 'expanded', 'pressed', 'selected'].includes(prop.name)) {
            // These properties only exist on interactive elements
            return true;
          }

          // Form-related interactiveness
          if (['required', 'autocomplete'].includes(prop.name) && prop.value) {
            return true;
          }

          // Elements with keyboard shortcuts are interactive
          if (prop.name === 'keyshortcuts' && prop.value) {
            return true;
          }
        } catch (error) {
          // Skip properties we can't process
          continue;
        }
      }
    }

    // ENHANCED TAG CHECK: Include truly interactive elements
    const interactiveTags = new Set([
      'button',
      'input',
      'select',
      'textarea',
      'a',
      'label',
      'details',
      'summary',
      'option',
      'optgroup',
    ]);
    
    if (interactiveTags.has(tagName)) {
      return true;
    }

    // Tertiary check: elements with interactive attributes
    if (node.attributes) {
      // Check for event handlers or interactive attributes
      const interactiveAttributes = new Set([
        'onclick',
        'onmousedown',
        'onmouseup',
        'onkeydown',
        'onkeyup',
        'tabindex'
      ]);
      
      if (Object.keys(node.attributes).some(attr => interactiveAttributes.has(attr))) {
        return true;
      }

      // Check for interactive ARIA roles
      if (node.attributes.role) {
        const interactiveRoles = new Set([
          'button',
          'link',
          'menuitem',
          'option',
          'radio',
          'checkbox',
          'tab',
          'textbox',
          'combobox',
          'slider',
          'spinbutton',
          'search',
          'searchbox',
        ]);
        
        if (interactiveRoles.has(node.attributes.role)) {
          return true;
        }
      }
    }

    // Quaternary check: accessibility tree roles
    if (node.ax_node && node.ax_node.role) {
      const interactiveAXRoles = new Set([
        'button',
        'link',
        'menuitem',
        'option',
        'radio',
        'checkbox',
        'tab',
        'textbox',
        'combobox',
        'slider',
        'spinbutton',
        'listbox',
        'search',
        'searchbox',
      ]);
      
      if (interactiveAXRoles.has(node.ax_node.role)) {
        return true;
      }
    }

    // ICON AND SMALL ELEMENT CHECK: Elements that might be icons
    if (
      node.snapshot_node &&
      node.snapshot_node.bounds &&
      node.snapshot_node.bounds.width >= 10 &&
      node.snapshot_node.bounds.width <= 50 && // Icon-sized elements
      node.snapshot_node.bounds.height >= 10 &&
      node.snapshot_node.bounds.height <= 50
    ) {
      // Check if this small element has interactive properties
      if (node.attributes) {
        // Small elements with these attributes are likely interactive icons
        const iconAttributes = new Set(['class', 'role', 'onclick', 'data-action', 'aria-label']);
        if (Object.keys(node.attributes).some(attr => iconAttributes.has(attr))) {
          return true;
        }
      }
    }

    // Final fallback: cursor style indicates interactivity (for cases Chrome missed)
    if (
      node.snapshot_node &&
      node.snapshot_node.cursor_style &&
      node.snapshot_node.cursor_style === 'pointer'
    ) {
      return true;
    }

    return false;
  }
}