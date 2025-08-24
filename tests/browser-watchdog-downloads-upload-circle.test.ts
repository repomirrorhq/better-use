/**
 * Test full circle: download a file and then upload it back, verifying hash matches
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import * as http from 'http';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { BrowserStateRequestEvent, FileDownloadedEvent } from '../src/browser/events';
import { Controller } from '../src/controller/service';
import { FileSystem } from '../src/filesystem';
import { 
  ActionModel,
  GoToUrlAction,
  ClickElementAction,
  UploadFileAction
} from '../src/controller/views';

describe('Download Upload Full Circle', () => {
  let server: http.Server;
  let serverPort: number;
  let testHash: string;
  let uploadedFiles: any[] = [];
  let tmpDir: string;

  beforeEach((done) => {
    // Create test content and hash
    const testContent = Buffer.from('This is a test file for download-upload verification. Random: 12345');
    testHash = crypto.createHash('sha256').update(testContent).digest('hex');

    // Create temp directory for downloads
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-downloads-'));
    const downloadsPath = path.join(tmpDir, 'downloads');
    fs.mkdirSync(downloadsPath);

    // Reset uploaded files
    uploadedFiles = [];

    // Create HTTP server
    server = http.createServer((req, res) => {
      const url = req.url || '';

      if (url === '/download/test-file.txt') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Disposition': 'attachment; filename="test-file.txt"'
        });
        res.end(testContent);
      } else if (url === '/upload-page') {
        const uploadPageHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Upload Test Page</title>
          </head>
          <body>
            <h1>File Upload Test</h1>
            <form id="uploadForm" action="/upload" method="POST" enctype="multipart/form-data">
              <input type="file" id="fileInput" name="file" />
              <button type="submit" id="submitButton">Upload File</button>
            </form>
            <div id="result"></div>
            
            <script>
              document.getElementById('uploadForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const file = formData.get('file');
                
                if (file) {
                  // Read file content
                  const content = await file.text();
                  
                  // Calculate SHA256 hash
                  const encoder = new TextEncoder();
                  const data = encoder.encode(content);
                  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                  const hashArray = Array.from(new Uint8Array(hashBuffer));
                  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                  
                  // Display result
                  document.getElementById('result').innerHTML = \`
                    <p>File uploaded successfully!</p>
                    <p>Filename: <span id="uploadedFileName">\${file.name}</span></p>
                    <p>Size: <span id="uploadedFileSize">\${file.size}</span> bytes</p>
                    <p>SHA256: <span id="uploadedFileHash">\${hashHex}</span></p>
                  \`;
                  
                  // Send to server for verification
                  fetch('/upload', {
                    method: 'POST',
                    body: formData
                  });
                }
              });
            </script>
          </body>
          </html>
        `;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(uploadPageHtml);
      } else if (url === '/download-page') {
        const downloadPageHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Download Test Page</title>
          </head>
          <body>
            <h1>File Download Test</h1>
            <a id="downloadLink" href="/download/test-file.txt">Download Test File</a>
            <p>Original file SHA256: <span id="originalHash">${testHash}</span></p>
          </body>
          </html>
        `;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(downloadPageHtml);
      } else if (url === '/upload' && req.method === 'POST') {
        // Handle file upload
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          // Simple response for upload
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, () => {
      serverPort = (server.address() as any).port;
      done();
    });
  });

  afterEach((done) => {
    server.close(() => {
      // Clean up temp directory
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      done();
    });
  });

  test('download then upload with hash verification', async () => {
    const downloadsPath = path.join(tmpDir, 'downloads');

    // Create browser session with downloads enabled
    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        downloadsPath: downloadsPath,
        userDataDir: null,
      })
    });

    await browserSession.start();

    // Create controller and file system
    const controller = new Controller();
    const fileSystem = new FileSystem(tmpDir);

    try {
      const baseUrl = `http://localhost:${serverPort}`;

      // Step 1: Navigate to download page
      const goToDownloadAction: ActionModel = {
        goToUrl: {
          url: `${baseUrl}/download-page`,
          newTab: false
        }
      } as ActionModel;

      let result = await controller.act(goToDownloadAction, { browserSession });
      expect(result.error).toBeNull();

      await new Promise(resolve => setTimeout(resolve, 500));

      // Get browser state to find download link
      const stateEvent = browserSession.eventBus.dispatch(new BrowserStateRequestEvent());
      const stateResult = await stateEvent.eventResult();

      // Find download link
      let downloadLinkIndex: number | null = null;
      for (const [idx, element] of Object.entries(stateResult.domState.selectorMap)) {
        if (element.attributes?.id === 'downloadLink') {
          downloadLinkIndex = parseInt(idx);
          break;
        }
      }

      expect(downloadLinkIndex).not.toBeNull();

      // Step 2: Click download link and wait for download
      const clickDownloadAction: ActionModel = {
        clickElementByIndex: {
          index: downloadLinkIndex!
        }
      } as ActionModel;

      result = await controller.act(clickDownloadAction, { browserSession });
      expect(result.error).toBeNull();

      // Wait for the download event
      let downloadedFilePath: string;
      try {
        const downloadEvent = await browserSession.eventBus.expect(FileDownloadedEvent, 10000) as FileDownloadedEvent;
        downloadedFilePath = downloadEvent.path;
      } catch (error) {
        throw new Error('Download did not complete within timeout');
      }

      expect(downloadedFilePath).toBeDefined();
      expect(fs.existsSync(downloadedFilePath)).toBe(true);

      // Verify download is tracked by browser session
      expect(browserSession.downloadedFiles.includes(downloadedFilePath)).toBe(true);

      // Calculate hash of downloaded file
      const downloadedContent = fs.readFileSync(downloadedFilePath);
      const downloadedHash = crypto.createHash('sha256').update(downloadedContent).digest('hex');

      console.log(`✅ File downloaded: ${downloadedFilePath}`);
      console.log(`   Original hash: ${testHash}`);
      console.log(`   Downloaded hash: ${downloadedHash}`);
      expect(downloadedHash).toBe(testHash);

      // Step 3: Navigate to upload page in a new tab
      console.log(`\n🔄 Opening upload page in new tab: ${baseUrl}/upload-page`);

      const tabsBefore = await browserSession.getTabs();
      console.log(`📑 Tabs before navigation: ${tabsBefore.length} tabs`);

      const goToUploadAction: ActionModel = {
        goToUrl: {
          url: `${baseUrl}/upload-page`,
          newTab: true
        }
      } as ActionModel;

      result = await controller.act(goToUploadAction, { browserSession });
      expect(result.error).toBeNull();

      // Give time for the new tab to load and focus
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get all tabs
      const tabs = await browserSession.getTabs();
      console.log('\n📑 All tabs after opening upload page:');
      tabs.forEach((tab, i) => {
        console.log(`  Tab ${i}: ${tab.url} - ${tab.title}`);
      });

      // Get browser state to find file input
      const uploadStateEvent = browserSession.eventBus.dispatch(new BrowserStateRequestEvent());
      const uploadStateResult = await uploadStateEvent.eventResult();

      console.log('\n🔍 Getting DOM state:');
      console.log(`  Current page URL: ${uploadStateResult.url}`);
      console.log(`  Current page title: ${uploadStateResult.title}`);

      // Find file input
      let fileInputIndex: number | null = null;
      const inputElements: any[] = [];
      for (const [idx, element] of Object.entries(uploadStateResult.domState.selectorMap)) {
        if (element.tagName?.toLowerCase() === 'input') {
          inputElements.push([idx, element.attributes]);
          if (element.attributes?.type === 'file') {
            fileInputIndex = parseInt(idx);
            break;
          }
        }
      }

      console.log(`Found ${inputElements.length} input elements`);
      expect(fileInputIndex).not.toBeNull();

      // Step 4: Upload the downloaded file
      const uploadAction: ActionModel = {
        uploadFile: {
          index: fileInputIndex!,
          path: downloadedFilePath
        }
      } as ActionModel;

      result = await controller.act(uploadAction, { 
        browserSession,
        availableFilePaths: [],
        fileSystem
      });
      expect(result.error).toBeNull();

      // Step 4b: Click the submit button
      const submitStateEvent = browserSession.eventBus.dispatch(new BrowserStateRequestEvent());
      const submitStateResult = await submitStateEvent.eventResult();

      // Find submit button
      let submitButtonIndex: number | null = null;
      for (const [idx, element] of Object.entries(submitStateResult.domState.selectorMap)) {
        if (element.tagName?.toLowerCase() === 'button' && 
            element.attributes?.id === 'submitButton') {
          submitButtonIndex = parseInt(idx);
          break;
        }
      }

      expect(submitButtonIndex).not.toBeNull();

      // Click the submit button
      const clickSubmitAction: ActionModel = {
        clickElementByIndex: {
          index: submitButtonIndex!
        }
      } as ActionModel;

      result = await controller.act(clickSubmitAction, { browserSession });
      expect(result.error).toBeNull();

      // Wait for JavaScript to process the upload
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 5: Verify upload via JavaScript (client-side hash)
      const cdpSession = await browserSession.getOrCreateCdpSession();

      const uploadVerification = await browserSession.cdpClient.send.Runtime.evaluate({
        params: {
          expression: `
            (() => {
              const fileName = document.getElementById('uploadedFileName')?.textContent;
              const fileSize = document.getElementById('uploadedFileSize')?.textContent;
              const fileHash = document.getElementById('uploadedFileHash')?.textContent;
              
              return {
                fileName: fileName || null,
                fileSize: fileSize || null,
                fileHash: fileHash || null,
                hasResult: !!document.getElementById('result').textContent.includes('successfully')
              };
            })()
          `,
          returnByValue: true,
        },
        sessionId: cdpSession.sessionId,
      });

      const uploadInfo = uploadVerification?.result?.value || {};

      // Verify upload was successful
      expect(uploadInfo.hasResult).toBe(true);
      expect(uploadInfo.fileName).toBe('test-file.txt');
      expect(uploadInfo.fileHash).toBe(testHash);

      console.log('✅ File uploaded successfully!');
      console.log(`   Uploaded filename: ${uploadInfo.fileName}`);
      console.log(`   Uploaded hash: ${uploadInfo.fileHash}`);
      console.log(`   Hash matches original: ${uploadInfo.fileHash === testHash}`);

      console.log('\n🎉 Full circle test passed: Download → Upload with hash verification!');

    } finally {
      await browserSession.stop();
    }
  }, 30000); // 30 second timeout for this complex test
});