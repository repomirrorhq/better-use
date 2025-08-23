/**
 * Test for Gmail integration
 */

import { GmailService, registerGmailActions } from '../src/integrations/gmail';

describe('Gmail Integration', () => {
  it('should create GmailService', () => {
    const service = new GmailService();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should register Gmail actions with mock controller', () => {
    // Mock controller with registry structure
    const mockController = {
      registry: {
        actions: {}
      }
    } as any;

    const result = registerGmailActions(mockController);
    
    expect(result).toBe(mockController);
    expect(mockController.registry.actions['getRecentEmails']).toBeDefined();
    expect(mockController.registry.actions['getRecentEmails'].name).toBe('getRecentEmails');
    expect(mockController.registry.actions['getRecentEmails'].description).toContain('email');
  });
});