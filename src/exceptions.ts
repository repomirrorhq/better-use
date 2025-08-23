/**
 * Custom exception classes for browser-use
 */

export class LLMException extends Error {
  public readonly statusCode: number;
  public readonly message: string;

  constructor(statusCode: number, message: string) {
    super(`Error ${statusCode}: ${message}`);
    this.name = 'LLMException';
    this.statusCode = statusCode;
    this.message = message;
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