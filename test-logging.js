// Quick test script for logging system
const { setupLogging, getLogger } = require('./dist/logging/index.js');

try {
  console.log('Testing logging system...');
  
  const logger = setupLogging();
  console.log('✅ Setup logging successful');
  
  const testLogger = getLogger('test');
  console.log('✅ Get logger successful');
  
  testLogger.info('This is a test info message');
  testLogger.warn('This is a test warning message');
  testLogger.error('This is a test error message');
  testLogger.debug('This is a test debug message');
  
  console.log('✅ All logging tests passed!');
} catch (error) {
  console.error('❌ Logging test failed:', error);
  process.exit(1);
}