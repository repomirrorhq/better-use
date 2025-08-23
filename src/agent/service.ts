/**
 * Agent service for browser-use TypeScript
 * 
 * Main agent orchestrating browser automation using LLM guidance.
 * This is a simplified initial implementation focusing on core functionality.
 */

import { v7 as uuid7 } from 'uuid';
import { EventEmitter } from 'events';
import { 
  AgentSettings,
  AgentState,
  AgentStateSchema,
  AgentOutput,
  ActionResult,
  AgentStepInfo,
  AgentHistory,
  AgentHistoryList,
  AgentHistoryListHelper,
  StepMetadata,
  StepMetadataHelper,
  BrowserStateHistory,
  createAgentSettings,
  createAgentState,
  createActionResult,
  createAgentStepInfo,
} from './views';
import { MessageManager, type SensitiveData } from './messageManager/index';
import { BaseChatModel } from '../llm/base';
import { SystemMessage, createSystemMessage } from '../llm/messages';
import { BrowserSession } from '../browser/session';
import { BrowserStateSummary } from '../browser/views';
import { logPrettyUrl, sleep } from '../utils';
import { ScreenshotService } from '../screenshots';
import { getLogger } from '../logging';
import * as path from 'path';

// Dynamic logger is defined as a getter in Agent class

export type Context = any; // Generic context type
export type AgentStructuredOutput = any; // Generic structured output type

/**
 * Agent hook function type
 */
export type AgentHookFunc<T extends Agent<any, any> = Agent<any, any>> = (agent: T) => Promise<void>;

/**
 * Main Agent class for browser automation
 */
export class Agent<TContext = any, TStructuredOutput = any> extends EventEmitter {
  public readonly sessionId: string = uuid7();
  public readonly taskId: string = uuid7();
  
  // Core components
  public task: string;
  public llm: BaseChatModel;
  public settings: AgentSettings;
  public state: AgentState;
  public browserSession?: BrowserSession;
  public messageManager: MessageManager;
  public screenshotService?: ScreenshotService;
  
  // Context and callbacks
  public context?: TContext;
  public sensitiveData?: SensitiveData;
  
  // Runtime state
  private history: AgentHistory[] = [];
  private stepStartTime: number = 0;
  private sessionStartTime: number = 0;
  private taskStartTime: number = 0;
  
  constructor(options: {
    task: string;
    llm: BaseChatModel;
    settings?: Partial<AgentSettings>;
    state?: AgentState;
    browserSession?: BrowserSession;
    context?: TContext;
    sensitiveData?: SensitiveData;
    agentDirectory?: string;
  }) {
    super();
    
    this.task = options.task;
    this.llm = options.llm;
    this.settings = createAgentSettings(options.settings || {});
    this.state = options.state || createAgentState({});
    this.browserSession = options.browserSession;
    this.context = options.context;
    this.sensitiveData = options.sensitiveData;
    
    // Initialize screenshot service
    if (options.agentDirectory) {
      this.screenshotService = new ScreenshotService(options.agentDirectory);
      console.debug(`📸 Screenshot service initialized in: ${path.join(options.agentDirectory, 'screenshots')}`);
    }
    
    // Initialize message manager
    const systemMessage = this.createSystemMessage();
    this.messageManager = new MessageManager({
      task: this.task,
      systemMessage,
      fileSystem: null, // TODO: Implement FileSystem
      state: this.state.message_manager_state,
      useThinking: this.settings.use_thinking,
      includeAttributes: this.settings.include_attributes || [],
      sensitiveData: this.sensitiveData,
      maxHistoryItems: this.settings.max_history_items,
      visionDetailLevel: this.settings.vision_detail_level,
      includeToolCallExamples: this.settings.include_tool_call_examples,
      includeRecentEvents: false, // TODO: Implement recent events
    });
  }

  /**
   * Get instance-specific logger with task ID and session info
   */
  get logger() {
    const browserSessionId = this.browserSession?.id || '----';
    const currentTargetId = this.browserSession?.agentFocus?.targetId?.slice(-2) || '--';
    return getLogger(`browser_use.Agent🅰 ${this.taskId.slice(-4)} ⇢ 🅑 ${browserSessionId.slice(-4)} 🅣 ${currentTargetId}`);
  }
  
  /**
   * Create the system message for the agent
   */
  private createSystemMessage(): SystemMessage {
    let systemContent = 'You are a browser automation agent.';
    
    if (this.settings.override_system_message) {
      systemContent = this.settings.override_system_message;
    } else {
      // TODO: Implement proper SystemPrompt class
      systemContent = `You are a browser automation agent. Your task is: ${this.task}`;
      
      if (this.settings.extend_system_message) {
        systemContent += `\n\n${this.settings.extend_system_message}`;
      }
    }
    
    return createSystemMessage(systemContent);
  }
  
  /**
   * Execute the task with maximum number of steps
   */
  async run(
    maxSteps: number = 100,
    onStepStart?: AgentHookFunc<this>,
    onStepEnd?: AgentHookFunc<this>
  ): Promise<AgentHistoryListHelper> {
    this.logger.info(`🤖 Starting agent run - Task: ${this.task}`);
    this.logger.debug(`🔧 Agent setup: Agent Session ID ${this.sessionId.slice(-4)}, Task ID ${this.taskId.slice(-4)}, Browser Session ID ${this.browserSession?.id.slice(-4) || 'None'}`);
    
    // Initialize timing
    this.sessionStartTime = Date.now();
    this.taskStartTime = this.sessionStartTime;
    
    try {
      // Initialize browser session if not provided
      if (!this.browserSession) {
        throw new Error('BrowserSession is required but not provided');
      }
      
      // Main execution loop
      while (this.state.n_steps < maxSteps && !this.isDone() && !this.state.stopped) {
        if (this.state.paused) {
          await sleep(1000); // Sleep 1 second if paused
          continue;
        }
        
        const stepInfo = createAgentStepInfo(this.state.n_steps, maxSteps);
        
        // Execute pre-step hook
        if (onStepStart) {
          await onStepStart(this);
        }
        
        // Execute the step
        await this.step(stepInfo);
        
        // Execute post-step hook
        if (onStepEnd) {
          await onStepEnd(this);
        }
        
        // Check for consecutive failures
        if (this.state.consecutive_failures >= this.settings.max_failures) {
          this.logger.error(`❌ Max failures (${this.settings.max_failures}) reached. Stopping.`);
          break;
        }
      }
      
      // Create and return history list
      const historyList = new AgentHistoryListHelper({
        history: this.history,
        usage: null, // TODO: Implement usage tracking
      });
      
      if (this.isDone()) {
        this.logger.info('✅ Agent completed successfully');
      } else if (this.state.n_steps >= maxSteps) {
        this.logger.warn(`⚠️ Agent reached max steps (${maxSteps})`);
      } else if (this.state.stopped) {
        this.logger.info('🛑 Agent was stopped');
      }
      
      return historyList;
      
    } catch (error) {
      this.logger.error('❌ Agent run failed:', error);
      throw error;
    }
  }
  
  /**
   * Execute one step of the task
   */
  async step(stepInfo?: AgentStepInfo): Promise<void> {
    this.stepStartTime = Date.now();
    
    try {
      this.logger.info(`\n🔄 Step ${this.state.n_steps + 1}${stepInfo ? `/${stepInfo.max_steps}` : ''}`);
      
      // Phase 1: Prepare context
      const browserStateSummary = await this.prepareContext(stepInfo);
      
      // Phase 2: Get model output and execute actions
      await this.getNextAction(browserStateSummary, stepInfo);
      await this.executeActions();
      
      // Phase 3: Post-processing
      await this.postProcess(browserStateSummary, stepInfo);
      
    } catch (error) {
      await this.handleStepError(error);
    } finally {
      await this.finalizeStep();
    }
  }
  
  /**
   * Prepare the context for the step
   */
  private async prepareContext(stepInfo?: AgentStepInfo): Promise<BrowserStateSummary> {
    if (!this.browserSession) {
      throw new Error('BrowserSession is not set up');
    }
    
    this.logger.debug(`🌐 Step ${this.state.n_steps + 1}: Getting browser state...`);
    
    // Get browser state with screenshot
    // TODO: Implement getBrowserStateSummary method in BrowserSession
    const browserStateSummary: BrowserStateSummary = {
      url: 'http://example.com', // Placeholder
      title: 'Example Page',
      screenshot: this.settings.use_vision ? 'base64screenshot' : '',
      tabs: [],
      current_tab_id: 'tab1',
      page_info: {
        viewport_width: 1280,
        viewport_height: 720,
        page_width: 1280,
        page_height: 1080,
        scroll_x: 0,
        scroll_y: 0,
        max_scroll_x: 0,
        max_scroll_y: 360,
        device_pixel_ratio: 1,
        zoom_level: 1,
      },
      recent_events: [],
      timestamp: Date.now(),
      isPdfViewer: false,
    };
    
    if (browserStateSummary.screenshot) {
      this.logger.debug(`📸 Got browser state WITH screenshot`);
    } else {
      this.logger.debug('📸 Got browser state WITHOUT screenshot');
    }
    
    // TODO: Check for new downloads
    // TODO: Set up action models and page actions
    
    return browserStateSummary;
  }
  
  /**
   * Get the next action from the LLM
   */
  private async getNextAction(
    browserStateSummary: BrowserStateSummary,
    stepInfo?: AgentStepInfo
  ): Promise<void> {
    this.logger.debug('🤔 Generating LLM response...');
    
    // Create state messages
    await this.messageManager.createStateMessages({
      browserStateSummary,
      modelOutput: this.state.last_model_output,
      result: this.state.last_result,
      stepInfo,
      useVision: this.settings.use_vision,
      sensitiveData: this.sensitiveData,
    });
    
    // Get messages and make LLM call
    const messages = this.messageManager.getMessages();
    this.logger.debug(`📨 Sending ${messages.length} messages to LLM`);
    
    try {
      // TODO: Implement proper LLM call with structured output
      // For now, create a mock response
      const response: AgentOutput = {
        thinking: this.settings.use_thinking ? 'I need to analyze the current page and take the next action.' : null,
        evaluation_previous_goal: this.state.n_steps > 0 ? 'Previous step completed' : null,
        memory: `Currently on: ${logPrettyUrl(browserStateSummary.url)}`,
        next_goal: 'Continue with the task',
        action: [], // TODO: Implement action parsing
      };
      
      this.state.last_model_output = response;
      this.logger.debug('✅ Got LLM response');
      
      // TODO: Log response details
      
    } catch (error) {
      this.logger.error('❌ LLM call failed:', error);
      throw error;
    }
  }
  
  /**
   * Execute the actions from the model output
   */
  private async executeActions(): Promise<void> {
    if (!this.state.last_model_output?.action) {
      this.logger.warn('⚠️ No actions to execute');
      return;
    }
    
    this.logger.debug(`🎬 Executing ${this.state.last_model_output.action.length} action(s)...`);
    
    const results: ActionResult[] = [];
    
    // TODO: Implement actual action execution
    for (const action of this.state.last_model_output.action) {
      this.logger.debug(`🎯 Executing action: ${JSON.stringify(action)}`);
      
      // Mock result for now
      const result = createActionResult({
        success: true,
        long_term_memory: `Executed action successfully`,
      });
      
      results.push(result);
    }
    
    this.state.last_result = results;
    this.logger.debug(`✅ Completed ${results.length} action(s)`);
  }
  
  /**
   * Post-process after action execution
   */
  private async postProcess(
    browserStateSummary: BrowserStateSummary,
    stepInfo?: AgentStepInfo
  ): Promise<void> {
    // Create step metadata
    const stepEndTime = Date.now();
    const metadata = new StepMetadataHelper({
      step_start_time: this.stepStartTime,
      step_end_time: stepEndTime,
      step_number: this.state.n_steps + 1,
    });
    
    // Store screenshot if available
    let screenshotPath: string | null = null;
    if (browserStateSummary.screenshot && this.screenshotService) {
      this.logger.debug(
        `📸 Storing screenshot for step ${this.state.n_steps}, screenshot length: ${browserStateSummary.screenshot.length}`
      );
      screenshotPath = await this.screenshotService.storeScreenshot(
        browserStateSummary.screenshot, 
        this.state.n_steps
      );
      this.logger.debug(`📸 Screenshot stored at: ${screenshotPath}`);
    } else if (browserStateSummary.screenshot && !this.screenshotService) {
      this.logger.debug('📸 Screenshot available but ScreenshotService not initialized');
    } else {
      this.logger.debug(`📸 No screenshot in browser_state_summary for step ${this.state.n_steps}`);
    }
    
    // Create browser state history
    const stateHistory: BrowserStateHistory = {
      url: browserStateSummary.url,
      title: browserStateSummary.title,
      tabs: browserStateSummary.tabs,
      interacted_element: [], // TODO: Implement interacted elements
      screenshot_path: screenshotPath,
    };
    
    // Create and add history entry
    const historyEntry: AgentHistory = {
      model_output: this.state.last_model_output,
      result: this.state.last_result || [],
      state: stateHistory,
      metadata,
    };
    
    this.history.push(historyEntry);
    
    // Update state
    this.state.n_steps += 1;
    
    // Check for errors and update consecutive failures
    const hasError = this.state.last_result?.some(r => r.error) || false;
    if (hasError) {
      this.state.consecutive_failures += 1;
      this.logger.warn(`⚠️ Step had errors. Consecutive failures: ${this.state.consecutive_failures}`);
    } else {
      this.state.consecutive_failures = 0;
    }
    
    this.logger.debug(`📈 Step ${this.state.n_steps} completed in ${metadata.durationSeconds.toFixed(2)}s`);
  }
  
  /**
   * Handle step errors
   */
  private async handleStepError(error: any): Promise<void> {
    this.logger.error(`❌ Step ${this.state.n_steps + 1} failed:`, error);
    
    this.state.consecutive_failures += 1;
    
    // Create error result
    const errorResult = createActionResult({
      success: false,
      error: error.message || String(error),
    });
    
    this.state.last_result = [errorResult];
    
    // Wait before retry if configured
    if (this.settings.retry_delay > 0) {
      this.logger.debug(`⏳ Waiting ${this.settings.retry_delay}s before retry...`);
      await sleep(this.settings.retry_delay * 1000);
    }
  }
  
  /**
   * Finalize the step
   */
  private async finalizeStep(): Promise<void> {
    // TODO: Save conversation if configured
    // TODO: Generate GIF if configured
    // TODO: Emit events
    
    // Force garbage collection periodically
    if (this.state.n_steps % 10 === 0) {
      if (global.gc) {
        global.gc();
      }
    }
  }
  
  /**
   * Check if the agent is done
   */
  public isDone(): boolean {
    return this.state.last_result?.some(r => r.is_done) || false;
  }
  
  /**
   * Check if the agent was successful
   */
  public isSuccessful(): boolean | null {
    if (!this.isDone()) {
      return null;
    }
    
    const lastResult = this.state.last_result?.find(r => r.is_done);
    return lastResult?.success || false;
  }
  
  /**
   * Pause the agent
   */
  public pause(): void {
    this.state.paused = true;
    this.logger.info('⏸️ Agent paused');
  }
  
  /**
   * Resume the agent
   */
  public resume(): void {
    this.state.paused = false;
    this.logger.info('▶️ Agent resumed');
  }
  
  /**
   * Stop the agent
   */
  public stop(): void {
    this.state.stopped = true;
    this.logger.info('🛑 Agent stopped');
  }
  
  /**
   * Get the current history list
   */
  public getHistory(): AgentHistoryList {
    return new AgentHistoryListHelper({
      history: this.history,
      usage: null,
    });
  }
  
  /**
   * Add a new task (updates the current task)
   */
  public addNewTask(newTask: string): void {
    this.task = newTask;
    this.messageManager.addNewTask(newTask);
    this.logger.info(`🔄 Task updated: ${newTask}`);
  }
}

/**
 * Log the model's response (utility function)
 */
export function logResponse(response: AgentOutput, logger: any): void {
  if (response.thinking) {
    logger.debug(`💡 Thinking:\n${response.thinking}`);
  }
  
  if (response.evaluation_previous_goal) {
    const eval_goal = response.evaluation_previous_goal;
    if (eval_goal.toLowerCase().includes('success')) {
      logger.info(`  ✅ Eval: ${eval_goal}`);
    } else if (eval_goal.toLowerCase().includes('failure')) {
      logger.info(`  ❌ Eval: ${eval_goal}`);
    } else {
      logger.info(`  ❔ Eval: ${eval_goal}`);
    }
  }
  
  if (response.memory) {
    logger.debug(`🧠 Memory: ${response.memory}`);
  }
  
  if (response.next_goal) {
    logger.info(`  🎯 Next goal: ${response.next_goal}`);
  }
}