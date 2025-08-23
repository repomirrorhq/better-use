/**
 * Gmail Integration for Browser Use
 * 
 * This module provides Gmail integration capabilities including:
 * - OAuth2 authentication with Gmail API
 * - Reading recent emails with filtering
 * - Extracting 2FA codes and verification tokens
 * - Integration with browser-use controller actions
 */

export { GmailService } from './service';
export { registerGmailActions } from './actions';
export type { EmailData } from './service';