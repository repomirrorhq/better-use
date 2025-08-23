import { FileSystem, MarkdownFile } from '../src/filesystem';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';

describe('Basic Integration Tests', () => {
  let testDir: string;
  let fileSystem: FileSystem;

  beforeEach(() => {
    testDir = path.join(__dirname, 'test-basic');
    fileSystem = new FileSystem(testDir);
  });

  afterEach(() => {
    try {
      fileSystem.nuke();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('FileSystem Core', () => {
    it('should create and manage basic files', async () => {
      // Write a file
      const writeResult = await fileSystem.writeFile('test.md', 'Hello World');
      expect(writeResult).toBeDefined();
      expect(typeof writeResult).toBe('string');

      // Read the file back
      const content = await fileSystem.readFile('test.md');
      expect(content).toContain('Hello World');

      // List files
      const files = fileSystem.listFiles();
      expect(files).toContain('test.md');
      expect(files).toContain('todo.md'); // Default file
    });

    it('should handle file extensions', () => {
      const extensions = fileSystem.getAllowedExtensions();
      expect(extensions).toEqual(expect.arrayContaining(['md', 'txt', 'json', 'csv', 'pdf']));
    });

    it('should create different file types', () => {
      const mdFile = new MarkdownFile('test');
      expect(mdFile.extension).toBe('md');
      expect(mdFile.fullName).toBe('test.md');
      expect(mdFile.size).toBe(0); // Empty content initially
      expect(mdFile.lineCount).toBe(1); // Empty string has 1 line
    });
  });

  describe('File Operations', () => {
    it('should save extracted content', async () => {
      const result = await fileSystem.saveExtractedContent('Some extracted data');
      expect(result).toContain('extracted_content_0.md');
      expect(result).toContain('successfully');
    });

    it('should handle invalid operations gracefully', async () => {
      // Invalid filename
      const invalidResult = await fileSystem.writeFile('bad-file.xyz', 'test');
      expect(invalidResult).toContain('Error');

      // Non-existent file
      const missingResult = await fileSystem.readFile('missing.md');
      expect(missingResult).toContain('not found');
    });
  });
});