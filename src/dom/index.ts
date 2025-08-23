/**
 * DOM module exports
 * 
 * This module provides comprehensive DOM tree extraction, serialization, and
 * analysis capabilities for browser automation.
 */

// Core service
export { DomService } from './service';

// Views and data structures
export * from './views';

// Enhanced snapshot processing
export * from './enhanced_snapshot';

// Serialization
export * from './serializer/serializer';
export * from './serializer/clickable_elements';

// Utilities
export * from './utils';