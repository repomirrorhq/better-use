// Global test setup
import { config } from 'dotenv';

// Load environment variables for tests
config({ path: '.env.test' });

// Set default test timeout
jest.setTimeout(30000);

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      // Custom matchers can be added here if needed
    }
  }
}

export {};