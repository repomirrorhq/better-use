/**
 * Authentication service for sync functionality
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { AuthInfo, AuthInfoSchema } from './types';

/**
 * Authentication service for browser-use sync
 */
export class AuthService {
  private static readonly CONFIG_DIR = path.join(os.homedir(), '.config', 'browser-use-ts');
  private static readonly AUTH_FILE = path.join(AuthService.CONFIG_DIR, 'auth.json');
  private static readonly KEY_FILE = path.join(AuthService.CONFIG_DIR, '.auth_key');

  private authInfo: AuthInfo | null = null;
  private encryptionKey: Buffer | null = null;

  constructor() {
    this.initializeEncryptionKey();
  }

  /**
   * Authenticate with API credentials
   */
  async authenticate(apiKey: string, userId?: string): Promise<AuthInfo> {
    try {
      // For now, this is a simple implementation
      // In a real implementation, you would exchange the API key for a token
      const authInfo: AuthInfo = {
        userId: userId || this.generateUserId(apiKey),
        token: apiKey,
        scopes: ['sync', 'telemetry'],
      };

      await this.saveAuthInfo(authInfo);
      this.authInfo = authInfo;

      return authInfo;
    } catch (error) {
      throw new Error(`Authentication failed: ${error}`);
    }
  }

  /**
   * Get current authentication info
   */
  async getAuthInfo(): Promise<AuthInfo | null> {
    if (!this.authInfo) {
      await this.loadAuthInfo();
    }
    return this.authInfo;
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const authInfo = await this.getAuthInfo();
    return authInfo !== null && this.isTokenValid(authInfo);
  }

  /**
   * Logout and clear authentication info
   */
  async logout(): Promise<void> {
    try {
      await fs.unlink(AuthService.AUTH_FILE);
    } catch (error) {
      // File doesn't exist, ignore
    }
    
    this.authInfo = null;
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<AuthInfo | null> {
    const authInfo = await this.getAuthInfo();
    if (!authInfo || !authInfo.refreshToken) {
      return null;
    }

    try {
      // In a real implementation, you would call the refresh endpoint
      // For now, just return the existing auth info
      return authInfo;
    } catch (error) {
      throw new Error(`Token refresh failed: ${error}`);
    }
  }

  /**
   * Initialize encryption key for storing auth info
   */
  private async initializeEncryptionKey(): Promise<void> {
    try {
      try {
        const keyData = await fs.readFile(AuthService.KEY_FILE);
        this.encryptionKey = keyData;
      } catch (error) {
        // Generate new key
        this.encryptionKey = crypto.randomBytes(32);
        await fs.mkdir(AuthService.CONFIG_DIR, { recursive: true });
        await fs.writeFile(AuthService.KEY_FILE, this.encryptionKey, { mode: 0o600 });
      }
    } catch (error) {
      // Fall back to no encryption
      this.encryptionKey = null;
    }
  }

  /**
   * Save authentication info to disk (encrypted)
   */
  private async saveAuthInfo(authInfo: AuthInfo): Promise<void> {
    try {
      await fs.mkdir(AuthService.CONFIG_DIR, { recursive: true });
      
      const data = JSON.stringify(authInfo);
      let finalData: string;

      if (this.encryptionKey) {
        finalData = this.encrypt(data);
      } else {
        finalData = data;
      }

      await fs.writeFile(AuthService.AUTH_FILE, finalData, { mode: 0o600 });
    } catch (error) {
      throw new Error(`Failed to save auth info: ${error}`);
    }
  }

  /**
   * Load authentication info from disk (decrypt)
   */
  private async loadAuthInfo(): Promise<void> {
    try {
      const rawData = await fs.readFile(AuthService.AUTH_FILE, 'utf-8');
      let data: string;

      if (this.encryptionKey && rawData.startsWith('enc:')) {
        data = this.decrypt(rawData);
      } else {
        data = rawData;
      }

      const parsed = JSON.parse(data);
      this.authInfo = AuthInfoSchema.parse(parsed);
    } catch (error) {
      this.authInfo = null;
    }
  }

  /**
   * Check if token is valid (not expired)
   */
  private isTokenValid(authInfo: AuthInfo): boolean {
    if (!authInfo.expiresAt) {
      return true; // No expiration
    }
    return new Date() < authInfo.expiresAt;
  }

  /**
   * Generate user ID from API key
   */
  private generateUserId(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
  }

  /**
   * Encrypt data using the encryption key
   */
  private encrypt(data: string): string {
    if (!this.encryptionKey) {
      return data;
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `enc:${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt data using the encryption key
   */
  private decrypt(encryptedData: string): string {
    if (!this.encryptionKey || !encryptedData.startsWith('enc:')) {
      return encryptedData;
    }

    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}