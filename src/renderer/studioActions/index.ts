/**
 * Studio Actions Registry
 */

import type React from 'react';

export interface StudioContext {
  rootLayoutNode: any;
  contentDataRef: React.MutableRefObject<Record<string, any>>;
  activeContentPaneId: string;
  setActiveContentPaneId: (id: string) => void;
  setRootLayoutNode: (node: any) => void;
  performSplit: (targetPath: number[], side: string, contentType: string, contentId: string) => void;
  closeContentPane: (paneId: string, nodePath: number[]) => void;
  updateContentPane: (paneId: string, contentType: string, contentId: string, skipMessageLoad?: boolean) => void;
  handleAddTab?: (paneId: string, contentType: string) => void;
  handleTabClose?: (paneId: string, tabIndex: number) => void;
  handleTabSelect?: (paneId: string, tabIndex: number) => void;
  toggleZenMode?: (paneId: string) => void;
  generateId: () => string;
  findPanePath: (node: any, paneId: string, path?: number[]) => number[] | null;
}

export interface StudioActionResult {
  success: boolean;
  error?: string;
  [key: string]: any;
}

export type StudioActionHandler = (
  args: Record<string, any>,
  ctx: StudioContext
) => Promise<StudioActionResult>;

// Action registry
const actions: Record<string, StudioActionHandler> = {};

export function registerAction(name: string, handler: StudioActionHandler): void {
  actions[name] = handler;
  console.log('[StudioActions] Registered:', name);
}

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  // Dynamic imports to avoid circular dependency
  await import('./paneActions');
  await import('./contentActions');
  await import('./tabActions');
  await import('./browserActions');
  await import('./dataActions');
  await import('./uiActions');

  console.log('[StudioActions] All actions loaded:', Object.keys(actions));
}

// Initialize immediately
ensureInitialized();

export async function executeStudioAction(
  name: string,
  args: Record<string, any>,
  ctx: StudioContext
): Promise<StudioActionResult> {
  await ensureInitialized();

  const handler = actions[name];

  if (!handler) {
    return {
      success: false,
      error: `Unknown studio action: ${name}. Available: ${Object.keys(actions).join(', ')}`
    };
  }

  try {
    return await handler(args, ctx);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function getRegisteredActions(): string[] {
  return Object.keys(actions);
}

export function hasAction(name: string): boolean {
  return name in actions;
}
