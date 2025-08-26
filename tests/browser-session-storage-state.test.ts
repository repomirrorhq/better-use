import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { SaveStorageStateEvent } from '../src/browser/events';
import { HTTPServer } from './test-utils/http-server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('BrowserSession Storage State', () => {
  let testServer: any;
  let tempDir: string;

  beforeAll(async () => {
    testServer = await getTestServer();
  });

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    await testServer.stop();
  });

  test('should save and load storage state with cookies', async () => {
    const storageStatePath = path.join(tempDir, 'storage-state.json');
    
    // Set up test server endpoint that sets a cookie
    testServer.expect_request('/set-cookie').respond_with_data(
      '<html><body>Cookie set!</body></html>',
      200,
      {
        'Set-Cookie': 'test_cookie=test_value; Path=/; HttpOnly',
        'Content-Type': 'text/html'
      }
    );

    testServer.expect_request('/check-cookie').respond_with_handler((request: any) => {
      const cookies = request.headers.get('Cookie');
      const hasCookie = cookies && cookies.includes('test_cookie=test_value');
      return {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<html><body>Cookie: ${hasCookie ? 'Present' : 'Missing'}</body></html>`
      };
    });

    // First session: Set a cookie and save storage state
    const profile1 = new BrowserProfile({
      headless: true,
      keep_alive: false,
      storage_state_path: undefined
    });

    const session1 = new BrowserSession({ profile: profile1 });
    
    try {
      await session1.start();
      
      // Navigate to set cookie
      const page = await session1.getActivePage();
      await page.goto(testServer.url_for('/set-cookie'));
      await page.waitForLoadState('networkidle');
      
      // Save storage state using event
      const saveEvent = new SaveStorageStateEvent({
        path: storageStatePath
      });
      await session1.executeEvent(saveEvent);
      
      // Verify file was created
      expect(fs.existsSync(storageStatePath)).toBe(true);
      
      const storageState = JSON.parse(fs.readFileSync(storageStatePath, 'utf8'));
      expect(storageState.cookies).toBeDefined();
      expect(storageState.cookies.length).toBeGreaterThan(0);
      
      // Find our test cookie
      const testCookie = storageState.cookies.find((c: any) => c.name === 'test_cookie');
      expect(testCookie).toBeDefined();
      expect(testCookie.value).toBe('test_value');
      
    } finally {
      await session1.stop();
    }

    // Second session: Load storage state and verify cookie is present
    const profile2 = new BrowserProfile({
      headless: true,
      keep_alive: false,
      storage_state_path: storageStatePath
    });

    const session2 = new BrowserSession({ profile: profile2 });
    
    try {
      await session2.start();
      
      // Navigate to check cookie endpoint
      const page = await session2.getActivePage();
      await page.goto(testServer.url_for('/check-cookie'));
      await page.waitForLoadState('networkidle');
      
      // Verify cookie is present
      const content = await page.content();
      expect(content).toContain('Cookie: Present');
      
    } finally {
      await session2.stop();
    }
  });

  test('should save and load storage state with localStorage', async () => {
    const storageStatePath = path.join(tempDir, 'storage-state.json');
    
    // Set up test server endpoint with localStorage
    testServer.expect_request('/set-storage').respond_with_data(
      `<html>
      <body>
        <script>
          localStorage.setItem('testKey', 'testValue');
          localStorage.setItem('anotherKey', 'anotherValue');
        </script>
        <p>Storage set!</p>
      </body>
      </html>`,
      200,
      { 'Content-Type': 'text/html' }
    );

    testServer.expect_request('/check-storage').respond_with_data(
      `<html>
      <body>
        <p id="result"></p>
        <script>
          const testValue = localStorage.getItem('testKey');
          const anotherValue = localStorage.getItem('anotherKey');
          document.getElementById('result').textContent = 
            'testKey=' + (testValue || 'missing') + 
            ', anotherKey=' + (anotherValue || 'missing');
        </script>
      </body>
      </html>`,
      200,
      { 'Content-Type': 'text/html' }
    );

    // First session: Set localStorage and save storage state
    const profile1 = new BrowserProfile({
      headless: true,
      keep_alive: false
    });

    const session1 = new BrowserSession({ profile: profile1 });
    
    try {
      await session1.start();
      
      // Navigate and set localStorage
      const page = await session1.getActivePage();
      await page.goto(testServer.url_for('/set-storage'));
      await page.waitForLoadState('networkidle');
      
      // Save storage state
      const saveEvent = new SaveStorageStateEvent({
        path: storageStatePath
      });
      await session1.executeEvent(saveEvent);
      
      // Verify file was created with origins
      const storageState = JSON.parse(fs.readFileSync(storageStatePath, 'utf8'));
      expect(storageState.origins).toBeDefined();
      expect(storageState.origins.length).toBeGreaterThan(0);
      
    } finally {
      await session1.stop();
    }

    // Second session: Load storage state and verify localStorage
    const profile2 = new BrowserProfile({
      headless: true,
      keep_alive: false,
      storage_state_path: storageStatePath
    });

    const session2 = new BrowserSession({ profile: profile2 });
    
    try {
      await session2.start();
      
      // Navigate to check storage endpoint
      const page = await session2.getActivePage();
      await page.goto(testServer.url_for('/check-storage'));
      await page.waitForLoadState('networkidle');
      
      // Check if localStorage values are present
      const result = await page.textContent('#result');
      expect(result).toContain('testKey=testValue');
      expect(result).toContain('anotherKey=anotherValue');
      
    } finally {
      await session2.stop();
    }
  });

  test('should handle non-existent storage state file gracefully', async () => {
    const nonExistentPath = path.join(tempDir, 'non-existent.json');
    
    const profile = new BrowserProfile({
      headless: true,
      keep_alive: false,
      storage_state_path: nonExistentPath
    });

    const session = new BrowserSession({ profile: profile });
    
    // Should start without error even if file doesn't exist
    await expect(session.start()).resolves.not.toThrow();
    
    try {
      // Verify browser is functional
      const page = await session.getActivePage();
      expect(page).toBeDefined();
      
      // Navigate to a simple page
      testServer.expect_request('/simple').respond_with_data(
        '<html><body>Simple page</body></html>',
        200,
        { 'Content-Type': 'text/html' }
      );
      
      await page.goto(testServer.url_for('/simple'));
      const content = await page.content();
      expect(content).toContain('Simple page');
      
    } finally {
      await session.stop();
    }
  });
});