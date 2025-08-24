import * as fs from 'fs/promises';
import * as path from 'path';
import { BrowserProfile, BrowserSession } from '../../browser';
// ViewportSize not needed - use inline type
import { NavigateToUrlEvent } from '../../browser/events';
import { DomService } from '../service';
import { EnhancedDOMTreeNode } from '../views';
import { injectHighlightingScript, removeHighlightingScript } from '../debug';

async function main() {
  const browser = new BrowserSession({
    profile: new BrowserProfile({
      viewport_width: 1100,
      viewport_height: 1000,
      disable_web_security: true,
      wait_for_network_idle_page_load_time: 1,
      headless: false,
      chrome_args: ['--incognito'],
    }),
  });

  await browser.start();

  // Navigate to test page
  const navEvent = browser.eventBus.dispatch(
    {
      name: 'navigate_to_url',
      args: {
        url: 'https://v0-website-with-clickable-elements.vercel.app/nested-iframe',
      }
    } as any
  );
  await navEvent;

  // Wait a moment for page to fully load
  await new Promise(resolve => setTimeout(resolve, 2000));

  while (true) {
    const domService = new DomService(browser);
    // domService doesn't need connect() - it's initialized with browser

    try {
      await removeHighlightingScript(domService);

      const start = Date.now();
      
      // Get current target ID from browser session
      let targetId: string;
      if (browser.agentFocus && browser.agentFocus.targetId) {
        targetId = browser.agentFocus.targetId;
      } else {
        // Get first available target
        const targets = await (browser as any)._cdpGetAllPages();
        if (!targets || targets.length === 0) {
          throw new Error('No targets available');
        }
        targetId = targets[0].targetId;
      }

      const domResult = await domService.getDOMTree(targetId);
      let domTree: EnhancedDOMTreeNode;
      let domTiming: any = {};
      
      if (Array.isArray(domResult)) {
        domTree = domResult[0];
        domTiming = domResult[1] || {};
      } else {
        domTree = domResult;
      }

      const end = Date.now();
      console.log(`Time taken: ${(end - start) / 1000} seconds`);

      // Ensure tmp directory exists
      const tmpDir = path.join(process.cwd(), 'tmp');
      await fs.mkdir(tmpDir, { recursive: true });

      // Save DOM tree to file
      const outputPath = path.join(tmpDir, 'enhanced_dom_tree.json');
      await fs.writeFile(outputPath, JSON.stringify(domTree, null, 2));
      console.log(`Saved enhanced dom tree to ${outputPath}`);

      // Count visible and clickable elements
      let visibleClickableCount = 0;
      let totalWithSnapshot = 0;

      function countElements(node: EnhancedDOMTreeNode) {
        if (node.snapshot_node) {
          totalWithSnapshot++;
          if (node.is_visible && node.snapshot_node.is_clickable) {
            visibleClickableCount++;
          }
        }

        if (node.children_nodes) {
          for (const child of node.children_nodes) {
            countElements(child);
          }
        }
      }

      countElements(domTree);
      console.log(
        `Found ${visibleClickableCount} visible clickable elements out of ${totalWithSnapshot} elements with snapshot data`
      );

      const serializedResult = await domService.getSerializedDOMTree();
      const dom = serializedResult[0];
      const timing = serializedResult[2];
      console.log('DOM serialization timing:', timing || {});

      // Test highlight functionality
      await injectHighlightingScript(domService, []);
      console.log('Highlighting script injected');
      
      // Wait a bit to see highlights
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await removeHighlightingScript(domService);
      console.log('Highlighting script removed');

    } finally {
      // domService doesn't need disconnect()
    }

    // Wait before next iteration
    console.log('Press Ctrl+C to exit, waiting 5 seconds before next iteration...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Run the main function
if (require.main === module) {
  main().catch(console.error);
}

export { main };