import { z } from 'zod';

export interface ActionModel {
  getIndex?(): number | null;
  setIndex?(index: number): void;
}

export interface RegisteredAction {
  name: string;
  description: string;
  function: ActionFunction;
  paramSchema: z.ZodType<any>;
  domains?: string[];
}

export type ActionFunction = (params: any, specialParams: Record<string, any>) => Promise<any>;

export class ActionRegistry {
  public actions: Record<string, RegisteredAction> = {};

  public matchDomains(domains: string[] | undefined, url: string): boolean {
    if (!domains || domains.length === 0) {
      return true; // No domain restrictions
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      for (const domain of domains) {
        // Handle different domain patterns
        if (domain.startsWith('*.')) {
          // Wildcard subdomain matching: *.example.com
          const domainPattern = domain.substring(2); // Remove *.
          if (hostname === domainPattern || hostname.endsWith(`.${domainPattern}`)) {
            return true;
          }
        } else if (domain.includes('://')) {
          // Full URL pattern: https://example.com
          if (url.startsWith(domain)) {
            return true;
          }
        } else {
          // Exact hostname matching
          if (hostname === domain) {
            return true;
          }
        }
      }
      
      return false;
    } catch {
      return false; // Invalid URL
    }
  }

  public getPromptDescription(pageUrl?: string): string {
    const availableActions: RegisteredAction[] = [];
    
    for (const action of Object.values(this.actions)) {
      // Filter by domain if pageUrl is provided
      if (pageUrl) {
        const domainMatches = this.matchDomains(action.domains, pageUrl);
        if (!domainMatches) {
          continue;
        }
      } else {
        // If no pageUrl provided, only include actions with no domain restrictions
        if (action.domains && action.domains.length > 0) {
          continue;
        }
      }
      
      availableActions.push(action);
    }

    if (availableActions.length === 0) {
      return 'No actions available for this page.';
    }

    const descriptions = availableActions.map(action => 
      `${action.name}: ${action.description}`
    );
    
    return descriptions.join('\n');
  }
}

export interface SpecialActionParameters {
  context?: any;
  browserSession?: any; // BrowserSession type
  pageUrl?: string;
  cdpClient?: any;
  pageExtractionLlm?: any; // BaseChatModel type
  availableFilePaths?: string[];
  hasSensitiveData?: boolean;
  fileSystem?: any; // FileSystem type
}