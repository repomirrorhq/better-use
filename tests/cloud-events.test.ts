/**
 * Tests for the cloud events system
 */

import {
  CloudEventsFactory,
  CloudEventsManager,
  cloudEventsManager,
  validateFileContentSize,
  validateScreenshotSize,
  UpdateAgentTaskEventSchema,
  CreateAgentOutputFileEventSchema,
  CreateAgentStepEventSchema,
  CreateAgentTaskEventSchema,
  CreateAgentSessionEventSchema
} from '../src/agent/cloudEvents';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Cloud Events System', () => {
  describe('Schema Validation', () => {
    it('should validate UpdateAgentTaskEvent', () => {
      const event = {
        task_id: 'task-123',
        stopped: false,
        paused: false,
        done_output: 'Task completed successfully',
        agent_state: { step: 5 }
      };

      const result = UpdateAgentTaskEventSchema.parse(event);
      expect(result.task_id).toBe('task-123');
      expect(result.stopped).toBe(false);
      expect(result.done_output).toBe('Task completed successfully');
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should validate CreateAgentOutputFileEvent', () => {
      const event = {
        task_id: 'task-123',
        file_name: 'screenshot.png',
        file_content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGbVGw8wAAAABJRU5ErkJggg==',
        content_type: 'image/png'
      };

      const result = CreateAgentOutputFileEventSchema.parse(event);
      expect(result.task_id).toBe('task-123');
      expect(result.file_name).toBe('screenshot.png');
      expect(result.content_type).toBe('image/png');
    });

    it('should validate CreateAgentStepEvent', () => {
      const event = {
        agent_task_id: 'task-123',
        step: 1,
        evaluation_previous_goal: 'Navigate to website',
        memory: 'Opened browser',
        next_goal: 'Click login button',
        actions: [{ type: 'click', element: 'button' }],
        url: 'https://example.com'
      };

      const result = CreateAgentStepEventSchema.parse(event);
      expect(result.agent_task_id).toBe('task-123');
      expect(result.step).toBe(1);
      expect(result.actions).toHaveLength(1);
    });

    it('should validate CreateAgentTaskEvent', () => {
      const event = {
        agent_session_id: 'session-123',
        llm_model: 'gpt-4',
        task: 'Test automation task',
        stopped: false,
        paused: false
      };

      const result = CreateAgentTaskEventSchema.parse(event);
      expect(result.agent_session_id).toBe('session-123');
      expect(result.llm_model).toBe('gpt-4');
      expect(result.task).toBe('Test automation task');
    });

    it('should validate CreateAgentSessionEvent', () => {
      const event = {
        browser_session_id: 'browser-123',
        browser_session_live_url: 'ws://localhost:9222',
        browser_session_cdp_url: 'http://localhost:9222',
        browser_state: { headless: true },
        browser_session_data: { cookies: [] }
      };

      const result = CreateAgentSessionEventSchema.parse(event);
      expect(result.browser_session_id).toBe('browser-123');
      expect(result.browser_session_live_url).toBe('ws://localhost:9222');
      expect(result.browser_state).toEqual({ headless: true });
    });
  });

  describe('File Content Validation', () => {
    it('should validate normal file content size', () => {
      const smallBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGbVGw8wAAAABJRU5ErkJggg==';
      expect(() => validateFileContentSize(smallBase64)).not.toThrow();
    });

    it('should handle undefined content', () => {
      expect(validateFileContentSize(undefined)).toBeUndefined();
    });

    it('should remove data URL prefix before size check', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGbVGw8wAAAABJRU5ErkJggg==';
      expect(() => validateFileContentSize(dataUrl)).not.toThrow();
    });

    it('should throw error for oversized content', () => {
      // Create a base64 string that would decode to over 50MB
      const oversizedBase64 = 'A'.repeat(70000000); // ~70MB when base64 encoded
      expect(() => validateFileContentSize(oversizedBase64)).toThrow(/exceeds maximum size/);
    });
  });

  describe('Screenshot Size Validation', () => {
    it('should validate normal screenshot URLs', () => {
      const httpUrl = 'https://example.com/screenshot.png';
      expect(validateScreenshotSize(httpUrl)).toBe(httpUrl);
    });

    it('should validate data URLs', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGbVGw8wAAAABJRU5ErkJggg==';
      expect(() => validateScreenshotSize(dataUrl)).not.toThrow();
    });

    it('should handle undefined content', () => {
      expect(validateScreenshotSize(undefined)).toBeUndefined();
    });
  });

  describe('CloudEventsFactory', () => {
    const mockAgent = {
      cloud_sync: {
        auth_client: {
          device_id: 'device-123'
        }
      },
      history: {
        final_result: () => 'Task completed',
        is_done: () => true
      },
      state: {
        stopped: false,
        paused: false,
        n_steps: 3,
        model_dump: () => ({ step: 3, status: 'active' })
      },
      task_id: 'task-456',
      session_id: 'session-789',
      llm: {
        model_name: 'gpt-4'
      },
      _task_start_time: Date.now() / 1000,
      browser_profile: {
        viewport: { width: 1920, height: 1080 },
        headless: false,
        allowed_domains: ['example.com']
      }
    };

    it('should create UpdateAgentTaskEvent', () => {
      const event = CloudEventsFactory.createUpdateAgentTaskEvent(
        mockAgent,
        'task-123',
        { user_comment: 'Test comment' }
      );

      expect(event.task_id).toBe('task-123');
      expect(event.device_id).toBe('device-123');
      expect(event.done_output).toBe('Task completed');
      expect(event.user_comment).toBe('Test comment');
    });

    it('should create CreateAgentStepEvent', () => {
      const modelOutput = {
        current_state: {
          evaluation_previous_goal: 'Previous goal',
          memory: 'Memory state',
          next_goal: 'Next goal'
        }
      };

      const actions = [
        { type: 'click', element: 'button' }
      ];

      const browserStateSummary = {
        url: 'https://example.com',
        screenshot: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGbVGw8wAAAABJRU5ErkJggg=='
      };

      const event = CloudEventsFactory.createAgentStepEvent(
        mockAgent,
        modelOutput,
        actions,
        browserStateSummary
      );

      expect(event.agent_task_id).toBe('task-456');
      expect(event.step).toBe(3);
      expect(event.evaluation_previous_goal).toBe('Previous goal');
      expect(event.actions).toHaveLength(1);
      expect(event.url).toBe('https://example.com');
      expect(event.screenshot_url).toContain('data:image/png;base64,');
    });

    it('should create CreateAgentTaskEvent', () => {
      const event = CloudEventsFactory.createAgentTaskEvent(
        mockAgent,
        'Test automation task'
      );

      expect(event.agent_session_id).toBe('session-789');
      expect(event.task).toBe('Test automation task');
      expect(event.llm_model).toBe('gpt-4');
      expect(event.device_id).toBe('device-123');
    });

    it('should create CreateAgentSessionEvent', () => {
      const mockBrowserSession = {
        id: 'browser-session-123'
      };

      const event = CloudEventsFactory.createAgentSessionEvent(
        mockAgent,
        mockBrowserSession
      );

      expect(event.browser_session_id).toBe('browser-session-123');
      expect(event.device_id).toBe('device-123');
      expect(event.browser_state.viewport).toEqual({ width: 1920, height: 1080 });
      expect(event.browser_session_data?.allowed_domains).toContain('example.com');
    });

    it('should create CreateAgentOutputFileEvent from file', async () => {
      // Create a temporary test file
      const tempDir = os.tmpdir();
      const testFile = path.join(tempDir, 'test.gif');
      fs.writeFileSync(testFile, 'GIF89a test content');

      try {
        const event = await CloudEventsFactory.createAgentOutputFileEvent(
          mockAgent,
          'task-123',
          testFile
        );

        expect(event.task_id).toBe('task-123');
        expect(event.file_name).toBe('test.gif');
        expect(event.content_type).toBe('image/gif');
        expect(event.file_content).toBeDefined();
        expect(event.device_id).toBe('device-123');
      } finally {
        // Cleanup
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
      }
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        CloudEventsFactory.createAgentOutputFileEvent(
          mockAgent,
          'task-123',
          '/non/existent/file.gif'
        )
      ).rejects.toThrow('File not found');
    });
  });

  describe('CloudEventsManager', () => {
    let manager: CloudEventsManager;

    beforeEach(() => {
      manager = new CloudEventsManager();
    });

    it('should emit and store events', () => {
      const event = {
        id: 'event-123',
        user_id: 'user-456',
        device_id: 'device-789',
        created_at: new Date()
      };

      manager.emit('test_event', event);

      const events = manager.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });

    it('should handle event listeners', () => {
      const listener = jest.fn();
      manager.on('test_event', listener);

      const event = {
        id: 'event-123',
        user_id: 'user-456',
        device_id: 'device-789',
        created_at: new Date()
      };

      manager.emit('test_event', event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should remove event listeners', () => {
      const listener = jest.fn();
      manager.on('test_event', listener);
      manager.off('test_event', listener);

      const event = {
        id: 'event-123',
        user_id: 'user-456',
        device_id: 'device-789',
        created_at: new Date()
      };

      manager.emit('test_event', event);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should clear events', () => {
      const event = {
        id: 'event-123',
        user_id: 'user-456',
        device_id: 'device-789',
        created_at: new Date()
      };

      manager.emit('test_event', event);
      expect(manager.getEvents()).toHaveLength(1);

      manager.clearEvents();
      expect(manager.getEvents()).toHaveLength(0);
    });

    it('should export events as JSON', () => {
      const event = {
        id: 'event-123',
        user_id: 'user-456',
        device_id: null,
        created_at: new Date()
      };

      manager.emit('test_event', event);

      const exported = manager.exportEvents();
      const parsed = JSON.parse(exported);
      
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('event-123');
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      manager.on('test_event', errorListener);
      manager.on('test_event', normalListener);

      // Mock console.error to avoid noise in test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const event = {
        id: 'event-123',
        user_id: 'user-456',
        device_id: 'device-789',
        created_at: new Date()
      };

      manager.emit('test_event', event);

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in event listener'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Default Manager Instance', () => {
    it('should provide a default manager instance', () => {
      expect(cloudEventsManager).toBeInstanceOf(CloudEventsManager);
      
      // Test that it works
      const event = {
        id: 'test-event',
        user_id: 'test-user',
        device_id: null,
        created_at: new Date()
      };

      cloudEventsManager.clearEvents(); // Clear any previous state
      cloudEventsManager.emit('test', event);
      
      expect(cloudEventsManager.getEvents()).toHaveLength(1);
      cloudEventsManager.clearEvents(); // Clean up
    });
  });
});