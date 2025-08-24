// Global test setup
import { config } from 'dotenv';

// Load environment variables for tests
config({ path: '.env.test' });

// Set default test timeout
jest.setTimeout(30000);

// Force headless mode for tests in CI environments or when no DISPLAY is available
if (!process.env.DISPLAY || process.env.CI) {
  process.env.HEADLESS = 'true';
}

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      // Custom matchers can be added here if needed
    }
  }
}

export {};