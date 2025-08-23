/**
 * Mock LLM for testing purposes
 * Provides predetermined responses for agent tests
 */

import { AbstractChatModel } from '../../src/llm/base';
import { BaseMessage } from '../../src/llm/messages';
import { ChatInvokeCompletion, createCompletion } from '../../src/llm/views';
import { z } from 'zod';

export class MockLLM extends AbstractChatModel {
	private responses: string[];
	private currentIndex: number = 0;

	constructor(responses: string[]) {
		super('mock-model');
		this.responses = responses;
	}

	get provider(): string {
		return 'mock';
	}

	async ainvoke<T = string>(
		messages: BaseMessage[],
		outputFormat?: z.ZodSchema<T>
	): Promise<ChatInvokeCompletion<T>> {
		if (this.currentIndex >= this.responses.length) {
			throw new Error('No more mock responses available');
		}

		const response = this.responses[this.currentIndex];
		this.currentIndex++;

		// Parse the response if an output format is provided
		let parsedContent: T | string = response;
		if (outputFormat) {
			try {
				const jsonData = JSON.parse(response);
				parsedContent = outputFormat.parse(jsonData);
			} catch (error) {
				// If parsing fails, return the raw response
				parsedContent = response as T;
			}
		}

		return createCompletion({
			content: parsedContent,
			usage: {
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0,
			},
		});
	}

	// Helper method to get raw responses for backwards compatibility
	async run(messages: BaseMessage[]): Promise<{ content: string; usage: any }> {
		const result = await this.ainvoke(messages);
		return {
			content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
			usage: {
				inputTokens: result.usage?.prompt_tokens || 0,
				outputTokens: result.usage?.completion_tokens || 0,
				totalTokens: result.usage?.total_tokens || 0,
			},
		};
	}

	// Override the countTokens method
	countTokens(messages: BaseMessage[]): number {
		// Simple token count estimation
		return messages.reduce((total, msg) => {
			const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
			return total + Math.ceil(content.length / 4);
		}, 0);
	}
}

/**
 * Create a mock LLM with predetermined responses
 * @param responses Array of response strings
 * @returns MockLLM instance
 */
export function createMockLLM(responses: string[]): MockLLM {
	return new MockLLM(responses);
}