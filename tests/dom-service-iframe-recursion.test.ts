import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { DomService } from '../src/dom/service';
import { BrowserSession } from '../src/browser/session';
import { NodeType } from '../src/dom/views';
import { DOMNode } from './test-utils/domTypes';
import { createMockLogger } from './test-utils/mockLogger';

describe('DomService - Self-Referencing Iframe Protection', () => {
  let domService: DomService;
  let mockBrowserSession: jest.Mocked<BrowserSession>;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockBrowserSession = {
      getCurrentPage: jest.fn(),
      getCurrentPageUrl: jest.fn().mockResolvedValue('https://example.com'),
      getCurrentPageTitle: jest.fn().mockResolvedValue('Test Page'),
      currentPageId: 'test-page-id',
      sendCDPMessage: jest.fn()
    } as any;

    domService = new DomService(mockBrowserSession);
    (domService as any).logger = mockLogger;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle self-referencing iframes without infinite recursion', async () => {
    // Create a self-referencing iframe structure
    const createSelfReferencingNode = (depth: number = 0): DOMNode => {
      const node: DOMNode = {
        nodeId: depth,
        nodeType: NodeType.ELEMENT_NODE,
        nodeName: depth === 0 ? 'HTML' : 'IFRAME',
        nodeValue: '',
        attributes: [],
        frameId: `frame-${depth}`
      };

      // Create self-reference up to depth 15 (exceeds MAX_IFRAME_DEPTH of 10)
      if (depth < 15) {
        node.contentDocument = createSelfReferencingNode(depth + 1);
      }

      return node;
    };

    const rootNode = createSelfReferencingNode();
    
    // Mock CDP responses
    mockBrowserSession.sendCDPMessage.mockImplementation(async (method: string) => {
      if (method === 'DOM.getDocument') {
        return { root: rootNode };
      }
      if (method === 'DOMSnapshot.captureSnapshot') {
        return {
          documents: [{
            nodes: {
              nodeType: [NodeType.ELEMENT_NODE],
              nodeName: ['HTML'],
              nodeValue: [''],
              attributes: [[]],
              parentIndex: [-1],
              nodeId: [0]
            },
            layout: {
              nodeIndex: [0],
              bounds: [[0, 0, 1920, 1080]],
              text: ['']
            }
          }],
          strings: []
        };
      }
      if (method === 'Accessibility.getFullAXTree') {
        return { nodes: [] };
      }
      return {};
    });

    // Process the self-referencing structure
    const result = await domService.getDomTree();

    // Verify that:
    // 1. The function completes without hanging
    // 2. Max depth protection was triggered
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Max iframe depth')
    );
    
    // 3. The result is valid
    expect(result).toBeDefined();
    expect(result.dom_tree).toBeDefined();
  });

  it('should process nested iframes up to MAX_IFRAME_DEPTH', async () => {
    // Create a nested iframe structure that is exactly at the limit
    const createNestedIframes = (depth: number, maxDepth: number): DOMNode => {
      const node: DOMNode = {
        nodeId: depth,
        nodeType: NodeType.ELEMENT_NODE,
        nodeName: depth === 0 ? 'HTML' : 'IFRAME',
        nodeValue: '',
        attributes: [],
        frameId: `frame-${depth}`
      };

      if (depth < maxDepth) {
        node.contentDocument = {
          nodeId: 1000 + depth,
          nodeType: NodeType.DOCUMENT_NODE,
          nodeName: '#document',
          nodeValue: '',
          children: [createNestedIframes(depth + 1, maxDepth)]
        };
      }

      return node;
    };

    // Create structure with exactly 10 iframes (should be processed)
    const rootNode = createNestedIframes(0, 9);

    mockBrowserSession.sendCDPMessage.mockImplementation(async (method: string) => {
      if (method === 'DOM.getDocument') {
        return { root: rootNode };
      }
      if (method === 'DOMSnapshot.captureSnapshot') {
        return {
          documents: Array(10).fill(null).map((_, i) => ({
            nodes: {
              nodeType: [NodeType.ELEMENT_NODE],
              nodeName: [i === 0 ? 'HTML' : 'IFRAME'],
              nodeValue: [''],
              attributes: [[]],
              parentIndex: [-1],
              nodeId: [i]
            },
            layout: {
              nodeIndex: [0],
              bounds: [[0, 0, 1920 - i * 100, 1080 - i * 100]],
              text: ['']
            }
          })),
          strings: []
        };
      }
      if (method === 'Accessibility.getFullAXTree') {
        return { nodes: [] };
      }
      return {};
    });

    const result = await domService.getDomTree();

    // Should NOT trigger max depth warning for exactly 10 iframes
    expect(mockLogger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Max iframe depth')
    );
    
    expect(result).toBeDefined();
    expect(result.dom_tree).toBeDefined();
  });

  it('should mark iframes that exceed max depth with data attribute', async () => {
    // Create deeply nested iframes that exceed the limit
    const deepNode: DOMNode = {
      nodeId: 0,
      nodeType: NodeType.ELEMENT_NODE,
      nodeName: 'HTML',
      nodeValue: '',
      attributes: [],
      frameId: 'main',
      children: []
    };

    // Create a chain of 12 nested iframes
    let currentNode = deepNode;
    for (let i = 1; i <= 12; i++) {
      const iframe: DOMNode = {
        nodeId: i,
        nodeType: NodeType.ELEMENT_NODE,
        nodeName: 'IFRAME',
        nodeValue: '',
        attributes: [`src="page${i}.html"`],
        frameId: `frame-${i}`,
        contentDocument: {
          nodeId: 100 + i,
          nodeType: NodeType.DOCUMENT_NODE,
          nodeName: '#document',
          nodeValue: '',
          children: []
        }
      };
      
      if (currentNode.children) {
        currentNode.children.push(iframe);
      } else {
        currentNode.children = [iframe];
      }
      
      if (iframe.contentDocument) {
        currentNode = iframe.contentDocument;
      }
    }

    mockBrowserSession.sendCDPMessage.mockImplementation(async (method: string) => {
      if (method === 'DOM.getDocument') {
        return { root: deepNode };
      }
      if (method === 'DOMSnapshot.captureSnapshot') {
        return {
          documents: [{
            nodes: {
              nodeType: Array(13).fill(NodeType.ELEMENT_NODE),
              nodeName: ['HTML', ...Array(12).fill('IFRAME')],
              nodeValue: Array(13).fill(''),
              attributes: Array(13).fill([]),
              parentIndex: [-1, ...Array(12).fill(0).map((_, i) => i)],
              nodeId: Array(13).fill(0).map((_, i) => i)
            },
            layout: {
              nodeIndex: Array(13).fill(0).map((_, i) => i),
              bounds: Array(13).fill([0, 0, 1920, 1080]),
              text: Array(13).fill('')
            }
          }],
          strings: []
        };
      }
      if (method === 'Accessibility.getFullAXTree') {
        return { nodes: [] };
      }
      return {};
    });

    const result = await domService.getDomTree();

    // Should have triggered max depth warning
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Max iframe depth (10) reached')
    );

    expect(result).toBeDefined();
    expect(result.dom_tree).toBeDefined();
  });

  it('should handle circular iframe references without hanging', async () => {
    // Create a circular reference: iframe A contains iframe B, which contains iframe A
    const iframeA: DOMNode = {
      nodeId: 1,
      nodeType: NodeType.ELEMENT_NODE,
      nodeName: 'IFRAME',
      nodeValue: '',
      attributes: ['id="frame-a"', 'src="page-a.html"'],
      frameId: 'frame-a'
    };

    const iframeB: DOMNode = {
      nodeId: 2,
      nodeType: NodeType.ELEMENT_NODE,
      nodeName: 'IFRAME',
      nodeValue: '',
      attributes: ['id="frame-b"', 'src="page-b.html"'],
      frameId: 'frame-b'
    };

    // Create circular reference
    iframeA.contentDocument = {
      nodeId: 10,
      nodeType: NodeType.DOCUMENT_NODE,
      nodeName: '#document',
      nodeValue: '',
      children: [iframeB]
    };

    iframeB.contentDocument = {
      nodeId: 20,
      nodeType: NodeType.DOCUMENT_NODE,
      nodeName: '#document',
      nodeValue: '',
      children: [iframeA] // Circular reference back to iframe A
    };

    const rootNode: DOMNode = {
      nodeId: 0,
      nodeType: NodeType.ELEMENT_NODE,
      nodeName: 'HTML',
      nodeValue: '',
      attributes: [],
      frameId: 'main',
      children: [iframeA]
    };

    mockBrowserSession.sendCDPMessage.mockImplementation(async (method: string) => {
      if (method === 'DOM.getDocument') {
        return { root: rootNode };
      }
      if (method === 'DOMSnapshot.captureSnapshot') {
        return {
          documents: [{
            nodes: {
              nodeType: [NodeType.ELEMENT_NODE],
              nodeName: ['HTML'],
              nodeValue: [''],
              attributes: [[]],
              parentIndex: [-1],
              nodeId: [0]
            },
            layout: {
              nodeIndex: [0],
              bounds: [[0, 0, 1920, 1080]],
              text: ['']
            }
          }],
          strings: []
        };
      }
      if (method === 'Accessibility.getFullAXTree') {
        return { nodes: [] };
      }
      return {};
    });

    // Set a timeout to ensure the test doesn't hang
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Test timed out - possible infinite recursion')), 5000);
    });

    const processPromise = domService.getDomTree();

    // Race between processing and timeout
    try {
      const result = await Promise.race([processPromise, timeoutPromise]);
      
      // If we get here, the circular reference was handled properly
      expect(result).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Max iframe depth')
      );
    } catch (error: any) {
      // Should not timeout
      expect(error.message).not.toContain('Test timed out');
      throw error;
    }
  });
});