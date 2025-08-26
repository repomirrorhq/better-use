/**
 * Simple test to verify that sequential agents can reuse the same BrowserSession
 * without it being closed prematurely due to garbage collection.
 */

import { Agent } from '../src/agent';
import { BrowserSession, BrowserProfile } from '../src/browser';
import { createMockLLM } from './test-utils/mockLLM';
import * as http from 'http';
import express from 'express';

describe('TestSequentialAgentsSimple', () => {
	let server: http.Server;
	let app: express.Application;
	let serverUrl: string;

	beforeEach((done) => {
		app = express();
		server = app.listen(0, () => {
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

	test('sequential agents can share browser session without it being closed', async () => {
		// Set up test HTML pages
		app.get('/page1', (req, res) => {
			res.send('<html><body><h1>Page 1</h1></body></html>');
		});
		app.get('/page2', (req, res) => {
			res.send('<html><body><h1>Page 2</h1></body></html>');
		});

		// Create a browser session with keepAlive=true
		const browserSession = new BrowserSession({
			browserProfile: new BrowserProfile({
				keepAlive: true,
				headless: true,
				userDataDir: undefined, // Use temporary directory
			}),
		});
		await browserSession.start();

		// Verify browser is running
		// Get initial browser PID from localBrowserWatchdog
		const initialPid = browserSession['_localBrowserWatchdog']?.['_subprocess']?.pid || null;
		
		// Verify session is connected
		try {
			const url = await browserSession.getCurrentPageUrl();
			expect(url).toBeDefined();
		} catch (error) {
			throw new Error('Browser session is not connected');
		}

		// Agent 1: Navigate to page 1
		const agent1Actions = [
			JSON.stringify({
				thinking: "Navigating to page 1",
				evaluation_previous_goal: "Starting task",
				memory: "Need to navigate to page 1",
				next_goal: "Navigate to page 1",
				action: [
					{ go_to_url: { url: `${serverUrl}/page1`, new_tab: false } }
				]
			})
		];

		const agent1 = new Agent({
			task: 'Navigate to page 1',
			llm: createMockLLM(agent1Actions),
			browserSession: browserSession,
		});
		
		const history1 = await agent1.run({ maxSteps: 2 });
		expect(history1.history.length).toBeGreaterThanOrEqual(1);
		expect(history1.history[history1.history.length - 1].state.url).toBe(`${serverUrl}/page1`);

		// Verify browser session is still alive
		const url = await browserSession.getCurrentPageUrl();
		expect(url).toBeDefined();
		
		if (initialPid !== null) {
			// Check browser PID is still the same
			const currentPid = browserSession['_localBrowserWatchdog']?.['_subprocess']?.pid || null;
			expect(currentPid).toBe(initialPid);
		}

		// Delete agent1 and force garbage collection
		// Note: JavaScript/TypeScript doesn't have explicit garbage collection like Python
		// We'll simulate this by nullifying the reference
		(agent1 as any) = null;
		
		// Add a small delay to simulate async cleanup
		await new Promise(resolve => setTimeout(resolve, 100));

		// Verify browser is STILL alive after garbage collection
		const urlAfterGC = await browserSession.getCurrentPageUrl();
		expect(urlAfterGC).toBeDefined();
		
		if (initialPid !== null) {
			// Check browser PID is still the same
			const currentPidAfterGC = browserSession['_localBrowserWatchdog']?.['_subprocess']?.pid || null;
			expect(currentPidAfterGC).toBe(initialPid);
		}

		// Agent 2: Navigate to page 2
		const agent2Actions = [
			JSON.stringify({
				thinking: "Navigating to page 2",
				evaluation_previous_goal: "Previous agent successfully navigated",
				memory: "Browser is still open, need to go to page 2",
				next_goal: "Navigate to page 2",
				action: [
					{ go_to_url: { url: `${serverUrl}/page2`, new_tab: false } }
				]
			})
		];

		const agent2 = new Agent({
			task: 'Navigate to page 2',
			llm: createMockLLM(agent2Actions),
			browserSession: browserSession,
		});
		
		const history2 = await agent2.run({ maxSteps: 2 });
		expect(history2.history.length).toBeGreaterThanOrEqual(1);
		expect(history2.history[history2.history.length - 1].state.url).toBe(`${serverUrl}/page2`);

		// Verify browser session is still alive after second agent
		const urlAfterAgent2 = await browserSession.getCurrentPageUrl();
		expect(urlAfterAgent2).toBeDefined();
		
		if (initialPid !== null) {
			// Check browser PID is still the same
			const currentPidAfterAgent2 = browserSession['_localBrowserWatchdog']?.['_subprocess']?.pid || null;
			expect(currentPidAfterAgent2).toBe(initialPid);
		}

		// Clean up
		await browserSession.stop();
	}, 30000); // 30 second timeout

	test('multiple tabs with sequential agents', async () => {
		// Set up test pages
		app.get('/tab1', (req, res) => {
			res.send('<html><body><h1>Tab 1</h1></body></html>');
		});
		app.get('/tab2', (req, res) => {
			res.send('<html><body><h1>Tab 2</h1></body></html>');
		});

		const browserSession = new BrowserSession({
			browserProfile: new BrowserProfile({
				keepAlive: true,
				headless: true,
				userDataDir: undefined, // Use temporary directory
			}),
		});
		await browserSession.start();

		// Agent 1: Open two tabs
		const agent1Actions = [
			JSON.stringify({
				thinking: "Opening two tabs",
				evaluation_previous_goal: "Starting task",
				memory: "Need to open two tabs",
				next_goal: "Open tab 1 and tab 2",
				action: [
					{ go_to_url: { url: `${serverUrl}/tab1`, new_tab: false } },
					{ go_to_url: { url: `${serverUrl}/tab2`, new_tab: true } }
				]
			})
		];

		const agent1 = new Agent({
			task: 'Open two tabs',
			llm: createMockLLM(agent1Actions),
			browserSession: browserSession,
		});
		
		await agent1.run({ maxSteps: 2 });

		// Verify 2 tabs are open
		const tabs = await browserSession.getTabs();
		expect(tabs.length).toBe(2);
		
		// Agent1 should be on the second tab (tab2)
		expect(agent1.browserSession).toBeDefined();
		const url1 = await agent1.browserSession!.getCurrentPageUrl();
		expect(url1).toBeDefined();
		expect(url1).toContain('/tab2');

		// Clean up agent1
		(agent1 as any) = null;
		
		// Add a small delay to simulate async cleanup
		await new Promise(resolve => setTimeout(resolve, 100));

		// Agent 2: Switch to first tab
		const firstTargetId = tabs[0].targetId;
		const agent2Actions = [
			JSON.stringify({
				thinking: "Switching to first tab",
				evaluation_previous_goal: "Two tabs are open",
				memory: `Need to switch to tab ${firstTargetId.slice(-4)}`,
				next_goal: `Switch to tab ${firstTargetId.slice(-4)}`,
				action: [
					{ switch_tab: { tab_id: firstTargetId.slice(-4) } }
				]
			})
		];

		const agent2 = new Agent({
			task: 'Switch to first tab',
			llm: createMockLLM(agent2Actions),
			browserSession: browserSession,
		});
		
		await agent2.run({ maxSteps: 3 });

		// Verify agent2 is on the first tab
		expect(agent2.browserSession).toBeDefined();
		const url2 = await agent2.browserSession!.getCurrentPageUrl();
		expect(url2).toBeDefined();
		expect(url2).toContain('/tab1');

		// Verify browser is still functional
		const finalUrl = await browserSession.getCurrentPageUrl();
		expect(finalUrl).toBeDefined();
		
		// Check number of tabs
		const finalTabs = await browserSession.getTabs();
		expect(finalTabs.length).toBe(2);

		await browserSession.stop();
	}, 30000); // 30 second timeout
});