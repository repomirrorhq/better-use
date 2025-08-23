# Browser-Use TypeScript Examples

This directory contains example scripts demonstrating how to use browser-use with TypeScript.

## Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up API keys:**
   
   For OpenAI:
   ```bash
   export OPENAI_API_KEY="your_openai_api_key_here"
   ```
   
   For Anthropic Claude:
   ```bash
   export ANTHROPIC_API_KEY="your_anthropic_api_key_here"
   ```
   
   For other providers, see the [main README](../README.md) for environment variable names.

3. **Install ts-node globally (optional):**
   ```bash
   npm install -g ts-node
   ```

## Running Examples

### Getting Started

These examples demonstrate basic functionality:

- **Basic Search** (`getting_started/01_basic_search.ts`)
  ```bash
  ts-node examples/getting_started/01_basic_search.ts
  ```

- **Form Filling** (`getting_started/02_form_filling.ts`)
  ```bash
  ts-node examples/getting_started/02_form_filling.ts
  ```

- **Data Extraction** (`getting_started/03_data_extraction.ts`)
  ```bash
  ts-node examples/getting_started/03_data_extraction.ts
  ```

- **Multi-Step Task** (`getting_started/04_multi_step_task.ts`)
  ```bash
  ts-node examples/getting_started/04_multi_step_task.ts
  ```

- **Fast Agent** (`getting_started/05_fast_agent.ts`)
  ```bash
  ts-node examples/getting_started/05_fast_agent.ts
  ```

### Model Examples

These examples show how to use different LLM providers:

- **Anthropic Claude** (`models/anthropic_claude.ts`)
  ```bash
  ts-node examples/models/anthropic_claude.ts
  ```

- **OpenAI GPT** (`models/openai_gpt.ts`)
  ```bash
  ts-node examples/models/openai_gpt.ts
  ```

## Example Structure

Each example follows this general pattern:

1. **Import the library:** Import `BrowserUse` and any specific providers
2. **Configure the LLM:** Set up your preferred language model
3. **Create browser instance:** Initialize browser-use with your configuration
4. **Run the task:** Execute your automation task
5. **Handle results:** Process the results and any generated files

## Common Options

Most examples support these common options:

- `headless: boolean` - Run browser in headless mode (default: true)
- `viewportSize: {width: number, height: number}` - Set browser viewport size
- `outputSchema: ZodSchema` - Define structured output format
- `maxSteps: number` - Limit the number of automation steps
- `outputPath: string` - Directory for saving screenshots and files

## Tips for Writing Your Own Examples

1. **Start simple:** Begin with basic navigation and clicking
2. **Be specific:** Provide clear, detailed instructions to the AI
3. **Handle errors:** Always wrap your code in try-catch blocks
4. **Use schemas:** For data extraction, define Zod schemas for validation
5. **Monitor resources:** Be mindful of API costs and rate limits

## Need Help?

- Check the [main documentation](../README.md)
- Review the [test files](../tests/) for more code examples
- Open an issue on GitHub if you encounter problems

## Contributing Examples

We welcome contributions of new examples! Please:

1. Follow the existing code style
2. Add clear comments explaining what the example does
3. Include error handling
4. Update this README with information about your example