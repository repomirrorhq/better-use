/**
 * Custom exception classes for browser-use
 */

export class LLMException extends Error {
  public readonly statusCode: number;
  public readonly model?: string;

  constructor(statusCode: number, message: string, model?: string) {
    super(`Error ${statusCode}: ${message}`);
    this.name = 'LLMException';
    this.statusCode = statusCode;
    this.model = model;
  }
}

export class ModelProviderError extends LLMException {
  constructor(options: { message: string; status_code?: number; model?: string }) {
    super(options.status_code || 500, options.message, options.model);
    this.name = 'ModelProviderError';
  }
}

export class ModelRateLimitError extends LLMException {
  constructor(options: { message: string; status_code?: number; model?: string }) {
    super(options.status_code || 429, options.message, options.model);
    this.name = 'ModelRateLimitError';
  }
}

export class BrowserException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserException';
  }
}

export class DOMException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DOMException';
  }
}

export class ConfigurationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationException';
  }
}

export class AgentException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentException';
  }
}

export class BrowserError extends Error {
  public readonly message: string;
  public readonly details?: Record<string, any>;
  public readonly while_handling_event?: any;
  
  constructor(message: string, details?: Record<string, any>, event?: any) {
    super(message);
    this.name = 'BrowserError';
    this.message = message;
    this.details = details;
    this.while_handling_event = event;
  }

  toString(): string {
    if (this.details) {
      return `${this.message} (${JSON.stringify(this.details)}) during: ${this.while_handling_event}`;
    } else if (this.while_handling_event) {
      return `${this.message} (while handling: ${this.while_handling_event})`;
    } else {
      return this.message;
    }
  }
}

export class URLNotAllowedError extends BrowserError {
  constructor(message: string, details?: Record<string, any>, event?: any) {
    super(message, details, event);
    this.name = 'URLNotAllowedError';
  }
}