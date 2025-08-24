import * as fs from 'fs/promises';
import * as path from 'path';
import { BrowserProfile, BrowserSession } from '../../browser';
import { ViewportSize } from '../../browser/views';
import { NavigateToUrlEvent } from '../../browser/events';
import { DomService } from '../service';
import { EnhancedDOMTreeNode } from '../views';
import { inject_highlighting_script, remove_highlighting_script } from '../debug';

async function main() {
  const browser = new BrowserSession({
    profile: new BrowserProfile({
      viewport: { width: 1100, height: 1000 } as ViewportSize,
      disableSecurity: true,
      waitForNetworkIdlePageLoadTime: 1,
      headless: false,
      args: ['--incognito'],
    }),
  });

  await browser.start();

  // Navigate to test page
  const navEvent = browser.eventBus.dispatch(
    new NavigateToUrlEvent({
      url: 'https://v0-website-with-clickable-elements.vercel.app/nested-iframe',
    })
  );
  await navEvent;

  // Wait a moment for page to fully load
  await new Promise(resolve => setTimeout(resolve, 2000));

  while (true) {
    const domService = new DomService(browser);
    await domService.connect();

    try {
      await remove_highlighting_script(domService);

      const start = Date.now();
      
      // Get current target ID from browser session
      let targetId: string;
      if (browser.agentFocus && browser.agentFocus.targetId) {
        targetId = browser.agentFocus.targetId;
      } else {
        // Get first available target
        const targets = await browser._cdpGetAllPages();
        if (!targets || targets.length === 0) {
          throw new Error('No targets available');
        }
        targetId = targets[0].targetId;
      }

      const result = await domService.getDomTree(targetId);
      let domTree: EnhancedDOMTreeNode;
      let domTiming: any = {};
      
      if (Array.isArray(result)) {
        domTree = result[0];
        domTiming = result[1] || {};
      } else {
        domTree = result;
      }

      const end = Date.now();
      console.log(`Time taken: ${(end - start) / 1000} seconds`);

      // Ensure tmp directory exists
      const tmpDir = path.join(process.cwd(), 'tmp');
      await fs.mkdir(tmpDir, { recursive: true });

      // Save DOM tree to file
      const outputPath = path.join(tmpDir, 'enhanced_dom_tree.json');
      await fs.writeFile(outputPath, JSON.stringify(domTree.toJSON(), null, 2));
      console.log(`Saved enhanced dom tree to ${outputPath}`);

      // Count visible and clickable elements
      let visibleClickableCount = 0;
      let totalWithSnapshot = 0;

      function countElements(node: EnhancedDOMTreeNode) {
        if (node.snapshotNode) {
          totalWithSnapshot++;
          if (node.isVisible && node.snapshotNode.isClickable) {
            visibleClickableCount++;
          }
        }

        if (node.childrenNodes) {
          for (const child of node.childrenNodes) {
            countElements(child);
          }
        }
      }

      countElements(domTree);
      console.log(
        `Found ${visibleClickableCount} visible clickable elements out of ${totalWithSnapshot} elements with snapshot data`
      );

      const { dom, timing } = await domService.getSerializedDomTree();
      console.log('DOM serialization timing:', timing);

      // Test highlight functionality
      await inject_highlighting_script(domService);
      console.log('Highlighting script injected');
      
      // Wait a bit to see highlights
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await remove_highlighting_script(domService);
      console.log('Highlighting script removed');

    } finally {
      await domService.disconnect();
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