import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

// Constants
export const INVALID_FILENAME_ERROR_MESSAGE = 'Error: Invalid filename format. Must be alphanumeric with supported extension.';
export const DEFAULT_FILE_SYSTEM_PATH = 'browseruse_agent_data';

// Custom exception for file system operations
export class FileSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileSystemError';
  }
}

// Base file interface
export interface BaseFile {
  name: string;
  content: string;
  extension: string;
  fullName: string;
  size: number;
  lineCount: number;
  
  writeFileContent(content: string): void;
  appendFileContent(content: string): void;
  updateContent(content: string): void;
  syncToDiskSync(basePath: string): void;
  syncToDisk(basePath: string): Promise<void>;
  write(content: string, basePath: string): Promise<void>;
  append(content: string, basePath: string): Promise<void>;
  read(): string;
}

// Abstract base file class
export abstract class AbstractBaseFile implements BaseFile {
  constructor(
    public name: string,
    public content: string = ''
  ) {}

  abstract get extension(): string;

  get fullName(): string {
    return `${this.name}.${this.extension}`;
  }

  get size(): number {
    return this.content.length;
  }

  get lineCount(): number {
    return this.content.split('\n').length;
  }

  writeFileContent(content: string): void {
    this.updateContent(content);
  }

  appendFileContent(content: string): void {
    this.updateContent(this.content + content);
  }

  updateContent(content: string): void {
    this.content = content;
  }

  syncToDiskSync(basePath: string): void {
    const filePath = path.join(basePath, this.fullName);
    require('fs').writeFileSync(filePath, this.content, 'utf8');
  }

  async syncToDisk(basePath: string): Promise<void> {
    const filePath = path.join(basePath, this.fullName);
    await fs.writeFile(filePath, this.content, 'utf8');
  }

  async write(content: string, basePath: string): Promise<void> {
    this.writeFileContent(content);
    await this.syncToDisk(basePath);
  }

  async append(content: string, basePath: string): Promise<void> {
    this.appendFileContent(content);
    await this.syncToDisk(basePath);
  }

  read(): string {
    return this.content;
  }
}

// Specific file type implementations
export class MarkdownFile extends AbstractBaseFile {
  get extension(): string {
    return 'md';
  }
}

export class TxtFile extends AbstractBaseFile {
  get extension(): string {
    return 'txt';
  }
}

export class JsonFile extends AbstractBaseFile {
  get extension(): string {
    return 'json';
  }
}

export class CsvFile extends AbstractBaseFile {
  get extension(): string {
    return 'csv';
  }
}

export class PdfFile extends AbstractBaseFile {
  get extension(): string {
    return 'pdf';
  }

  syncToDiskSync(basePath: string): void {
    // For now, just save as text. In a full implementation, 
    // you'd use a PDF generation library like puppeteer-pdf
    const filePath = path.join(basePath, this.fullName);
    require('fs').writeFileSync(filePath, this.content, 'utf8');
  }

  async syncToDisk(basePath: string): Promise<void> {
    // For now, just save as text. In a full implementation, 
    // you'd use a PDF generation library like puppeteer-pdf
    const filePath = path.join(basePath, this.fullName);
    await fs.writeFile(filePath, this.content, 'utf8');
  }
}

// File system state schema
export const FileSystemStateSchema = z.object({
  files: z.record(z.string(), z.object({
    type: z.string(),
    data: z.object({
      name: z.string(),
      content: z.string()
    })
  })),
  baseDir: z.string(),
  extractedContentCount: z.number().default(0)
});

export type FileSystemState = z.infer<typeof FileSystemStateSchema>;

// Main FileSystem class
export class FileSystem {
  private baseDir: string;
  private dataDir: string;
  private files: Map<string, BaseFile> = new Map();
  private extractedContentCount = 0;
  private fileTypes: Record<string, new (name: string) => BaseFile> = {
    'md': MarkdownFile,
    'txt': TxtFile,
    'json': JsonFile,
    'csv': CsvFile,
    'pdf': PdfFile,
  };

  constructor(baseDir: string | path.ParsedPath, createDefaultFiles = true) {
    this.baseDir = typeof baseDir === 'string' ? baseDir : path.format(baseDir);
    this.dataDir = path.join(this.baseDir, DEFAULT_FILE_SYSTEM_PATH);
    
    this.initializeDirectories();
    
    if (createDefaultFiles) {
      this.createDefaultFiles();
    }
  }

  private initializeDirectories(): void {
    try {
      // Create base directory if it doesn't exist
      require('fs').mkdirSync(this.baseDir, { recursive: true });
      
      // Clean and recreate data directory
      if (require('fs').existsSync(this.dataDir)) {
        require('fs').rmSync(this.dataDir, { recursive: true, force: true });
      }
      require('fs').mkdirSync(this.dataDir, { recursive: true });
    } catch (error) {
      throw new FileSystemError(`Failed to initialize directories: ${error}`);
    }
  }

  getAllowedExtensions(): string[] {
    return Object.keys(this.fileTypes);
  }

  private getFileTypeClass(extension: string): (new (name: string) => BaseFile) | null {
    return this.fileTypes[extension.toLowerCase()] || null;
  }

  private createDefaultFiles(): void {
    const defaultFiles = ['todo.md'];
    
    for (const fullFilename of defaultFiles) {
      const { name, extension } = this.parseFilename(fullFilename);
      const FileClass = this.getFileTypeClass(extension);
      
      if (!FileClass) {
        throw new Error(`Error: Invalid file extension '${extension}' for file '${fullFilename}'.`);
      }

      const fileObj = new FileClass(name);
      this.files.set(fullFilename, fileObj);
      fileObj.syncToDiskSync(this.dataDir);
    }
  }

  private isValidFilename(filename: string): boolean {
    const extensions = Object.keys(this.fileTypes).join('|');
    const pattern = new RegExp(`^[a-zA-Z0-9_\\-]+\\.(${extensions})$`);
    return pattern.test(filename);
  }

  private parseFilename(filename: string): { name: string; extension: string } {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1) {
      throw new Error(`Invalid filename format: ${filename}`);
    }
    
    const name = filename.substring(0, lastDotIndex);
    const extension = filename.substring(lastDotIndex + 1).toLowerCase();
    return { name, extension };
  }

  getDir(): string {
    return this.dataDir;
  }

  getFile(fullFilename: string): BaseFile | null {
    if (!this.isValidFilename(fullFilename)) {
      return null;
    }
    return this.files.get(fullFilename) || null;
  }

  listFiles(): string[] {
    return Array.from(this.files.values()).map(file => file.fullName);
  }

  displayFile(fullFilename: string): string | null {
    if (!this.isValidFilename(fullFilename)) {
      return null;
    }

    const fileObj = this.getFile(fullFilename);
    if (!fileObj) {
      return null;
    }

    return fileObj.read();
  }

  async readFile(fullFilename: string, externalFile = false): Promise<string> {
    if (externalFile) {
      try {
        const { extension } = this.parseFilename(fullFilename);
        
        if (['md', 'txt', 'json', 'csv'].includes(extension)) {
          const content = await fs.readFile(fullFilename, 'utf8');
          return `Read from file ${fullFilename}.\n<content>\n${content}\n</content>`;
        } else if (extension === 'pdf') {
          // For PDF reading, you'd need to implement PDF parsing
          // For now, return an error
          return `Error: PDF reading not yet implemented for external files.`;
        } else {
          return `Error: Cannot read file ${fullFilename} as ${extension} extension is not supported.`;
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return `Error: File '${fullFilename}' not found.`;
        } else if (error.code === 'EACCES') {
          return `Error: Permission denied to read file '${fullFilename}'.`;
        } else {
          return `Error: Could not read file '${fullFilename}'.`;
        }
      }
    }

    if (!this.isValidFilename(fullFilename)) {
      return INVALID_FILENAME_ERROR_MESSAGE;
    }

    const fileObj = this.getFile(fullFilename);
    if (!fileObj) {
      return `File '${fullFilename}' not found.`;
    }

    try {
      const content = fileObj.read();
      return `Read from file ${fullFilename}.\n<content>\n${content}\n</content>`;
    } catch (error) {
      if (error instanceof FileSystemError) {
        return error.message;
      }
      return `Error: Could not read file '${fullFilename}'.`;
    }
  }

  async writeFile(fullFilename: string, content: string): Promise<string> {
    if (!this.isValidFilename(fullFilename)) {
      return INVALID_FILENAME_ERROR_MESSAGE;
    }

    try {
      const { name, extension } = this.parseFilename(fullFilename);
      const FileClass = this.getFileTypeClass(extension);
      
      if (!FileClass) {
        throw new Error(`Error: Invalid file extension '${extension}' for file '${fullFilename}'.`);
      }

      // Create or get existing file
      let fileObj = this.files.get(fullFilename);
      if (!fileObj) {
        fileObj = new FileClass(name);
        this.files.set(fullFilename, fileObj);
      }

      // Use file-specific write method
      await fileObj.write(content, this.dataDir);
      return `Data written to file ${fullFilename} successfully.`;
    } catch (error) {
      if (error instanceof FileSystemError) {
        return error.message;
      }
      return `Error: Could not write to file '${fullFilename}'. ${error}`;
    }
  }

  async appendFile(fullFilename: string, content: string): Promise<string> {
    if (!this.isValidFilename(fullFilename)) {
      return INVALID_FILENAME_ERROR_MESSAGE;
    }

    const fileObj = this.getFile(fullFilename);
    if (!fileObj) {
      return `File '${fullFilename}' not found.`;
    }

    try {
      await fileObj.append(content, this.dataDir);
      return `Data appended to file ${fullFilename} successfully.`;
    } catch (error) {
      if (error instanceof FileSystemError) {
        return error.message;
      }
      return `Error: Could not append to file '${fullFilename}'. ${error}`;
    }
  }

  async replaceFileStr(fullFilename: string, oldStr: string, newStr: string): Promise<string> {
    if (!this.isValidFilename(fullFilename)) {
      return INVALID_FILENAME_ERROR_MESSAGE;
    }

    if (!oldStr) {
      return 'Error: Cannot replace empty string. Please provide a non-empty string to replace.';
    }

    const fileObj = this.getFile(fullFilename);
    if (!fileObj) {
      return `File '${fullFilename}' not found.`;
    }

    try {
      const content = fileObj.read();
      const newContent = content.replace(new RegExp(oldStr, 'g'), newStr);
      await fileObj.write(newContent, this.dataDir);
      return `Successfully replaced all occurrences of "${oldStr}" with "${newStr}" in file ${fullFilename}`;
    } catch (error) {
      if (error instanceof FileSystemError) {
        return error.message;
      }
      return `Error: Could not replace string in file '${fullFilename}'. ${error}`;
    }
  }

  async saveExtractedContent(content: string): Promise<string> {
    const initialFilename = `extracted_content_${this.extractedContentCount}`;
    const extractedFilename = `${initialFilename}.md`;
    const fileObj = new MarkdownFile(initialFilename);
    
    await fileObj.write(content, this.dataDir);
    this.files.set(extractedFilename, fileObj);
    this.extractedContentCount++;
    
    return `Extracted content saved to file ${extractedFilename} successfully.`;
  }

  describe(): string {
    const DISPLAY_CHARS = 400;
    let description = '';

    for (const fileObj of this.files.values()) {
      // Skip todo.md from description
      if (fileObj.fullName === 'todo.md') {
        continue;
      }

      const content = fileObj.read();

      // Handle empty files
      if (!content) {
        description += `<file>\n${fileObj.fullName} - [empty file]\n</file>\n`;
        continue;
      }

      const lines = content.split('\n');
      const lineCount = lines.length;

      // For small files, display the entire content
      const wholeFileDescription = 
        `<file>\n${fileObj.fullName} - ${lineCount} lines\n<content>\n${content}\n</content>\n</file>\n`;
      
      if (content.length < 1.5 * DISPLAY_CHARS) {
        description += wholeFileDescription;
        continue;
      }

      // For larger files, display start and end previews
      const halfDisplayChars = Math.floor(DISPLAY_CHARS / 2);

      // Get start preview
      let startPreview = '';
      let startLineCount = 0;
      let charsCount = 0;
      
      for (const line of lines) {
        if (charsCount + line.length + 1 > halfDisplayChars) {
          break;
        }
        startPreview += line + '\n';
        charsCount += line.length + 1;
        startLineCount++;
      }

      // Get end preview
      let endPreview = '';
      let endLineCount = 0;
      charsCount = 0;
      
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (charsCount + line.length + 1 > halfDisplayChars) {
          break;
        }
        endPreview = line + '\n' + endPreview;
        charsCount += line.length + 1;
        endLineCount++;
      }

      // Calculate lines in between
      const middleLineCount = lineCount - startLineCount - endLineCount;
      if (middleLineCount <= 0) {
        description += wholeFileDescription;
        continue;
      }

      startPreview = startPreview.trim();
      endPreview = endPreview.trim();

      // Format output
      if (!startPreview && !endPreview) {
        description += `<file>\n${fileObj.fullName} - ${lineCount} lines\n<content>\n${middleLineCount} lines...\n</content>\n</file>\n`;
      } else {
        description += `<file>\n${fileObj.fullName} - ${lineCount} lines\n<content>\n${startPreview}\n`;
        description += `... ${middleLineCount} more lines ...\n`;
        description += `${endPreview}\n</content>\n</file>\n`;
      }
    }

    return description.trim();
  }

  getTodoContents(): string {
    const todoFile = this.getFile('todo.md');
    return todoFile ? todoFile.read() : '';
  }

  getState(): FileSystemState {
    const filesData: Record<string, any> = {};
    
    for (const [fullFilename, fileObj] of this.files.entries()) {
      filesData[fullFilename] = {
        type: fileObj.constructor.name,
        data: {
          name: fileObj.name,
          content: fileObj.content
        }
      };
    }

    return {
      files: filesData,
      baseDir: this.baseDir,
      extractedContentCount: this.extractedContentCount
    };
  }

  nuke(): void {
    try {
      require('fs').rmSync(this.dataDir, { recursive: true, force: true });
    } catch (error) {
      throw new FileSystemError(`Failed to delete file system directory: ${error}`);
    }
  }

  static fromState(state: FileSystemState): FileSystem {
    // Create file system without default files
    const fs = new FileSystem(state.baseDir, false);
    fs.extractedContentCount = state.extractedContentCount;

    // Restore all files
    for (const [fullFilename, fileData] of Object.entries(state.files)) {
      const fileType = fileData.type;
      const fileInfo = fileData.data;

      let fileObj: BaseFile;
      
      // Create the appropriate file object based on type
      switch (fileType) {
        case 'MarkdownFile':
          fileObj = new MarkdownFile(fileInfo.name, fileInfo.content);
          break;
        case 'TxtFile':
          fileObj = new TxtFile(fileInfo.name, fileInfo.content);
          break;
        case 'JsonFile':
          fileObj = new JsonFile(fileInfo.name, fileInfo.content);
          break;
        case 'CsvFile':
          fileObj = new CsvFile(fileInfo.name, fileInfo.content);
          break;
        case 'PdfFile':
          fileObj = new PdfFile(fileInfo.name, fileInfo.content);
          break;
        default:
          // Skip unknown file types
          continue;
      }

      // Add to files map and sync to disk
      fs.files.set(fullFilename, fileObj);
      fileObj.syncToDiskSync(fs.dataDir);
    }

    return fs;
  }
}