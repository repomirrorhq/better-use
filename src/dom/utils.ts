/**
 * DOM utility functions
 */

/**
 * Cap text length for display.
 */
export function capTextLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
}