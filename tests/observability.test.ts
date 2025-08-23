/**
 * Test for observability system
 */

import {
  observe,
  observeDebug,
  observeFunction,
  observeDebugFunction,
  isLmnrAvailable,
  isDebugModeActive,
  getObservabilityStatus,
} from '../src/observability';

describe('Observability System', () => {
  beforeEach(() => {
    // Clean up environment variables for consistent testing
    delete process.env.LMNR_LOGGING_LEVEL;
    delete process.env.BROWSER_USE_VERBOSE_OBSERVABILITY;
  });

  it('should provide status information', () => {
    const status = getObservabilityStatus();
    expect(typeof status.lmnrAvailable).toBe('boolean');
    expect(typeof status.debugMode).toBe('boolean');
    expect(typeof status.observeActive).toBe('boolean');
    expect(typeof status.observeDebugActive).toBe('boolean');
  });

  it('should detect debug mode from environment', () => {
    // Initially should be false
    expect(isDebugModeActive()).toBe(false);

    // Set debug mode
    process.env.LMNR_LOGGING_LEVEL = 'debug';
    // Note: The debug mode detection happens at module load time,
    // so we can't easily test the dynamic behavior here
  });

  it('should provide LMNR availability status', () => {
    const available = isLmnrAvailable();
    expect(typeof available).toBe('boolean');
  });

  describe('Function Wrapping', () => {
    it('should wrap functions without throwing', () => {
      const testFn = (a: number, b: number) => a + b;
      
      const wrappedFn = observeFunction(testFn, {
        name: 'test_function',
        metadata: { test: true },
      });

      expect(wrappedFn(2, 3)).toBe(5);
    });

    it('should wrap functions for debug mode without throwing', () => {
      const testFn = (a: number, b: number) => a * b;
      
      const wrappedFn = observeDebugFunction(testFn, {
        name: 'debug_test_function',
        ignoreInput: true,
        ignoreOutput: true,
      });

      expect(wrappedFn(2, 3)).toBe(6);
    });
  });

  describe('Decorators', () => {
    it('should apply observe decorator without throwing', () => {
      class TestClass {
        @observe({ name: 'test_method', spanType: 'TOOL' })
        testMethod(a: number, b: number): number {
          return a + b;
        }
      }

      const instance = new TestClass();
      expect(instance.testMethod(2, 3)).toBe(5);
    });

    it('should apply observeDebug decorator without throwing', () => {
      class TestClass {
        @observeDebug({ 
          name: 'debug_test_method', 
          ignoreInput: true,
          metadata: { debug: true } 
        })
        debugTestMethod(a: number, b: number): number {
          return a * b;
        }
      }

      const instance = new TestClass();
      expect(instance.debugTestMethod(2, 3)).toBe(6);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing lmnr gracefully', () => {
      // These should not throw even if lmnr is not available
      expect(() => {
        const testFn = () => 'test';
        observeFunction(testFn);
        observeDebugFunction(testFn);
      }).not.toThrow();
    });

    it('should handle decorator errors gracefully', () => {
      expect(() => {
        class TestClass {
          @observe({ name: 'test' })
          @observeDebug({ name: 'debug_test' })
          testMethod(): string {
            return 'test';
          }
        }
        
        const instance = new TestClass();
        instance.testMethod();
      }).not.toThrow();
    });
  });

  describe('Configuration Options', () => {
    it('should accept all configuration options', () => {
      const options = {
        name: 'custom_name',
        ignoreInput: true,
        ignoreOutput: true,
        metadata: { custom: 'metadata' },
        spanType: 'LLM' as const,
        customOption: 'custom_value',
      };

      expect(() => {
        const testFn = () => 'test';
        observeFunction(testFn, options);
        observeDebugFunction(testFn, options);
      }).not.toThrow();
    });
  });
});