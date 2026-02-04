/**
 * Browser Actions
 *
 * Actions for controlling browser panes:
 * - navigate, browser_back, browser_forward, get_browser_info
 */

import { registerAction, StudioContext, StudioActionResult } from './index';

/**
 * Navigate a browser pane to a URL
 */
async function navigate(
  args: { paneId?: string; url: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { url } = args;

  if (!url) {
    return { success: false, error: 'url is required' };
  }

  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'browser') {
    return { success: false, error: `Pane is not a browser: ${data.contentType}` };
  }

  // Update the browser URL
  ctx.contentDataRef.current[paneId] = {
    ...data,
    browserUrl: url,
    contentId: url
  };

  // Trigger re-render
  ctx.updateContentPane(paneId, 'browser', url);

  return {
    success: true,
    paneId,
    url
  };
}

/**
 * Navigate browser back
 */
async function browser_back(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'browser') {
    return { success: false, error: `Pane is not a browser: ${data.contentType}` };
  }

  // Browser back would need to be implemented via webview API
  // This is a placeholder that would trigger the actual navigation

  return {
    success: true,
    paneId,
    action: 'back'
  };
}

/**
 * Navigate browser forward
 */
async function browser_forward(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'browser') {
    return { success: false, error: `Pane is not a browser: ${data.contentType}` };
  }

  // Browser forward would need to be implemented via webview API

  return {
    success: true,
    paneId,
    action: 'forward'
  };
}

/**
 * Get browser pane info
 */
async function get_browser_info(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'browser') {
    return { success: false, error: `Pane is not a browser: ${data.contentType}` };
  }

  return {
    success: true,
    paneId,
    url: data.browserUrl || data.contentId,
    title: data.browserTitle || 'Browser'
  };
}

/**
 * Click on an element in a browser pane
 */
async function browser_click(
  args: { paneId?: string; selector?: string; text?: string; index?: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { selector, text, index } = args;

  if (!selector && !text) {
    return { success: false, error: 'Either selector or text is required' };
  }

  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'browser') {
    return { success: false, error: `Pane is not a browser: ${data.contentType}` };
  }

  if (!data.browserClick) {
    return { success: false, error: 'Browser automation not available for this pane' };
  }

  const result = await data.browserClick(selector || '', { text, index });
  return { ...result, paneId };
}

/**
 * Type text into an input element in a browser pane
 */
async function browser_type(
  args: { paneId?: string; selector: string; text: string; clear?: boolean; submit?: boolean },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { selector, text, clear, submit } = args;

  if (!selector) {
    return { success: false, error: 'selector is required' };
  }

  if (text === undefined || text === null) {
    return { success: false, error: 'text is required' };
  }

  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'browser') {
    return { success: false, error: `Pane is not a browser: ${data.contentType}` };
  }

  if (!data.browserType) {
    return { success: false, error: 'Browser automation not available for this pane' };
  }

  const result = await data.browserType(selector, text, { clear, submit });
  return { ...result, paneId };
}

/**
 * Get page content from a browser pane
 */
async function get_browser_content(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'browser') {
    return { success: false, error: `Pane is not a browser: ${data.contentType}` };
  }

  if (!data.getPageContent) {
    return { success: false, error: 'Page content method not available for this pane' };
  }

  const result = await data.getPageContent();
  return { ...result, paneId };
}

/**
 * Take a screenshot of a browser pane
 */
async function browser_screenshot(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'browser') {
    return { success: false, error: `Pane is not a browser: ${data.contentType}` };
  }

  if (!data.browserScreenshot) {
    return { success: false, error: 'Screenshot not available for this pane' };
  }

  const result = await data.browserScreenshot();
  return { ...result, paneId };
}

/**
 * Execute JavaScript in a browser pane
 */
async function browser_eval(
  args: { paneId?: string; code: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { code } = args;

  if (!code) {
    return { success: false, error: 'code is required' };
  }

  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'browser') {
    return { success: false, error: `Pane is not a browser: ${data.contentType}` };
  }

  if (!data.browserEval) {
    return { success: false, error: 'Browser eval not available for this pane' };
  }

  const result = await data.browserEval(code);
  return { ...result, paneId };
}

// Register all browser actions
registerAction('navigate', navigate);
registerAction('browser_back', browser_back);
registerAction('browser_forward', browser_forward);
registerAction('get_browser_info', get_browser_info);
registerAction('browser_click', browser_click);
registerAction('browser_type', browser_type);
registerAction('get_browser_content', get_browser_content);
registerAction('browser_screenshot', browser_screenshot);
registerAction('browser_eval', browser_eval);
