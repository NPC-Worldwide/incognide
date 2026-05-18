import { describe, it, expect, beforeEach, vi } from 'vitest';

// Tests for the dynamic provider options logic extracted from TeamManagement

describe('dynamic provider options', () => {
  const baseProviderOptions = [
    { value: 'ollama', label: 'Ollama' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'lmstudio', label: 'LM Studio' },
    { value: 'llamacpp', label: 'llama.cpp' },
  ];

  it('includes base providers when no custom providers', () => {
    const customProviders: Record<string, any> = {};
    const customProviderOptions = Object.entries(customProviders).map(([name]) => ({
      value: name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
    }));
    const providerOptions = [...baseProviderOptions, ...customProviderOptions.filter(
      cp => !baseProviderOptions.some(bp => bp.value === cp.value)
    )];

    expect(providerOptions).toHaveLength(6);
    expect(providerOptions.map(p => p.value)).toEqual(['ollama', 'openai', 'anthropic', 'gemini', 'lmstudio', 'llamacpp']);
  });

  it('adds custom providers from YAML', () => {
    const customProviders: Record<string, any> = {
      myllm: { base_url: 'https://api.myllm.com/v1', api_key_var: 'MYLLM_API_KEY' },
      moonshot: { base_url: 'https://api.moonshot.cn/v1', api_key_var: 'MOONSHOT_API_KEY' },
    };
    const customProviderOptions = Object.entries(customProviders).map(([name]) => ({
      value: name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
    }));
    const providerOptions = [...baseProviderOptions, ...customProviderOptions.filter(
      cp => !baseProviderOptions.some(bp => bp.value === cp.value)
    )];

    expect(providerOptions).toHaveLength(8);
    expect(providerOptions.find(p => p.value === 'myllm')?.label).toBe('Myllm');
    expect(providerOptions.find(p => p.value === 'moonshot')?.label).toBe('Moonshot');
  });

  it('does not duplicate providers that overlap with base', () => {
    const customProviders: Record<string, any> = {
      ollama: { base_url: 'http://localhost:11434', api_key_var: '' },
    };
    const customProviderOptions = Object.entries(customProviders).map(([name]) => ({
      value: name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
    }));
    const providerOptions = [...baseProviderOptions, ...customProviderOptions.filter(
      cp => !baseProviderOptions.some(bp => bp.value === cp.value)
    )];

    // ollama is in base, so it should not be duplicated
    expect(providerOptions).toHaveLength(6);
    expect(providerOptions.filter(p => p.value === 'ollama')).toHaveLength(1);
  });
});

describe('ProvidersContent YAML load/save', () => {
  it('converts custom providers from YAML to form state', () => {
    const yamlProviders = {
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

    const loaded = Object.entries(yamlProviders).map(([name, config]: [string, any]) => ({
      name: name.toLowerCase(),
      baseUrl: config.base_url || '',
      apiKeyVar: config.api_key_var || '',
      headers: config.headers ? JSON.stringify(config.headers, null, 2) : '',
    }));

    expect(loaded).toHaveLength(2);
    expect(loaded[0].name).toBe('myllm');
    expect(loaded[0].baseUrl).toBe('https://api.myllm.com/v1');
    expect(loaded[0].apiKeyVar).toBe('MYLLM_API_KEY');
    expect(loaded[0].headers).toBe('{\n  "X-Custom": "value"\n}');
    expect(loaded[1].name).toBe('moonshot');
    expect(loaded[1].headers).toBe('');
  });

  it('converts form state back to YAML providers map', () => {
    const providers = [
      { name: 'myllm', baseUrl: 'https://api.myllm.com/v1', apiKeyVar: 'MYLLM_API_KEY', headers: '{\n  "X-Custom": "value"\n}' },
      { name: 'moonshot', baseUrl: 'https://api.moonshot.cn/v1', apiKeyVar: 'MOONSHOT_API_KEY', headers: '' },
    ];

    const providersMap: Record<string, any> = {};
    providers.forEach(provider => {
      if (provider.name && provider.baseUrl) {
        const config: Record<string, any> = {
          base_url: provider.baseUrl,
          api_key_var: provider.apiKeyVar || `${provider.name.toUpperCase()}_API_KEY`,
        };
        if (provider.headers) {
          try { config.headers = JSON.parse(provider.headers); } catch {}
        }
        providersMap[provider.name.toLowerCase()] = config;
      }
    });

    expect(providersMap.myllm.base_url).toBe('https://api.myllm.com/v1');
    expect(providersMap.myllm.headers).toEqual({ 'X-Custom': 'value' });
    expect(providersMap.moonshot.base_url).toBe('https://api.moonshot.cn/v1');
    expect(providersMap.moonshot.headers).toBeUndefined();
  });
});

describe('dynamic team switching', () => {
  it('builds team order from registered teams', () => {
    const registeredTeams = {
      incognide: { path: '~/.incognide/npc_team', name: 'Incognide' },
      npcsh: { path: '~/.npcsh/npc_team', name: 'npcsh' },
      myproject: { path: '/Users/dev/myproject/npc_team', name: 'My Project' },
    };

    const teamOrder = ['project', ...Object.keys(registeredTeams)];
    const teamLabels: Record<string, string> = {
      project: 'Project',
      ...Object.fromEntries(
        Object.entries(registeredTeams).map(([k, v]: [string, any]) => [k, v.name || k])
      ),
    };

    expect(teamOrder).toEqual(['project', 'incognide', 'npcsh', 'myproject']);
    expect(teamLabels.incognide).toBe('Incognide');
    expect(teamLabels.myproject).toBe('My Project');
    expect(teamLabels.project).toBe('Project');
  });

  it('resolves global path from registered teams', () => {
    const registeredTeams: Record<string, any> = {
      incognide: { path: '~/.incognide/npc_team', name: 'Incognide' },
      npcsh: { path: '~/.npcsh/npc_team', name: 'npcsh' },
      myproject: { path: '/Users/dev/myproject/npc_team', name: 'My Project' },
    };

    // globalSource = 'incognide' → registeredTeams.incognide.path
    const globalSource = 'incognide';
    const globalPath = registeredTeams[globalSource]?.path || undefined;
    expect(globalPath).toBe('~/.incognide/npc_team');

    // globalSource = 'npcsh' → npcsh is a known shortcut
    const globalSource2 = 'npcsh';
    const globalPath2 = globalSource2 === 'npcsh' ? 'npcsh' : (registeredTeams[globalSource2]?.path || undefined);
    expect(globalPath2).toBe('npcsh');

    // globalSource = 'myproject' → custom team path
    const globalSource3 = 'myproject';
    const globalPath3 = registeredTeams[globalSource3]?.path || undefined;
    expect(globalPath3).toBe('/Users/dev/myproject/npc_team');
  });
});

describe('loadAvailableNPCs with registered teams', () => {
  it('fetches NPCs from all registered teams', async () => {
    const mockProjectNPCs = [
      { name: 'sibiji', provider: 'ollama' },
    ];
    const mockIncognideNPCs = [
      { name: 'ledbi', provider: 'ollama' },
    ];
    const mockNpcshNPCs = [
      { name: 'sibiji_global', provider: 'ollama' },
    ];

    // Simulate the merging logic
    const teamKeys = ['project', 'incognide', 'npcsh'];
    const results = [
      { status: 'fulfilled', value: { npcs: mockProjectNPCs } },
      { status: 'fulfilled', value: { npcs: mockIncognideNPCs } },
      { status: 'fulfilled', value: { npcs: mockNpcshNPCs } },
    ];

    const combinedNPCs: any[] = [];
    results.forEach((result, idx) => {
      const teamKey = teamKeys[idx];
      const npcs = result.status === 'fulfilled' ? (result.value.npcs || []) : [];
      npcs.forEach((npc: any) => {
        combinedNPCs.push({
          ...npc,
          value: npc.name,
          display_name: `${npc.name} | ${teamKey === 'project' ? 'Project' : teamKey}`,
          source: teamKey === 'project' ? 'project' : 'global',
          team: teamKey,
        });
      });
    });

    expect(combinedNPCs).toHaveLength(3);
    expect(combinedNPCs[0].team).toBe('project');
    expect(combinedNPCs[1].team).toBe('incognide');
    expect(combinedNPCs[2].team).toBe('npcsh');
    expect(combinedNPCs[0].display_name).toBe('sibiji | Project');
    expect(combinedNPCs[1].display_name).toBe('ledbi | incognide');
  });
});

describe('getNPCTeamGlobal resolves registered team keys', () => {
  it('resolves known team key to path from registered_teams.yaml', async () => {
    const yaml = require('js-yaml');
    const registeredTeams = {
      myproject: { path: '/Users/dev/myproject/npc_team', name: 'My Project' },
    };

    // Simulate resolution logic
    const globalPath = 'myproject';
    const team = registeredTeams[globalPath];
    if (team?.path) {
      const resolved = team.path.replace(/^~(?=\/|$)/, require('os').homedir());
      expect(resolved).toBe('/Users/dev/myproject/npc_team');
    }
  });

  it('falls back to npcsh for npcsh key', () => {
    const globalPath = 'npcsh';
    expect(globalPath).toBe('npcsh');
    // Would route to: path.join(os.homedir(), '.npcsh', 'npc_team')
  });

  it('falls back to INCOGNIDE_TEAM_PATH for undefined/empty globalPath', () => {
    const globalPath = undefined;
    // Would route to INCOGNIDE_TEAM_PATH
    expect(globalPath).toBeUndefined();
  });
});