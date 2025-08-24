import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('Browser Popup Window Handling', () => {
  let browserSession: BrowserSession;
  let server: http.Server;
  let serverUrl: string;
  let tempDir: string;

  // HTML content for the test pages
  const mainPageHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Main Page</title>
    </head>
    <body>
        <h1>Main Page</h1>
        <p>Value from popup: <span id="popupValue">None</span></p>
        <button id="openPopupBtn" onclick="openPopup()">Open Popup</button>

        <script>
            let popupWindow = null;

            function openPopup() {
                popupWindow = window.open(
                    "/popup.html", 
                    "PopupWindow", 
                    "width=400,height=300"
                );
            }

            // Function to be called by popup
            function updateValueFromPopup(value) {
                document.getElementById("popupValue").textContent = value;
            }

            // Make it available globally so popup can call it
            window.updateValueFromPopup = updateValueFromPopup;
        </script>
    </body>
    </html>
  `;

  const popupPageHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Popup</title>
    </head>
    <body>
        <h1>Popup Window</h1>
        <label>Enter value: <input type="text" id="inputValue"></label>
        <button id="saveBtn" onclick="saveValue()">Save</button>

        <script>
            function saveValue() {
                const value = document.getElementById("inputValue").value;
                if (window.opener && !window.opener.closed) {
                    // Call parent's function
                    window.opener.updateValueFromPopup(value);
                }
                window.close();
            }
        </script>
    </body>
    </html>
  `;

  beforeEach(async () => {
    // Create temp directory for browser profile
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'browser-test-'));

    // Start HTTP server
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html');
        if (req.url === '/popup.html') {
          res.end(popupPageHtml);
        } else {
          res.end(mainPageHtml);
        }
      });
      
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // Create browser session
    const profile = new BrowserProfile({
      userDataDir: tempDir,
      headless: true,
      disableSecurity: true,
    });
    browserSession = new BrowserSession(profile);
  });

  afterEach(async () => {
    // Clean up browser session
    if (browserSession && browserSession.isRunning) {
      await browserSession.stop();
    }

    // Stop server
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  it('should properly track and close popup windows created with window.open()', async () => {
    await browserSession.start();

    // Navigate to main page
    await browserSession.navigateToUrl({ url: serverUrl });

    // Track tab/page counts
    const initialPageCount = browserSession.pages.size;
    expect(initialPageCount).toBe(1);

    // Track tab created events
    let tabCreatedCount = 0;
    let tabClosedCount = 0;
    
    browserSession.on('tabCreated', () => {
      tabCreatedCount++;
    });
    
    browserSession.on('tabClosed', () => {
      tabClosedCount++;
    });

    // Click the "Open Popup" button
    const currentPage = browserSession.pages.get(browserSession.currentTabId!);
    expect(currentPage).toBeDefined();
    
    await currentPage!.click('#openPopupBtn');

    // Wait for popup to be created
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check that popup was tracked
    expect(browserSession.pages.size).toBe(2);
    expect(tabCreatedCount).toBe(1);

    // Get the popup page
    const popupPageId = Array.from(browserSession.pages.keys()).find(
      id => id !== browserSession.currentTabId
    );
    expect(popupPageId).toBeDefined();
    
    const popupPage = browserSession.pages.get(popupPageId!);
    expect(popupPage).toBeDefined();

    // Interact with popup - enter value and save
    await popupPage!.fill('#inputValue', 'TestValue');
    await popupPage!.click('#saveBtn');

    // Wait for popup to close
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify popup was closed and tracked properly
    expect(browserSession.pages.size).toBe(1);
    expect(tabClosedCount).toBe(1);

    // Verify value was updated in main window
    const mainPage = browserSession.pages.get(browserSession.currentTabId!);
    const popupValue = await mainPage!.textContent('#popupValue');
    expect(popupValue).toBe('TestValue');
  });

  it('should close all popup windows when browser session stops', async () => {
    await browserSession.start();

    // Navigate to main page
    await browserSession.navigateToUrl({ url: serverUrl });

    // Open multiple popups
    const currentPage = browserSession.pages.get(browserSession.currentTabId!);
    
    // Open first popup
    await currentPage!.click('#openPopupBtn');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Open second popup (click again)
    await currentPage!.evaluate(() => {
      (window as any).open('/popup.html', 'PopupWindow2', 'width=400,height=300');
    });
    await new Promise(resolve => setTimeout(resolve, 300));

    // Should have 3 pages total (main + 2 popups)
    expect(browserSession.pages.size).toBe(3);

    // Stop browser session
    await browserSession.stop();

    // All pages should be closed
    expect(browserSession.pages.size).toBe(0);
    expect(browserSession.isRunning).toBe(false);
  });
});