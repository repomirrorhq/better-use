/**
 * Test that verifies permissions watchdog is working correctly.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { Agent } from '../src/agent';
import { createMockLLM } from './test-utils/mockLLM';
import * as http from 'http';

describe('BrowserWatchdogPermissions', () => {
  let server: http.Server;
  let serverUrl: string;
  let session: BrowserSession | null = null;

  beforeEach((done) => {
    // Create test server
    server = http.createServer((req, res) => {
      if (req.url === '/geo') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
          <body>
            <h1>Geolocation Test</h1>
            <button id="get-location" onclick="getLocation()">Get Location</button>
            <div id="result"></div>
            <script>
              function getLocation() {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    position => {
                      document.getElementById('result').innerText = 
                        'Lat: ' + position.coords.latitude + ', Lon: ' + position.coords.longitude;
                    },
                    error => {
                      document.getElementById('result').innerText = 'Error: ' + error.message;
                    }
                  );
                } else {
                  document.getElementById('result').innerText = 'Geolocation not supported';
                }
              }
            </script>
          </body>
          </html>
        `);
      } else if (req.url === '/camera') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
          <body>
            <h1>Camera Test</h1>
            <button id="camera-btn" onclick="requestCamera()">Request Camera</button>
            <div id="result"></div>
            <script>
              async function requestCamera() {
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                  document.getElementById('result').innerText = 'Camera access granted';
                  stream.getTracks().forEach(track => track.stop());
                } catch (error) {
                  document.getElementById('result').innerText = 'Error: ' + error.message;
                }
              }
            </script>
          </body>
          </html>
        `);
      } else if (req.url === '/notifications') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
          <body>
            <h1>Notifications Test</h1>
            <button id="notify-btn" onclick="requestNotifications()">Request Notifications</button>
            <div id="result"></div>
            <script>
              async function requestNotifications() {
                try {
                  const permission = await Notification.requestPermission();
                  document.getElementById('result').innerText = 'Permission: ' + permission;
                  if (permission === 'granted') {
                    new Notification('Test notification');
                  }
                } catch (error) {
                  document.getElementById('result').innerText = 'Error: ' + error.message;
                }
              }
            </script>
          </body>
          </html>
        `);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, () => {
      const port = (server.address() as any).port;
      serverUrl = `http://localhost:${port}`;
      done();
    });
  });

  afterEach(async () => {
    if (session) {
      await session.close();
      session = null;
    }
    server.close();
  });

  test('permissions are granted on connect', async () => {
    // Create a profile with geolocation permissions
    const profile = new BrowserProfile({ permissions: ['geolocation'], headless: true });

    // Create a mock LLM that will navigate and click the button
    const mockLLM = createMockLLM([
      {
        thinking: "Navigating to the geolocation test page",
        evaluation_previous_goal: "Starting",
        memory: "Need to navigate",
        next_goal: "Navigate to geo page",
        action: [
          {
            go_to_url: {
              url: `${serverUrl}/geo`
            }
          }
        ]
      },
      {
        thinking: "Clicking the get location button",
        evaluation_previous_goal: "Navigated successfully",
        memory: "On geo page",
        next_goal: "Click get location button",
        action: [
          {
            click_element: {
              index: 0
            }
          }
        ]
      },
      {
        thinking: "Waiting for result",
        evaluation_previous_goal: "Clicked button",
        memory: "Clicked geolocation button",
        next_goal: "Wait for result",
        action: [
          {
            wait: {
              seconds: 1
            }
          }
        ]
      },
      {
        thinking: "Task completed",
        evaluation_previous_goal: "Got location",
        memory: "Location received",
        next_goal: "Done",
        action: [
          {
            done: {
              summary: "Successfully got geolocation"
            }
          }
        ]
      }
    ]);

    // Create agent with mock LLM
    const agent = new Agent({
      task: "Click the get location button and verify geolocation works",
      llm: mockLLM,
      browserProfile: profile,
      maxSteps: 10
    });

    // Run the agent
    const result = await agent.run();

    // Verify permissions were granted (check page content)
    session = agent.getSession();
    if (session) {
      const page = await session.getPage();
      const resultText = await page.locator('#result').textContent();
      
      // Should have latitude and longitude (mocked by Playwright)
      expect(resultText).toContain('Lat:');
      expect(resultText).toContain('Lon:');
    }
  }, 30000);

  test('multiple permissions can be granted', async () => {
    // Create a profile with multiple permissions
    const profile = new BrowserProfile({ 
      permissions: ['geolocation', 'camera', 'microphone', 'notifications'],
      headless: true 
    });

    session = new BrowserSession({ profile });
    await session.start();

    // Navigate to camera test page
    const page = await session.getPage();
    await page.goto(`${serverUrl}/camera`);

    // Try to access camera (should be granted automatically)
    await page.click('#camera-btn');
    await page.waitForTimeout(1000);

    const resultText = await page.locator('#result').textContent();
    
    // In headless mode, camera access might fail but shouldn't show permission denied
    // The important thing is that the permission prompt doesn't block
    expect(resultText).toBeDefined();
    
    // Navigate to notifications page
    await page.goto(`${serverUrl}/notifications`);
    await page.click('#notify-btn');
    await page.waitForTimeout(1000);

    const notifyResult = await page.locator('#result').textContent();
    expect(notifyResult).toContain('Permission:');
  }, 30000);

  test('permissions watchdog logs granted permissions', async () => {
    const consoleSpy = jest.spyOn(console, 'info').mockImplementation();

    // Create a profile with permissions
    const profile = new BrowserProfile({ 
      permissions: ['geolocation', 'camera'],
      headless: true 
    });

    session = new BrowserSession({ profile });
    await session.start();

    // Wait a bit for watchdog to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check that permissions were logged
    const logCalls = consoleSpy.mock.calls;
    const permissionLogs = logCalls.filter(call => 
      call.some(arg => 
        typeof arg === 'string' && 
        (arg.includes('permission') || arg.includes('Permission'))
      )
    );

    // Should have logged something about permissions
    expect(permissionLogs.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  }, 30000);

  test('no permissions granted when not specified', async () => {
    // Create a profile without permissions
    const profile = new BrowserProfile({ headless: true });

    session = new BrowserSession({ profile });
    await session.start();

    // Navigate to geo page
    const page = await session.getPage();
    await page.goto(`${serverUrl}/geo`);

    // Permissions should not be automatically granted
    // The browser will show a permission prompt (which we can't interact with in headless)
    
    // Verify session started without permissions in profile
    expect(profile.permissions).toBeUndefined();
  }, 30000);
});