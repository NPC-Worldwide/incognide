// Built-in demo maps for Cartoglyph — sample GeoJSON datasets
// Each entry is a complete GIS project users can load and explore

import type { GISProject } from 'npcts';

export interface DemoMap {
    title: string;
    description: string;
    category: 'travel' | 'history' | 'nature' | 'infrastructure' | 'intelligence';
    featureCount: number;
    center: [number, number];
    zoom: number;
    project: GISProject;
}

export const demoMaps: DemoMap[] = [
    // ===== TRAVEL =====
    {
        title: 'Seven Wonders of the Ancient World',
        description: 'Locations of the original seven wonders with historical notes',
        category: 'travel',
        featureCount: 7,
        center: [31.2, 32.5],
        zoom: 4,
        project: {
            version: 2, name: 'Seven Wonders of the Ancient World', center: [31.2, 32.5], zoom: 4, basemap: 'satellite',
            layers: [{ id: 'wonders', name: 'Ancient Wonders', visible: true, color: '#f59e0b', features: ['w1','w2','w3','w4','w5','w6','w7'], locked: false }],
            features: [
                { id: 'w1', type: 'marker', name: 'Great Pyramid of Giza', coordinates: [29.9792, 31.1342], color: '#f59e0b', visible: true, layerId: 'wonders', properties: { built: '2560 BC', status: 'Still standing', location: 'Giza, Egypt' } },
                { id: 'w2', type: 'marker', name: 'Hanging Gardens of Babylon', coordinates: [32.5355, 44.4275], color: '#f59e0b', visible: true, layerId: 'wonders', properties: { built: '600 BC', status: 'Destroyed (earthquake)', location: 'Hillah, Iraq' } },
                { id: 'w3', type: 'marker', name: 'Statue of Zeus at Olympia', coordinates: [37.6386, 21.6300], color: '#f59e0b', visible: true, layerId: 'wonders', properties: { built: '435 BC', status: 'Destroyed (fire)', location: 'Olympia, Greece' } },
                { id: 'w4', type: 'marker', name: 'Temple of Artemis at Ephesus', coordinates: [37.9497, 27.3638], color: '#f59e0b', visible: true, layerId: 'wonders', properties: { built: '550 BC', status: 'Destroyed (arson)', location: 'Selçuk, Turkey' } },
                { id: 'w5', type: 'marker', name: 'Mausoleum at Halicarnassus', coordinates: [37.0379, 27.4241], color: '#f59e0b', visible: true, layerId: 'wonders', properties: { built: '351 BC', status: 'Destroyed (earthquake)', location: 'Bodrum, Turkey' } },
                { id: 'w6', type: 'marker', name: 'Colossus of Rhodes', coordinates: [36.4510, 28.2278], color: '#f59e0b', visible: true, layerId: 'wonders', properties: { built: '280 BC', status: 'Destroyed (earthquake)', location: 'Rhodes, Greece' } },
                { id: 'w7', type: 'marker', name: 'Lighthouse of Alexandria', coordinates: [31.2140, 29.8856], color: '#f59e0b', visible: true, layerId: 'wonders', properties: { built: '280 BC', status: 'Destroyed (earthquake)', location: 'Alexandria, Egypt' } },
            ],
        },
    },
    {
        title: 'World Capital Cities (G20)',
        description: 'Capital cities of all G20 member nations',
        category: 'travel',
        featureCount: 20,
        center: [20, 0],
        zoom: 2,
        project: {
            version: 2, name: 'G20 Capital Cities', center: [20, 0], zoom: 2, basemap: 'osm',
            layers: [{ id: 'capitals', name: 'G20 Capitals', visible: true, color: '#3b82f6', features: Array.from({length: 20}, (_, i) => `g${i}`), locked: false }],
            features: [
                { id: 'g0', type: 'marker', name: 'Washington D.C.', coordinates: [38.9072, -77.0369], color: '#3b82f6', visible: true, layerId: 'capitals', properties: { country: 'United States', population: '689,545' } },
                { id: 'g1', type: 'marker', name: 'Beijing', coordinates: [39.9042, 116.4074], color: '#ef4444', visible: true, layerId: 'capitals', properties: { country: 'China', population: '21,540,000' } },
                { id: 'g2', type: 'marker', name: 'Moscow', coordinates: [55.7558, 37.6173], color: '#8b5cf6', visible: true, layerId: 'capitals', properties: { country: 'Russia', population: '12,600,000' } },
                { id: 'g3', type: 'marker', name: 'Brasilia', coordinates: [-15.7975, -47.8919], color: '#10b981', visible: true, layerId: 'capitals', properties: { country: 'Brazil', population: '3,015,268' } },
                { id: 'g4', type: 'marker', name: 'New Delhi', coordinates: [28.6139, 77.2090], color: '#f59e0b', visible: true, layerId: 'capitals', properties: { country: 'India', population: '16,787,941' } },
                { id: 'g5', type: 'marker', name: 'Tokyo', coordinates: [35.6762, 139.6503], color: '#ec4899', visible: true, layerId: 'capitals', properties: { country: 'Japan', population: '13,960,000' } },
                { id: 'g6', type: 'marker', name: 'Berlin', coordinates: [52.5200, 13.4050], color: '#06b6d4', visible: true, layerId: 'capitals', properties: { country: 'Germany', population: '3,769,495' } },
                { id: 'g7', type: 'marker', name: 'London', coordinates: [51.5074, -0.1278], color: '#84cc16', visible: true, layerId: 'capitals', properties: { country: 'United Kingdom', population: '8,982,000' } },
                { id: 'g8', type: 'marker', name: 'Paris', coordinates: [48.8566, 2.3522], color: '#a855f7', visible: true, layerId: 'capitals', properties: { country: 'France', population: '2,161,000' } },
                { id: 'g9', type: 'marker', name: 'Ottawa', coordinates: [45.4215, -75.6972], color: '#ef4444', visible: true, layerId: 'capitals', properties: { country: 'Canada', population: '1,017,449' } },
                { id: 'g10', type: 'marker', name: 'Canberra', coordinates: [-35.2809, 149.1300], color: '#f59e0b', visible: true, layerId: 'capitals', properties: { country: 'Australia', population: '462,213' } },
                { id: 'g11', type: 'marker', name: 'Buenos Aires', coordinates: [-34.6037, -58.3816], color: '#06b6d4', visible: true, layerId: 'capitals', properties: { country: 'Argentina', population: '3,075,646' } },
                { id: 'g12', type: 'marker', name: 'Riyadh', coordinates: [24.7136, 46.6753], color: '#10b981', visible: true, layerId: 'capitals', properties: { country: 'Saudi Arabia', population: '7,676,654' } },
                { id: 'g13', type: 'marker', name: 'Ankara', coordinates: [39.9334, 32.8597], color: '#ec4899', visible: true, layerId: 'capitals', properties: { country: 'Turkey', population: '5,747,325' } },
                { id: 'g14', type: 'marker', name: 'Seoul', coordinates: [37.5665, 126.9780], color: '#3b82f6', visible: true, layerId: 'capitals', properties: { country: 'South Korea', population: '9,776,000' } },
                { id: 'g15', type: 'marker', name: 'Mexico City', coordinates: [19.4326, -99.1332], color: '#84cc16', visible: true, layerId: 'capitals', properties: { country: 'Mexico', population: '9,209,944' } },
                { id: 'g16', type: 'marker', name: 'Jakarta', coordinates: [-6.2088, 106.8456], color: '#8b5cf6', visible: true, layerId: 'capitals', properties: { country: 'Indonesia', population: '10,562,088' } },
                { id: 'g17', type: 'marker', name: 'Rome', coordinates: [41.9028, 12.4964], color: '#f59e0b', visible: true, layerId: 'capitals', properties: { country: 'Italy', population: '2,873,000' } },
                { id: 'g18', type: 'marker', name: 'Pretoria', coordinates: [-25.7479, 28.2293], color: '#ef4444', visible: true, layerId: 'capitals', properties: { country: 'South Africa', population: '2,921,488' } },
                { id: 'g19', type: 'marker', name: 'Brussels', coordinates: [50.8503, 4.3517], color: '#06b6d4', visible: true, layerId: 'capitals', properties: { country: 'European Union', population: '1,209,000' } },
            ],
        },
    },

    // ===== HISTORY =====
    {
        title: 'Silk Road Trade Routes',
        description: 'Major waypoints along the ancient Silk Road network',
        category: 'history',
        featureCount: 14,
        center: [38, 65],
        zoom: 4,
        project: {
            version: 2, name: 'Silk Road Trade Routes', center: [38, 65], zoom: 4, basemap: 'topo',
            layers: [
                { id: 'cities', name: 'Silk Road Cities', visible: true, color: '#f59e0b', features: ['sr0','sr1','sr2','sr3','sr4','sr5','sr6','sr7','sr8','sr9','sr10','sr11'], locked: false },
                { id: 'route', name: 'Main Route', visible: true, color: '#ef4444', features: ['route1'], locked: false },
            ],
            features: [
                { id: 'sr0', type: 'marker', name: "Xi'an (Chang'an)", coordinates: [34.2658, 108.9541], color: '#ef4444', visible: true, layerId: 'cities', properties: { role: 'Eastern terminus', era: 'Han Dynasty onwards' } },
                { id: 'sr1', type: 'marker', name: 'Dunhuang', coordinates: [40.1421, 94.6620], color: '#f59e0b', visible: true, layerId: 'cities', properties: { role: 'Gateway to the desert', note: 'Mogao Caves' } },
                { id: 'sr2', type: 'marker', name: 'Kashgar', coordinates: [39.4547, 75.9797], color: '#f59e0b', visible: true, layerId: 'cities', properties: { role: 'Major junction', note: 'Split between northern and southern routes' } },
                { id: 'sr3', type: 'marker', name: 'Samarkand', coordinates: [39.6270, 66.9750], color: '#f59e0b', visible: true, layerId: 'cities', properties: { role: 'Trade hub', note: 'Timurid capital, paper production' } },
                { id: 'sr4', type: 'marker', name: 'Bukhara', coordinates: [39.7681, 64.4556], color: '#f59e0b', visible: true, layerId: 'cities', properties: { role: 'Scholarly center', note: 'Islamic golden age scholarship' } },
                { id: 'sr5', type: 'marker', name: 'Merv', coordinates: [37.6639, 62.1874], color: '#f59e0b', visible: true, layerId: 'cities', properties: { role: 'Oasis city', note: 'Once largest city in the world' } },
                { id: 'sr6', type: 'marker', name: 'Tehran', coordinates: [35.6892, 51.3890], color: '#f59e0b', visible: true, layerId: 'cities', properties: { role: 'Persian waypoint' } },
                { id: 'sr7', type: 'marker', name: 'Baghdad', coordinates: [33.3152, 44.3661], color: '#f59e0b', visible: true, layerId: 'cities', properties: { role: 'Abbasid capital', note: 'House of Wisdom' } },
                { id: 'sr8', type: 'marker', name: 'Palmyra', coordinates: [34.5515, 38.2841], color: '#f59e0b', visible: true, layerId: 'cities', properties: { role: 'Desert oasis trading post' } },
                { id: 'sr9', type: 'marker', name: 'Antioch', coordinates: [36.2000, 36.1500], color: '#f59e0b', visible: true, layerId: 'cities', properties: { role: 'Roman trading port' } },
                { id: 'sr10', type: 'marker', name: 'Constantinople', coordinates: [41.0082, 28.9784], color: '#8b5cf6', visible: true, layerId: 'cities', properties: { role: 'Western terminus', note: 'Gateway to Europe' } },
                { id: 'sr11', type: 'marker', name: 'Alexandria', coordinates: [31.2001, 29.9187], color: '#8b5cf6', visible: true, layerId: 'cities', properties: { role: 'Maritime connection', note: 'Great Library' } },
                { id: 'route1', type: 'line', name: 'Main Overland Route', coordinates: [
                    [34.2658, 108.9541], [40.1421, 94.6620], [39.4547, 75.9797], [39.6270, 66.9750],
                    [39.7681, 64.4556], [37.6639, 62.1874], [35.6892, 51.3890], [33.3152, 44.3661],
                    [34.5515, 38.2841], [36.2000, 36.1500], [41.0082, 28.9784],
                ], color: '#ef4444', visible: true, layerId: 'route', properties: { distance: '~6,400 km', active_period: '130 BC – 1453 AD' } },
            ],
        },
    },
    {
        title: 'D-Day Landing Beaches',
        description: 'The five Allied landing beaches of June 6, 1944',
        category: 'history',
        featureCount: 7,
        center: [49.35, -0.75],
        zoom: 11,
        project: {
            version: 2, name: 'D-Day Landing Beaches', center: [49.35, -0.75], zoom: 11, basemap: 'satellite',
            layers: [{ id: 'beaches', name: 'Landing Beaches', visible: true, color: '#10b981', features: ['d0','d1','d2','d3','d4','d5','d6'], locked: false }],
            features: [
                { id: 'd0', type: 'marker', name: 'Utah Beach', coordinates: [49.4150, -1.1750], color: '#3b82f6', visible: true, layerId: 'beaches', properties: { force: 'US 4th Infantry Division', casualties: '197', sector: 'Western' } },
                { id: 'd1', type: 'marker', name: 'Omaha Beach', coordinates: [49.3650, -0.8700], color: '#ef4444', visible: true, layerId: 'beaches', properties: { force: 'US 1st & 29th Infantry Divisions', casualties: '~2,000', sector: 'Western', note: 'Bloodiest beach' } },
                { id: 'd2', type: 'marker', name: 'Gold Beach', coordinates: [49.3400, -0.6300], color: '#f59e0b', visible: true, layerId: 'beaches', properties: { force: 'British 50th Infantry Division', casualties: '~400', sector: 'Central' } },
                { id: 'd3', type: 'marker', name: 'Juno Beach', coordinates: [49.3350, -0.4600], color: '#ef4444', visible: true, layerId: 'beaches', properties: { force: '3rd Canadian Infantry Division', casualties: '~1,200', sector: 'Central' } },
                { id: 'd4', type: 'marker', name: 'Sword Beach', coordinates: [49.2900, -0.2900], color: '#8b5cf6', visible: true, layerId: 'beaches', properties: { force: 'British 3rd Infantry Division', casualties: '~630', sector: 'Eastern' } },
                { id: 'd5', type: 'marker', name: 'Pointe du Hoc', coordinates: [49.3956, -0.9892], color: '#f59e0b', visible: true, layerId: 'beaches', properties: { force: 'US 2nd Ranger Battalion', note: 'Cliff assault on German gun emplacements' } },
                { id: 'd6', type: 'marker', name: 'Pegasus Bridge', coordinates: [49.2440, -0.2740], color: '#10b981', visible: true, layerId: 'beaches', properties: { force: 'British 6th Airborne Division', note: 'Glider assault, first objective taken' } },
            ],
        },
    },

    // ===== NATURE =====
    {
        title: 'Ring of Fire Volcanoes',
        description: 'Major active volcanoes along the Pacific Ring of Fire',
        category: 'nature',
        featureCount: 15,
        center: [10, 170],
        zoom: 2,
        project: {
            version: 2, name: 'Ring of Fire Volcanoes', center: [10, 170], zoom: 2, basemap: 'topo',
            layers: [{ id: 'volcanoes', name: 'Active Volcanoes', visible: true, color: '#ef4444', features: Array.from({length: 15}, (_, i) => `v${i}`), locked: false }],
            features: [
                { id: 'v0', type: 'marker', name: 'Mount Fuji', coordinates: [35.3606, 138.7274], color: '#ef4444', visible: true, layerId: 'volcanoes', properties: { elevation: '3,776m', country: 'Japan', last_eruption: '1707' } },
                { id: 'v1', type: 'marker', name: 'Mount Pinatubo', coordinates: [15.1429, 120.3496], color: '#ef4444', visible: true, layerId: 'volcanoes', properties: { elevation: '1,486m', country: 'Philippines', last_eruption: '1991' } },
                { id: 'v2', type: 'marker', name: 'Krakatoa', coordinates: [-6.1021, 105.4230], color: '#ef4444', visible: true, layerId: 'volcanoes', properties: { elevation: '813m', country: 'Indonesia', last_eruption: '2020' } },
                { id: 'v3', type: 'marker', name: 'Mount Erebus', coordinates: [-77.5280, 167.1530], color: '#8b5cf6', visible: true, layerId: 'volcanoes', properties: { elevation: '3,794m', country: 'Antarctica', note: 'Southernmost active volcano' } },
                { id: 'v4', type: 'marker', name: 'Mount Rainier', coordinates: [46.8523, -121.7603], color: '#ef4444', visible: true, layerId: 'volcanoes', properties: { elevation: '4,392m', country: 'USA', note: 'Most dangerous volcano in the US' } },
                { id: 'v5', type: 'marker', name: 'Mount St. Helens', coordinates: [46.1912, -122.1944], color: '#ef4444', visible: true, layerId: 'volcanoes', properties: { elevation: '2,549m', country: 'USA', last_eruption: '2008' } },
                { id: 'v6', type: 'marker', name: 'Popocatépetl', coordinates: [19.0225, -98.6278], color: '#f59e0b', visible: true, layerId: 'volcanoes', properties: { elevation: '5,426m', country: 'Mexico', last_eruption: '2024' } },
                { id: 'v7', type: 'marker', name: 'Cotopaxi', coordinates: [-0.6836, -78.4375], color: '#f59e0b', visible: true, layerId: 'volcanoes', properties: { elevation: '5,897m', country: 'Ecuador', last_eruption: '2023' } },
                { id: 'v8', type: 'marker', name: 'Mount Vesuvius', coordinates: [40.8210, 14.4260], color: '#ef4444', visible: true, layerId: 'volcanoes', properties: { elevation: '1,281m', country: 'Italy', last_eruption: '1944', note: 'Destroyed Pompeii in 79 AD' } },
                { id: 'v9', type: 'marker', name: 'Kilauea', coordinates: [19.4069, -155.2834], color: '#ef4444', visible: true, layerId: 'volcanoes', properties: { elevation: '1,247m', country: 'USA (Hawaii)', last_eruption: '2023' } },
                { id: 'v10', type: 'marker', name: 'Taal Volcano', coordinates: [14.0113, 120.9982], color: '#f59e0b', visible: true, layerId: 'volcanoes', properties: { elevation: '311m', country: 'Philippines', last_eruption: '2022', note: 'Volcano within a lake within a volcano' } },
                { id: 'v11', type: 'marker', name: 'Mount Merapi', coordinates: [-7.5407, 110.4457], color: '#ef4444', visible: true, layerId: 'volcanoes', properties: { elevation: '2,930m', country: 'Indonesia', last_eruption: '2023' } },
                { id: 'v12', type: 'marker', name: 'Sakurajima', coordinates: [31.5852, 130.6568], color: '#ef4444', visible: true, layerId: 'volcanoes', properties: { elevation: '1,117m', country: 'Japan', last_eruption: '2024', note: 'One of most active in the world' } },
                { id: 'v13', type: 'marker', name: 'Villarrica', coordinates: [-39.4200, -71.9300], color: '#f59e0b', visible: true, layerId: 'volcanoes', properties: { elevation: '2,847m', country: 'Chile', last_eruption: '2024' } },
                { id: 'v14', type: 'marker', name: 'Eyjafjallajökull', coordinates: [63.6320, -19.6210], color: '#06b6d4', visible: true, layerId: 'volcanoes', properties: { elevation: '1,651m', country: 'Iceland', last_eruption: '2010', note: 'Disrupted European air travel for weeks' } },
            ],
        },
    },

    // ===== INFRASTRUCTURE =====
    {
        title: 'Undersea Internet Cables (Major)',
        description: 'Key transoceanic fiber optic cable landing points',
        category: 'infrastructure',
        featureCount: 13,
        center: [20, -30],
        zoom: 2,
        project: {
            version: 2, name: 'Undersea Internet Cables', center: [20, -30], zoom: 2, basemap: 'dark',
            layers: [
                { id: 'landing', name: 'Landing Points', visible: true, color: '#06b6d4', features: Array.from({length: 8}, (_, i) => `lp${i}`), locked: false },
                { id: 'cables', name: 'Cable Routes', visible: true, color: '#3b82f6', features: ['c0', 'c1', 'c2', 'c3', 'c4'], locked: false },
            ],
            features: [
                { id: 'lp0', type: 'marker', name: 'Tuckerton, NJ', coordinates: [39.6031, -74.3404], color: '#06b6d4', visible: true, layerId: 'landing', properties: { cables: 'TAT-14, AC-1', type: 'Major US landing' } },
                { id: 'lp1', type: 'marker', name: 'Bude, Cornwall', coordinates: [50.8296, -4.5431], color: '#06b6d4', visible: true, layerId: 'landing', properties: { cables: 'TAT-14, AC-1', type: 'Major UK landing' } },
                { id: 'lp2', type: 'marker', name: 'Marseille', coordinates: [43.2965, 5.3698], color: '#06b6d4', visible: true, layerId: 'landing', properties: { type: 'Major European hub', note: '13+ cables' } },
                { id: 'lp3', type: 'marker', name: 'Singapore', coordinates: [1.3521, 103.8198], color: '#06b6d4', visible: true, layerId: 'landing', properties: { type: 'Asian hub', note: 'Connects to 25+ cables' } },
                { id: 'lp4', type: 'marker', name: 'Mumbai', coordinates: [19.0760, 72.8777], color: '#06b6d4', visible: true, layerId: 'landing', properties: { type: 'India gateway' } },
                { id: 'lp5', type: 'marker', name: 'Tokyo', coordinates: [35.6762, 139.6503], color: '#06b6d4', visible: true, layerId: 'landing', properties: { type: 'Transpacific hub' } },
                { id: 'lp6', type: 'marker', name: 'Fortaleza', coordinates: [-3.7319, -38.5267], color: '#06b6d4', visible: true, layerId: 'landing', properties: { type: 'South American hub', cables: 'SACS, EllaLink' } },
                { id: 'lp7', type: 'marker', name: 'Djibouti', coordinates: [11.5721, 43.1456], color: '#06b6d4', visible: true, layerId: 'landing', properties: { type: 'Africa/Middle East chokepoint', note: '8+ cables through strait' } },
                { id: 'c0', type: 'line', name: 'Transatlantic (TAT-14)', coordinates: [[39.6, -74.3], [50.83, -4.54]], color: '#3b82f6', visible: true, layerId: 'cables', properties: { capacity: '3.2 Tbps', length: '15,428 km' } },
                { id: 'c1', type: 'line', name: 'Europe-Asia (SEA-ME-WE 6)', coordinates: [[43.3, 5.37], [31.2, 32.3], [11.57, 43.15], [19.08, 72.88], [1.35, 103.82], [35.68, 139.65]], color: '#8b5cf6', visible: true, layerId: 'cables', properties: { capacity: '100+ Tbps', length: '19,200 km' } },
                { id: 'c2', type: 'line', name: 'South Atlantic (SACS)', coordinates: [[-3.73, -38.53], [-6.13, 12.36], [-33.92, 18.42]], color: '#10b981', visible: true, layerId: 'cables', properties: { capacity: '40 Tbps', note: 'Brazil to Angola/South Africa' } },
                { id: 'c3', type: 'line', name: 'Transpacific (FASTER)', coordinates: [[35.68, 139.65], [33.77, -118.19]], color: '#f59e0b', visible: true, layerId: 'cables', properties: { capacity: '60 Tbps', length: '11,629 km' } },
                { id: 'c4', type: 'line', name: 'EllaLink (Europe-South America)', coordinates: [[39.4, -9.14], [-3.73, -38.53]], color: '#ec4899', visible: true, layerId: 'cables', properties: { capacity: '72 Tbps', note: 'First direct EU-Brazil cable' } },
            ],
        },
    },

    // ===== INTELLIGENCE =====
    {
        title: 'Five Eyes Intelligence Alliance',
        description: 'SIGINT facilities and headquarters of the Five Eyes nations',
        category: 'intelligence',
        featureCount: 12,
        center: [35, -30],
        zoom: 2,
        project: {
            version: 2, name: 'Five Eyes Intelligence Alliance', center: [35, -30], zoom: 2, basemap: 'dark',
            layers: [
                { id: 'hq', name: 'Headquarters', visible: true, color: '#ef4444', features: ['hq0','hq1','hq2','hq3','hq4'], locked: false },
                { id: 'stations', name: 'Known SIGINT Stations', visible: true, color: '#f59e0b', features: ['st0','st1','st2','st3','st4','st5','st6'], locked: false },
            ],
            features: [
                { id: 'hq0', type: 'marker', name: 'NSA (Fort Meade)', coordinates: [39.1086, -76.7711], color: '#ef4444', visible: true, layerId: 'hq', properties: { agency: 'NSA', country: 'USA', note: 'National Security Agency HQ' } },
                { id: 'hq1', type: 'marker', name: 'GCHQ (Cheltenham)', coordinates: [51.8986, -2.1244], color: '#ef4444', visible: true, layerId: 'hq', properties: { agency: 'GCHQ', country: 'UK', note: 'Government Communications HQ — the Doughnut' } },
                { id: 'hq2', type: 'marker', name: 'ASD (Canberra)', coordinates: [-35.3075, 149.1244], color: '#ef4444', visible: true, layerId: 'hq', properties: { agency: 'ASD', country: 'Australia', note: 'Australian Signals Directorate' } },
                { id: 'hq3', type: 'marker', name: 'CSE (Ottawa)', coordinates: [45.3453, -75.8656], color: '#ef4444', visible: true, layerId: 'hq', properties: { agency: 'CSE', country: 'Canada', note: 'Communications Security Establishment' } },
                { id: 'hq4', type: 'marker', name: 'GCSB (Wellington)', coordinates: [-41.3187, 174.8264], color: '#ef4444', visible: true, layerId: 'hq', properties: { agency: 'GCSB', country: 'New Zealand', note: 'Government Communications Security Bureau' } },
                { id: 'st0', type: 'marker', name: 'Pine Gap', coordinates: [-23.7991, 133.7370], color: '#f59e0b', visible: true, layerId: 'stations', properties: { type: 'Satellite ground station', operated_by: 'CIA/ASD', country: 'Australia', note: 'Joint Defence Facility — satellite surveillance' } },
                { id: 'st1', type: 'marker', name: 'Menwith Hill', coordinates: [54.0057, -1.6901], color: '#f59e0b', visible: true, layerId: 'stations', properties: { type: 'SIGINT station', operated_by: 'NSA/GCHQ', country: 'UK', note: 'Largest NSA station outside US' } },
                { id: 'st2', type: 'marker', name: 'Waihopai Station', coordinates: [-41.6181, 173.8131], color: '#f59e0b', visible: true, layerId: 'stations', properties: { type: 'Satellite intercept', operated_by: 'GCSB', country: 'New Zealand' } },
                { id: 'st3', type: 'marker', name: 'CFS Leitrim', coordinates: [45.2959, -75.5474], color: '#f59e0b', visible: true, layerId: 'stations', properties: { type: 'SIGINT station', operated_by: 'CSE', country: 'Canada' } },
                { id: 'st4', type: 'marker', name: 'Buckley SFB', coordinates: [39.7116, -104.7521], color: '#f59e0b', visible: true, layerId: 'stations', properties: { type: 'Satellite operations', operated_by: 'NRO/NSA', country: 'USA' } },
                { id: 'st5', type: 'marker', name: 'Utah Data Center', coordinates: [40.4278, -111.9318], color: '#f59e0b', visible: true, layerId: 'stations', properties: { type: 'Data storage', operated_by: 'NSA', country: 'USA', note: 'Intelligence Community Comprehensive National Cybersecurity Initiative Data Center' } },
                { id: 'st6', type: 'marker', name: 'Diego Garcia', coordinates: [-7.3195, 72.4229], color: '#f59e0b', visible: true, layerId: 'stations', properties: { type: 'Naval/SIGINT', operated_by: 'US/UK', note: 'Indian Ocean relay station' } },
            ],
        },
    },
    {
        title: 'Global Nuclear Facilities',
        description: 'Active nuclear power plants, enrichment sites, and test locations',
        category: 'intelligence',
        featureCount: 16,
        center: [35, 30],
        zoom: 2,
        project: {
            version: 2, name: 'Global Nuclear Facilities', center: [35, 30], zoom: 2, basemap: 'dark',
            layers: [
                { id: 'plants', name: 'Power Plants', visible: true, color: '#10b981', features: ['np0','np1','np2','np3','np4','np5','np6','np7'], locked: false },
                { id: 'enrich', name: 'Enrichment/Research', visible: true, color: '#f59e0b', features: ['en0','en1','en2','en3','en4'], locked: false },
                { id: 'tests', name: 'Test Sites', visible: true, color: '#ef4444', features: ['ts0','ts1','ts2'], locked: false },
            ],
            features: [
                { id: 'np0', type: 'marker', name: 'Fukushima Daiichi', coordinates: [37.4211, 141.0328], color: '#10b981', visible: true, layerId: 'plants', properties: { type: 'BWR', status: 'Decommissioning', country: 'Japan', note: '2011 disaster' } },
                { id: 'np1', type: 'marker', name: 'Chernobyl', coordinates: [51.3893, 30.0982], color: '#10b981', visible: true, layerId: 'plants', properties: { type: 'RBMK', status: 'Decommissioned', country: 'Ukraine', note: '1986 disaster' } },
                { id: 'np2', type: 'marker', name: 'Palo Verde', coordinates: [33.3886, -112.8615], color: '#10b981', visible: true, layerId: 'plants', properties: { type: 'PWR', status: 'Active', country: 'USA', note: 'Largest US nuclear plant' } },
                { id: 'np3', type: 'marker', name: 'Zaporizhzhia', coordinates: [47.5070, 34.5854], color: '#10b981', visible: true, layerId: 'plants', properties: { type: 'VVER', status: 'Active (contested)', country: 'Ukraine', note: 'Largest in Europe' } },
                { id: 'np4', type: 'marker', name: 'Bruce Nuclear', coordinates: [44.3256, -81.5972], color: '#10b981', visible: true, layerId: 'plants', properties: { type: 'CANDU', status: 'Active', country: 'Canada', note: 'Largest operational plant by capacity' } },
                { id: 'np5', type: 'marker', name: 'Hinkley Point C', coordinates: [51.2080, -3.1305], color: '#10b981', visible: true, layerId: 'plants', properties: { type: 'EPR', status: 'Under construction', country: 'UK' } },
                { id: 'np6', type: 'marker', name: 'Barakah', coordinates: [23.9590, 52.2575], color: '#10b981', visible: true, layerId: 'plants', properties: { type: 'APR-1400', status: 'Active', country: 'UAE', note: 'First Arab nuclear plant' } },
                { id: 'np7', type: 'marker', name: 'Bushehr', coordinates: [28.8313, 50.8883], color: '#10b981', visible: true, layerId: 'plants', properties: { type: 'VVER', status: 'Active', country: 'Iran' } },
                { id: 'en0', type: 'marker', name: 'Natanz', coordinates: [33.7250, 51.7267], color: '#f59e0b', visible: true, layerId: 'enrich', properties: { type: 'Uranium enrichment', country: 'Iran', note: 'Underground centrifuge facility' } },
                { id: 'en1', type: 'marker', name: 'Fordow', coordinates: [34.8768, 51.5758], color: '#f59e0b', visible: true, layerId: 'enrich', properties: { type: 'Uranium enrichment', country: 'Iran', note: 'Built inside mountain' } },
                { id: 'en2', type: 'marker', name: 'Yongbyon', coordinates: [39.7956, 125.7553], color: '#f59e0b', visible: true, layerId: 'enrich', properties: { type: 'Plutonium production/enrichment', country: 'North Korea' } },
                { id: 'en3', type: 'marker', name: 'Dimona', coordinates: [31.0015, 35.1445], color: '#f59e0b', visible: true, layerId: 'enrich', properties: { type: 'Research reactor', country: 'Israel', note: 'Shimon Peres Negev Nuclear Research Center' } },
                { id: 'en4', type: 'marker', name: 'Kahuta', coordinates: [33.5970, 73.3860], color: '#f59e0b', visible: true, layerId: 'enrich', properties: { type: 'Uranium enrichment', country: 'Pakistan', note: 'Khan Research Laboratories' } },
                { id: 'ts0', type: 'marker', name: 'Nevada Test Site', coordinates: [37.0580, -116.0260], color: '#ef4444', visible: true, layerId: 'tests', properties: { tests: '928', country: 'USA', period: '1951-1992' } },
                { id: 'ts1', type: 'marker', name: 'Semipalatinsk', coordinates: [50.4400, 77.6500], color: '#ef4444', visible: true, layerId: 'tests', properties: { tests: '456', country: 'Kazakhstan (USSR)', period: '1949-1989' } },
                { id: 'ts2', type: 'marker', name: 'Lop Nur', coordinates: [41.5486, 88.3411], color: '#ef4444', visible: true, layerId: 'tests', properties: { tests: '45', country: 'China', period: '1964-1996' } },
            ],
        },
    },
];
