import { z } from 'zod';

// Action Input Models

export const SearchGoogleActionSchema = z.object({
  query: z.string(),
});
export type SearchGoogleAction = z.infer<typeof SearchGoogleActionSchema>;

export const GoToUrlActionSchema = z.object({
  url: z.string(),
  newTab: z.boolean().default(false), // True to open in new tab, False to navigate in current tab
});
export type GoToUrlAction = z.infer<typeof GoToUrlActionSchema>;

export const ClickElementActionSchema = z.object({
  index: z.number().int().min(1).describe('index of the element to click'),
  whileHoldingCtrl: z.boolean().default(false).describe('set True to open any resulting navigation in a new background tab, False otherwise'),
});
export type ClickElementAction = z.infer<typeof ClickElementActionSchema>;

export const InputTextActionSchema = z.object({
  index: z.number().int().min(0).describe('index of the element to input text into, 0 is the page'),
  text: z.string(),
  clearExisting: z.boolean().default(true).describe('set True to clear existing text, False to append to existing text'),
});
export type InputTextAction = z.infer<typeof InputTextActionSchema>;

export const DoneActionSchema = z.object({
  text: z.string(),
  success: z.boolean(),
  filesToDisplay: z.array(z.string()).optional().default([]),
});
export type DoneAction = z.infer<typeof DoneActionSchema>;

export const StructuredOutputActionSchema = <T extends z.ZodType>(dataSchema: T) => z.object({
  success: z.boolean().default(true),
  data: dataSchema,
});
export type StructuredOutputAction<T> = {
  success: boolean;
  data: T;
};

export const SwitchTabActionSchema = z.object({
  url: z.string().optional().describe('URL or URL substring of the tab to switch to, if not provided, the tab_id or most recently opened tab will be used'),
  tabId: z.string().min(4).max(4).optional().describe('exact 4 character Tab ID to match instead of URL, prefer using this if known'), // last 4 chars of TargetID
});
export type SwitchTabAction = z.infer<typeof SwitchTabActionSchema>;

export const CloseTabActionSchema = z.object({
  tabId: z.string().min(4).max(4).describe('4 character Tab ID'), // last 4 chars of TargetID
});
export type CloseTabAction = z.infer<typeof CloseTabActionSchema>;

export const ScrollActionSchema = z.object({
  down: z.boolean(), // True to scroll down, False to scroll up
  numPages: z.number(), // Number of pages to scroll (0.5 = half page, 1.0 = one page, etc.)
  frameElementIndex: z.number().int().optional(), // Optional element index to find scroll container for
});
export type ScrollAction = z.infer<typeof ScrollActionSchema>;

export const SendKeysActionSchema = z.object({
  keys: z.string(),
});
export type SendKeysAction = z.infer<typeof SendKeysActionSchema>;

export const UploadFileActionSchema = z.object({
  index: z.number().int(),
  path: z.string(),
});
export type UploadFileAction = z.infer<typeof UploadFileActionSchema>;

export const ExtractPageContentActionSchema = z.object({
  value: z.string(),
});
export type ExtractPageContentAction = z.infer<typeof ExtractPageContentActionSchema>;

export const NoParamsActionSchema = z.object({}).passthrough(); // Accepts anything and ignores it
export type NoParamsAction = z.infer<typeof NoParamsActionSchema>;

export const GetDropdownOptionsActionSchema = z.object({
  index: z.number().int().min(1).describe('index of the dropdown element to get the option values for'),
});
export type GetDropdownOptionsAction = z.infer<typeof GetDropdownOptionsActionSchema>;

export const SelectDropdownOptionActionSchema = z.object({
  index: z.number().int().min(1).describe('index of the dropdown element to select an option for'),
  text: z.string().describe('the text or exact value of the option to select'),
});
export type SelectDropdownOptionAction = z.infer<typeof SelectDropdownOptionActionSchema>;

// Base action model
export const ActionModelBaseSchema = z.object({});

// Export all action schemas as a record for easy access
export const ActionSchemas = {
  searchGoogle: SearchGoogleActionSchema,
  goToUrl: GoToUrlActionSchema,
  clickElement: ClickElementActionSchema,
  inputText: InputTextActionSchema,
  done: DoneActionSchema,
  switchTab: SwitchTabActionSchema,
  closeTab: CloseTabActionSchema,
  scroll: ScrollActionSchema,
  sendKeys: SendKeysActionSchema,
  uploadFile: UploadFileActionSchema,
  extractPageContent: ExtractPageContentActionSchema,
  noParams: NoParamsActionSchema,
  getDropdownOptions: GetDropdownOptionsActionSchema,
  selectDropdownOption: SelectDropdownOptionActionSchema,
} as const;

export type ActionName = keyof typeof ActionSchemas;