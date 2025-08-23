/**
 * Mock LLM for testing purposes
 * Provides predetermined responses for agent tests
 */

import { BaseLLM } from '../../src/llm/base';
import { LLMMessage, LLMResponse } from '../../src/llm/messages';

export class MockLLM extends BaseLLM {
	private responses: string[];
	private currentIndex: number = 0;

	constructor(responses: string[]) {
		super();
		this.responses = responses;
	}

	async run(messages: LLMMessage[]): Promise<LLMResponse> {
		if (this.currentIndex >= this.responses.length) {
			throw new Error('No more mock responses available');
		}

		const response = this.responses[this.currentIndex];
		this.currentIndex++;

		return {
			content: response,
			usage: {
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
			},
		};
	}

	async generateStructuredOutput<T>(
		messages: LLMMessage[],
		schema: any
	): Promise<T> {
		const response = await this.run(messages);
		
		// Try to parse the response as JSON
		try {
			return JSON.parse(response.content);
		} catch (error) {
			throw new Error(`Failed to parse mock response as JSON: ${response.content}`);
		}
	}

	// Override the format method to return the response as-is
	format(messages: LLMMessage[]): any {
		return messages;
	}

	// Override the countTokens method
	countTokens(messages: LLMMessage[]): number {
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