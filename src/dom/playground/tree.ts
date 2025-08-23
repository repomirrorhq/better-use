import * as fs from 'fs/promises';
import { BrowserProfile, BrowserSession } from '../../browser';
import { ViewportSize } from '../../browser/views';
import { NavigateToUrlEvent } from '../../browser/events';
import { inject_highlighting_script, remove_highlighting_script } from '../debug/highlights';
import { DomService } from '../service';
import { EnhancedDOMTreeNode } from '../views';

async function main(): Promise<void> {
  const browser = new BrowserSession({
    browserProfile: new BrowserProfile({
      windowSize: new ViewportSize({ width: 1100, height: 1000 }),
      disableSecurity: true,
      waitForNetworkIdlePageLoadTime: 1,
      headless: false,
      args: ['--incognito'],
    }),
  });

  // Navigate to the target URL
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
    
    try {
      await remove_highlighting_script(domService);

      const start = Date.now();
      
      // Get current target ID from browser session
      let targetId: string;
      if (browser.agentFocus?.targetId) {
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
      let domTiming: Record<string, any> = {};

      if (Array.isArray(result)) {
        domTree = result[0];
        domTiming = result[1] || {};
      } else {
        domTree = result;
      }

      const end = Date.now();
      console.log(`Time taken: ${(end - start) / 1000} seconds`);

      await fs.writeFile(
        'tmp/enhanced_dom_tree.json',
        JSON.stringify(domTree.__json__(), null, 1)
      );

      console.log('Saved enhanced dom tree to tmp/enhanced_dom_tree.json');

      // Print some sample information about visible/clickable elements
      let visibleClickableCount = 0;
      let totalWithSnapshot = 0;

      function countElements(node: EnhancedDOMTreeNode): void {
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

      const [serializedDomState, timingInfo] = await domService.getSerializedDomTree();

      await fs.writeFile(
        'tmp/serialized_dom_tree.txt',
        serializedDomState.llmRepresentation()
      );

      console.log('Saved serialized dom tree to tmp/serialized_dom_tree.txt');

      const treeStart = Date.now();
      const [snapshot, domTreeRaw, axTree] = await domService._getAllTrees();
      const treeEnd = Date.now();
      console.log(`Time taken: ${(treeEnd - treeStart) / 1000} seconds`);

      await fs.writeFile(
        'tmp/snapshot.json',
        JSON.stringify(snapshot, null, 1)
      );

      await fs.writeFile(
        'tmp/dom_tree.json',
        JSON.stringify(domTreeRaw, null, 1)
      );

      await fs.writeFile(
        'tmp/ax_tree.json',
        JSON.stringify(axTree, null, 1)
      );

      console.log('saved dom tree to tmp/dom_tree.json');
      console.log('saved snapshot to tmp/snapshot.json');
      console.log('saved ax tree to tmp/ax_tree.json');

      await inject_highlighting_script(domService, serializedDomState.selectorMap);

      // Wait for user input
      await new Promise((resolve) => {
        process.stdin.once('data', () => resolve(undefined));
        console.log('Done. Press Enter to continue...');
      });
    } finally {
      await domService.close();
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}