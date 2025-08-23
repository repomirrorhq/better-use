#!/usr/bin/env ts-node

/**
 * Data Extraction Example
 * 
 * This example demonstrates how to extract structured data from web pages
 * using browser-use with schema validation.
 */

import { BrowserUse } from '../../src/index';
import { z } from 'zod';

// Define a schema for the data we want to extract
const NewsArticleSchema = z.object({
  headline: z.string().describe('The main headline of the article'),
  summary: z.string().describe('A brief summary of the article content'),
  publishDate: z.string().describe('When the article was published'),
  author: z.string().optional().describe('The author of the article if available'),
  category: z.string().optional().describe('The category or section of the article')
});

type NewsArticle = z.infer<typeof NewsArticleSchema>;

async function main() {
  console.log('Starting data extraction example...');
  
  try {
    const browserUse = new BrowserUse();
    
    // Extract structured data from a news website
    const result = await browserUse.run<NewsArticle>(
      'Go to https://news.ycombinator.com and find the top story. ' +
      'Extract the headline, summary, publish date, author (if available), and category.',
      {
        headless: false,
        viewportSize: { width: 1280, height: 720 },
        outputSchema: NewsArticleSchema
      }
    );
    
    console.log('Extracted article data:');
    console.log(JSON.stringify(result.completion, null, 2));
    
    // Validate the extracted data
    try {
      const validatedData = NewsArticleSchema.parse(result.completion);
      console.log('✅ Data validation successful');
      console.log(`Article: "${validatedData.headline}"`);
      console.log(`Summary: ${validatedData.summary}`);
    } catch (validationError) {
      console.warn('❌ Data validation failed:', validationError);
    }
    
  } catch (error) {
    console.error('Error during data extraction:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}