import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import yaml from 'js-yaml';

// We test the logic functions extracted from the IPC handlers by simulating
// their behavior with temp directories.

describe('INCOGNIDE_HOME migration', () => {
  const tmpDir = path.join(os.tmpdir(), `incognide-test-${Date.now()}`);
  const npcshDir = path.join(tmpDir, '.npcsh');
  const npcshIncognideDir = path.join(npcshDir, 'incognide');
  const newIncognideDir = path.join(tmpDir, '.incognide');

  beforeEach(() => {
    fs.mkdirSync(npcshIncognideDir, { recursive: true });
    // Create a marker file in the old dir to verify migration
    fs.writeFileSync(path.join(npcshIncognideDir, 'test.txt'), 'hello');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies old incognide dir to new location if new does not exist', () => {
    const INCOGNIDE_HOME = newIncognideDir;
    const marker = path.join(INCOGNIDE_HOME, '.migrated');

    if (!fs.existsSync(marker)) {
      if (!fs.existsSync(INCOGNIDE_HOME) && fs.existsSync(npcshIncognideDir)) {
        fs.cpSync(npcshIncognideDir, INCOGNIDE_HOME, { recursive: true });
      }
      fs.writeFileSync(marker, new Date().toISOString());
    }

    expect(fs.existsSync(INCOGNIDE_HOME)).toBe(true);
    expect(fs.existsSync(path.join(INCOGNIDE_HOME, 'test.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(INCOGNIDE_HOME, 'test.txt'), 'utf8')).toBe('hello');
    expect(fs.existsSync(marker)).toBe(true);
  });

  it('skips migration if marker already exists', () => {
    const INCOGNIDE_HOME = newIncognideDir;
    const marker = path.join(INCOGNIDE_HOME, '.migrated');

    // First migration
    if (!fs.existsSync(marker)) {
      if (!fs.existsSync(INCOGNIDE_HOME) && fs.existsSync(npcshIncognideDir)) {
        fs.cpSync(npcshIncognideDir, INCOGNIDE_HOME, { recursive: true });
      }
      fs.writeFileSync(marker, new Date().toISOString());
    }

    // Modify old dir to verify second run doesn't overwrite
    fs.writeFileSync(path.join(npcshIncognideDir, 'new.txt'), 'should-not-copy');

    // Second "migration" — should skip
    if (!fs.existsSync(marker)) {
      // This block should NOT execute
      fs.cpSync(npcshIncognideDir, INCOGNIDE_HOME, { recursive: true });
    }

    expect(fs.existsSync(path.join(INCOGNIDE_HOME, 'new.txt'))).toBe(false);
  });

  it('creates fresh dir if neither old nor new exists', () => {
    const freshDir = path.join(tmpDir, '.incognide-fresh');
    fs.rmSync(freshDir, { recursive: true, force: true });
    const marker = path.join(freshDir, '.migrated');

    if (!fs.existsSync(marker)) {
      if (!fs.existsSync(freshDir)) {
        fs.mkdirSync(freshDir, { recursive: true });
      }
      fs.writeFileSync(marker, new Date().toISOString());
    }

    expect(fs.existsSync(freshDir)).toBe(true);
    expect(fs.existsSync(marker)).toBe(true);
  });
});

describe('custom_providers.yaml', () => {
  const tmpDir = path.join(os.tmpdir(), `incognide-cp-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty providers when file does not exist', () => {
    const filePath = path.join(tmpDir, 'custom_providers.yaml');
    let providers = {};
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = yaml.load(content);
      providers = parsed?.providers || {};
    } catch {
      providers = {};
    }
    expect(providers).toEqual({});
  });

  it('writes and reads custom providers', () => {
    const filePath = path.join(tmpDir, 'custom_providers.yaml');
    const providers = {
      myllm: {
        base_url: 'https://api.myllm.com/v1',
        api_key_var: 'MYLLM_API_KEY',
        headers: { 'X-Custom': 'value' },
      },
      moonshot: {
        base_url: 'https://api.moonshot.cn/v1',
        api_key_var: 'MOONSHOT_API_KEY',
      },
    };

    const content = yaml.dump({ providers }, { lineWidth: -1 });
    fs.writeFileSync(filePath, content, 'utf8');

    const readBack = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(readBack);
    expect(parsed.providers.myllm.base_url).toBe('https://api.myllm.com/v1');
    expect(parsed.providers.myllm.api_key_var).toBe('MYLLM_API_KEY');
    expect(parsed.providers.moonshot.base_url).toBe('https://api.moonshot.cn/v1');
  });

  it('preserves headers as objects', () => {
    const filePath = path.join(tmpDir, 'custom_providers.yaml');
    const providers = {
      myllm: {
        base_url: 'https://api.myllm.com/v1',
        api_key_var: 'MYLLM_API_KEY',
        headers: { 'X-Custom': 'value', 'Authorization': 'Bearer test' },
      },
    };

    fs.writeFileSync(filePath, yaml.dump({ providers }, { lineWidth: -1 }), 'utf8');
    const parsed = yaml.load(fs.readFileSync(filePath, 'utf8'));

    expect(typeof parsed.providers.myllm.headers).toBe('object');
    expect(parsed.providers.myllm.headers['X-Custom']).toBe('value');
  });
});

describe('registered_teams.yaml', () => {
  const tmpDir = path.join(os.tmpdir(), `incognide-teams-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns defaults when file does not exist', () => {
    const filePath = path.join(tmpDir, 'registered_teams.yaml');
    let teams;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      teams = yaml.load(content)?.teams || {};
    } catch {
      teams = {
        incognide: { path: path.join(tmpDir, 'npc_team'), name: 'Incognide' },
        npcsh: { path: path.join(os.homedir(), '.npcsh', 'npc_team'), name: 'npcsh' },
      };
    }
    expect(teams.incognide).toBeDefined();
    expect(teams.npcsh).toBeDefined();
    expect(teams.incognide.name).toBe('Incognide');
    expect(teams.npcsh.name).toBe('npcsh');
  });

  it('writes and reads registered teams', () => {
    const filePath = path.join(tmpDir, 'registered_teams.yaml');
    const teams = {
      incognide: { path: '~/.incognide/npc_team', name: 'Incognide' },
      npcsh: { path: '~/.npcsh/npc_team', name: 'npcsh' },
      myproject: { path: '/Users/dev/myproject/npc_team', name: 'My Project' },
    };

    fs.writeFileSync(filePath, yaml.dump({ teams }, { lineWidth: -1 }), 'utf8');
    const parsed = yaml.load(fs.readFileSync(filePath, 'utf8'));

    expect(parsed.teams.myproject.name).toBe('My Project');
    expect(parsed.teams.myproject.path).toBe('/Users/dev/myproject/npc_team');
    expect(Object.keys(parsed.teams)).toHaveLength(3);
  });

  it('can add and remove teams', () => {
    const filePath = path.join(tmpDir, 'registered_teams.yaml');
    let teams: Record<string, any> = {
      incognide: { path: '~/.incognide/npc_team', name: 'Incognide' },
      npcsh: { path: '~/.npcsh/npc_team', name: 'npcsh' },
    };

    // Add a team
    teams['giacomo'] = { path: '/Users/caug/giacomo/npc_team', name: 'Giacomo' };
    expect(Object.keys(teams)).toHaveLength(3);

    // Remove a team
    delete teams['npcsh'];
    expect(Object.keys(teams)).toHaveLength(2);
    expect(teams.npcsh).toBeUndefined();
  });
});

describe('CUSTOM_PROVIDER_* filtering in global settings', () => {
  it('filters out CUSTOM_PROVIDER_ keys from global_vars on read', () => {
    const lines = [
      'export NPCSH_CHAT_MODEL=llama3.2',
      'export NPCSH_CHAT_PROVIDER=ollama',
      'export CUSTOM_PROVIDER_MYLLM={"base_url":"https://api.myllm.com","api_key_var":"MYLLM_API_KEY"}',
      'export SOME_OTHER_VAR=value',
    ];

    const global_vars: Record<string, string> = {};
    for (const line of lines) {
      const stripped = line.trim().replace(/^export\s+/, '');
      const eqIdx = stripped.indexOf('=');
      if (eqIdx === -1) continue;
      const envKey = stripped.slice(0, eqIdx).trim();
      let value = stripped.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (envKey && !envKey.startsWith('CUSTOM_PROVIDER_')) {
        global_vars[envKey] = value;
      }
    }

    expect(global_vars['NPCSH_CHAT_MODEL']).toBe('llama3.2');
    expect(global_vars['SOME_OTHER_VAR']).toBe('value');
    expect(global_vars['CUSTOM_PROVIDER_MYLLM']).toBeUndefined();
  });

  it('filters out CUSTOM_PROVIDER_ keys from global_vars on write', () => {
    const inputVars: Record<string, string> = {
      NPCSH_CHAT_MODEL: 'llama3.2',
      CUSTOM_PROVIDER_MYLLM: '{"base_url":"https://api.myllm.com"}',
      MY_VAR: 'hello',
    };

    const filteredVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(inputVars)) {
      if (!key.startsWith('CUSTOM_PROVIDER_')) {
        filteredVars[key] = value;
      }
    }

    expect(filteredVars['NPCSH_CHAT_MODEL']).toBe('llama3.2');
    expect(filteredVars['MY_VAR']).toBe('hello');
    expect(filteredVars['CUSTOM_PROVIDER_MYLLM']).toBeUndefined();
  });
});

describe('detect-provider-keys includes custom providers', () => {
  it('includes custom providers from YAML alongside known providers', () => {
    const KNOWN = [
      { provider: 'openai', envVar: 'OPENAI_API_KEY', baseUrl: 'https://api.openai.com/v1' },
      { provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY', baseUrl: 'https://api.anthropic.com/v1' },
    ];
    const envSources = new Set(['OPENAI_API_KEY', 'MYLLM_API_KEY']);

    const detected = KNOWN.filter(k => envSources.has(k.envVar));

    // Simulate custom providers from YAML
    const customProviders = {
      myllm: { base_url: 'https://api.myllm.com/v1', api_key_var: 'MYLLM_API_KEY' },
    };
    for (const [name, config] of Object.entries(customProviders)) {
      const cp = config as any;
      detected.push({
        provider: name,
        envVar: cp.api_key_var || `${name.toUpperCase()}_API_KEY`,
        baseUrl: cp.base_url || '',
        custom: true,
      });
    }

    expect(detected).toHaveLength(2);
    expect(detected.find(d => d.provider === 'openai')).toBeDefined();
    expect(detected.find(d => d.provider === 'myllm')).toBeDefined();
    expect(detected.find(d => d.provider === 'myllm')?.custom).toBe(true);
    expect(detected.find(d => d.provider === 'anthropic')).toBeUndefined();
  });
});

describe('getCustomProviders helper', () => {
  const tmpDir = path.join(os.tmpdir(), `incognide-getcp-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty object when YAML file does not exist', async () => {
    const filePath = path.join(tmpDir, 'custom_providers.yaml');
    let providers = {};
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = yaml.load(content);
      providers = parsed?.providers || {};
    } catch {
      providers = {};
    }
    expect(providers).toEqual({});
  });

  it('returns providers from YAML file', () => {
    const filePath = path.join(tmpDir, 'custom_providers.yaml');
    const providers = {
      fart: { base_url: 'https://enpisi.com/api', api_key_var: 'FART_API_KEY' },
    };
    fs.writeFileSync(filePath, yaml.dump({ providers }, { lineWidth: -1 }), 'utf8');

    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(content);
    const result = parsed?.providers || {};

    expect(result.fart.base_url).toBe('https://enpisi.com/api');
    expect(result.fart.api_key_var).toBe('FART_API_KEY');
  });
});

describe('INCOGNIDE_HOME path replacement', () => {
  it('replaces .npcsh/incognide paths with INCOGNIDE_HOME', () => {
    const INCOGNIDE_HOME = '/home/user/.incognide';
    const paths = {
      venv: path.posix.join(INCOGNIDE_HOME, 'venv'),
      data: path.posix.join(INCOGNIDE_HOME, 'data'),
      npc_team: path.posix.join(INCOGNIDE_HOME, 'npc_team'),
      logs: path.posix.join(INCOGNIDE_HOME, 'logs'),
    };

    expect(paths.venv).toBe('/home/user/.incognide/venv');
    expect(paths.data).toBe('/home/user/.incognide/data');
    expect(paths.npc_team).toBe('/home/user/.incognide/npc_team');
    expect(paths.logs).toBe('/home/user/.incognide/logs');
  });

  it('INCOGNIDE_TEAM_PATH uses INCOGNIDE_HOME', () => {
    const INCOGNIDE_HOME = '/home/user/.incognide';
    const INCOGNIDE_TEAM_PATH = path.posix.join(INCOGNIDE_HOME, 'npc_team');

    expect(INCOGNIDE_TEAM_PATH).toBe('/home/user/.incognide/npc_team');
  });
});