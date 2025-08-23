/**
 * Gmail Actions for Browser Use
 * Defines agent actions for Gmail integration including 2FA code retrieval,
 * email reading, and authentication management.
 */

import { z } from 'zod';
// Simple logger for Gmail integration
const logger = {
  info: (message: string) => console.log(message),
  error: (message: string) => console.error(message),
  debug: (message: string) => console.debug(message),
};
import { ActionResult } from '../../agent/views';
import type { Controller } from '../../controller';
import type { ActionFunction } from '../../controller/registry/views';
import { GmailService } from './service';

// Global Gmail service instance - initialized when actions are registered
let gmailService: GmailService | null = null;

/**
 * Parameters for getting recent emails
 */
const GetRecentEmailsParamsSchema = z.object({
  keyword: z.string().default('').describe('A single keyword for search, e.g. github, airbnb, etc.'),
  maxResults: z.number().int().min(1).max(50).default(3).describe('Maximum number of emails to retrieve (1-50, default: 3)'),
});

type GetRecentEmailsParams = z.infer<typeof GetRecentEmailsParamsSchema>;

/**
 * Register Gmail actions with the provided controller
 */
export function registerGmailActions(
  controller: Controller,
  options?: {
    gmailService?: GmailService;
    accessToken?: string;
  }
): Controller {
  // Use provided service or create a new one with access token if provided
  if (options?.gmailService) {
    gmailService = options.gmailService;
  } else if (options?.accessToken) {
    gmailService = new GmailService({ accessToken: options.accessToken });
  } else {
    gmailService = new GmailService();
  }

  // Register the get_recent_emails action
  const actionFunction: ActionFunction = async (
    params: GetRecentEmailsParams,
    specialParams: Record<string, any>
  ): Promise<ActionResult> => {
      try {
        if (!gmailService) {
          throw new Error('Gmail service not initialized');
        }

        // Ensure authentication
        if (!gmailService.isAuthenticated()) {
          logger.info('📧 Gmail not authenticated, attempting authentication...');
          const authenticated = await gmailService.authenticate();
          if (!authenticated) {
            return new ActionResult({
              success: false,
              extracted_content: 'Failed to authenticate with Gmail. Please ensure Gmail credentials are set up properly.',
              long_term_memory: 'Gmail authentication failed',
            });
          }
        }

        // Use specified max_results (1-50, default 3), last 5 minutes
        const maxResults = params.maxResults;
        const timeFilter = '5m';

        // Build query with time filter and optional user query
        const queryParts = [`newer_than:${timeFilter}`];
        if (params.keyword.trim()) {
          queryParts.push(params.keyword.trim());
        }

        const query = queryParts.join(' ');
        logger.info(`🔍 Gmail search query: ${query}`);

        // Get emails
        const emails = await gmailService.getRecentEmails({
          maxResults,
          query,
          timeFilter,
        });

        if (emails.length === 0) {
          const queryInfo = params.keyword.trim() ? ` matching '${params.keyword}'` : '';
          const memory = `No recent emails found from last ${timeFilter}${queryInfo}`;
          return new ActionResult({
            extracted_content: memory,
            long_term_memory: memory,
          });
        }

        // Format with full email content for large display
        let content = `Found ${emails.length} recent email${emails.length > 1 ? 's' : ''} from the last ${timeFilter}:\n\n`;

        for (let i = 0; i < emails.length; i++) {
          const email = emails[i];
          content += `Email ${i + 1}:\n`;
          content += `From: ${email.from}\n`;
          content += `Subject: ${email.subject}\n`;
          content += `Date: ${email.date}\n`;
          content += `Content:\n${email.body}\n`;
          content += '-'.repeat(50) + '\n\n';
        }

        logger.info(`📧 Retrieved ${emails.length} recent emails`);
        return new ActionResult({
          extracted_content: content,
          include_extracted_content_only_once: true,
          long_term_memory: `Retrieved ${emails.length} recent emails from last ${timeFilter} for query ${query}.`,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error getting recent emails: ${errorMessage}`);
        return new ActionResult({
          error: `Error getting recent emails: ${errorMessage}`,
          long_term_memory: 'Failed to get recent emails due to error',
        });
      }
    };

  // Add the action to the registry
  (controller as any).registry.actions['getRecentEmails'] = {
    name: 'getRecentEmails',
    description: 'Get recent emails from the mailbox with a keyword to retrieve verification codes, OTP, 2FA tokens, magic links, or any recent email content. Keep your query a single keyword.',
    function: actionFunction,
    paramSchema: GetRecentEmailsParamsSchema,
  };

  return controller;
}

export { GmailService };