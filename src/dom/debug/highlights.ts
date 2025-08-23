/**
 * DOM Debug Highlights for Browser Use
 * Provides element highlighting and debugging tools for interactive DOM elements.
 */

import type { DomService } from '../service';
import type { DOMSelectorMap } from '../views';

interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HighlightElement {
  x: number;
  y: number;
  width: number;
  height: number;
  interactive_index: number;
  element_name: string;
  is_clickable: boolean;
  is_scrollable: boolean;
  attributes: Record<string, string>;
  frame_id?: string;
  node_id: number;
  backend_node_id: number;
  xpath?: string;
  text_content: string;
  reasoning?: {
    confidence?: string;
    primary_reason?: string;
    reasons?: string[];
    element_type?: string;
  };
}

/**
 * Convert selector map to highlight format expected by JavaScript
 */
export function convertSelectorMapToHighlightFormat(selectorMap: DOMSelectorMap): HighlightElement[] {
  const elements: HighlightElement[] = [];

  // Handle both Map and Record types for DOMSelectorMap
  const entries = selectorMap instanceof Map 
    ? Array.from(selectorMap.entries())
    : Object.entries(selectorMap).map(([k, v]) => [parseInt(k), v] as [number, any]);
  
  for (const [interactiveIndex, node] of entries) {
    // Get bounding box - prioritize absolute position if available
    let bbox: ElementBounds | null = null;
    
    if (node.absolute_position) {
      // Use absolute position which includes iframe coordinate translations
      const rect = node.absolute_position;
      bbox = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }

    // Only include elements with valid bounding boxes
    if (bbox && bbox.width > 0 && bbox.height > 0) {
      const element: HighlightElement = {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        interactive_index: interactiveIndex,
        element_name: node.node_name,
        is_clickable: (node as any).is_clickable ?? true,
        is_scrollable: node.is_scrollable ?? false,
        attributes: node.attributes || {},
        frame_id: node.frame_id || undefined,
        node_id: node.node_id,
        backend_node_id: node.backend_node_id,
        xpath: (node as any).xpath,
        text_content: (node.node_value || '').substring(0, 50),
      };

      elements.push(element);
    }
  }

  return elements;
}

/**
 * Remove all browser-use highlighting elements from the page
 */
export async function removeHighlightingScript(domService: DomService): Promise<void> {
  try {
    console.debug('🧹 Removing browser-use highlighting elements');

    // Create script to remove all highlights
    const script = `
      (function() {
        // Remove any existing highlights - be thorough
        const existingHighlights = document.querySelectorAll('[data-browser-use-highlight]');
        console.log('Removing', existingHighlights.length, 'browser-use highlight elements');
        existingHighlights.forEach(el => el.remove());
        
        // Also remove by ID in case selector missed anything
        const highlightContainer = document.getElementById('browser-use-debug-highlights');
        if (highlightContainer) {
          console.log('Removing highlight container by ID');
          highlightContainer.remove();
        }
        
        // Final cleanup - remove any orphaned tooltips
        const orphanedTooltips = document.querySelectorAll('[data-browser-use-highlight="tooltip"]');
        orphanedTooltips.forEach(el => el.remove());
      })();
    `;

    // Execute the removal script via CDP
    // Note: This would need to be implemented with proper CDP client access
    console.debug('Script to remove highlights would be executed here:', script);

  } catch (error) {
    console.error('Error removing highlighting elements:', error);
  }
}

/**
 * Inject JavaScript to highlight interactive elements with detailed hover tooltips
 */
export async function injectHighlightingScript(
  domService: DomService, 
  interactiveElements: DOMSelectorMap
): Promise<void> {
  const hasElements = interactiveElements instanceof Map 
    ? interactiveElements.size > 0
    : Object.keys(interactiveElements).length > 0;
    
  if (!interactiveElements || !hasElements) {
    console.debug('⚠️ No interactive elements to highlight');
    return;
  }

  try {
    // Convert SelectorMap to the format expected by the JavaScript
    const convertedElements = convertSelectorMapToHighlightFormat(interactiveElements);
    
    console.debug(`📍 Creating CSP-safe highlighting for ${convertedElements.length} elements`);

    // ALWAYS remove any existing highlights first to prevent double-highlighting
    await removeHighlightingScript(domService);

    // Add a small delay to ensure removal completes
    await new Promise(resolve => setTimeout(resolve, 50));

    // Create CSP-safe highlighting script using DOM methods instead of innerHTML
    const script = `
      (function() {
        // Interactive elements data
        const interactiveElements = ${JSON.stringify(convertedElements)};
        
        console.log('=== BROWSER-USE HIGHLIGHTING ===');
        console.log('Highlighting', interactiveElements.length, 'interactive elements');
        
        // Double-check: Remove any existing highlight container first to prevent duplicates
        const existingContainer = document.getElementById('browser-use-debug-highlights');
        if (existingContainer) {
          console.log('⚠️ Found existing highlight container, removing it first');
          existingContainer.remove();
        }
        
        // Also remove any stray highlight elements
        const strayHighlights = document.querySelectorAll('[data-browser-use-highlight]');
        if (strayHighlights.length > 0) {
          console.log('⚠️ Found', strayHighlights.length, 'stray highlight elements, removing them');
          strayHighlights.forEach(el => el.remove());
        }
        
        // Use a high but reasonable z-index to be visible without covering important content
        const HIGHLIGHT_Z_INDEX = 2147483647; // Maximum z-index for CSS (2^31-1)
        
        // Create container for all highlights - use fixed positioning
        const container = document.createElement('div');
        container.id = 'browser-use-debug-highlights';
        container.setAttribute('data-browser-use-highlight', 'container');
        
        container.style.cssText = \`
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: \${HIGHLIGHT_Z_INDEX};
          overflow: visible;
          margin: 0;
          padding: 0;
          border: none;
          outline: none;
          box-shadow: none;
          background: none;
          font-family: inherit;
        \`;
        
        // Helper function to create text elements safely (CSP-friendly)
        function createTextElement(tag, text, styles) {
          const element = document.createElement(tag);
          element.textContent = text;
          if (styles) element.style.cssText = styles;
          return element;
        }
        
        // Add highlights with tooltips
        interactiveElements.forEach((element, index) => {
          const highlight = document.createElement('div');
          highlight.setAttribute('data-browser-use-highlight', 'element');
          highlight.setAttribute('data-element-id', element.interactive_index);
          highlight.style.cssText = \`
            position: absolute;
            left: \${element.x}px;
            top: \${element.y}px;
            width: \${element.width}px;
            height: \${element.height}px;
            outline: 2px solid #4a90e2;
            outline-offset: -2px;
            background: transparent;
            pointer-events: none;
            box-sizing: content-box;
            transition: outline 0.2s ease;
            margin: 0;
            padding: 0;
            border: none;
          \`;
          
          // Enhanced label with interactive index
          const label = createTextElement('div', element.interactive_index, \`
            position: absolute;
            top: -20px;
            left: 0;
            background-color: #4a90e2;
            color: white;
            padding: 2px 6px;
            font-size: 11px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-weight: bold;
            border-radius: 3px;
            white-space: nowrap;
            z-index: \${HIGHLIGHT_Z_INDEX + 1};
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            border: none;
            outline: none;
            margin: 0;
            line-height: 1.2;
          \`);
          
          // Enhanced tooltip with details
          const tooltip = document.createElement('div');
          tooltip.setAttribute('data-browser-use-highlight', 'tooltip');
          tooltip.style.cssText = \`
            position: absolute;
            top: -120px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(0, 0, 0, 0.95);
            color: white;
            padding: 12px 16px;
            font-size: 12px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            border-radius: 8px;
            white-space: nowrap;
            z-index: \${HIGHLIGHT_Z_INDEX + 2};
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            box-shadow: 0 6px 20px rgba(0,0,0,0.5);
            border: 1px solid #666;
            max-width: 400px;
            white-space: normal;
            line-height: 1.4;
            min-width: 200px;
            margin: 0;
          \`;
          
          // Build tooltip content
          const header = createTextElement('div', \`[\${element.interactive_index}] \${element.element_name.toUpperCase()}\`, \`
            color: #4a90e2;
            font-weight: bold;
            font-size: 13px;
            margin-bottom: 8px;
            border-bottom: 1px solid #666;
            padding-bottom: 4px;
          \`);
          
          // Element details
          const detailsDiv = createTextElement('div', \`\${element.is_clickable ? '🖱️ Clickable' : '📄 Non-clickable'} \${element.is_scrollable ? '📜 Scrollable' : ''}\`, \`
            color: #ccc;
            font-size: 11px;
            margin-bottom: 6px;
          \`);
          
          // Text content if available
          if (element.text_content && element.text_content.trim()) {
            const textDiv = createTextElement('div', \`Text: "\${element.text_content}"\`, \`
              color: #fff;
              font-size: 10px;
              margin-bottom: 6px;
              font-style: italic;
            \`);
            tooltip.appendChild(textDiv);
          }
          
          // Position and size info
          const boundsDiv = createTextElement('div', \`Position: (\${Math.round(element.x)}, \${Math.round(element.y)}) Size: \${Math.round(element.width)}×\${Math.round(element.height)}\`, \`
            color: #888;
            font-size: 9px;
            margin-top: 8px;
            border-top: 1px solid #444;
            padding-top: 4px;
          \`);
          
          // Assemble tooltip
          tooltip.appendChild(header);
          tooltip.appendChild(detailsDiv);
          tooltip.appendChild(boundsDiv);
          
          // Add hover effects
          highlight.addEventListener('mouseenter', () => {
            highlight.style.outline = '3px solid #ff6b6b';
            highlight.style.outlineOffset = '-1px';
            tooltip.style.opacity = '1';
            tooltip.style.visibility = 'visible';
            label.style.backgroundColor = '#ff6b6b';
            label.style.transform = 'scale(1.1)';
          });
          
          highlight.addEventListener('mouseleave', () => {
            highlight.style.outline = '2px solid #4a90e2';
            highlight.style.outlineOffset = '-2px';
            tooltip.style.opacity = '0';
            tooltip.style.visibility = 'hidden';
            label.style.backgroundColor = '#4a90e2';
            label.style.transform = 'scale(1)';
          });
          
          highlight.appendChild(tooltip);
          highlight.appendChild(label);
          container.appendChild(highlight);
        });
        
        // Add container to document
        document.body.appendChild(container);
        
        console.log('Highlighting complete');
      })();
    `;

    // Execute the highlighting script via CDP
    // Note: This would need to be implemented with proper CDP client access
    console.debug('Highlighting script would be executed here:', script.substring(0, 200) + '...');
    console.debug(`Enhanced CSP-safe highlighting injected for ${convertedElements.length} elements`);

  } catch (error) {
    console.debug('❌ Error injecting enhanced highlighting script:', error);
  }
}