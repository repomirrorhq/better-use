import { DOMPlayground } from '../src/dom/playground';

describe('DOM Playground', () => {
  let playground: DOMPlayground;

  beforeAll(() => {
    playground = new DOMPlayground({ 
      headless: true,
      viewportSize: { width: 800, height: 600 }
    });
  });

  it('should create playground instance', () => {
    expect(playground).toBeDefined();
    expect(playground).toBeInstanceOf(DOMPlayground);
  });

  it('should handle basic configuration', () => {
    const customPlayground = new DOMPlayground({
      headless: false,
      viewportSize: { width: 1200, height: 800 },
      disableSecurity: true
    });
    
    expect(customPlayground).toBeDefined();
  });

  // Note: Full integration tests would require browser session setup
  // which is complex for unit testing. The playground is primarily
  // designed for interactive testing and CLI usage.
});