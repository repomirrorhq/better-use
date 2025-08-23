/**
 * Real Browser Example
 * 
 * This example demonstrates how to use Browser Use with a real Chrome profile
 * instead of a fresh browser session. This allows you to:
 * - Access sites where you're already logged in
 * - Use existing cookies and saved passwords
 * - Leverage browser extensions
 * - Maintain browsing history and preferences
 * 
 * SETUP: First copy your real Chrome profile (close Chrome first, then run):
 * 
 * Mac:
 * mkdir -p ~/.config/browseruse/profiles && cp -r ~/Library/Application\ Support/Google/Chrome ~/.config/browseruse/profiles/real-chrome
 * 
 * Windows:
 * mkdir %USERPROFILE%\.config\browseruse\profiles && xcopy "%LOCALAPPDATA%\Google\Chrome\User Data" "%USERPROFILE%\.config\browseruse\profiles\real-chrome" /E /I
 * 
 * Linux:
 * mkdir -p ~/.config/browseruse/profiles && cp -r ~/.config/google-chrome ~/.config/browseruse/profiles/real-chrome
 */

import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../../src/agent';
import { BrowserProfile } from '../../src/browser/profile';
import { BrowserSession } from '../../src/browser/session';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { Controller } from '../../src/controller';
import os from 'os';
import path from 'path';

// Get the appropriate Chrome executable path based on the operating system
function getChromeExecutablePath(): string {
    const platform = os.platform();
    
    switch (platform) {
        case 'darwin': // macOS
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        case 'win32': // Windows
            return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        case 'linux': // Linux
            return '/usr/bin/google-chrome';
        default:
            throw new Error(`Unsupported platform: ${platform}. Please specify Chrome executable path manually.`);
    }
}

// Get the appropriate profile directory path
function getProfilePath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.config', 'browseruse', 'profiles', 'real-chrome');
}

async function main(): Promise<void> {
    try {
        console.log('🌐 Real Browser Example');
        console.log('=' + '='.repeat(40));
        
        // Create browser profile using real Chrome profile
        const browserProfile = new BrowserProfile({
            executablePath: getChromeExecutablePath(),
            userDataDir: getProfilePath(),
        });
        
        console.log(`📁 Using profile: ${getProfilePath()}`);
        console.log(`🔧 Chrome executable: ${getChromeExecutablePath()}`);
        
        const browserSession = new BrowserSession({
            browserProfile
        });
        
        // Verify OpenAI API key
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is required');
        }
        
        const llm = new ChatOpenAI({
            model: 'gpt-4.1-mini',
            apiKey,
            temperature: 0
        });
        
        const controller = new Controller();
        
        const agent = new Agent({
            llm,
            task: 'Visit https://duckduckgo.com and search for "browser-use founders"',
            browserSession,
            controller,
            useVision: true
        });
        
        console.log('🚀 Starting agent with real browser profile...');
        console.log('📝 Task: Visit https://duckduckgo.com and search for "browser-use founders"');
        console.log('');
        console.log('Benefits of using real browser profile:');
        console.log('• Access to existing cookies and sessions');
        console.log('• Saved passwords and autofill data');
        console.log('• Browser extensions and themes');
        console.log('• Browsing history and bookmarks');
        console.log('• Customized settings and preferences');
        console.log('');
        
        await agent.run();
        
        console.log('✅ Task completed successfully!');
        console.log('');
        console.log('💡 Tips for using real browser profiles:');
        console.log('• Always close Chrome before copying the profile');
        console.log('• Use a dedicated profile copy to avoid conflicts');
        console.log('• Regular profiles contain sensitive data - be careful with sharing');
        console.log('• Consider creating a separate Chrome profile for automation');
        
        await browserSession.close();
        
    } catch (error) {
        console.error('❌ Error:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('Chrome executable')) {
                console.log('');
                console.log('🔧 Chrome Executable Not Found:');
                console.log('Make sure Google Chrome is installed and accessible at:');
                console.log(`  ${getChromeExecutablePath()}`);
                console.log('');
                console.log('Alternative locations to check:');
                if (os.platform() === 'darwin') {
                    console.log('• /Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
                    console.log('• /usr/local/bin/chrome');
                } else if (os.platform() === 'win32') {
                    console.log('• C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe');
                    console.log('• C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
                } else {
                    console.log('• /usr/bin/chromium-browser');
                    console.log('• /snap/bin/chromium');
                    console.log('• /usr/bin/google-chrome-stable');
                }
            } else if (error.message.includes('profile') || error.message.includes('user data')) {
                console.log('');
                console.log('📁 Profile Directory Issue:');
                console.log('Make sure you\'ve copied your Chrome profile to:');
                console.log(`  ${getProfilePath()}`);
                console.log('');
                console.log('Setup commands:');
                if (os.platform() === 'darwin') {
                    console.log('mkdir -p ~/.config/browseruse/profiles');
                    console.log('cp -r ~/Library/Application\\ Support/Google/Chrome ~/.config/browseruse/profiles/real-chrome');
                } else if (os.platform() === 'win32') {
                    console.log('mkdir %USERPROFILE%\\.config\\browseruse\\profiles');
                    console.log('xcopy "%LOCALAPPDATA%\\Google\\Chrome\\User Data" "%USERPROFILE%\\.config\\browseruse\\profiles\\real-chrome" /E /I');
                } else {
                    console.log('mkdir -p ~/.config/browseruse/profiles');
                    console.log('cp -r ~/.config/google-chrome ~/.config/browseruse/profiles/real-chrome');
                }
            }
        }
        
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}