import * as fs from 'fs';
import * as path from 'path';
import { Controller } from '../src/controller';
import { AgentOutput } from '../src/agent/views';
import { SchemaOptimizer } from '../src/llm/schema';
import { encode } from 'gpt-tokenizer';

describe('LLM Custom Structured Output', () => {
  test('optimized schema generation and token comparison', () => {
    // Create controller and get all registered actions
    const controller = new Controller();
    const ActionModel = controller.registry.createActionModel();

    // Create the agent output model with custom actions
    const agentOutputModel = AgentOutput.typeWithCustomActions(ActionModel);

    // Get original schema for comparison
    const originalSchema = agentOutputModel.schema;

    // Create the optimized schema
    const optimizedSchema = SchemaOptimizer.createOptimizedJsonSchema(agentOutputModel);

    // Create tmp directory if it doesn't exist
    const tmpDir = './tmp';
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Save optimized schema
    const schemaPath = path.join(tmpDir, 'optimized_schema.json');
    fs.writeFileSync(schemaPath, JSON.stringify(optimizedSchema, null, 2));

    console.log(`✅ Optimized schema generated and saved to ${schemaPath}`);

    // Compare token counts of both
    const originalTokens = encode(JSON.stringify(originalSchema)).length;
    const optimizedTokens = encode(JSON.stringify(optimizedSchema)).length;

    const savings = originalTokens - optimizedTokens;
    const savingsPercentage = originalTokens > 0 ? (savings / originalTokens * 100) : 0;

    console.log('\n📊 Token Count Comparison:');
    console.log(`   Original schema: ${originalTokens.toLocaleString()} tokens`);
    console.log(`   Optimized schema: ${optimizedTokens.toLocaleString()} tokens`);
    console.log(`   Token savings: ${savings.toLocaleString()} tokens (${savingsPercentage.toFixed(1)}% reduction)`);

    // Count tokens per action in optimized schema
    console.log('\n🔍 Tokens per Action in Optimized Schema:');

    if (optimizedSchema.properties && optimizedSchema.properties.action) {
      const actionProp = optimizedSchema.properties.action as any;
      if (actionProp.items && actionProp.items.anyOf) {
        const actions = actionProp.items.anyOf;

        let totalActionTokens = 0;
        actions.forEach((action: any, i: number) => {
          const actionJson = JSON.stringify(action);
          const actionTokens = encode(actionJson).length;
          totalActionTokens += actionTokens;

          // Try to get action name from the schema
          let actionName = 'Unknown';
          if (action.properties) {
            // Get the first property that's not common ones like 'index', 'reasoning'
            for (const propName of Object.keys(action.properties)) {
              if (!['index', 'reasoning'].includes(propName)) {
                actionName = propName;
                break;
              }
            }
          }

          console.log(`   Action ${i + 1} (${actionName}): ${actionTokens.toLocaleString()} tokens`);
        });

        console.log('\n📈 Summary:');
        console.log(`   Total actions: ${actions.length}`);
        console.log(`   Total action tokens: ${totalActionTokens.toLocaleString()} tokens`);
        console.log(`   Average tokens per action: ${Math.floor(totalActionTokens / actions.length).toLocaleString()} tokens`);
        console.log(`   Action tokens as % of total: ${(totalActionTokens / optimizedTokens * 100).toFixed(1)}%`);
      } else {
        console.log('   No actions found in expected schema structure');
      }
    } else {
      console.log('   No action property found in optimized schema');
    }

    // Assertions to ensure the test passes
    expect(optimizedSchema).toBeDefined();
    expect(optimizedSchema.properties).toBeDefined();
    expect(optimizedTokens).toBeLessThanOrEqual(originalTokens);
    expect(savingsPercentage).toBeGreaterThanOrEqual(0);
  });
});