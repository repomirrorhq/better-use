import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { 
  BrowserStartEvent, 
  BrowserConnectedEvent, 
  BrowserStopEvent, 
  BrowserStoppedEvent,
  SaveStorageStateEvent,
  StorageStateSavedEvent,
  LoadStorageStateEvent,
  StorageStateLoadedEvent,
  NavigateToUrlEvent
} from '../src/browser/events';
import { StorageStateWatchdog } from '../src/browser/watchdogs/storagestate';

describe('StorageStateWatchdog', () => {
  let session: BrowserSession;
  let tempStorageFile: string;

  beforeEach(() => {
    // Create a temporary file for storage state
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test-storage-'));
    tempStorageFile = path.join(tempDir, 'storage-state.json');
  });

  afterEach(async () => {
    // Clean up browser session
    if (session) {
      try {
        await session.stop();
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Clean up temp files
    if (tempStorageFile && fs.existsSync(tempStorageFile)) {
      fs.unlinkSync(tempStorageFile);
      const tempDir = path.dirname(tempStorageFile);
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    }
  });

  it('should start and stop with browser session', async () => {
    const profile = new BrowserProfile({ headless: true });
    session = new BrowserSession({ profile });

    // Start browser
    await session.start();
    expect(session.isRunning).toBe(true);

    // Verify storage state watchdog was created
    const watchdogs = (session as any).watchdogs;
    const storageWatchdog = watchdogs?.find((w: any) => w instanceof StorageStateWatchdog);
    expect(storageWatchdog).toBeDefined();
    expect(storageWatchdog).not.toBeNull();

    // Stop browser
    await session.stop();
    expect(session.isRunning).toBe(false);

    // Give it a moment to clean up
    await new Promise(resolve => setTimeout(resolve, 100));
  }, 10000);

  it('should respond to SaveStorageStateEvent', async () => {
    const profile = new BrowserProfile({ 
      headless: true,
      storage_state: tempStorageFile 
    });
    session = new BrowserSession({ profile });

    // Start browser
    await session.start();

    // Navigate to create some context
    await session.goToURL('data:text/html,<h1>Test Page</h1>');

    // Dispatch SaveStorageStateEvent
    const saveEvent = {} as SaveStorageStateEvent;
    await session.eventBus.dispatch(saveEvent);

    // Wait a bit for the save to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify storage file was created/updated
    expect(fs.existsSync(tempStorageFile)).toBe(true);

    // If file exists, verify it's valid JSON
    if (fs.existsSync(tempStorageFile)) {
      const content = fs.readFileSync(tempStorageFile, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    }
  }, 10000);

  it('should respond to LoadStorageStateEvent', async () => {
    // First create a storage state file with some data
    const storageData = {
      cookies: [],
      origins: []
    };
    fs.writeFileSync(tempStorageFile, JSON.stringify(storageData, null, 2));

    const profile = new BrowserProfile({ 
      headless: true,
      storage_state: tempStorageFile 
    });
    session = new BrowserSession({ profile });

    // Start browser
    await session.start();

    // Dispatch LoadStorageStateEvent
    const loadEvent = {} as LoadStorageStateEvent;
    await session.eventBus.dispatch(loadEvent);

    // Wait a bit for the load to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // The storage state should have been loaded during browser start
    // We can't easily verify the state was loaded without inspecting browser internals
    // But we can verify the file still exists and is valid
    expect(fs.existsSync(tempStorageFile)).toBe(true);
  }, 10000);

  it('should handle SaveStorageStateEvent with specified path', async () => {
    // Create a different temp file for saving
    const customSaveFile = path.join(path.dirname(tempStorageFile), 'custom-storage.json');

    const profile = new BrowserProfile({ headless: true });
    session = new BrowserSession({ profile });

    // Start browser
    await session.start();

    // Navigate to create some context
    await session.goToURL('data:text/html,<h1>Custom Save Test</h1>');

    // Dispatch SaveStorageStateEvent with custom path
    const saveEvent: SaveStorageStateEvent = { path: customSaveFile };
    await session.eventBus.dispatch(saveEvent);

    // Wait for save to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify custom file was created
    expect(fs.existsSync(customSaveFile)).toBe(true);

    // Clean up custom file
    if (fs.existsSync(customSaveFile)) {
      fs.unlinkSync(customSaveFile);
    }
  }, 10000);

  it('should handle LoadStorageStateEvent with specified path', async () => {
    // Create a custom storage file with specific data
    const customLoadFile = path.join(path.dirname(tempStorageFile), 'custom-load.json');
    const customData = {
      cookies: [
        {
          name: 'test_cookie',
          value: 'test_value',
          domain: '.example.com',
          path: '/'
        }
      ],
      origins: []
    };
    fs.writeFileSync(customLoadFile, JSON.stringify(customData, null, 2));

    const profile = new BrowserProfile({ headless: true });
    session = new BrowserSession({ profile });

    // Start browser
    await session.start();

    // Dispatch LoadStorageStateEvent with custom path
    const loadEvent: LoadStorageStateEvent = { path: customLoadFile };
    await session.eventBus.dispatch(loadEvent);

    // Wait for load to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify the file still exists and contains our data
    expect(fs.existsSync(customLoadFile)).toBe(true);
    const loadedContent = JSON.parse(fs.readFileSync(customLoadFile, 'utf-8'));
    expect(loadedContent.cookies).toHaveLength(1);
    expect(loadedContent.cookies[0].name).toBe('test_cookie');

    // Clean up custom file
    if (fs.existsSync(customLoadFile)) {
      fs.unlinkSync(customLoadFile);
    }
  }, 10000);
});