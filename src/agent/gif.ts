/**
 * GIF generation system for better-use TypeScript
 * 
 * This module provides comprehensive GIF creation capabilities including:
 * - Creates animated GIFs from agent execution history
 * - Overlays task descriptions and goals on screenshots  
 * - Support for Unicode text rendering (Chinese, Arabic, etc.)
 * - Font fallback system for cross-platform compatibility
 * - Configurable duration, font sizes, logos
 */

import { Canvas, CanvasRenderingContext2D, createCanvas, loadImage, registerFont } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import GIFEncoder from 'gif-encoder-2';
import { CONFIG } from '../config';
import { getLogger } from '../logging';

const logger = getLogger('better_use.agent.gif');

// GIF generation configuration
export interface GIFGenerationConfig {
  output_path?: string;
  duration?: number; // Duration per frame in milliseconds
  show_goals?: boolean;
  show_task?: boolean;  
  show_logo?: boolean;
  font_size?: number;
  title_font_size?: number;
  goal_font_size?: number;
  margin?: number;
  line_spacing?: number;
  text_color?: [number, number, number, number]; // RGBA
  text_box_color?: [number, number, number, number]; // RGBA
}

// Default configuration
const DEFAULT_GIF_CONFIG: Required<GIFGenerationConfig> = {
  output_path: 'agent_history.gif',
  duration: 3000,
  show_goals: true,
  show_task: true,
  show_logo: false,
  font_size: 40,
  title_font_size: 56,
  goal_font_size: 44,
  margin: 40,
  line_spacing: 1.5,
  text_color: [255, 255, 255, 255], // White with full opacity
  text_box_color: [0, 0, 0, 255] // Black with full opacity
};

/**
 * Placeholder for 4px screenshot (about:blank pages)
 */
export const PLACEHOLDER_4PX_SCREENSHOT = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAD0lEQVQIHWPY//8/AzMDGwAhgwP/PpKjDAAAAABJRU5ErkJggg==';

/**
 * History item interface (placeholder for actual types)
 */
export interface HistoryItem {
  state: {
    get_screenshot(): string | null;
    url: string;
  };
  model_output: {
    current_state: {
      next_goal: string;
      evaluation_previous_goal: string;
      memory: string;
    };
  } | null;
}

/**
 * Agent history list interface
 */
export interface AgentHistoryList {
  history: HistoryItem[];
  screenshots(return_none_if_not_screenshot?: boolean): (string | null)[];
}

/**
 * Handle decoding unicode escape sequences for GIF overlay text
 * (needed for non-ASCII languages like Chinese or Arabic)
 */
export function decodeUnicodeEscapesToUTF8(text: string): string {
  if (!text.includes('\\u')) {
    // No escape sequences to decode
    return text;
  }

  try {
    // Try to decode Unicode escape sequences by replacing them
    return text.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
  } catch (error) {
    logger.debug(`Failed to decode unicode escape sequences: ${text}`);
    return text;
  }
}

/**
 * Check if a URL is a new tab page that should be skipped
 */
export function isNewTabPage(url: string): boolean {
  const newTabUrls = [
    'chrome://newtab/',
    'chrome://new-tab-page/',
    'about:blank',
    'about:newtab',
    'edge://newtab/',
    'edge://new-tab-page/',
  ];
  
  return newTabUrls.some(tabUrl => url.startsWith(tabUrl));
}

/**
 * Load fonts for text rendering with fallback support
 */
function loadFonts(): { 
  regular: string, 
  title: string, 
  goal: string,
  fontLoaded: boolean 
} {
  let fontLoaded = false;
  
  // Font options in order of preference (best for international text first)
  const fontOptions = [
    'Microsoft YaHei', // 微软雅黑
    'SimHei', // 黑体  
    'SimSun', // 宋体
    'Noto Sans CJK SC', // 思源黑体
    'WenQuanYi Micro Hei', // 文泉驿微米黑
    'Helvetica',
    'Arial',
    'DejaVu Sans',
    'Verdana'
  ];

  for (const fontName of fontOptions) {
    try {
      let fontPath: string;
      
      if (os.platform() === 'win32') {
        // Windows font path
        fontPath = path.join(CONFIG.WIN_FONT_DIR, fontName + '.ttf');
      } else if (os.platform() === 'darwin') {
        // macOS font paths
        const macPaths = [
          `/System/Library/Fonts/${fontName}.ttc`,
          `/System/Library/Fonts/${fontName}.ttf`,
          `/Library/Fonts/${fontName}.ttf`,
          `/Users/${os.userInfo().username}/Library/Fonts/${fontName}.ttf`
        ];
        fontPath = macPaths.find(p => fs.existsSync(p)) || '';
      } else {
        // Linux font paths
        const linuxPaths = [
          `/usr/share/fonts/truetype/${fontName.toLowerCase()}/${fontName.replace(/\s/g, '')}.ttf`,
          `/usr/share/fonts/truetype/dejavu/${fontName.replace(/\s/g, '-')}.ttf`,
          `/usr/share/fonts/TTF/${fontName.replace(/\s/g, '')}.ttf`,
          `/usr/local/share/fonts/${fontName.replace(/\s/g, '')}.ttf`
        ];
        fontPath = linuxPaths.find(p => fs.existsSync(p)) || '';
      }

      if (fontPath && fs.existsSync(fontPath)) {
        registerFont(fontPath, { family: fontName });
        fontLoaded = true;
        logger.debug(`Loaded font: ${fontName} from ${fontPath}`);
        return {
          regular: fontName,
          title: fontName,
          goal: fontName,
          fontLoaded: true
        };
      }
    } catch (error) {
      logger.debug(`Failed to load font ${fontName}:`, error);
      continue;
    }
  }

  // Fallback to system default fonts
  logger.warn('No preferred fonts found, using system defaults');
  return {
    regular: 'Arial, sans-serif',
    title: 'Arial, sans-serif', 
    goal: 'Arial, sans-serif',
    fontLoaded: false
  };
}

/**
 * Wrap text to fit within a given width
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const decodedText = decodeUnicodeEscapesToUTF8(text);
  const words = decodedText.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Create initial frame showing the task
 */
function createTaskFrame(
  task: string,
  firstScreenshot: string,
  fonts: { title: string, regular: string },
  config: Required<GIFGenerationConfig>,
  logo?: Canvas
): Canvas {
  // Decode base64 screenshot to get template dimensions
  const screenshotBuffer = Buffer.from(firstScreenshot, 'base64');
  
  return new Promise<Canvas>((resolve, reject) => {
    loadImage(screenshotBuffer).then(templateImage => {
      const canvas = createCanvas(templateImage.width, templateImage.height);
      const ctx = canvas.getContext('2d');

      // Fill with black background
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Calculate vertical center
      const centerY = canvas.height / 2;

      // Set up dynamic font sizing based on task length  
      let fontSize = config.title_font_size;
      const textLength = task.length;
      
      if (textLength > 200) {
        // For very long text, reduce font size logarithmically
        fontSize = Math.max(config.title_font_size - Math.floor(10 * (textLength / 200)), 16);
      }

      ctx.font = `${fontSize}px "${fonts.regular}"`;
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';

      // Wrap text to fit canvas width
      const maxWidth = canvas.width - (2 * config.margin);
      const wrappedLines = wrapText(ctx, task, maxWidth);

      // Calculate line height with spacing
      const lineHeight = fontSize * config.line_spacing;
      const totalHeight = lineHeight * wrappedLines.length;

      // Start position for first line
      let textY = centerY - (totalHeight / 2) + 50; // Shifted down slightly

      // Draw each line
      for (const line of wrappedLines) {
        ctx.fillText(line, canvas.width / 2, textY);
        textY += lineHeight;
      }

      // Add logo if provided (top right corner)
      if (logo) {
        const logoMargin = 20;
        const logoX = canvas.width - logo.width - logoMargin;
        ctx.drawImage(logo, logoX, logoMargin);
      }

      resolve(canvas);
    }).catch(reject);
  }) as any; // Type assertion to work around async issues
}

/**
 * Add step number and goal overlay to an image
 */
function addOverlayToImage(
  canvas: Canvas,
  stepNumber: number,
  goalText: string,
  fonts: { title: string, regular: string },
  config: Required<GIFGenerationConfig>,
  logo?: Canvas
): Canvas {
  const ctx = canvas.getContext('2d');
  const decodedGoalText = decodeUnicodeEscapesToUTF8(goalText);

  // Add step number (bottom left)
  if (stepNumber > 0) {
    ctx.font = `${config.title_font_size}px "${fonts.title}"`;
    const stepText = stepNumber.toString();
    const stepMetrics = ctx.measureText(stepText);

    // Position step number in bottom left
    const xStep = config.margin + 10;
    const yStep = canvas.height - config.margin - 10;

    // Draw rounded rectangle background for step number
    const padding = 20;
    const stepBgX = xStep - padding;
    const stepBgY = yStep - config.title_font_size - padding;
    const stepBgWidth = stepMetrics.width + padding * 2;
    const stepBgHeight = config.title_font_size + padding * 2;

    ctx.fillStyle = `rgba(${config.text_box_color[0]}, ${config.text_box_color[1]}, ${config.text_box_color[2]}, ${config.text_box_color[3] / 255})`;
    ctx.beginPath();
    ctx.roundRect(stepBgX, stepBgY, stepBgWidth, stepBgHeight, 15);
    ctx.fill();

    // Draw step number text
    ctx.fillStyle = `rgba(${config.text_color[0]}, ${config.text_color[1]}, ${config.text_color[2]}, ${config.text_color[3] / 255})`;
    ctx.textAlign = 'left';
    ctx.fillText(stepText, xStep, yStep);
  }

  // Draw goal text (centered, bottom)
  if (decodedGoalText) {
    ctx.font = `${config.title_font_size}px "${fonts.title}"`;
    ctx.textAlign = 'center';
    
    const maxWidth = canvas.width - (4 * config.margin);
    const goalLines = wrapText(ctx, decodedGoalText, maxWidth);
    
    const lineHeight = config.title_font_size * config.line_spacing;
    const totalGoalHeight = lineHeight * goalLines.length;

    // Center goal text horizontally, place above step number
    const xGoal = canvas.width / 2;
    const yGoal = canvas.height - config.margin - totalGoalHeight - 80; // More space above step

    // Draw rounded rectangle background for goal
    const goalPadding = 25;
    const maxLineWidth = Math.max(...goalLines.map(line => ctx.measureText(line).width));
    const goalBgX = xGoal - maxLineWidth / 2 - goalPadding;
    const goalBgY = yGoal - goalPadding;
    const goalBgWidth = maxLineWidth + goalPadding * 2;
    const goalBgHeight = totalGoalHeight + goalPadding * 2;

    ctx.fillStyle = `rgba(${config.text_box_color[0]}, ${config.text_box_color[1]}, ${config.text_box_color[2]}, ${config.text_box_color[3] / 255})`;
    ctx.beginPath();
    ctx.roundRect(goalBgX, goalBgY, goalBgWidth, goalBgHeight, 15);
    ctx.fill();

    // Draw goal text
    ctx.fillStyle = `rgba(${config.text_color[0]}, ${config.text_color[1]}, ${config.text_color[2]}, ${config.text_color[3] / 255})`;
    let currentY = yGoal + lineHeight;
    for (const line of goalLines) {
      ctx.fillText(line, xGoal, currentY);
      currentY += lineHeight;
    }
  }

  // Add logo if provided (top right corner)
  if (logo) {
    const logoMargin = 20;
    const logoX = canvas.width - logo.width - logoMargin;
    ctx.drawImage(logo, logoX, logoMargin);
  }

  return canvas;
}

/**
 * Create a GIF from the agent's history with overlaid task and goal text
 */
export async function createHistoryGIF(
  task: string,
  history: AgentHistoryList,
  config: Partial<GIFGenerationConfig> = {}
): Promise<void> {
  const fullConfig = { ...DEFAULT_GIF_CONFIG, ...config };

  if (!history.history || history.history.length === 0) {
    logger.warn('No history to create GIF from');
    return;
  }

  try {
    // Load fonts
    const fonts = loadFonts();

    // Get all screenshots from history
    const screenshots = history.screenshots(true);

    if (!screenshots || screenshots.length === 0) {
      logger.warn('No screenshots found in history');
      return;
    }

    // Find the first real screenshot (not placeholder)
    const firstRealScreenshot = screenshots.find(
      screenshot => screenshot && screenshot !== PLACEHOLDER_4PX_SCREENSHOT
    );

    if (!firstRealScreenshot) {
      logger.warn('No valid screenshots found (all are placeholders or from new tab pages)');
      return;
    }

    // Load logo if requested
    let logo: Canvas | undefined;
    if (fullConfig.show_logo) {
      try {
        const logoPath = path.resolve('./static/browser-use.png');
        if (fs.existsSync(logoPath)) {
          const logoImage = await loadImage(logoPath);
          const logoHeight = 150;
          const aspectRatio = logoImage.width / logoImage.height;
          const logoWidth = Math.floor(logoHeight * aspectRatio);
          
          logo = createCanvas(logoWidth, logoHeight);
          const logoCtx = logo.getContext('2d');
          logoCtx.drawImage(logoImage, 0, 0, logoWidth, logoHeight);
        }
      } catch (error) {
        logger.warn(`Could not load logo: ${error}`);
      }
    }

    const canvases: Canvas[] = [];

    // Create task frame if requested
    if (fullConfig.show_task && task) {
      try {
        const taskFrame = await createTaskFrame(task, firstRealScreenshot, fonts, fullConfig, logo);
        canvases.push(taskFrame);
      } catch (error) {
        logger.warn('Failed to create task frame:', error);
      }
    }

    // Process each history item with its corresponding screenshot
    for (let i = 0; i < history.history.length; i++) {
      const item = history.history[i];
      const screenshot = screenshots[i];

      if (!screenshot || screenshot === PLACEHOLDER_4PX_SCREENSHOT) {
        logger.debug(`Skipping placeholder screenshot at step ${i + 1}`);
        continue;
      }

      // Skip screenshots from new tab pages
      if (isNewTabPage(item.state.url)) {
        logger.debug(`Skipping screenshot from new tab page (${item.state.url}) at step ${i + 1}`);
        continue;
      }

      try {
        // Convert base64 screenshot to Canvas
        const screenshotBuffer = Buffer.from(screenshot, 'base64');
        const screenshotImage = await loadImage(screenshotBuffer);
        
        const canvas = createCanvas(screenshotImage.width, screenshotImage.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(screenshotImage, 0, 0);

        // Add overlay if goals should be shown and model output exists
        if (fullConfig.show_goals && item.model_output && item.model_output.current_state) {
          const overlaidCanvas = addOverlayToImage(
            canvas,
            i + 1,
            item.model_output.current_state.next_goal,
            fonts,
            fullConfig,
            logo
          );
          canvases.push(overlaidCanvas);
        } else {
          canvases.push(canvas);
        }
      } catch (error) {
        logger.warn(`Failed to process screenshot at step ${i + 1}:`, error);
        continue;
      }
    }

    if (canvases.length === 0) {
      logger.warn('No images found in history to create GIF');
      return;
    }

    // Create GIF encoder
    const firstCanvas = canvases[0];
    const encoder = new GIFEncoder(firstCanvas.width, firstCanvas.height);
    
    // Setup GIF options
    encoder.setDelay(fullConfig.duration);
    encoder.setRepeat(0); // 0 = infinite loop
    encoder.setTransparent(null);

    // Start encoding
    encoder.start();

    // Add frames to encoder
    for (const canvas of canvases) {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      encoder.addFrame(imageData.data);
    }

    // Finish encoding
    encoder.finish();

    // Save the GIF
    const gifBuffer = encoder.out.getData();
    fs.writeFileSync(fullConfig.output_path, gifBuffer);

    logger.info(`Created GIF at ${fullConfig.output_path} with ${canvases.length} frames`);
  } catch (error) {
    logger.error('Failed to create GIF:', error);
    throw error;
  }
}