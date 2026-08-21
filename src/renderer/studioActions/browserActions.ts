

import { registerAction, StudioContext, StudioActionResult } from './index';
import { resolveBrowserPaneId } from './paneActions';

function getBrowserPane(
  paneIdArg: string | undefined,
  ctx: StudioContext
): { paneId: string; data: any } | { error: string } {
  const paneId = resolveBrowserPaneId(paneIdArg, ctx);
  if (!paneId) {
    return { error: 'No browser pane found' };
  }

  const data = ctx.contentDataRef.current[paneId];
  if (!data) {
    return { error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'browser') {
    return { error: `Pane is not a browser: ${data.contentType}` };
  }

  ctx.contentDataRef.current[paneId] = {
    ...data,
    lastActiveAt: Date.now()
  };

  return { paneId, data: ctx.contentDataRef.current[paneId] };
}

async function navigate(
  args: { paneId?: string; url: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { url } = args;

  if (!url) {
    return { success: false, error: 'url is required' };
  }

  const resolved = getBrowserPane(args.paneId, ctx);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  const { paneId, data } = resolved;

  if (data.navigateTo) {
    const result = await data.navigateTo(url);
    return { ...result, paneId };
  }

  ctx.contentDataRef.current[paneId] = {
    ...data,
    browserUrl: url,
    contentId: url
  };

  ctx.updateContentPane(paneId, 'browser', url);

  return {
    success: true,
    paneId,
    url
  };
}

async function browser_back(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = getBrowserPane(args.paneId, ctx);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  const { paneId, data } = resolved;

  if (data.browserBack) {
    const result = await data.browserBack();
    return { ...result, paneId };
  }

  return {
    success: true,
    paneId,
    action: 'back'
  };
}

async function browser_forward(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = getBrowserPane(args.paneId, ctx);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  const { paneId, data } = resolved;

  if (data.browserForward) {
    const result = await data.browserForward();
    return { ...result, paneId };
  }

  return {
    success: true,
    paneId,
    action: 'forward'
  };
}

async function get_browser_info(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = getBrowserPane(args.paneId, ctx);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  const { paneId, data } = resolved;

  return {
    success: true,
    paneId,
    url: data.browserUrl || data.contentId,
    title: data.browserTitle || 'Browser'
  };
}

async function browser_click(
  args: { paneId?: string; selector?: string; text?: string; index?: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { selector, text, index } = args;

  if (!selector && !text) {
    return { success: false, error: 'Either selector or text is required' };
  }

  const resolved = getBrowserPane(args.paneId, ctx);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  const { paneId, data } = resolved;

  if (!data.browserClick) {
    return { success: false, error: 'Browser automation not available for this pane' };
  }

  const result = await data.browserClick(selector || '', { text, index });
  return { ...result, paneId };
}

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

  const resolved = getBrowserPane(args.paneId, ctx);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  const { paneId, data } = resolved;

  if (!data.browserType) {
    return { success: false, error: 'Browser automation not available for this pane' };
  }

  const result = await data.browserType(selector, text, { clear, submit });
  return { ...result, paneId };
}

async function get_browser_content(
  args: { paneId?: string; maxChars?: number; includeInteractive?: boolean },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = getBrowserPane(args.paneId, ctx);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  const { paneId, data } = resolved;

  if (!data.getPageContent) {
    return { success: false, error: 'Page content method not available for this pane' };
  }

  const result = await data.getPageContent({
    maxChars: args.maxChars ?? 100000,
    includeInteractive: args.includeInteractive ?? true
  });
  return { ...result, paneId };
}

async function browser_find_elements(
  args: { paneId?: string; selector?: string; maxResults?: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { selector, maxResults = 50 } = args;
  const resolved = getBrowserPane(args.paneId, ctx);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  const { paneId, data } = resolved;
  if (!data.browserEval) {
    return { success: false, error: 'Browser eval not available for this pane' };
  }

  const code = `
(function() {
  function findDeep(root, predicate, depth = 0) {
    if (depth > 6 || !root || root.nodeType !== 1) return null;
    if (predicate(root)) return root;
    if (root.shadowRoot) {
      for (const child of root.shadowRoot.querySelectorAll('*')) {
        const found = findDeep(child, predicate, depth + 1);
        if (found) return found;
      }
    }
    for (const child of root.children) {
      const found = findDeep(child, predicate, depth + 1);
      if (found) return found;
    }
    return null;
  }
  function findAllDeep(root, predicate, depth = 0, results = []) {
    if (depth > 6 || !root || root.nodeType !== 1) return results;
    if (predicate(root)) results.push(root);
    if (root.shadowRoot) {
      for (const child of root.shadowRoot.querySelectorAll('*')) {
        findAllDeep(child, predicate, depth + 1, results);
      }
    }
    for (const child of root.children) {
      findAllDeep(child, predicate, depth + 1, results);
    }
    return results;
  }
  function isInteractive(el) {
    if (!el) return false;
    const tag = el.tagName;
    const role = el.getAttribute('role');
    const type = el.type;
    if (tag === 'A' || tag === 'BUTTON' || tag === 'TEXTAREA') return true;
    if (tag === 'INPUT' && ['submit','button','image','text','email','password','search','url'].includes(type)) return true;
    if (role === 'button' || role === 'link' || role === 'menuitem' || role === 'textbox' || role === 'searchbox') return true;
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true;
    if (el.getAttribute('tabindex') === '0') return true;
    if (el.className?.toString().toLowerCase().includes('button')) return true;
    return false;
  }
  function getDirectText(el) {
    return Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
  }
  function summarize(el, idx) {
    const tag = el.tagName.toLowerCase();
    const id = el.id || '';
    const cls = (el.className?.toString() || '').split(/\\s+/).filter(Boolean).slice(0,4).join(' ');
    const text = getDirectText(el) || el.innerText?.trim() || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const placeholder = el.placeholder || el.getAttribute('placeholder') || '';
    const dataTestid = el.getAttribute('data-testid') || '';
    const name = el.name || '';
    const type = el.type || '';
    const value = el.value || '';
    let selector = '';
    if (id) selector = '#' + id;
    else if (dataTestid) selector = '[data-testid="' + dataTestid + '"]';
    else if (name) selector = tag + '[name="' + name + '"]';
    else if (cls) selector = tag + '.' + cls.split(' ')[0];
    else selector = tag;
    return { index: idx, tag, id, class: cls, selector, text: text.slice(0,120), ariaLabel, placeholder, dataTestid, name, type, value: String(value).slice(0,120), disabled: !!el.disabled };
  }
  let elements;
  if (${JSON.stringify(selector)}) {
    try {
      elements = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    } catch (e) {
      elements = [];
    }
    if (elements.length === 0) {
      elements = findAllDeep(document.body, el => {
        try { return el.matches(${JSON.stringify(selector)}); } catch { return false; }
      });
    }
  } else {
    elements = findAllDeep(document.body, isInteractive);
  }
  return elements.slice(0, ${JSON.stringify(maxResults)}).map((el, i) => summarize(el, i));
})();
  `.trim();
  const result = await data.browserEval(code);
  return { ...result, paneId };
}

async function browser_screenshot(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = getBrowserPane(args.paneId, ctx);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  const { paneId, data } = resolved;

  if (!data.browserScreenshot) {
    return { success: false, error: 'Screenshot not available for this pane' };
  }

  const result = await data.browserScreenshot();
  return { ...result, paneId };
}

async function browser_eval(
  args: { paneId?: string; code: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { code } = args;

  if (!code) {
    return { success: false, error: 'code is required' };
  }

  const resolved = getBrowserPane(args.paneId, ctx);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  const { paneId, data } = resolved;

  if (!data.browserEval) {
    return { success: false, error: 'Browser eval not available for this pane' };
  }

  const result = await data.browserEval(code);
  return { ...result, paneId };
}

registerAction('navigate', navigate);
registerAction('browser_back', browser_back);
registerAction('browser_forward', browser_forward);
registerAction('get_browser_info', get_browser_info);
registerAction('browser_click', browser_click);
registerAction('browser_type', browser_type);
registerAction('get_browser_content', get_browser_content);
registerAction('browser_find_elements', browser_find_elements);
registerAction('browser_screenshot', browser_screenshot);
registerAction('browser_eval', browser_eval);
