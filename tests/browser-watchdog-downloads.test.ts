/**
 * Test DownloadsWatchdog functionality.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { BrowserProfile, BrowserSession } from '../src/browser';
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { tmpdir } from 'os';
import { ClickElementEvent, FileDownloadedEvent } from '../src/browser/events';

// Helper to create a temporary directory
function createTempDir(prefix: string): string {
  const tempPath = path.join(tmpdir(), `${prefix}_${Date.now()}`);
  fs.mkdirSync(tempPath, { recursive: true });
  return tempPath;
}

// Helper to clean up a directory
function cleanupDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// Simple HTTP server for testing
let server: http.Server;
let serverUrl: string;

beforeEach((done) => {
  server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Page</h1>
          <button id="test-button" onclick="document.getElementById('result').innerText = 'Clicked!'">
            Click Me
          </button>
          <p id="result"></p>
          <a href="/download/test.pdf" download>Download PDF</a>
          <a href="/download/test.txt" download>Download Text</a>
        </body>
        </html>
      `);
    } else if (req.url === '/download/test.pdf') {
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="test.pdf"',
        'Content-Length': '11'
      });
      res.end('PDF content');
    } else if (req.url === '/download/test.txt') {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Content-Disposition': 'attachment; filename="test.txt"',
        'Content-Length': '23'
      });
      res.end('Test text file content');
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(0, () => {
    const address = server.address();
    if (address && typeof address !== 'string') {
      serverUrl = `http://localhost:${address.port}`;
    }
    done();
  });
});

afterEach((done) => {
  server.close(done);
});

describe('DownloadsWatchdog Tests', () => {
  test('downloads watchdog page attachment', async () => {
    const downloadsPath = createTempDir('downloads');

    const profile = new BrowserProfile({
      headless: true,
      downloadsPath
    });
    const session = new BrowserSession({ profile });

    try {
      await session.start();

      // Get downloads watchdog
      const downloadsWatchdog = (session as any)._downloadsWatchdog;
      expect(downloadsWatchdog).toBeDefined();

      // Navigate to create a new page
      await session.navigateToURL('data:text/html,<h1>Test Page</h1>');

      // Verify watchdog has pages with listeners
      expect(downloadsWatchdog).toHaveProperty('_pagesWithListeners');

      // Give it a moment for page attachment
      await new Promise(resolve => setTimeout(resolve, 200));

      // The watchdog should have attached to at least one page
    } finally {
      await session.stop();
      cleanupDir(downloadsPath);
    }
  }, 15000);

  test('downloads watchdog default downloads path', async () => {
    // Don't specify downloads_path - should use default
    const profile = new BrowserProfile({ headless: true });
    const session = new BrowserSession({ profile });

    try {
      await session.start();

      // Verify downloads watchdog was created
      const downloadsWatchdog = (session as any)._downloadsWatchdog;
      expect(downloadsWatchdog).toBeDefined();

      // Verify default downloads path was set by BrowserProfile
      expect(session.browserProfile.downloadsPath).toBeDefined();
      expect(fs.existsSync(session.browserProfile.downloadsPath!)).toBe(true);
    } finally {
      await session.stop();
    }
  }, 15000);

  test('unique downloads directories', async () => {
    // Create two profiles without specifying downloads_path
    const profile1 = new BrowserProfile({ headless: true });
    const profile2 = new BrowserProfile({ headless: true });

    // Ensure they have different downloads paths
    expect(profile1.downloadsPath).not.toBe(profile2.downloadsPath);
    expect(profile1.downloadsPath).toBeDefined();
    expect(profile2.downloadsPath).toBeDefined();

    // Ensure both directories exist
    expect(fs.existsSync(profile1.downloadsPath!)).toBe(true);
    expect(fs.existsSync(profile2.downloadsPath!)).toBe(true);

    // Ensure they are both under the temp directory with the correct prefix
    const tempDir = tmpdir();
    expect(path.dirname(profile1.downloadsPath!)).toBe(tempDir);
    expect(path.dirname(profile2.downloadsPath!)).toBe(tempDir);
    expect(profile1.downloadsPath!).toContain('browser-use-downloads-');
    expect(profile2.downloadsPath!).toContain('browser-use-downloads-');

    console.log(`✅ Profile 1 downloads path: ${profile1.downloadsPath}`);
    console.log(`✅ Profile 2 downloads path: ${profile2.downloadsPath}`);

    // Test that explicit downloads_path is preserved
    const explicitPath = createTempDir('custom-downloads');
    const profile3 = new BrowserProfile({
      headless: true,
      downloadsPath: explicitPath
    });
    expect(profile3.downloadsPath).toBe(explicitPath);
    console.log(`✅ Explicit downloads path preserved: ${profile3.downloadsPath}`);

    // Cleanup
    cleanupDir(explicitPath);
  });

  test('downloads watchdog detection timing', async () => {
    const downloadsPath1 = createTempDir('downloads1');
    const downloadsPath2 = createTempDir('downloads2');

    // Test 1: With downloads_dir set (default behavior)
    const browserWithDownloads = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        downloadsPath: downloadsPath1,
        userDataDir: undefined
      })
    });

    await browserWithDownloads.start();
    const page1 = await browserWithDownloads.getCurrentPage();
    await page1.goto(serverUrl);

    // Click button (non-download)
    const startTime1 = Date.now();
    await page1.click('#test-button');
    const durationWithDownloads = (Date.now() - startTime1) / 1000;

    // Verify click worked
    const resultText1 = await page1.locator('#result').textContent();
    expect(resultText1).toBe('Clicked!');

    await browserWithDownloads.stop();

    // Test 2: With downloads_dir set to null (disables download detection)
    const browserNoDownloads = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        downloadsPath: undefined,
        userDataDir: undefined
      })
    });

    await browserNoDownloads.start();
    const page2 = await browserNoDownloads.getCurrentPage();
    await page2.goto(serverUrl);

    // Clear previous result
    await page2.evaluate('document.getElementById("result").innerText = ""');

    // Click button (non-download)
    const startTime2 = Date.now();
    await page2.click('#test-button');
    const durationNoDownloads = (Date.now() - startTime2) / 1000;

    // Verify click worked
    const resultText2 = await page2.locator('#result').textContent();
    expect(resultText2).toBe('Clicked!');

    await browserNoDownloads.stop();

    // Check timing differences
    console.log(`Click with downloads_dir: ${durationWithDownloads.toFixed(2)}s`);
    console.log(`Click without downloads_dir: ${durationNoDownloads.toFixed(2)}s`);
    console.log(`Difference: ${(durationWithDownloads - durationNoDownloads).toFixed(2)}s`);

    // Both should be fast now since we're clicking a button (not a download link)
    expect(durationWithDownloads).toBeLessThan(8);
    expect(durationNoDownloads).toBeLessThan(3);

    // Cleanup
    cleanupDir(downloadsPath1);
    cleanupDir(downloadsPath2);
  }, 30000);

  test('downloads watchdog actual download detection', async () => {
    const downloadsPath = createTempDir('downloads');

    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        downloadsPath: downloadsPath,
        userDataDir: undefined
      })
    });

    await browserSession.start();
    const page = await browserSession.getCurrentPage();
    await page.goto(serverUrl);

    // Get the DOM state to find the download link
    const state = await browserSession.getBrowserStateSummary();

    // Find the download link element
    let downloadNode: any = null;
    for (const elem of Object.values(state.dom_state?.selector_map)) {
      if ((elem as any).tagName === 'a' && 'download' in (elem as any).attributes) {
        downloadNode = elem;
        break;
      }
    }

    expect(downloadNode).not.toBeNull();

    // Debug: Log what we're about to click
    console.log(`Clicking download link with href: ${downloadNode.attributes.href}`);
    console.log(`Download link has download attribute: ${'download' in downloadNode.attributes}`);

    // Click the download link
    const startTime = Date.now();
    const event = browserSession.eventBus.dispatch(new ClickElementEvent({ elementNode: downloadNode }));
    await event;
    const duration = (Date.now() - startTime) / 1000;

    console.log(`Click completed in ${duration.toFixed(2)}s`);

    // Wait for download to be processed
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if we're still on the same page (download attribute prevents navigation)
    const currentUrl = page.url();
    console.log(`Current URL after click: ${currentUrl}`);
    console.log('Download was handled by downloads watchdog');

    // Wait a bit more
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check the downloaded files
    const downloadedFiles = browserSession.downloadedFiles;

    // Debug: check the downloads directory
    console.log(`Downloads directory: ${downloadsPath}`);
    console.log(`Directory exists: ${fs.existsSync(downloadsPath)}`);
    if (fs.existsSync(downloadsPath)) {
      const files = fs.readdirSync(downloadsPath);
      console.log(`Files in downloads directory: ${files}`);
    }

    // Verify files were actually downloaded with correct content
    expect(downloadedFiles.length).toBeGreaterThan(0);

    // Check the most recent download
    const latestDownload = downloadedFiles[0]; // Files are sorted by newest first
    expect(latestDownload).toContain('test.pdf');
    expect(fs.existsSync(latestDownload)).toBe(true);

    // Verify the file has the correct content and size
    const fileSize = fs.statSync(latestDownload).size;
    expect(fileSize).toBe(11);

    // Verify the actual file content matches what the server sent
    const fileContent = fs.readFileSync(latestDownload);
    const expectedContent = Buffer.from('PDF content');
    expect(fileContent).toEqual(expectedContent);

    console.log(`✅ Download successful: ${latestDownload} (${fileSize} bytes) with correct content`);

    await browserSession.stop();
    cleanupDir(downloadsPath);
  }, 30000);

  test('downloads watchdog event dispatching', async () => {
    const downloadsPath = createTempDir('downloads');

    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        downloadsPath: downloadsPath,
        userDataDir: undefined
      })
    });

    try {
      await browserSession.start();
      const page = await browserSession.getCurrentPage();
      await page.goto(serverUrl);

      // Track download events
      const downloadEvents: FileDownloadedEvent[] = [];
      browserSession.eventBus.on(FileDownloadedEvent, (event) => {
        downloadEvents.push(event);
      });

      // Get initial event history count
      const initialHistoryCount = Object.keys(browserSession.eventBus.eventHistory).length;

      // Click download link - this should trigger FileDownloadedEvent
      const downloadLink = page.locator('a[download]');
      await downloadLink.click();

      // Wait for download to complete and event to be dispatched
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check that FileDownloadedEvent was dispatched
      const eventHistory = Object.values(browserSession.eventBus.eventHistory);
      const fileDownloadEvents = eventHistory.filter(e => e instanceof FileDownloadedEvent);

      // FileDownloadedEvent must be dispatched
      expect(fileDownloadEvents.length).toBeGreaterThanOrEqual(1);

      // Verify the event contains correct information
      const latestDownloadEvent = fileDownloadEvents[fileDownloadEvents.length - 1] as FileDownloadedEvent;
      expect(latestDownloadEvent.path).toBeDefined();
      expect(latestDownloadEvent.path).toContain('test.pdf');
      expect(fs.existsSync(latestDownloadEvent.path)).toBe(true);

      // Verify the downloaded file has correct content and size
      const fileSize = fs.statSync(latestDownloadEvent.path).size;
      expect(fileSize).toBe(11);

      const fileContent = fs.readFileSync(latestDownloadEvent.path);
      const expectedContent = Buffer.from('PDF content');
      expect(fileContent).toEqual(expectedContent);

      console.log(`✅ FileDownloadedEvent dispatched correctly for: ${latestDownloadEvent.path} (${fileSize} bytes)`);
    } finally {
      await browserSession.stop();
      cleanupDir(downloadsPath);
    }
  }, 30000);
});