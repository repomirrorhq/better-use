/**
 * Test for DOM debug tools
 */

import { convertSelectorMapToHighlightFormat } from '../src/dom/debug';

// Mock types for testing
interface MockNode {
  absolute_position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  node_name: string;
  is_clickable?: boolean;
  is_scrollable?: boolean;
  attributes?: Record<string, string>;
  frame_id?: string;
  node_id: number;
  backend_node_id: number;
  xpath?: string;
  node_value?: string;
}

describe('DOM Debug Tools', () => {
  describe('convertSelectorMapToHighlightFormat', () => {
    it('should convert selector map with valid elements', () => {
      const mockNode: MockNode = {
        absolute_position: { x: 100, y: 200, width: 150, height: 50 },
        node_name: 'BUTTON',
        is_clickable: true,
        is_scrollable: false,
        attributes: { id: 'test-button', class: 'btn' },
        node_id: 123,
        backend_node_id: 456,
        xpath: '//button[@id="test-button"]',
        node_value: 'Click me',
      };

      const selectorMap = new Map() as any;
      selectorMap.set(1, mockNode);

      const result = convertSelectorMapToHighlightFormat(selectorMap);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        x: 100,
        y: 200,
        width: 150,
        height: 50,
        interactive_index: 1,
        element_name: 'BUTTON',
        is_clickable: true,
        is_scrollable: false,
        attributes: { id: 'test-button', class: 'btn' },
        node_id: 123,
        backend_node_id: 456,
        xpath: '//button[@id="test-button"]',
        text_content: 'Click me',
      });
    });

    it('should filter out elements with invalid bounding boxes', () => {
      const validNode: MockNode = {
        absolute_position: { x: 100, y: 200, width: 150, height: 50 },
        node_name: 'BUTTON',
        node_id: 123,
        backend_node_id: 456,
        node_value: 'Valid button',
      };

      const invalidNode1: MockNode = {
        absolute_position: { x: 100, y: 200, width: 0, height: 50 },
        node_name: 'INPUT',
        node_id: 124,
        backend_node_id: 457,
        node_value: 'Invalid input',
      };

      const invalidNode2: MockNode = {
        // No absolute_position
        node_name: 'DIV',
        node_id: 125,
        backend_node_id: 458,
        node_value: 'No position',
      };

      const selectorMap = new Map() as any;
      selectorMap.set(1, validNode);
      selectorMap.set(2, invalidNode1);
      selectorMap.set(3, invalidNode2);

      const result = convertSelectorMapToHighlightFormat(selectorMap);

      expect(result).toHaveLength(1);
      expect(result[0].interactive_index).toBe(1);
      expect(result[0].element_name).toBe('BUTTON');
    });

    it('should handle empty selector map', () => {
      const selectorMap = new Map() as any;
      const result = convertSelectorMapToHighlightFormat(selectorMap);
      expect(result).toHaveLength(0);
    });

    it('should truncate long text content', () => {
      const longText = 'This is a very long text content that should be truncated to 50 characters maximum for display purposes';
      
      const mockNode: MockNode = {
        absolute_position: { x: 100, y: 200, width: 150, height: 50 },
        node_name: 'DIV',
        node_id: 123,
        backend_node_id: 456,
        node_value: longText,
      };

      const selectorMap = new Map() as any;
      selectorMap.set(1, mockNode);

      const result = convertSelectorMapToHighlightFormat(selectorMap);

      expect(result[0].text_content).toHaveLength(50);
      expect(result[0].text_content).toBe(longText.substring(0, 50));
    });

    it('should handle missing optional properties', () => {
      const minimalNode: MockNode = {
        absolute_position: { x: 100, y: 200, width: 150, height: 50 },
        node_name: 'SPAN',
        node_id: 123,
        backend_node_id: 456,
      };

      const selectorMap = new Map() as any;
      selectorMap.set(1, minimalNode);

      const result = convertSelectorMapToHighlightFormat(selectorMap);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        x: 100,
        y: 200,
        width: 150,
        height: 50,
        interactive_index: 1,
        element_name: 'SPAN',
        is_clickable: true, // default
        is_scrollable: false, // default
        attributes: {}, // default
        node_id: 123,
        backend_node_id: 456,
        text_content: '', // empty string from node_value
      });
    });
  });
});