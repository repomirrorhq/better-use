# Scratchpad

## Quick Notes
- Project uses TypeScript with Jest for testing
- Multiple LLM providers supported (Anthropic, OpenAI, Google, etc.)
- Browser automation via Playwright
- MCP protocol implementation present

## Commands to Remember
```bash
# Run tests
npm test

# Run specific test file
npm test -- <test-file>

# Build project
npm run build

# Lint code
npm run lint

# Type check
npm run typecheck
```

## Issues Found
1. **Missing Playwright browsers** - Need to run `npx playwright install`
2. **Missing module** - `../src/dom/types` not found in test file
3. **Multiple test failures** - Due to browser not being installed

## Working Notes
- Starting with .agent directory setup
- Next: Run test suite to identify issues