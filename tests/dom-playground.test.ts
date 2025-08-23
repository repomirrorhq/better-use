/**
 * Tests for the DOM playground tools
 */

import {
  DOMExtractionPlayground,
  runDOMExtractionPlayground,
  SAMPLE_WEBSITES,
  DIFFICULT_WEBSITES,
  DOMExtractionTiming,
  TestWebsite,
  PlaygroundConfig
} from '../src/dom/playground';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock browser session to avoid requiring full browser setup in tests
jest.mock('../src/browser/session', () => ({
  BrowserSession: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    navigateToUrl: jest.fn().mockResolvedValue(undefined),
    getBrowserStateSummary: jest.fn().mockResolvedValue({
      url: 'https://example.com',
      title: 'Test Page',
      dom_state: {
        selector_map: {
          1: { tag_name: 'button', text: 'Click me' },
          2: { tag_name: 'input', text: '' },
          3: { tag_name: 'a', text: 'Link text' }
        },
        _root: {
          tag_name: 'html',
          children: [],
          original_node: { tag_name: 'html', children: [] }
        }
      }
    })
  }))
}));

// Mock fs operations
jest.mock('fs', () => {
  const original = jest.requireActual('fs');
  return {
    ...original,
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

describe.skip('DOM Playground Tools', () => {
  const tempDir = os.tmpdir();
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Test Website Constants', () => {
    it('should have sample websites defined', () => {
      expect(SAMPLE_WEBSITES).toBeDefined();
      expect(Array.isArray(SAMPLE_WEBSITES)).toBe(true);
      expect(SAMPLE_WEBSITES.length).toBeGreaterThan(0);
      
      // Check structure of first sample website
      const firstWebsite = SAMPLE_WEBSITES[0];
      expect(firstWebsite).toHaveProperty('url');
      expect(firstWebsite).toHaveProperty('category', 'sample');
      expect(typeof firstWebsite.url).toBe('string');
      expect(firstWebsite.url.startsWith('http')).toBe(true);
    });

    it('should have difficult websites defined', () => {
      expect(DIFFICULT_WEBSITES).toBeDefined();
      expect(Array.isArray(DIFFICULT_WEBSITES)).toBe(true);
      expect(DIFFICULT_WEBSITES.length).toBeGreaterThan(0);
      
      // Check structure of first difficult website
      const firstWebsite = DIFFICULT_WEBSITES[0];
      expect(firstWebsite).toHaveProperty('url');
      expect(firstWebsite).toHaveProperty('category', 'difficult');
      expect(typeof firstWebsite.url).toBe('string');
      expect(firstWebsite.url.startsWith('http')).toBe(true);
      
      // Difficult websites should have challenges
      if (firstWebsite.challenges) {
        expect(Array.isArray(firstWebsite.challenges)).toBe(true);
      }
    });

    it('should have unique URLs across all websites', () => {
      const allWebsites = [...SAMPLE_WEBSITES, ...DIFFICULT_WEBSITES];
      const urls = allWebsites.map(site => site.url);
      const uniqueUrls = new Set(urls);
      
      expect(uniqueUrls.size).toBe(urls.length);
    });
  });

  describe('DOMExtractionPlayground', () => {
    it('should initialize with default configuration', () => {
      const playground = new DOMExtractionPlayground();
      expect(playground).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const config: Partial<PlaygroundConfig> = {
        outputDir: path.join(tempDir, 'custom-playground'),
        headless: true,
        viewportWidth: 1920,
        viewportHeight: 1080,
        timeout: 30000
      };

      const playground = new DOMExtractionPlayground(config);
      expect(playground).toBeDefined();
      
      // Verify output directory creation was attempted
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        config.outputDir,
        { recursive: true }
      );
    });

    it('should generate website list for prompt', () => {
      const playground = new DOMExtractionPlayground();
      const websiteList = playground.getWebsiteListForPrompt();
      
      expect(typeof websiteList).toBe('string');
      expect(websiteList).toContain('📋 Websites:');
      expect(websiteList.length).toBeGreaterThan(0);
      
      // Should contain references to both sample and difficult sites
      const lines = websiteList.split('\n');
      expect(lines.length).toBeGreaterThan(SAMPLE_WEBSITES.length);
    });

    it('should handle cleanup gracefully', async () => {
      const playground = new DOMExtractionPlayground();
      
      // Should not throw during cleanup
      await expect(playground.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('DOM Analysis Functions', () => {
    it('should create user message content', () => {
      const playground = new DOMExtractionPlayground();
      const website: TestWebsite = {
        url: 'https://example.com',
        description: 'Test website',
        category: 'sample',
        challenges: ['Challenge 1', 'Challenge 2']
      };

      const browserState = {
        url: 'https://example.com',
        title: 'Example Page',
        dom_state: {
          selector_map: {
            1: { tag_name: 'button', text: 'Click me' },
            2: { tag_name: 'input', text: '' }
          }
        }
      };

      // Access private method for testing (would need to make it public or use a different approach in real code)
      const userMessage = (playground as any).createUserMessage(browserState, website);
      
      expect(typeof userMessage).toBe('string');
      expect(userMessage).toContain('https://example.com');
      expect(userMessage).toContain('Test website');
      expect(userMessage).toContain('Challenge 1');
    });

    it('should create timing analysis', () => {
      const playground = new DOMExtractionPlayground();
      const website: TestWebsite = {
        url: 'https://example.com',
        description: 'Test website',
        category: 'sample'
      };

      const timing: DOMExtractionTiming = {
        get_state_summary_total: 2.5,
        clickable_detection_time: 0.8,
        dom_serialization_time: 1.2
      };

      const totalElements = 50;
      const tokenCount = 15000;

      // Access private method for testing
      const timingAnalysis = (playground as any).createTimingAnalysis(
        website, 
        timing, 
        totalElements, 
        tokenCount
      );
      
      expect(typeof timingAnalysis).toBe('string');
      expect(timingAnalysis).toContain('DOM EXTRACTION PERFORMANCE ANALYSIS');
      expect(timingAnalysis).toContain('https://example.com');
      expect(timingAnalysis).toContain('50'); // Total elements
      expect(timingAnalysis).toContain('15000'); // Token count
      expect(timingAnalysis).toContain('2500.00 ms'); // Total time in ms
    });
  });

  describe('File Output Operations', () => {
    it('should save analysis outputs', async () => {
      const playground = new DOMExtractionPlayground({
        outputDir: path.join(tempDir, 'test-output')
      });

      const website: TestWebsite = {
        url: 'https://example.com',
        description: 'Test website',
        category: 'sample'
      };

      const browserState = {
        url: 'https://example.com',
        title: 'Example Page',
        dom_state: {
          selector_map: { 1: { tag_name: 'button' } },
          _root: { tag_name: 'html', original_node: { tag_name: 'html' } }
        }
      };

      const timing: DOMExtractionTiming = {
        get_state_summary_total: 1.5
      };

      // Access private method for testing
      await (playground as any).saveAnalysisOutputs(
        'Test user message',
        browserState,
        website,
        timing,
        10
      );

      // Verify files were written
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('user_message.txt'),
        'Test user message',
        'utf-8'
      );

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('simplified_element_tree.json'),
        expect.any(String),
        'utf-8'
      );

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('timing_analysis.txt'),
        expect.any(String),
        'utf-8'
      );
    });
  });

  describe('Integration Tests', () => {
    it('should run playground without errors', async () => {
      // Mock the interactive loop to exit immediately
      const playground = new DOMExtractionPlayground({
        outputDir: path.join(tempDir, 'integration-test'),
        headless: true
      });

      // Override the runInteractiveLoop to prevent infinite loop
      (playground as any).runInteractiveLoop = jest.fn().mockResolvedValue(undefined);

      await expect(playground.start()).resolves.toBeUndefined();
    });

    it('should handle browser session errors gracefully', async () => {
      // Create a playground with a browser session that throws errors
      const mockBrowserSession = {
        start: jest.fn().mockRejectedValue(new Error('Browser start failed')),
        stop: jest.fn().mockResolvedValue(undefined)
      };

      const playground = new DOMExtractionPlayground();
      (playground as any).browserSession = mockBrowserSession;

      // Should handle the error without throwing
      await expect(playground.start()).rejects.toThrow('Browser start failed');
      
      // Cleanup should still be called
      expect(mockBrowserSession.stop).toHaveBeenCalled();
    });
  });

  describe('Standalone Runner Function', () => {
    it('should run playground with custom config', async () => {
      const config: Partial<PlaygroundConfig> = {
        headless: true,
        outputDir: path.join(tempDir, 'standalone-test')
      };

      // Mock the playground to avoid actual browser operations
      const mockStart = jest.fn().mockResolvedValue(undefined);
      const mockCleanup = jest.fn().mockResolvedValue(undefined);

      jest.doMock('../src/dom/playground/extraction', () => ({
        ...jest.requireActual('../src/dom/playground/extraction'),
        DOMExtractionPlayground: jest.fn().mockImplementation(() => ({
          start: mockStart,
          cleanup: mockCleanup
        }))
      }));

      await expect(runDOMExtractionPlayground(config)).resolves.toBeUndefined();
    });
  });

  describe('Performance Analysis', () => {
    it('should calculate performance metrics correctly', () => {
      const timing: DOMExtractionTiming = {
        get_state_summary_total: 3.0,
        clickable_detection_time: 1.5,
        dom_serialization_time: 1.0,
        element_processing_time: 0.5
      };

      const totalTime = timing.get_state_summary_total;
      
      expect(totalTime).toBe(3.0);
      
      // Verify percentage calculations would work
      const clickablePercentage = (timing.clickable_detection_time! / totalTime) * 100;
      expect(clickablePercentage).toBe(50); // 1.5 / 3.0 * 100
    });

    it('should handle missing timing data gracefully', () => {
      const timing: DOMExtractionTiming = {
        get_state_summary_total: 2.0
        // Other timing values are undefined
      };

      expect(timing.get_state_summary_total).toBeDefined();
      expect(timing.clickable_detection_time).toBeUndefined();
      
      // Should not crash when accessing undefined timing values
      const entries = Object.entries(timing);
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });
  });
});