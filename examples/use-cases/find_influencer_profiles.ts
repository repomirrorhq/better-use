/**
 * Find Influencer Profiles Use Case Example
 * 
 * This example demonstrates how to:
 * 1. Extract username from a TikTok video URL
 * 2. Search the web to find all social media profiles for that username
 * 3. Return structured data with profile links and platform names
 * 4. Use custom controller actions with structured output models
 * 
 * @dev You need to add OPENAI_API_KEY to your environment variables.
 * @dev You need to add BEARER_TOKEN for search API to your environment variables.
 */

import { z } from 'zod';
import { Agent } from '../../src/agent/index.js';
import { Controller } from '../../src/controller/index.js';
import { ChatOpenAI } from '../../src/llm/providers/openai.js';

// Define structured output schemas
const ProfileSchema = z.object({
  platform: z.string().describe('The social media platform name (e.g., Instagram, Twitter, YouTube)'),
  profile_url: z.string().url().describe('The URL to the profile on that platform'),
});

const ProfilesSchema = z.object({
  profiles: z.array(ProfileSchema).describe('List of social media profiles found'),
});

type Profile = z.infer<typeof ProfileSchema>;
type Profiles = z.infer<typeof ProfilesSchema>;

async function searchWeb(query: string): Promise<any[]> {
  const bearerToken = process.env.BEARER_TOKEN;
  
  if (!bearerToken) {
    throw new Error('BEARER_TOKEN is not set - go to https://www.heytessa.ai/ and create an API key');
  }

  try {
    const response = await fetch('https://asktessa.ai/api/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Search API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const sources = data.sources || [];

    // Filter results by score and extract relevant keys
    const keysToUse = ['url', 'title', 'content', 'author', 'score'];
    const filteredResults = sources
      .filter((source: any) => source.score >= 0.2)
      .map((source: any) => {
        const filtered: any = {};
        keysToUse.forEach(key => {
          if (key in source) {
            filtered[key] = source[key];
          }
        });
        return filtered;
      });

    console.log('Search results:', JSON.stringify(filteredResults, null, 2));
    return filteredResults;

  } catch (error) {
    console.error('Error searching web:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  console.log('🔍 Find Influencer Profiles Use Case Example');
  console.log('='.repeat(50));

  try {
    // Validate environment variables
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    if (!process.env.BEARER_TOKEN) {
      throw new Error('BEARER_TOKEN environment variable is required - get it from https://www.heytessa.ai/');
    }

    // Create controller with custom output model and exclude default search
    const controller = new Controller();
    
    // Register custom web search action
    controller.registry.register({
      name: 'search_web',
      description: 'Search the web for a specific query using external search API',
      parameters: z.object({
        query: z.string().describe('The search query to execute'),
      }),
      handler: async ({ query }: { query: string }) => {
        const results = await searchWeb(query);
        const resultText = JSON.stringify(results, null, 2);
        
        return {
          extracted_content: resultText,
          include_in_memory: true,
        };
      },
    });

    // Create LLM
    const llm = new ChatOpenAI({
      model: 'gpt-4.1-mini',
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Define the task
    const task = `
      Go to this TikTok video URL, open it and extract the @username from the resulting URL. 
      Then do a web search for this username to find all their social media profiles. 
      Return me the links to the social media profiles with the platform name.
      
      TikTok URL: https://www.tiktokv.com/share/video/7470981717659110678/
    `.trim();

    console.log('🚀 Starting influencer profile discovery...');
    console.log(`📋 Task: ${task}`);

    // Create and run agent
    const agent = new Agent({
      task,
      llm,
      controller,
    });

    const result = await agent.run();

    console.log('\n✅ Profile discovery completed!');
    
    // Try to extract structured profiles from the final result
    if (result.extractedContent) {
      try {
        // Try to parse as structured profiles
        let profileData: Profiles;
        
        // First try to parse the extracted content directly
        try {
          profileData = ProfilesSchema.parse(JSON.parse(result.extractedContent));
        } catch {
          // If that fails, try to extract from agent's structured response
          console.log('Attempting to extract profiles from agent response...');
          
          // Look for JSON-like content in the response
          const jsonMatch = result.extractedContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonStr = jsonMatch[0];
            const parsedData = JSON.parse(jsonStr);
            profileData = ProfilesSchema.parse(parsedData);
          } else {
            throw new Error('Could not find structured data in response');
          }
        }

        console.log('\n📊 Found Social Media Profiles:');
        console.log('='.repeat(40));
        
        profileData.profiles.forEach((profile, index) => {
          console.log(`\n${index + 1}. ${profile.platform}`);
          console.log(`   URL: ${profile.profile_url}`);
        });

        if (profileData.profiles.length === 0) {
          console.log('No social media profiles found.');
        }

      } catch (parseError) {
        console.log('\n⚠️  Could not parse structured profile data');
        console.log('📝 Raw result:');
        console.log(result.extractedContent);
      }
    } else {
      console.log('❌ No result extracted from the agent');
    }

    // Print usage statistics
    if (result.history.usage) {
      console.log('\n📊 Usage Statistics:');
      console.log(`Total tokens: ${result.history.usage.total_tokens}`);
      console.log(`Prompt tokens: ${result.history.usage.prompt_tokens}`);
      console.log(`Completion tokens: ${result.history.usage.completion_tokens}`);
      if (result.history.usage.total_cost) {
        console.log(`Total cost: $${result.history.usage.total_cost.toFixed(4)}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error running influencer profile discovery:', error);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure you have set the required environment variables:');
    console.log('   export OPENAI_API_KEY="your-openai-api-key"');
    console.log('   export BEARER_TOKEN="your-search-api-token"');
    console.log('2. Get a search API token from https://www.heytessa.ai/');
    console.log('3. Ensure the browser-use project is built: npm run build');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Failed to run find influencer profiles example:', error);
    process.exit(1);
  });
}