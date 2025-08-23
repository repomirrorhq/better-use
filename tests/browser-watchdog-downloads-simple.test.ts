import { chromium } from 'playwright';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { ClickElementEvent, FileDownloadedEvent } from '../src/browser/events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { promisify } from 'util';

describe('Browser Downloads Watchdog Simple Tests', () => {
  test('simple playwright download functionality', async () => {
    // Create temp directory for downloads
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-downloads-'));
    const downloadsPath = path.join(tmpdir, 'downloads');
    fs.mkdirSync(downloadsPath);

    try {
      // Launch browser
      const browser = await chromium.launch({ headless: true });
      
      // Create context with downloads enabled
      const context = await browser.newContext({ acceptDownloads: true });
      const page = await context.newPage();

      // Create a simple HTML page with download link
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <body>
          <a href="data:text/plain;base64,SGVsbG8gV29ybGQ=" download="test.txt">Download Test File</a>
        </body>
        </html>
      `;

      await page.setContent(htmlContent);

      // Set up download handling
      const downloads: any[] = [];
      page.on('download', (download) => downloads.push(download));

      // Click download link
      await page.click('a[download]');

      // Wait for download to be triggered
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify download was triggered
      expect(downloads.length).toBeGreaterThan(0);

      const download = downloads[0];

      // Save the download to our test directory
      const downloadPath = path.join(downloadsPath, download.suggestedFilename());
      await download.saveAs(downloadPath);

      // Verify file was saved and has correct content
      expect(fs.existsSync(downloadPath)).toBe(true);
      expect(fs.readFileSync(downloadPath, 'utf-8')).toBe('Hello World');

      await context.close();
      await browser.close();
    } finally {
      // Cleanup
      fs.rmSync(tmpdir, { recursive: true, force: true });
    }
  });

  test('browser-use download with HTTP server', async () => {
    // Create a simple HTTP server for testing
    const server = http.createServer((req, res) => {
      if (req.url === '/download/test.txt') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Disposition': 'attachment; filename="test.txt"'
        });
        res.end('Hello BrowserUse');
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const listen = promisify(server.listen.bind(server));
    await listen(0); // Listen on random port
    const address = server.address() as any;
    const baseUrl = `http://localhost:${address.port}`;

    // Create temp directory for downloads
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-downloads-'));
    const downloadsPath = path.join(tmpdir, 'downloads');
    fs.mkdirSync(downloadsPath);

    try {
      const browserSession = new BrowserSession(
        new BrowserProfile({
          headless: true,
          downloadsPath: downloadsPath,
          userDataDir: null,
        })
      );

      await browserSession.start();

      // Create HTML page with download link pointing to HTTP server
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <body>
          <h1>Download Test</h1>
          <a id="download-link" href="${baseUrl}/download/test.txt">Download Test File</a>
        </body>
        </html>
      `;

      // Set content using CDP
      const cdpSession = await browserSession.getOrCreateCdpSession();
      await cdpSession.cdpClient.send.Page.setDocumentContent({
        params: {
          frameId: cdpSession.cdpClient.pageFrameId,
          html: htmlContent
        },
        sessionId: cdpSession.sessionId
      });

      // Wait a moment for DOM to be ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // Click the download link using events
      const state = await browserSession.getBrowserStateSummary();
      let downloadLink = null;
      for (const [idx, element] of Object.entries(state.domState.selectorMap)) {
        if (element.attributes?.id === 'download-link') {
          downloadLink = element;
          break;
        }
      }

      expect(downloadLink).not.toBeNull();
      
      const clickEvent = browserSession.eventBus.dispatch(new ClickElementEvent({ node: downloadLink! }));
      await clickEvent;

      // Wait for the DownloadsWatchdog to process the download
      try {
        const downloadEvent = await browserSession.eventBus.expect(FileDownloadedEvent, 10000);
        expect(downloadEvent).toBeInstanceOf(FileDownloadedEvent);
        console.log(`📁 Download completed: ${downloadEvent.fileName} (${downloadEvent.fileSize} bytes)`);
      } catch (error) {
        throw new Error('Download event not received within timeout');
      }

      // Verify file exists in downloads directory
      const expectedFile = path.join(downloadsPath, 'test.txt');
      expect(fs.existsSync(expectedFile)).toBe(true);
      expect(fs.readFileSync(expectedFile, 'utf-8')).toBe('Hello BrowserUse');

      // Check if browserSession sees the downloaded file
      const downloadedFiles = browserSession.downloadedFiles;
      console.log(`Downloaded files seen by browserSession: ${downloadedFiles}`);

      await browserSession.stop();
    } finally {
      // Cleanup
      server.close();
      fs.rmSync(tmpdir, { recursive: true, force: true });
    }
  }, 30000); // Increase timeout for this test
});