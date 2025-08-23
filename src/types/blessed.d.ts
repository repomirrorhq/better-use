/**
 * Type definitions for neo-blessed
 */
declare module 'neo-blessed' {
  export interface BlessedScreen {
    append(element: any): void;
    render(): void;
    key(key: string[], callback: () => void): void;
    destroy(): void;
  }

  export interface BlessedElement {
    setContent(content: string): void;
    focus(): void;
    on(event: string, callback: Function): void;
    hide(): void;
    show(): void;
  }

  export interface BlessedBox extends BlessedElement {
    // Box specific methods
  }

  export interface BlessedTextbox extends BlessedElement {
    getValue(): string;
    setValue(value: string): void;
    submit(): void;
    cancel(): void;
    clearValue(): void;
  }

  export interface BlessedList extends BlessedElement {
    setItems(items: string[]): void;
    select(index: number): void;
    getSelected(): number;
    add(item: string): void;
    removeItem(item: any): void;
    clearItems(): void;
  }

  export interface BlessedLog extends BlessedElement {
    log(message: string): void;
    add(message: string): void;
  }

  export interface BlessedProgressBar extends BlessedElement {
    setProgress(percent: number): void;
  }

  export interface BlessedOptions {
    parent?: any;
    top?: number | string;
    left?: number | string;
    width?: number | string;
    height?: number | string;
    bottom?: number | string;
    right?: number | string;
    content?: string;
    tags?: boolean;
    border?: {
      type: string;
    };
    style?: {
      fg?: string;
      bg?: string;
      border?: {
        fg?: string;
      };
      focus?: {
        border?: {
          fg?: string;
        };
      };
    };
    label?: string;
    keys?: boolean;
    vi?: boolean;
    mouse?: boolean;
    scrollable?: boolean;
    alwaysScroll?: boolean;
    scrollbar?: {
      ch: string;
    };
    inputOnFocus?: boolean;
    items?: string[];
    filled?: number;
    ch?: string;
  }

  export namespace Widgets {
    export type Screen = BlessedScreen;
    export type Element = BlessedElement;
    export type BoxElement = BlessedBox;
    export type TextboxElement = BlessedTextbox;
    export type Textbox = BlessedTextbox; // Add alias for Textbox
    export type ListElement = BlessedList;
    export type Log = BlessedLog;
    export type ProgressBarElement = BlessedProgressBar;
  }

  export function screen(options?: any): BlessedScreen;
  export function box(options?: BlessedOptions): BlessedBox;
  export function textbox(options?: BlessedOptions): BlessedTextbox;
  export function list(options?: BlessedOptions): BlessedList;
  export function log(options?: BlessedOptions): BlessedLog;
  export function progressbar(options?: BlessedOptions): BlessedProgressBar;
}