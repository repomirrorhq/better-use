/**
 * Test telemetry functionality
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TelemetryService } from '../src/telemetry/service';
import { TelemetryEvent } from '../src/telemetry/types';

// Mock environment variables
const originalEnv = process.env;

describe('TelemetryService', () => {
  let telemetryService: TelemetryService;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telemetry-test-'));
    
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    // Cleanup
    if (telemetryService) {
      await telemetryService.shutdown();
    }
    
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
    
    // Restore environment
    process.env = originalEnv;
  });

  describe('Configuration', () => {
    it('should disable telemetry when BROWSER_USE_TELEMETRY is false', () => {
      process.env.BROWSER_USE_TELEMETRY = 'false';
      
      telemetryService = new TelemetryService();
      
      expect(telemetryService.isEnabled()).toBe(false);
    });

    it('should enable telemetry by default', () => {
      delete process.env.BROWSER_USE_TELEMETRY;
      
      telemetryService = new TelemetryService();
      
      expect(telemetryService.isEnabled()).toBe(true);
    });

    it('should enable debug mode when BROWSER_USE_DEBUG is true', () => {
      process.env.BROWSER_USE_DEBUG = 'true';
      
      telemetryService = new TelemetryService();
      
      expect(telemetryService.isDebugEnabled()).toBe(true);
    });

    it('should use custom endpoint from environment', () => {
      process.env.BROWSER_USE_TELEMETRY_ENDPOINT = 'https://custom.telemetry.endpoint';
      
      telemetryService = new TelemetryService();
      
      expect(telemetryService.getEndpoint()).toBe('https://custom.telemetry.endpoint');
    });
  });

  describe('Event Capture', () => {
    it('should capture events when enabled', async () => {
      telemetryService = new TelemetryService({ enabled: true });
      
      const event: TelemetryEvent = {
        name: 'test_event',
        properties: {
          action: 'test',
          value: 123
        }
      };
      
      let capturedEvent: TelemetryEvent | null = null;
      telemetryService.on('event', (e) => {
        capturedEvent = e;
      });
      
      await telemetryService.capture(event);
      
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent?.name).toBe('test_event');
      expect(capturedEvent?.properties?.action).toBe('test');
    });

    it('should not capture events when disabled', async () => {
      telemetryService = new TelemetryService({ enabled: false });
      
      const event: TelemetryEvent = {
        name: 'test_event',
        properties: {}
      };
      
      let capturedEvent: TelemetryEvent | null = null;
      telemetryService.on('event', (e) => {
        capturedEvent = e;
      });
      
      await telemetryService.capture(event);
      
      expect(capturedEvent).toBeNull();
    });

    it('should add default properties to events', async () => {
      telemetryService = new TelemetryService({ enabled: true });
      
      const event: TelemetryEvent = {
        name: 'test_event',
        properties: {
          custom: 'property'
        }
      };
      
      let capturedEvent: TelemetryEvent | null = null;
      telemetryService.on('event', (e) => {
        capturedEvent = e;
      });
      
      await telemetryService.capture(event);
      
      expect(capturedEvent?.sessionId).toBeDefined();
      expect(capturedEvent?.userId).toBeDefined();
      expect(capturedEvent?.timestamp).toBeDefined();
      expect(capturedEvent?.properties?.custom).toBe('property');
    });
  });

  describe('Event Queue and Flushing', () => {
    it('should queue events and flush them', async () => {
      telemetryService = new TelemetryService({ 
        enabled: true,
        maxBatchSize: 5
      });
      
      let flushedEvents: TelemetryEvent[] = [];
      telemetryService.on('flush', (events) => {
        flushedEvents = events;
      });
      
      // Add 4 events (below batch size)
      for (let i = 0; i < 4; i++) {
        await telemetryService.capture({
          name: `event_${i}`,
          properties: { index: i }
        });
      }
      
      // Should not have flushed yet
      expect(flushedEvents.length).toBe(0);
      
      // Add 5th event to trigger flush
      await telemetryService.capture({
        name: 'event_4',
        properties: { index: 4 }
      });
      
      // Should have flushed all 5 events
      expect(flushedEvents.length).toBe(5);
      expect(flushedEvents[0].name).toBe('event_0');
      expect(flushedEvents[4].name).toBe('event_4');
    });

    it('should manually flush pending events', async () => {
      telemetryService = new TelemetryService({ 
        enabled: true,
        maxBatchSize: 100
      });
      
      let flushedEvents: TelemetryEvent[] = [];
      telemetryService.on('flush', (events) => {
        flushedEvents = events;
      });
      
      // Add 3 events
      for (let i = 0; i < 3; i++) {
        await telemetryService.capture({
          name: `event_${i}`,
          properties: { index: i }
        });
      }
      
      // Manually flush
      await telemetryService.flush();
      
      expect(flushedEvents.length).toBe(3);
    });

    it('should not flush when disabled', async () => {
      telemetryService = new TelemetryService({ 
        enabled: false
      });
      
      let flushedEvents: TelemetryEvent[] | null = null;
      telemetryService.on('flush', (events) => {
        flushedEvents = events;
      });
      
      // Add events
      await telemetryService.capture({
        name: 'test_event',
        properties: {}
      });
      
      // Try to flush
      await telemetryService.flush();
      
      // Should not have flushed
      expect(flushedEvents).toBeNull();
    });
  });

  describe('User ID Persistence', () => {
    it('should generate and persist user ID', async () => {
      const userIdPath = path.join(tempDir, 'device_id');
      
      telemetryService = new TelemetryService({ 
        enabled: true,
        userIdPath
      });
      
      const userId1 = await telemetryService.getUserId();
      
      // Should generate a valid UUID
      expect(userId1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      
      // Should persist to file
      const savedId = await fs.readFile(userIdPath, 'utf-8');
      expect(savedId).toBe(userId1);
      
      // Create new instance - should load same ID
      const telemetryService2 = new TelemetryService({ 
        enabled: true,
        userIdPath
      });
      
      const userId2 = await telemetryService2.getUserId();
      expect(userId2).toBe(userId1);
      
      await telemetryService2.shutdown();
    });

    it('should handle missing user ID file gracefully', async () => {
      const userIdPath = path.join(tempDir, 'nonexistent', 'device_id');
      
      telemetryService = new TelemetryService({ 
        enabled: true,
        userIdPath
      });
      
      const userId = await telemetryService.getUserId();
      
      // Should generate a new ID
      expect(userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      
      // Directory and file should be created
      const fileExists = await fs.access(userIdPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe('CLI Telemetry Event', () => {
    it('should create CLI event with correct structure', () => {
      const event: TelemetryEvent = {
        name: 'cli_event',
        properties: {
          version: '1.0.0',
          action: 'start',
          mode: 'interactive',
          model: 'gpt-4',
          model_provider: 'OpenAI',
          duration_seconds: 10.5,
          error_message: null
        }
      };
      
      expect(event.name).toBe('cli_event');
      expect(event.properties?.version).toBe('1.0.0');
      expect(event.properties?.action).toBe('start');
      expect(event.properties?.mode).toBe('interactive');
      expect(event.properties?.model).toBe('gpt-4');
      expect(event.properties?.model_provider).toBe('OpenAI');
      expect(event.properties?.duration_seconds).toBe(10.5);
      expect(event.properties?.error_message).toBeNull();
    });
  });

  describe('MCP Client Telemetry Event', () => {
    it('should create MCP client event with correct structure', () => {
      const event: TelemetryEvent = {
        name: 'mcp_client_event',
        properties: {
          server_name: 'test-server',
          command: 'npx',
          tools_discovered: 5,
          version: '1.0.0',
          action: 'connect',
          tool_name: 'browser_navigate',
          duration_seconds: 2.5,
          error_message: null
        }
      };
      
      expect(event.name).toBe('mcp_client_event');
      expect(event.properties?.server_name).toBe('test-server');
      expect(event.properties?.command).toBe('npx');
      expect(event.properties?.tools_discovered).toBe(5);
      expect(event.properties?.version).toBe('1.0.0');
      expect(event.properties?.action).toBe('connect');
      expect(event.properties?.tool_name).toBe('browser_navigate');
      expect(event.properties?.duration_seconds).toBe(2.5);
      expect(event.properties?.error_message).toBeNull();
    });
  });

  describe('MCP Server Telemetry Event', () => {
    it('should create MCP server event with correct structure', () => {
      const event: TelemetryEvent = {
        name: 'mcp_server_event',
        properties: {
          version: '1.0.0',
          action: 'start',
          tool_name: 'browser_click',
          duration_seconds: 1.2,
          error_message: 'Test error',
          parent_process_cmdline: 'node dist/mcp/server.js'
        }
      };
      
      expect(event.name).toBe('mcp_server_event');
      expect(event.properties?.version).toBe('1.0.0');
      expect(event.properties?.action).toBe('start');
      expect(event.properties?.tool_name).toBe('browser_click');
      expect(event.properties?.duration_seconds).toBe(1.2);
      expect(event.properties?.error_message).toBe('Test error');
      expect(event.properties?.parent_process_cmdline).toBe('node dist/mcp/server.js');
    });
  });

  describe('Error Handling', () => {
    it('should emit error event on flush failure', async () => {
      telemetryService = new TelemetryService({ 
        enabled: true,
        endpoint: 'http://invalid.endpoint'
      });
      
      // Override sendEvents to simulate failure
      (telemetryService as any).sendEvents = async () => {
        throw new Error('Network error');
      };
      
      let errorEmitted = false;
      telemetryService.on('error', () => {
        errorEmitted = true;
      });
      
      // Capture an event
      await telemetryService.capture({
        name: 'test_event',
        properties: {}
      });
      
      // Try to flush
      await telemetryService.flush();
      
      // Should have emitted error
      expect(errorEmitted).toBe(true);
      
      // Events should be kept in queue for retry
      expect((telemetryService as any).eventQueue.length).toBe(1);
    });
  });

  describe('Shutdown', () => {
    it('should flush events and stop timer on shutdown', async () => {
      telemetryService = new TelemetryService({ 
        enabled: true,
        flushInterval: 1000
      });
      
      let flushedEvents: TelemetryEvent[] = [];
      telemetryService.on('flush', (events) => {
        flushedEvents = events;
      });
      
      // Add some events
      await telemetryService.capture({
        name: 'test_event',
        properties: {}
      });
      
      // Shutdown
      await telemetryService.shutdown();
      
      // Should have flushed
      expect(flushedEvents.length).toBe(1);
      
      // Timer should be cleared
      expect((telemetryService as any).flushTimer).toBeNull();
    });
  });
});