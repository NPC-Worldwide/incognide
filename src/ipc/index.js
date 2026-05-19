

const browser = require('./browser');
const terminal = require('./terminal');
const git = require('./git');
const database = require('./database');
const jupyter = require('./jupyter');
const chat = require('./chat');
const music = require('./music');
const npc = require('./npc');
const filesystem = require('./filesystem');
const settings = require('./settings');

function registerAll(ctx) {

  const fullCtx = {
    ...ctx,
    readPythonEnvConfig: settings.readPythonEnvConfig,
    resolvePythonPath: settings.resolvePythonPath,
    INCOGNIDE_HOME: ctx.INCOGNIDE_HOME,
  };

  browser.register(fullCtx);
  terminal.register(fullCtx);
  git.register(fullCtx);
  database.register(fullCtx);
  jupyter.register(fullCtx);
  chat.register(fullCtx);
  music.register(fullCtx);
  npc.register(fullCtx);
  filesystem.register(fullCtx);
  settings.register(fullCtx);
}

module.exports = {
  registerAll,

  browserViews: browser.browserViews,
  setupWebContentsHandlers: browser.setupWebContentsHandlers,
  loadSavedExtensions: browser.loadSavedExtensions,
  ptySessions: terminal.ptySessions,
  ptyKillTimers: terminal.ptyKillTimers,
  readPythonEnvConfig: settings.readPythonEnvConfig,
};
