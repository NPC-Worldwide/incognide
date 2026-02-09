/**
 * IPC Module Registry
 *
 * Registers all IPC handlers from sub-modules organized by pane type.
 * Each module exports a register(ctx) function that receives shared dependencies.
 */

const browser = require('./browser');
const terminal = require('./terminal');
const git = require('./git');
const database = require('./database');
const jupyter = require('./jupyter');
const chat = require('./chat');
const npc = require('./npc');
const filesystem = require('./filesystem');
const settings = require('./settings');

/**
 * Register all IPC handlers from all modules.
 * @param {Object} ctx - Shared context object with all dependencies
 */
function registerAll(ctx) {
  // Pass readPythonEnvConfig from settings to ctx so terminal and jupyter can use it
  const fullCtx = {
    ...ctx,
    readPythonEnvConfig: settings.readPythonEnvConfig,
  };

  browser.register(fullCtx);
  terminal.register(fullCtx);
  git.register(fullCtx);
  database.register(fullCtx);
  jupyter.register(fullCtx);
  chat.register(fullCtx);
  npc.register(fullCtx);
  filesystem.register(fullCtx);
  settings.register(fullCtx);
}

module.exports = {
  registerAll,
  // Re-export module-level state/functions that main.js may need
  browserViews: browser.browserViews,
  setupWebContentsHandlers: browser.setupWebContentsHandlers,
  loadSavedExtensions: browser.loadSavedExtensions,
  ptySessions: terminal.ptySessions,
  ptyKillTimers: terminal.ptyKillTimers,
  readPythonEnvConfig: settings.readPythonEnvConfig,
};
