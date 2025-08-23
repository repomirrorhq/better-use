import { z } from 'zod';
import { ActionRegistry, RegisteredAction, ActionFunction, ActionModel, SpecialActionParameters } from './views';
import { BrowserSession } from '../../browser/session';
import { BaseChatModel } from '../../llm/base';
import { FileSystem } from '../../filesystem/index';

export interface RegistryConfig<Context = any> {
  excludeActions?: string[];
}

export class Registry<Context = any> {
  private registry: ActionRegistry;
  private excludeActions: string[];

  constructor(config: RegistryConfig<Context> = {}) {
    this.registry = new ActionRegistry();
    this.excludeActions = config.excludeActions ?? [];
  }

  // Getter to access the internal actions for direct registration
  get actions(): Record<string, RegisteredAction> {
    return this.registry.actions;
  }

  private getSpecialParamTypes(): Record<string, any> {
    return {
      context: null, // Context is generic, can't validate type
      browserSession: BrowserSession,
      pageUrl: String,
      cdpClient: null, // CDPClient type not available in TS
      pageExtractionLlm: BaseChatModel,
      availableFilePaths: Array,
      hasSensitiveData: Boolean,
      fileSystem: FileSystem,
    };
  }

  public action(
    description: string,
    options: {
      paramSchema?: z.ZodType<any>;
      domains?: string[];
      allowedDomains?: string[];
    } = {}
  ) {
    const { paramSchema, domains, allowedDomains } = options;

    // Handle aliases: domains and allowedDomains are the same parameter
    if (allowedDomains && domains) {
      throw new Error("Cannot specify both 'domains' and 'allowedDomains' - they are aliases for the same parameter");
    }

    const finalDomains = allowedDomains ?? domains;

    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const func = descriptor.value as Function;

      // Skip registration if action is in excludeActions
      if (this.excludeActions.includes(propertyKey)) {
        return descriptor;
      }

      // Create a normalized function wrapper
      const normalizedFunc = this.createNormalizedFunction(func, paramSchema);

      const action: RegisteredAction = {
        name: propertyKey,
        description,
        function: normalizedFunc,
        paramSchema: paramSchema ?? z.object({}),
        domains: finalDomains,
      };

      this.registry.actions[propertyKey] = action;

      // Return the normalized function
      descriptor.value = normalizedFunc;
      return descriptor;
    };
  }

  private createNormalizedFunction(
    originalFunc: Function,
    paramSchema?: z.ZodType<any>
  ): ActionFunction {
    return async (params: any, specialParams: Record<string, any>) => {
      // Validate parameters if schema is provided
      let validatedParams = params;
      if (paramSchema) {
        try {
          validatedParams = paramSchema.parse(params);
        } catch (error) {
          throw new Error(`Invalid parameters for action: ${error}`);
        }
      }

      // Process sensitive data replacement if needed
      if (specialParams.hasSensitiveData && specialParams.sensitiveData) {
        validatedParams = this.replaceSensitiveData(
          validatedParams,
          specialParams.sensitiveData,
          specialParams.pageUrl
        );
      }

      // Call the original function with the validated params and special params
      try {
        if (originalFunc.constructor.name === 'AsyncFunction') {
          return await originalFunc.call(null, validatedParams, specialParams);
        } else {
          return await new Promise((resolve, reject) => {
            try {
              const result = originalFunc.call(null, validatedParams, specialParams);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          });
        }
      } catch (error) {
        throw new Error(`Action execution failed: ${error}`);
      }
    };
  }

  public async executeAction(
    actionName: string,
    params: Record<string, any>,
    options: {
      browserSession?: BrowserSession;
      pageExtractionLlm?: BaseChatModel;
      fileSystem?: FileSystem;
      sensitiveData?: Record<string, string | Record<string, string>>;
      availableFilePaths?: string[];
      context?: Context;
    } = {}
  ): Promise<any> {
    const {
      browserSession,
      pageExtractionLlm,
      fileSystem,
      sensitiveData,
      availableFilePaths = [],
      context,
    } = options;

    if (!this.registry.actions[actionName]) {
      throw new Error(`Action ${actionName} not found`);
    }

    const action = this.registry.actions[actionName];

    try {
      // Validate parameters
      let validatedParams: any;
      try {
        validatedParams = action.paramSchema.parse(params);
      } catch (error) {
        throw new Error(`Invalid parameters ${JSON.stringify(params)} for action ${actionName}: ${error}`);
      }

      // Build special context
      const specialContext = {
        context,
        browserSession,
        pageExtractionLlm,
        availableFilePaths,
        hasSensitiveData: actionName === 'inputText' && Boolean(sensitiveData),
        fileSystem,
        sensitiveData,
      };

      // Add page URL if browser session is available
      if (browserSession) {
        try {
          specialContext.pageUrl = await browserSession.getCurrentPageUrl();
        } catch {
          specialContext.pageUrl = undefined;
        }

        specialContext.cdpClient = browserSession.cdpClient;
      }

      // Execute the action
      return await action.function(validatedParams, specialContext);

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('requires browserSession but none provided') ||
            error.message.includes('requires pageExtractionLlm but none provided')) {
          throw new Error(error.message);
        }
        throw new Error(`Error executing action ${actionName}: ${error.message}`);
      }
      throw new Error(`Error executing action ${actionName}: ${String(error)}`);
    }
  }

  private replaceSensitiveData(
    params: any,
    sensitiveData: Record<string, string | Record<string, string>>,
    currentUrl?: string
  ): any {
    const secretPattern = /<secret>(.*?)<\/secret>/g;
    
    // Set to track missing placeholders
    const allMissingPlaceholders = new Set<string>();
    const replacedPlaceholders = new Set<string>();

    // Process sensitive data based on format and current URL
    const applicableSecrets: Record<string, string> = {};

    for (const [domainOrKey, content] of Object.entries(sensitiveData)) {
      if (typeof content === 'object' && content !== null) {
        // New format: {domain_pattern: {key: value}}
        if (currentUrl && !this.isNewTabPage(currentUrl)) {
          if (this.matchUrlWithDomainPattern(currentUrl, domainOrKey)) {
            Object.assign(applicableSecrets, content);
          }
        }
      } else {
        // Old format: {key: value}, expose to all domains
        applicableSecrets[domainOrKey] = content as string;
      }
    }

    // Filter out empty values
    Object.keys(applicableSecrets).forEach(key => {
      if (!applicableSecrets[key]) {
        delete applicableSecrets[key];
      }
    });

    const recursivelyReplaceSecrets = (value: any): any => {
      if (typeof value === 'string') {
        let matches;
        const allMatches: string[] = [];
        
        while ((matches = secretPattern.exec(value)) !== null) {
          allMatches.push(matches[1]);
        }
        
        for (const placeholder of allMatches) {
          if (placeholder in applicableSecrets) {
            value = value.replace(`<secret>${placeholder}</secret>`, applicableSecrets[placeholder]);
            replacedPlaceholders.add(placeholder);
          } else {
            allMissingPlaceholders.add(placeholder);
            // Don't replace the tag, keep it as is
          }
        }
        
        return value;
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          return value.map(item => recursivelyReplaceSecrets(item));
        } else {
          const result: Record<string, any> = {};
          for (const [k, v] of Object.entries(value)) {
            result[k] = recursivelyReplaceSecrets(v);
          }
          return result;
        }
      }
      return value;
    };

    const processedParams = recursivelyReplaceSecrets(params);

    // Log sensitive data usage
    if (replacedPlaceholders.size > 0) {
      const urlInfo = currentUrl && !this.isNewTabPage(currentUrl) ? ` on ${currentUrl}` : '';
      console.log(`🔒 Using sensitive data placeholders: ${Array.from(replacedPlaceholders).sort().join(', ')}${urlInfo}`);
    }

    // Log warning for missing placeholders
    if (allMissingPlaceholders.size > 0) {
      console.warn(`Missing or empty keys in sensitive_data dictionary: ${Array.from(allMissingPlaceholders).join(', ')}`);
    }

    return processedParams;
  }

  private isNewTabPage(url: string): boolean {
    return url === 'about:blank' || url === 'chrome://newtab/' || url === 'edge://newtab/';
  }

  private matchUrlWithDomainPattern(url: string, domainPattern: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      if (domainPattern.startsWith('*.')) {
        const pattern = domainPattern.substring(2);
        return hostname === pattern || hostname.endsWith(`.${pattern}`);
      } else if (domainPattern.includes('://')) {
        return url.startsWith(domainPattern);
      } else {
        return hostname === domainPattern;
      }
    } catch {
      return false;
    }
  }

  public createActionModel(
    includeActions?: string[],
    pageUrl?: string
  ): z.ZodType<ActionModel> {
    const availableActions: Record<string, RegisteredAction> = {};
    
    for (const [name, action] of Object.entries(this.registry.actions)) {
      if (includeActions && !includeActions.includes(name)) {
        continue;
      }

      // Filter by page URL if provided
      if (pageUrl === null) {
        // Only include actions with no domain filters
        if (!action.domains || action.domains.length === 0) {
          availableActions[name] = action;
        }
      } else if (pageUrl) {
        // Check domain filter
        const domainIsAllowed = this.registry.matchDomains(action.domains, pageUrl);
        if (domainIsAllowed) {
          availableActions[name] = action;
        }
      } else {
        // pageUrl is undefined, include all actions
        availableActions[name] = action;
      }
    }

    // Create individual action schemas
    const actionSchemas: Record<string, z.ZodType<any>> = {};
    
    for (const [name, action] of Object.entries(availableActions)) {
      actionSchemas[name] = action.paramSchema;
    }

    if (Object.keys(actionSchemas).length === 0) {
      return z.object({});
    }

    // Create a union of all action schemas
    const actionSchema = z.object(actionSchemas).partial();
    
    return actionSchema as z.ZodType<ActionModel>;
  }

  public getPromptDescription(pageUrl?: string): string {
    return this.registry.getPromptDescription(pageUrl);
  }
}