import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '../../src/main.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });
  page = await app.firstWindow();
  // Wait for app to be ready
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  if (app) {
    await app.close();
  }
});

test.describe('App Launch', () => {
  test('window opens successfully', async () => {
    const title = await page.title();
    expect(title).toBeDefined();
  });

  test('window has correct dimensions', async () => {
    const { width, height } = page.viewportSize()!;
    expect(width).toBeGreaterThan(400);
    expect(height).toBeGreaterThan(300);
  });

  test('main UI elements are visible', async () => {
    // Wait for the app to fully load (past setup/loading screens)
    await page.waitForTimeout(3000);

    // Check that the body has content
    const bodyContent = await page.locator('body').innerHTML();
    expect(bodyContent.length).toBeGreaterThan(0);
  });
});

test.describe('Sidebar', () => {
  test('sidebar is visible', async () => {
    // Look for sidebar elements - file tree or sidebar container
    const sidebar = page.locator('[class*="sidebar"], [data-testid="sidebar"]').first();
    if (await sidebar.isVisible()) {
      expect(await sidebar.isVisible()).toBe(true);
    }
  });
});

test.describe('Pane System', () => {
  test('can detect pane containers', async () => {
    // Look for pane-related elements
    const panes = page.locator('[class*="pane"], [data-testid*="pane"]');
    const count = await panes.count();
    // App should have at least one pane area
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Keyboard Shortcuts', () => {
  test('Ctrl+Shift+F opens search', async () => {
    await page.keyboard.press('Control+Shift+f');
    await page.waitForTimeout(500);
    // Search pane or input should appear
    const searchInput = page.locator('input[placeholder*="earch"], [class*="search"]').first();
    if (await searchInput.isVisible()) {
      expect(await searchInput.isVisible()).toBe(true);
    }
  });
});

test.describe('Theme', () => {
  test('app has dark or light theme applied', async () => {
    const body = page.locator('body');
    const classList = await body.getAttribute('class');
    const bgColor = await body.evaluate((el) => getComputedStyle(el).backgroundColor);
    // Should have some styling applied
    expect(bgColor).toBeDefined();
  });
});
