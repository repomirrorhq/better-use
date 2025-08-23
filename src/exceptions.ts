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