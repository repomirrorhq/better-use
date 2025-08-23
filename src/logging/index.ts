/**
 * Advanced logging configuration for better-use TypeScript
 * 
 * This module provides comprehensive logging capabilities including:
 * - Custom log levels (RESULT level)
 * - Advanced log formatting and filtering
 * - Third-party logger management
 * - Cross-platform compatibility
 */

import * as winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CONFIG } from '../config';

// Custom log levels
const customLevels = {
  levels: {
    error: 0,
    fatal: 0,  // Alias for error
    critical: 0,  // Alias for error
    warn: 1,
    result: 2,  // Custom level between warn and info
    info: 3,
    debug: 4
  },
  colors: {
    error: 'red',
    fatal: 'red',
    critical: 'red',
    warn: 'yellow',
    result: 'cyan',
    info: 'green',
    debug: 'blue'
  }
};

// Add colors to winston
winston.addColors(customLevels.colors);

/**
 * Custom formatter for better-use logs
 */
function createBetterUseFormatter(logLevel: string) {
  return winston.format((info: any) => {
    // Only clean up names in non-debug modes, keep everything in debug mode
    if (logLevel !== 'debug' && info.label && typeof info.label === 'string' && (info.label.startsWith('better_use.') || info.label.startsWith('browser_use.'))) {
      // Extract clean component names from logger names
      if (info.label.includes('Agent')) {
        info.label = 'Agent';
      } else if (info.label.includes('BrowserSession')) {
        info.label = 'BrowserSession';
      } else if (info.label.includes('controller')) {
        info.label = 'controller';
      } else if (info.label.includes('dom')) {
        info.label = 'dom';
      } else if (info.label.startsWith('better_use.') || info.label.startsWith('browser_use.')) {
        // For other better_use/browser_use modules, use the last part
        const parts = info.label.split('.');
        if (parts.length >= 2) {
          info.label = parts[parts.length - 1];
        }
      }
    }
    return info;
  })();
}

/**
 * Simple FIFO Handler for named pipe logging (Unix-like systems)
 */
export class FIFOHandler {
  private fifoPath: string;
  private fd: number | null = null;

  constructor(fifoPath: string) {
    this.fifoPath = fifoPath;
    
    // Ensure parent directory exists
    const dir = path.dirname(fifoPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create FIFO if it doesn't exist (Unix-like systems only)
    if (!fs.existsSync(fifoPath) && os.platform() !== 'win32') {
      try {
        // Create named pipe (FIFO)
        require('child_process').execSync(`mkfifo "${fifoPath}"`);
      } catch (error) {
        console.warn(`Failed to create FIFO at ${fifoPath}:`, error);
      }
    }
  }

  write(message: string): void {
    try {
      // Open FIFO on first write if not already open
      if (this.fd === null && os.platform() !== 'win32') {
        try {
          this.fd = fs.openSync(this.fifoPath, 'w');
        } catch (error) {
          // No reader connected yet, skip this message
          return;
        }
      }

      if (this.fd !== null) {
        fs.writeSync(this.fd, message + '\n');
      }
    } catch (error) {
      // Reader disconnected, close and reset
      if (this.fd !== null) {
        try {
          fs.closeSync(this.fd);
        } catch (closeError) {
          // Ignore close errors
        }
        this.fd = null;
      }
    }
  }

  close(): void {
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch (error) {
        // Ignore close errors
      }
      this.fd = null;
    }
  }
}

let isLoggingSetup = false;
const loggers = new Map<string, winston.Logger>();

/**
 * Setup logging configuration for better-use
 * 
 * @param stream - Output stream (not used in winston, but kept for compatibility)
 * @param logLevel - Override log level
 * @param forceSetup - Force reconfiguration even if already set up
 */
export function setupLogging(
  stream?: NodeJS.WritableStream,
  logLevel?: string,
  forceSetup = false
): winston.Logger {
  if (isLoggingSetup && !forceSetup) {
    return getLogger('better_use');
  }

  const logType = logLevel || CONFIG.BROWSER_USE_LOGGING_LEVEL;

  // Clear existing loggers if force setup
  if (forceSetup) {
    loggers.clear();
  }

  // Determine the log level to use
  let winstonLogLevel: string;
  if (logType === 'result') {
    winstonLogLevel = 'result';
  } else if (logType === 'debug') {
    winstonLogLevel = 'debug';
  } else {
    winstonLogLevel = 'info';
  }

  // Configure winston with custom levels
  winston.configure({
    levels: customLevels.levels,
    transports: [
      new winston.transports.Console({
        level: winstonLogLevel,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.colorize({ all: true }),
          createBetterUseFormatter(logType),
          logType === 'result' 
            ? winston.format.printf(({ message }: any) => message || '')
            : winston.format.printf(({ level, label, message }: any) => {
                const labelStr = label ? `[${label}] ` : '';
                return `${level.padEnd(8)} ${labelStr}${message || ''}`;
              })
        )
      })
    ]
  });

  isLoggingSetup = true;
  const logger = getLogger('better_use');
  
  return logger;
}

/**
 * Get or create a logger with the given name
 */
export function getLogger(name: string): winston.Logger {
  if (loggers.has(name)) {
    return loggers.get(name)!;
  }

  if (!isLoggingSetup) {
    setupLogging();
  }

  const logger = winston.createLogger({
    levels: customLevels.levels,
    level: 'debug', // Set to debug by default, will be filtered by transports
    format: winston.format.combine(
      winston.format.label({ label: name }),
      winston.format.timestamp(),
      winston.format.errors({ stack: true })
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize({ all: true }),
          winston.format.printf(({ level, label, message }: any) => {
            return `${level.padEnd(8)} [${label}] ${message || ''}`;
          })
        )
      })
    ]
  });

  loggers.set(name, logger);
  return logger;
}

/**
 * Setup named pipes for log streaming
 * 
 * @param sessionId - Session ID for unique pipe naming
 * @param baseDir - Base directory for pipes (defaults to temp directory)
 */
export function setupLogPipes(sessionId: string, baseDir?: string): void {
  const tempDir = baseDir || os.tmpdir();
  const suffix = sessionId.slice(-4);
  const pipeDir = path.join(tempDir, `buagent.${suffix}`);

  // Ensure pipe directory exists
  if (!fs.existsSync(pipeDir)) {
    fs.mkdirSync(pipeDir, { recursive: true });
  }

  // Create pipe paths
  const agentPipePath = path.join(pipeDir, 'agent.pipe');
  const cdpPipePath = path.join(pipeDir, 'cdp.pipe');
  const eventPipePath = path.join(pipeDir, 'events.pipe');

  // Create FIFO handlers
  const agentHandler = new FIFOHandler(agentPipePath);
  const cdpHandler = new FIFOHandler(cdpPipePath);
  const eventHandler = new FIFOHandler(eventPipePath);

  // Add custom transports to existing loggers
  const agentLoggerNames = ['better_use.agent', 'better_use.controller', 'browser_use.agent', 'browser_use.controller'];
  for (const loggerName of agentLoggerNames) {
    const logger = getLogger(loggerName);
    
    // Add a custom transport that writes to FIFO
    logger.add(new winston.transports.Console({
      level: 'debug',
      silent: true, // Don't output to console
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, label, message, timestamp }: any) => {
          const logLine = `${level.padEnd(8)} [${label || 'agent'}] ${message || ''}`;
          agentHandler.write(logLine);
          return logLine;
        })
      )
    }));
  }

  console.log(`Log pipes setup in: ${pipeDir}`);
  console.log(`Agent logs: tail -f ${agentPipePath}`);
  console.log(`CDP logs: tail -f ${cdpPipePath}`);
  console.log(`Event logs: tail -f ${eventPipePath}`);
}

// Export the main logger for convenience
export const logger = getLogger('better_use');

// Export types for external use
export type Logger = winston.Logger;

// Custom log level methods
declare module 'winston' {
  interface Logger {
    result(message: string, meta?: any): winston.Logger;
    fatal(message: string, meta?: any): winston.Logger;
    critical(message: string, meta?: any): winston.Logger;
  }
}