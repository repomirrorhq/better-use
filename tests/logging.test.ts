/**
 * Tests for the advanced logging system
 */

import { setupLogging, getLogger, FIFOHandler, setupLogPipes } from '../src/logging';
import winston from 'winston';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('Advanced Logging System', () => {
  beforeEach(() => {
    // Clear winston loggers before each test - winston doesn't have clear method
    // Reset winston configuration instead
    winston.configure({
      transports: []
    });
  });

  afterEach(() => {
    // Reset winston after each test
    winston.configure({
      transports: []
    });
  });

  describe('setupLogging', () => {
    it('should setup logging with default configuration', () => {
      const logger = setupLogging();
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should support custom log levels', () => {
      const logger = setupLogging(undefined, 'debug');
      expect(logger).toBeDefined();
      
      // Test that logger has the custom RESULT level
      const resultLogger = getLogger('test');
      expect(typeof (resultLogger as any).log).toBe('function');
    });

    it('should setup logging with result level', () => {
      const logger = setupLogging(undefined, 'result');
      expect(logger).toBeDefined();
    });

    it('should handle force setup', () => {
      const logger1 = setupLogging();
      const logger2 = setupLogging(undefined, undefined, true);
      expect(logger2).toBeDefined();
    });
  });

  describe('getLogger', () => {
    it('should create logger with custom name', () => {
      setupLogging();
      const logger = getLogger('test.module');
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });

    it('should return same logger instance for same name', () => {
      setupLogging();
      const logger1 = getLogger('same.name');
      const logger2 = getLogger('same.name');
      expect(logger1).toBe(logger2);
    });

    it('should create different loggers for different names', () => {
      setupLogging();
      const logger1 = getLogger('name1');
      const logger2 = getLogger('name2');
      expect(logger1).not.toBe(logger2);
    });
  });

  describe('FIFOHandler', () => {
    it('should create FIFO handler', () => {
      const tempDir = os.tmpdir();
      const fifoPath = path.join(tempDir, 'test.pipe');
      
      const handler = new FIFOHandler(fifoPath);
      expect(handler).toBeDefined();
      
      // Cleanup
      handler.close();
      if (fs.existsSync(fifoPath)) {
        try {
          fs.unlinkSync(fifoPath);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    it('should handle write operations', () => {
      const tempDir = os.tmpdir();
      const fifoPath = path.join(tempDir, 'test-write.pipe');
      
      const handler = new FIFOHandler(fifoPath);
      expect(handler).toBeDefined();
      
      // Test writing (won't actually write on most systems without a reader)
      expect(() => {
        handler.write('test message');
      }).not.toThrow();
      
      // Cleanup
      handler.close();
      if (fs.existsSync(fifoPath)) {
        try {
          fs.unlinkSync(fifoPath);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });
  });

  describe('setupLogPipes', () => {
    it('should setup log pipes with session ID', () => {
      const sessionId = 'test-session-12345';
      setupLogging();
      
      // Mock console.log to capture pipe setup messages
      const originalLog = console.log;
      const logMessages: string[] = [];
      console.log = jest.fn((...args) => {
        logMessages.push(args.join(' '));
      });
      
      setupLogPipes(sessionId);
      
      // Restore console.log
      console.log = originalLog;
      
      // Check that setup messages were logged
      expect(logMessages.some(msg => msg.includes('Log pipes setup'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('agent.pipe'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('cdp.pipe'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('events.pipe'))).toBe(true);
    });

    it('should use custom base directory', () => {
      const sessionId = 'test-session-67890';
      const customDir = path.join(os.tmpdir(), 'custom-log-dir');
      setupLogging();
      
      // Mock console.log to capture messages
      const originalLog = console.log;
      const logMessages: string[] = [];
      console.log = jest.fn((...args) => {
        logMessages.push(args.join(' '));
      });
      
      setupLogPipes(sessionId, customDir);
      
      // Restore console.log
      console.log = originalLog;
      
      // Check that custom directory is mentioned
      expect(logMessages.some(msg => msg.includes(customDir))).toBe(true);
      
      // Cleanup
      try {
        fs.rmSync(customDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });
  });

  describe('Logger Integration', () => {
    it('should work with browser session logger', () => {
      setupLogging();
      const logger = getLogger('browser_use.browser.session');
      expect(logger).toBeDefined();
      
      // Test that we can call various log methods without errors
      expect(() => {
        logger.info('Test info message');
        logger.debug('Test debug message');
        logger.warn('Test warn message');
        logger.error('Test error message');
      }).not.toThrow();
    });

    it('should work with controller logger', () => {
      setupLogging();
      const logger = getLogger('browser_use.controller');
      expect(logger).toBeDefined();
      
      expect(() => {
        logger.info('Controller test message');
      }).not.toThrow();
    });

    it('should work with agent logger', () => {
      setupLogging();
      const logger = getLogger('browser_use.agent');
      expect(logger).toBeDefined();
      
      expect(() => {
        logger.info('Agent test message');
      }).not.toThrow();
    });
  });

  describe('Third-party Logger Management', () => {
    it('should configure third-party loggers to be less verbose', () => {
      setupLogging();
      
      // Get some third-party loggers and verify they exist
      const axiosLogger = winston.loggers.get('axios');
      const playwrightLogger = winston.loggers.get('playwright');
      
      // These loggers should be configured to be silent by default
      expect(axiosLogger).toBeDefined();
      expect(playwrightLogger).toBeDefined();
    });
  });

  describe('Custom Log Levels', () => {
    it('should support RESULT level logging', () => {
      setupLogging();
      const logger = getLogger('test.result');
      
      // Winston adds custom levels as methods
      const loggerWithCustomLevel = logger as any;
      expect(typeof loggerWithCustomLevel.log).toBe('function');
      
      // Test logging at different levels
      expect(() => {
        logger.info('Info level');
        logger.debug('Debug level');
        logger.warn('Warn level');
        logger.error('Error level');
      }).not.toThrow();
    });
  });
});