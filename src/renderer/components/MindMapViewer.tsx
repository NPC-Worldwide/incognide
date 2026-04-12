import React, { useState, useEffect, useCallback, useRef, useMemo, memo, lazy, Suspense } from 'react';
import {
    Save, Download, Upload, Plus, Trash2, X, Eye, Edit2, Layers,
    Search, Navigation, Ruler, FileJson, Globe, MapPin,
    ChevronDown, ChevronRight, EyeOff, Route, Hexagon, Circle,
    LocateFixed, Copy, Network, Map as MapIcon, BookOpen
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Hide Leaflet attribution watermark
const leafletStyle = document.createElement('style');
leafletStyle.textContent = '.leaflet-control-attribution { display: none !important; }';
document.head.appendChild(leafletStyle);
import type {
    GISProject, GeoFeature, MapLayer, DrawMode, GISMapViewProps,
    MindMapData
} from 'npcts';
import {
    GISMapView, featuresToGeoJSON, geoJSONToFeatures,
    BASEMAPS, LAYER_COLORS, DEFAULT_PROJECT, REFERENCE_LAYERS, TILE_OVERLAYS,
    MindMapViewer as NpctsMindMapViewer, RadioPane
} from 'npcts';
import { demoMaps } from './cartoglyphLibrary';

// ---- Proxy fetch through Electron main process (bypasses CORS) ----
async function proxyFetch(url: string, options?: any): Promise<Response> {
    const api = (window as any).api;
    if (api?.proxyFetch) {
        const result = await api.proxyFetch(url, options);
        const data = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
        return new Response(data, { status: result.status, headers: { 'content-type': 'application/json' } });
    }
    return fetch(url, options);
}

// ---- Legacy .mapx conversion ----

function convertLegacyMapx(data: any): GISProject {
    const features: GeoFeature[] = (data.nodes || []).map((n: any) => ({
        id: n.id,
        type: 'marker' as const,
        name: n.label || 'Node',
        coordinates: [n.lat || n.y || 0, n.lng || n.x || 0] as [number, number],
        color: n.color || '#3b82f6',
        visible: true,
        layerId: 'default',
        properties: {},
    }));
    return {
        ...DEFAULT_PROJECT,
        name: data.name || 'Imported Map',
        layers: [{ id: 'default', name: 'Imported', visible: true, color: '#3b82f6', features: features.map(f => f.id), locked: false }],
        features,
    };
}

// ---- KML parsing ----

async function parseKML(text: string): Promise<any> {
    const { kml } = await import('@tmcw/togeojson');
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    return kml(doc);
}

// ---- Main wrapper component ----

type ActiveTab = 'gis' | 'mindmap' | 'radio' | 'data';

const CartoglyphPane = ({
    nodeId,
    contentDataRef,
    findNodePath,
    rootLayoutNode,
    setDraggedItem,
    setPaneContextMenu,
    closeContentPane
}: {
    nodeId: string;
    contentDataRef: React.MutableRefObject<Record<string, any>>;
    findNodePath: any;
    rootLayoutNode: any;
    setDraggedItem: any;
    setPaneContextMenu: any;
    closeContentPane: any;
}) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('gis');

    // GIS state
    const [project, setProject] = useState<GISProject>({ ...DEFAULT_PROJECT });
    const [mode, setMode] = useState<DrawMode>('select');
    const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [sidebarTab, setSidebarTab] = useState<'layers' | 'properties' | 'osint' | 'overlays'>('layers');
    const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set());
    const [activeTileOverlays, setActiveTileOverlays] = useState<Set<string>>(new Set());
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [activeLayerId, setActiveLayerId] = useState('default');

    // OSINT auto-cache
    const [osintCache, setOsintCache] = useState<Record<string, { results: any[]; bbox: string }>>({});
    const [osintVisible, setOsintVisible] = useState<Set<string>>(new Set());
    const [osintLoading, setOsintLoading] = useState<Set<string>>(new Set());

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // OSINT
    const [osintQuery, setOsintQuery] = useState('');
    const [osintResults, setOsintResults] = useState<any[]>([]);
    const [isOsintLoading, setIsOsintLoading] = useState(false);
    const [osintType, setOsintType] = useState<'nominatim' | 'overpass'>('nominatim');

    // Menus
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showBasemapMenu, setShowBasemapMenu] = useState(false);
    const [showImportMenu, setShowImportMenu] = useState(false);
    const [showSamplesMenu, setShowSamplesMenu] = useState(false);

    // Feature editing
    const [editingFeatureName, setEditingFeatureName] = useState<string | null>(null);
    const [editNameValue, setEditNameValue] = useState('');

    const mapRef = useRef<L.Map | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // OSINT preset categories
    const OSINT_PRESETS: Record<string, { label: string; query: string; color: string; category: string }> = useMemo(() => ({
        hospitals: { label: 'Hospitals', query: 'amenity=hospital', color: '#ef4444', category: 'emergency' },
        police: { label: 'Police', query: 'amenity=police', color: '#3b82f6', category: 'emergency' },
        fire_stations: { label: 'Fire Stations', query: 'amenity=fire_station', color: '#f97316', category: 'emergency' },
        pharmacies: { label: 'Pharmacies', query: 'amenity=pharmacy', color: '#10b981', category: 'emergency' },
        schools: { label: 'Schools', query: 'amenity=school', color: '#8b5cf6', category: 'civic' },
        banks: { label: 'Banks', query: 'amenity=bank', color: '#eab308', category: 'civic' },
        embassies: { label: 'Embassies', query: 'amenity=embassy', color: '#06b6d4', category: 'civic' },
        prisons: { label: 'Prisons', query: 'amenity=prison', color: '#64748b', category: 'civic' },
        government: { label: 'Government', query: 'office=government', color: '#a855f7', category: 'civic' },
        military: { label: 'Military', query: 'military=yes', color: '#78716c', category: 'security' },
        cameras: { label: 'Surveillance', query: 'man_made=surveillance', color: '#f43f5e', category: 'security' },
        cell_towers: { label: 'Cell Towers', query: 'telecom=mast', color: '#d946ef', category: 'infrastructure' },
        power_plants: { label: 'Power Plants', query: 'power=plant', color: '#facc15', category: 'infrastructure' },
        gas_stations: { label: 'Gas Stations', query: 'amenity=fuel', color: '#fb923c', category: 'infrastructure' },
        water_towers: { label: 'Water Towers', query: 'man_made=water_tower', color: '#38bdf8', category: 'infrastructure' },
        helipads: { label: 'Helipads', query: 'aeroway=helipad', color: '#a3e635', category: 'transport' },
        hotels: { label: 'Hotels', query: 'tourism=hotel', color: '#c084fc', category: 'commercial' },
        restaurants: { label: 'Restaurants', query: 'amenity=restaurant', color: '#fb7185', category: 'commercial' },
        bridges: { label: 'Bridges', query: 'man_made=bridge', color: '#94a3b8', category: 'infrastructure' },
        dams: { label: 'Dams', query: 'waterway=dam', color: '#22d3ee', category: 'infrastructure' },
    }), []);

    // Fetch a single OSINT category for current viewport
    const fetchOsintCategory = useCallback(async (key: string) => {
        const preset = OSINT_PRESETS[key];
        if (!preset || !mapRef.current) return;
        const bounds = mapRef.current.getBounds();
        const bbox = `${bounds.getSouth().toFixed(2)},${bounds.getWest().toFixed(2)},${bounds.getNorth().toFixed(2)},${bounds.getEast().toFixed(2)}`;
        // Skip if already cached for this bbox
        if (osintCache[key]?.bbox === bbox) return;
        setOsintLoading(prev => new Set(prev).add(key));
        try {
            const parts = preset.query.split('=');
            const tagFilter = parts[1] ? `["${parts[0]}"="${parts[1]}"]` : `["${parts[0]}"]`;
            const s = bounds.getSouth(), w = bounds.getWest(), n = bounds.getNorth(), e = bounds.getEast();
            const q = `[out:json][timeout:25];(node${tagFilter}(${s},${w},${n},${e});way${tagFilter}(${s},${w},${n},${e}););out center body 200;`;
            const resp = await proxyFetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: `data=${encodeURIComponent(q)}`,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            if (!resp.ok) throw new Error(`Overpass ${resp.status}`);
            const data = await resp.json();
            const results = (data.elements || []).map((el: any) => ({
                lat: el.lat || el.center?.lat,
                lng: el.lon || el.center?.lon,
                name: el.tags?.name || `${el.type}/${el.id}`,
                tags: el.tags || {},
            })).filter((r: any) => r.lat && r.lng);
            setOsintCache(prev => ({ ...prev, [key]: { results, bbox } }));
        } catch (err) {
            console.error(`OSINT fetch ${key}:`, err);
        } finally {
            setOsintLoading(prev => { const s = new Set(prev); s.delete(key); return s; });
        }
    }, [OSINT_PRESETS, osintCache]);

    // Toggle an OSINT layer — fetch if needed, then show/hide
    const toggleOsintLayer = useCallback((key: string) => {
        setOsintVisible(prev => {
            const next = new Set(prev);
            if (next.has(key)) { next.delete(key); } else { next.add(key); fetchOsintCategory(key); }
            return next;
        });
    }, [fetchOsintCategory]);

    // Re-fetch visible OSINT layers when map moves significantly
    const lastOsintFetchBbox = useRef<string>('');
    const osintRefreshTimer = useRef<any>(null);

    const scheduleOsintRefresh = useCallback(() => {
        if (osintRefreshTimer.current) clearTimeout(osintRefreshTimer.current);
        osintRefreshTimer.current = setTimeout(() => {
            if (!mapRef.current || osintVisible.size === 0) return;
            const bounds = mapRef.current.getBounds();
            const bbox = `${bounds.getSouth().toFixed(1)},${bounds.getWest().toFixed(1)},${bounds.getNorth().toFixed(1)},${bounds.getEast().toFixed(1)}`;
            if (bbox === lastOsintFetchBbox.current) return;
            lastOsintFetchBbox.current = bbox;
            osintVisible.forEach(key => fetchOsintCategory(key));
        }, 2000);
    }, [osintVisible, fetchOsintCategory]);

    // Hook into map move
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const handler = () => scheduleOsintRefresh();
        map.on('moveend', handler);
        return () => { map.off('moveend', handler); };
    }, [scheduleOsintRefresh]);

    // Mind Map state
    const [mindMapData, setMindMapData] = useState<MindMapData | null>(null);

    const paneData = contentDataRef?.current?.[nodeId];
    const filePath = paneData?.contentId;
    const isStandalone = !filePath || filePath === 'cartoglyph' || filePath === 'mindmap-standalone';

    // Load project
    useEffect(() => {
        if (isStandalone) return;
        const load = async () => {
            try {
                const response = await (window as any).api?.readFile?.(filePath);
                if (response && !response.error) {
                    const content = response.content || response;
                    const data = JSON.parse(content);
                    if (data.version === 2) {
                        setProject(data);
                        setActiveTab('gis');
                    } else if (data.mapType || data.nodes) {
                        // Legacy mind map format
                        setMindMapData(data);
                        setProject(convertLegacyMapx(data));
                        setActiveTab('mindmap');
                    }
                }
            } catch (err) {
                console.error('Error loading map:', err);
            }
        };
        load();
    }, [filePath, isStandalone]);

    // Save
    const saveProject = useCallback(async () => {
        if (isStandalone) return;
        setIsSaving(true);
        try {
            await (window as any).api?.writeFile?.(filePath, JSON.stringify(project, null, 2));
            setHasChanges(false);
        } catch (err) {
            console.error('Error saving:', err);
        } finally {
            setIsSaving(false);
        }
    }, [filePath, project, isStandalone]);

    const updateProject = useCallback((updater: (prev: GISProject) => GISProject) => {
        setProject(prev => {
            const next = updater(prev);
            setHasChanges(true);
            return next;
        });
    }, []);

    // ---- Feature/Layer ops ----

    const updateFeature = useCallback((id: string, updates: Partial<GeoFeature>) => {
        updateProject(prev => ({ ...prev, features: prev.features.map(f => f.id === id ? { ...f, ...updates } : f) }));
    }, [updateProject]);

    const deleteFeature = useCallback((id: string) => {
        updateProject(prev => ({
            ...prev,
            features: prev.features.filter(f => f.id !== id),
            layers: prev.layers.map(l => ({ ...l, features: l.features.filter(fid => fid !== id) })),
        }));
        if (selectedFeatureId === id) setSelectedFeatureId(null);
    }, [updateProject, selectedFeatureId]);

    const addLayer = useCallback(() => {
        const id = `layer_${Date.now()}`;
        const color = LAYER_COLORS[project.layers.length % LAYER_COLORS.length];
        updateProject(prev => ({ ...prev, layers: [...prev.layers, { id, name: `Layer ${prev.layers.length + 1}`, visible: true, color, features: [], locked: false }] }));
        setActiveLayerId(id);
    }, [updateProject, project.layers.length]);

    const deleteLayer = useCallback((layerId: string) => {
        if (project.layers.length <= 1) return;
        updateProject(prev => ({
            ...prev,
            features: prev.features.filter(f => f.layerId !== layerId),
            layers: prev.layers.filter(l => l.id !== layerId),
        }));
        if (activeLayerId === layerId) setActiveLayerId(project.layers.find(l => l.id !== layerId)?.id || 'default');
    }, [updateProject, project.layers, activeLayerId]);

    const toggleLayerVisibility = useCallback((layerId: string) => {
        updateProject(prev => ({ ...prev, layers: prev.layers.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l) }));
    }, [updateProject]);

    // ---- Search ----

    const handleSearch = useCallback(async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const resp = await proxyFetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=8`, {
                headers: { 'User-Agent': 'Incognide-Cartoglyph/1.0' },
            });
            setSearchResults(await resp.json());
        } catch (err) { console.error('Search error:', err); }
        finally { setIsSearching(false); }
    }, [searchQuery]);

    const goToResult = useCallback((r: any) => {
        mapRef.current?.setView([parseFloat(r.lat), parseFloat(r.lon)], 14);
        setSearchResults([]);
        setSearchQuery('');
    }, []);

    const addResultAsMarker = useCallback((r: any) => {
        const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
        const id = `feat_${Date.now()}`;
        const layer = project.layers.find(l => l.id === activeLayerId);
        updateProject(prev => ({
            ...prev,
            features: [...prev.features, { id, type: 'marker' as const, name: r.display_name?.split(',')[0] || 'Location', coordinates: [lat, lng] as [number, number], color: layer?.color || '#3b82f6', visible: true, layerId: activeLayerId, properties: { source: 'nominatim', display_name: r.display_name } }],
            layers: prev.layers.map(l => l.id === activeLayerId ? { ...l, features: [...l.features, id] } : l),
        }));
        mapRef.current?.setView([lat, lng], 14);
        setSearchResults([]);
        setSearchQuery('');
    }, [activeLayerId, project.layers, updateProject]);

    // ---- OSINT ----

    const fetchOSINT = useCallback(async (queryOverride?: string, typeOverride?: 'nominatim' | 'overpass') => {
        const q = queryOverride || osintQuery;
        const t = typeOverride || osintType;
        if (!q.trim()) return;
        setIsOsintLoading(true);
        setOsintResults([]);
        try {
            if (t === 'nominatim') {
                const resp = await proxyFetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=20&addressdetails=1`, {
                    headers: { 'User-Agent': 'Incognide-Cartoglyph/1.0' },
                });
                const data = await resp.json();
                setOsintResults(data.map((r: any) => ({
                    id: r.osm_id, name: r.display_name?.split(',')[0], fullName: r.display_name,
                    lat: parseFloat(r.lat), lng: parseFloat(r.lon), type: r.type, category: r.class, source: 'nominatim',
                })));
            } else {
                // Overpass — use proper QL format
                const bounds = mapRef.current?.getBounds();
                if (!bounds) { setIsOsintLoading(false); return; }
                const s = bounds.getSouth(), w = bounds.getWest(), n = bounds.getNorth(), e = bounds.getEast();
                // Parse "key=value" format from user
                const parts = q.split('=');
                const key = parts[0]?.trim();
                const val = parts[1]?.trim();
                const tagFilter = val ? `["${key}"="${val}"]` : `["${key}"]`;
                const query = `[out:json][timeout:25];(node${tagFilter}(${s},${w},${n},${e});way${tagFilter}(${s},${w},${n},${e}););out center body 50;`;
                const resp = await proxyFetch('https://overpass-api.de/api/interpreter', {
                    method: 'POST',
                    body: `data=${encodeURIComponent(query)}`,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                });
                if (!resp.ok) throw new Error(`Overpass returned ${resp.status}`);
                const data = await resp.json();
                setOsintResults((data.elements || []).map((el: any) => ({
                    id: el.id, name: el.tags?.name || `${el.type}/${el.id}`,
                    fullName: Object.entries(el.tags || {}).map(([k, v]) => `${k}=${v}`).join(', '),
                    lat: el.lat || el.center?.lat, lng: el.lon || el.center?.lon,
                    type: el.type, category: el.tags?.amenity || el.tags?.shop || el.tags?.building || 'unknown', source: 'overpass',
                })));
            }
        } catch (err) { console.error('OSINT fetch error:', err); }
        finally { setIsOsintLoading(false); }
    }, [osintQuery, osintType]);

    const addOsintResult = useCallback((r: any) => {
        if (!r.lat || !r.lng) return;
        const id = `osint_${Date.now()}_${r.id}`;
        const layer = project.layers.find(l => l.id === activeLayerId);
        updateProject(prev => ({
            ...prev,
            features: [...prev.features, { id, type: 'marker' as const, name: r.name, coordinates: [r.lat, r.lng] as [number, number], color: '#f59e0b', visible: true, layerId: activeLayerId, properties: { source: r.source, category: r.category } }],
            layers: prev.layers.map(l => l.id === activeLayerId ? { ...l, features: [...l.features, id] } : l),
        }));
    }, [activeLayerId, project.layers, updateProject]);

    // ---- Import/Export ----

    const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const ext = file.name.split('.').pop()?.toLowerCase();
        const layerColor = LAYER_COLORS[project.layers.length % LAYER_COLORS.length];
        const newLayerId = `import_${Date.now()}`;
        let features: GeoFeature[] = [];

        try {
            if (ext === 'geojson' || ext === 'json') {
                features = geoJSONToFeatures(JSON.parse(text), newLayerId, layerColor);
            } else if (ext === 'kml' || ext === 'kmz') {
                features = geoJSONToFeatures(await parseKML(text), newLayerId, layerColor);
            } else if (ext === 'gpx') {
                const { gpx: gpxParser } = await import('@tmcw/togeojson');
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/xml');
                const geojson = gpxParser(doc);
                features = geoJSONToFeatures(geojson, newLayerId, layerColor);
            } else if (ext === 'csv' || ext === 'tsv') {
                const lines = text.trim().split('\n');
                const sep = ext === 'tsv' ? '\t' : ',';
                const headers = lines[0].split(sep).map(h => h.trim().toLowerCase());
                const latIdx = headers.findIndex(h => ['lat', 'latitude', 'y'].includes(h));
                const lngIdx = headers.findIndex(h => ['lng', 'lon', 'longitude', 'x'].includes(h));
                const nameIdx = headers.findIndex(h => ['name', 'label', 'title'].includes(h));
                if (latIdx >= 0 && lngIdx >= 0) {
                    features = lines.slice(1).map((line, i) => {
                        const cols = line.split(sep).map(c => c.trim());
                        const lat = parseFloat(cols[latIdx]), lng = parseFloat(cols[lngIdx]);
                        if (isNaN(lat) || isNaN(lng)) return null;
                        return { id: `csv_${Date.now()}_${i}`, type: 'marker' as const, name: nameIdx >= 0 ? cols[nameIdx] : `Point ${i + 1}`, coordinates: [lat, lng] as [number, number], color: layerColor, visible: true, layerId: newLayerId, properties: Object.fromEntries(headers.map((h, hi) => [h, cols[hi]])) };
                    }).filter(Boolean) as GeoFeature[];
                }
            } else if (ext === 'mapx') {
                const data = JSON.parse(text);
                features = convertLegacyMapx(data).features.map(f => ({ ...f, layerId: newLayerId }));
            }
        } catch (err) { console.error('Import error:', err); return; }

        if (features.length > 0) {
            updateProject(prev => ({
                ...prev,
                layers: [...prev.layers, { id: newLayerId, name: file.name.replace(/\.[^.]+$/, ''), visible: true, color: layerColor, features: features.map(f => f.id), locked: false }],
                features: [...prev.features, ...features],
            }));
            const coords: [number, number][] = [];
            features.forEach(f => { if (Array.isArray(f.coordinates[0])) (f.coordinates as [number, number][]).forEach(c => coords.push(c)); else coords.push(f.coordinates as [number, number]); });
            if (coords.length > 0 && mapRef.current) mapRef.current.fitBounds(L.latLngBounds(coords.map(c => [c[0], c[1]])), { padding: [50, 50] });
        }
        setShowImportMenu(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [project.layers.length, updateProject]);

    const exportGeoJSON = useCallback(() => {
        const blob = new Blob([JSON.stringify(featuresToGeoJSON(project.features.filter(f => f.visible)), null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${project.name.replace(/\s+/g, '_')}.geojson`; a.click();
        setShowExportMenu(false);
    }, [project]);

    const exportKML = useCallback(async () => {
        const { default: tokmlFn } = await import('tokml');
        const kmlString = tokmlFn(featuresToGeoJSON(project.features.filter(f => f.visible)));
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml' })); a.download = `${project.name.replace(/\s+/g, '_')}.kml`; a.click();
        setShowExportMenu(false);
    }, [project]);

    const exportProject = useCallback(() => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })); a.download = `${project.name.replace(/\s+/g, '_')}.mapx`; a.click();
        setShowExportMenu(false);
    }, [project]);

    const selectedFeature = project.features.find(f => f.id === selectedFeatureId);

    const modeButtons: { m: DrawMode; icon: any; label: string }[] = [
        { m: 'select', icon: Navigation, label: 'Select' },
        { m: 'marker', icon: MapPin, label: 'Marker' },
        { m: 'line', icon: Route, label: 'Line' },
        { m: 'polygon', icon: Hexagon, label: 'Polygon' },
        { m: 'circle', icon: Circle, label: 'Circle' },
        { m: 'measure', icon: Ruler, label: 'Measure' },
    ];

    return (
        <div className="h-full flex flex-col theme-bg-primary">
            {/* Tab bar + toolbar */}
            <div className="flex-shrink-0 border-b theme-border px-1.5 py-1 flex items-center gap-1.5 theme-bg-secondary">
                {/* Tab switcher */}
                <div className="flex items-center gap-0.5 px-1 py-0.5 theme-bg-tertiary rounded border theme-border mr-2">
                    <button onClick={() => setActiveTab('gis')} className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors ${activeTab === 'gis' ? 'bg-emerald-600 text-white' : 'theme-text-muted hover:theme-text-primary'}`}>
                        <MapIcon size={12} /> GIS Map
                    </button>
                    <button onClick={() => setActiveTab('mindmap')} className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors ${activeTab === 'mindmap' ? 'bg-emerald-600 text-white' : 'theme-text-muted hover:theme-text-primary'}`}>
                        <Network size={12} /> Mind Map
                    </button>
                    <button onClick={() => setActiveTab('radio')} className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors ${activeTab === 'radio' ? 'bg-emerald-600 text-white' : 'theme-text-muted hover:theme-text-primary'}`}>
                        <Navigation size={12} /> Radio
                    </button>
                    <button onClick={() => setActiveTab('data')} className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors ${activeTab === 'data' ? 'bg-emerald-600 text-white' : 'theme-text-muted hover:theme-text-primary'}`}>
                        <Download size={12} /> Data
                    </button>
                </div>

                {activeTab === 'gis' && (
                    <>
                        <input type="text" value={project.name} onChange={(e) => updateProject(prev => ({ ...prev, name: e.target.value }))}
                            className="px-2 py-1 text-sm theme-bg-tertiary theme-text-primary border theme-border rounded focus:border-emerald-500 focus:outline-none w-32" />
                        <div className="h-4 w-px theme-border-color bg-current opacity-30" />

                        {/* Mode buttons */}
                        <div className="flex items-center gap-0.5 px-1 py-0.5 theme-bg-tertiary rounded border theme-border">
                            {modeButtons.map(({ m, icon: Icon, label }) => (
                                <button key={m} onClick={() => setMode(m)} title={label}
                                    className={`px-1.5 py-1 rounded text-xs flex items-center gap-1 transition-colors ${mode === m ? 'bg-emerald-600 text-white' : 'theme-text-muted hover:theme-text-primary'}`}>
                                    <Icon size={14} />
                                </button>
                            ))}
                        </div>
                        <div className="flex-1" />

                        {/* Search */}
                        <div className="relative">
                            <div className="flex items-center gap-1">
                                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="Search places..."
                                    className="px-2 py-1 text-xs theme-bg-tertiary theme-text-primary border theme-border rounded focus:border-emerald-500 focus:outline-none w-40" />
                                <button onClick={handleSearch} disabled={isSearching} className="p-1 theme-hover rounded theme-text-muted"><Search size={14} /></button>
                            </div>
                            {searchResults.length > 0 && (
                                <div className="absolute right-0 top-full mt-1 theme-bg-secondary border theme-border rounded shadow-xl z-[10000] max-h-60 overflow-y-auto w-80">
                                    {searchResults.map((r: any, i: number) => (
                                        <div key={i} className="flex items-center gap-1 px-2 py-1.5 hover:theme-bg-tertiary text-xs border-b theme-border last:border-0">
                                            <button onClick={() => goToResult(r)} className="flex-1 text-left theme-text-primary truncate">{r.display_name}</button>
                                            <button onClick={() => addResultAsMarker(r)} className="p-1 text-emerald-400 hover:text-emerald-300" title="Add as marker"><Plus size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="h-4 w-px theme-border-color bg-current opacity-30" />

                        {/* Samples */}
                        <div className="relative">
                            <button onClick={() => setShowSamplesMenu(!showSamplesMenu)} className="p-1.5 theme-hover rounded theme-text-muted" title="Sample Maps"><BookOpen size={14} /></button>
                            {showSamplesMenu && (
                                <>
                                    <div className="fixed inset-0 z-[9999]" onMouseDown={() => setShowSamplesMenu(false)} />
                                    <div className="absolute right-0 top-full mt-1 theme-bg-secondary border theme-border rounded shadow-xl z-[10000] py-1 min-w-[280px] max-h-80 overflow-y-auto">
                                        <div className="px-3 py-1 text-[10px] theme-text-muted border-b theme-border">Load a sample map</div>
                                        {['travel', 'history', 'nature', 'infrastructure', 'intelligence'].map(cat => {
                                            const maps = demoMaps.filter(m => m.category === cat);
                                            if (maps.length === 0) return null;
                                            return (
                                                <div key={cat}>
                                                    <div className="px-3 pt-2 pb-0.5 text-[10px] theme-text-muted uppercase tracking-wider">{cat}</div>
                                                    {maps.map(m => (
                                                        <button key={m.title} onClick={() => {
                                                            setProject(m.project);
                                                            setHasChanges(false);
                                                            setShowSamplesMenu(false);
                                                            setTimeout(() => mapRef.current?.setView(m.center, m.zoom), 100);
                                                        }} className="flex flex-col px-3 py-1.5 w-full text-left hover:theme-bg-tertiary">
                                                            <span className="text-xs theme-text-primary font-medium">{m.title}</span>
                                                            <span className="text-[10px] theme-text-muted">{m.description} &middot; {m.featureCount} features</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>


                        {/* Import */}
                        <div className="relative">
                            <button onClick={() => setShowImportMenu(!showImportMenu)} className="p-1.5 theme-hover rounded theme-text-muted" title="Import"><Upload size={14} /></button>
                            {showImportMenu && (
                                <>
                                    <div className="fixed inset-0 z-[9999]" onMouseDown={() => setShowImportMenu(false)} />
                                    <div className="absolute right-0 top-full mt-1 theme-bg-secondary border theme-border rounded shadow-xl z-[10000] py-1 min-w-[260px]">
                                        <div className="px-3 py-1 text-[10px] theme-text-muted border-b theme-border">Import from file</div>
                                        <button onClick={() => { fileInputRef.current?.setAttribute('accept', '.geojson,.json'); fileInputRef.current?.click(); }} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-primary hover:theme-bg-tertiary">
                                            <FileJson size={12} className="text-blue-400" /> <div><span className="font-medium">GeoJSON</span><br /><span className="text-[10px] theme-text-muted">Points, lines, polygons — ArcGIS/QGIS standard</span></div>
                                        </button>
                                        <button onClick={() => { fileInputRef.current?.setAttribute('accept', '.kml,.kmz'); fileInputRef.current?.click(); }} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-primary hover:theme-bg-tertiary">
                                            <Globe size={12} className="text-green-400" /> <div><span className="font-medium">KML</span><br /><span className="text-[10px] theme-text-muted">Google Earth, Google Maps export</span></div>
                                        </button>
                                        <button onClick={() => { fileInputRef.current?.setAttribute('accept', '.gpx'); fileInputRef.current?.click(); }} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-primary hover:theme-bg-tertiary">
                                            <Route size={12} className="text-orange-400" /> <div><span className="font-medium">GPX</span><br /><span className="text-[10px] theme-text-muted">GPS tracks — Garmin, Strava, AllTrails</span></div>
                                        </button>
                                        <button onClick={() => { fileInputRef.current?.setAttribute('accept', '.csv,.tsv'); fileInputRef.current?.click(); }} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-primary hover:theme-bg-tertiary">
                                            <Layers size={12} className="text-yellow-400" /> <div><span className="font-medium">CSV / TSV</span><br /><span className="text-[10px] theme-text-muted">Spreadsheet with lat, lng, name columns</span></div>
                                        </button>
                                        <button onClick={() => { fileInputRef.current?.setAttribute('accept', '.mapx'); fileInputRef.current?.click(); }} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-primary hover:theme-bg-tertiary">
                                            <MapIcon size={12} className="text-emerald-400" /> <div><span className="font-medium">MAPX Project</span><br /><span className="text-[10px] theme-text-muted">Cartoglyph native project file</span></div>
                                        </button>
                                        <div className="border-t theme-border my-1" />
                                        <div className="px-3 py-1 text-[10px] theme-text-muted border-b theme-border">Download template</div>
                                        <button onClick={() => {
                                            const csv = 'name,lat,lng,description\nExample Point,40.7128,-74.0060,New York City\nAnother Point,34.0522,-118.2437,Los Angeles\n';
                                            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'template_points.csv'; a.click(); setShowImportMenu(false);
                                        }} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-muted hover:theme-bg-tertiary">
                                            <Download size={12} /> CSV template (points)
                                        </button>
                                        <button onClick={() => {
                                            const geojson = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-74.006, 40.7128] }, properties: { name: 'New York City' } }, { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-74.006, 40.7128], [-118.2437, 34.0522]] }, properties: { name: 'NYC to LA' } }] }, null, 2);
                                            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([geojson], { type: 'application/json' })); a.download = 'template.geojson'; a.click(); setShowImportMenu(false);
                                        }} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-muted hover:theme-bg-tertiary">
                                            <Download size={12} /> GeoJSON template (point + line)
                                        </button>
                                    </div>
                                </>
                            )}
                            <input ref={fileInputRef} type="file" accept=".geojson,.json,.kml,.csv,.mapx,.gpx,.kmz,.tsv" className="hidden" onChange={handleFileImport} />
                        </div>

                        {/* Export */}
                        <div className="relative">
                            <button onClick={() => setShowExportMenu(!showExportMenu)} className="p-1.5 theme-hover rounded theme-text-muted" title="Export"><Download size={14} /></button>
                            {showExportMenu && (
                                <>
                                    <div className="fixed inset-0 z-[9999]" onMouseDown={() => setShowExportMenu(false)} />
                                    <div className="absolute right-0 top-full mt-1 theme-bg-secondary border theme-border rounded shadow-xl z-[10000] py-1 min-w-[260px]">
                                        <div className="px-3 py-1 text-[10px] theme-text-muted border-b theme-border">Export {project.features.length} features</div>
                                        <button onClick={exportGeoJSON} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-primary hover:theme-bg-tertiary">
                                            <FileJson size={12} className="text-blue-400" /> <div><span className="font-medium">GeoJSON</span><br /><span className="text-[10px] theme-text-muted">Universal GIS format — open in ArcGIS, QGIS, Mapbox</span></div>
                                        </button>
                                        <button onClick={exportKML} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-primary hover:theme-bg-tertiary">
                                            <Globe size={12} className="text-green-400" /> <div><span className="font-medium">KML</span><br /><span className="text-[10px] theme-text-muted">Google Earth / Google Maps</span></div>
                                        </button>
                                        <button onClick={() => {
                                            const markers = project.features.filter(f => f.visible && f.type === 'marker');
                                            const lines = ['name,lat,lng,type,color,layer'];
                                            markers.forEach(f => {
                                                const c = f.coordinates as [number, number];
                                                lines.push(`"${f.name.replace(/"/g, '""')}",${c[0]},${c[1]},${f.type},${f.color},${f.layerId}`);
                                            });
                                            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = `${project.name.replace(/\s+/g, '_')}.csv`; a.click(); setShowExportMenu(false);
                                        }} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-primary hover:theme-bg-tertiary">
                                            <Layers size={12} className="text-yellow-400" /> <div><span className="font-medium">CSV</span><br /><span className="text-[10px] theme-text-muted">Spreadsheet — markers only, with coordinates</span></div>
                                        </button>
                                        <button onClick={() => {
                                            const geojson = featuresToGeoJSON(project.features.filter(f => f.visible));
                                            let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Cartoglyph">\n`;
                                            geojson.features.forEach((f: any) => {
                                                if (f.geometry.type === 'Point') {
                                                    gpx += `  <wpt lat="${f.geometry.coordinates[1]}" lon="${f.geometry.coordinates[0]}"><name>${f.properties?.name || ''}</name></wpt>\n`;
                                                } else if (f.geometry.type === 'LineString') {
                                                    gpx += `  <trk><name>${f.properties?.name || ''}</name><trkseg>\n`;
                                                    f.geometry.coordinates.forEach((c: number[]) => { gpx += `    <trkpt lat="${c[1]}" lon="${c[0]}"/>\n`; });
                                                    gpx += `  </trkseg></trk>\n`;
                                                }
                                            });
                                            gpx += `</gpx>`;
                                            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' })); a.download = `${project.name.replace(/\s+/g, '_')}.gpx`; a.click(); setShowExportMenu(false);
                                        }} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-primary hover:theme-bg-tertiary">
                                            <Route size={12} className="text-orange-400" /> <div><span className="font-medium">GPX</span><br /><span className="text-[10px] theme-text-muted">GPS exchange — Garmin, hiking apps, Strava</span></div>
                                        </button>
                                        <div className="border-t theme-border my-1" />
                                        <button onClick={exportProject} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs theme-text-primary hover:theme-bg-tertiary">
                                            <MapIcon size={12} className="text-emerald-400" /> <div><span className="font-medium">MAPX Project</span><br /><span className="text-[10px] theme-text-muted">Full project — layers, features, settings</span></div>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {!isStandalone && (
                            <button onClick={saveProject} disabled={isSaving || !hasChanges} className="p-1.5 theme-hover rounded theme-text-muted disabled:opacity-50" title="Save"><Save size={14} /></button>
                        )}
                        <span className="text-xs theme-text-muted">{project.features.length} feat{hasChanges && <span className="text-yellow-500 ml-1">*</span>}</span>
                    </>
                )}

                <div className="flex-1" />
                <button onClick={() => closeContentPane?.(nodeId, findNodePath?.(rootLayoutNode, nodeId) || [])} className="p-1.5 theme-hover rounded theme-text-muted"><X size={14} /></button>
            </div>

            {/* Content */}
            {activeTab === 'gis' && (
                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar */}
                    {!sidebarCollapsed && (
                        <div className="w-60 border-r theme-border flex flex-col theme-bg-secondary overflow-hidden">
                            <div className="flex border-b theme-border">
                                {(['layers', 'properties', 'overlays', 'osint'] as const).map(tab => (
                                    <button key={tab} onClick={() => setSidebarTab(tab)}
                                        className={`flex-1 px-2 py-1.5 text-xs transition-colors ${sidebarTab === tab ? 'text-emerald-400 border-b-2 border-emerald-400' : 'theme-text-muted hover:theme-text-primary'}`}>
                                        {tab === 'layers' ? 'Layers' : tab === 'properties' ? 'Props' : tab === 'overlays' ? 'Ref' : 'OSINT'}
                                    </button>
                                ))}
                            </div>
                            <div className="flex-1 overflow-y-auto p-2">
                                {sidebarTab === 'layers' && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium theme-text-primary">Layers</span>
                                            <button onClick={addLayer} className="p-1 theme-hover rounded text-emerald-400"><Plus size={14} /></button>
                                        </div>
                                        {project.layers.map(layer => (
                                            <div key={layer.id} className={`border theme-border rounded p-2 ${activeLayerId === layer.id ? 'border-emerald-500/50 theme-bg-tertiary' : ''}`}>
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={() => toggleLayerVisibility(layer.id)} className="theme-text-muted hover:theme-text-primary">{layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: layer.color }} />
                                                    <button onClick={() => setActiveLayerId(layer.id)} className={`flex-1 text-left text-xs truncate ${activeLayerId === layer.id ? 'text-emerald-400 font-medium' : 'theme-text-primary'}`}>{layer.name}</button>
                                                    <span className="text-[10px] theme-text-muted">{layer.features.length}</span>
                                                    {project.layers.length > 1 && <button onClick={() => deleteLayer(layer.id)} className="p-0.5 text-red-400/50 hover:text-red-400"><Trash2 size={10} /></button>}
                                                </div>
                                                {activeLayerId === layer.id && (
                                                    <div className="mt-1.5 space-y-0.5 max-h-40 overflow-y-auto">
                                                        {project.features.filter(f => f.layerId === layer.id).map(f => (
                                                            <button key={f.id} onClick={() => { setSelectedFeatureId(f.id); setSidebarTab('properties'); if (f.type === 'marker' && mapRef.current) mapRef.current.setView(f.coordinates as [number, number], mapRef.current.getZoom()); }}
                                                                className={`w-full text-left px-1.5 py-1 rounded text-[11px] flex items-center gap-1.5 ${selectedFeatureId === f.id ? 'bg-emerald-600/30 text-emerald-300' : 'theme-text-muted hover:theme-bg-tertiary'}`}>
                                                                {f.type === 'marker' ? <MapPin size={10} /> : f.type === 'line' ? <Route size={10} /> : f.type === 'polygon' ? <Hexagon size={10} /> : <Circle size={10} />}
                                                                <span className="truncate">{f.name}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {sidebarTab === 'properties' && selectedFeature && (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[10px] theme-text-muted block mb-1">Name</label>
                                            {editingFeatureName === selectedFeature.id ? (
                                                <div className="flex gap-1">
                                                    <input type="text" value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') { updateFeature(selectedFeature.id, { name: editNameValue }); setEditingFeatureName(null); } if (e.key === 'Escape') setEditingFeatureName(null); }}
                                                        className="flex-1 px-1.5 py-0.5 text-xs theme-bg-tertiary theme-text-primary border theme-border rounded focus:outline-none" autoFocus />
                                                    <button onClick={() => { updateFeature(selectedFeature.id, { name: editNameValue }); setEditingFeatureName(null); }} className="text-xs text-emerald-400">OK</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => { setEditingFeatureName(selectedFeature.id); setEditNameValue(selectedFeature.name); }} className="text-sm theme-text-primary hover:text-emerald-400 text-left w-full truncate">{selectedFeature.name}</button>
                                            )}
                                        </div>
                                        <div><label className="text-[10px] theme-text-muted block mb-1">Type</label><span className="text-xs theme-text-primary capitalize">{selectedFeature.type}</span></div>
                                        <div>
                                            <label className="text-[10px] theme-text-muted block mb-1">Color</label>
                                            <div className="flex gap-1 flex-wrap">{LAYER_COLORS.map(c => (<button key={c} onClick={() => updateFeature(selectedFeature.id, { color: c })} className={`w-5 h-5 rounded ${selectedFeature.color === c ? 'ring-2 ring-white' : ''}`} style={{ backgroundColor: c }} />))}</div>
                                        </div>
                                        {selectedFeature.type === 'marker' && (
                                            <div><label className="text-[10px] theme-text-muted block mb-1">Coordinates</label><span className="text-xs theme-text-primary font-mono">{(selectedFeature.coordinates as [number, number])[0].toFixed(6)}, {(selectedFeature.coordinates as [number, number])[1].toFixed(6)}</span></div>
                                        )}
                                        {Object.keys(selectedFeature.properties).filter(k => !k.startsWith('_')).length > 0 && (
                                            <div>
                                                <label className="text-[10px] theme-text-muted block mb-1">Properties</label>
                                                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                                    {Object.entries(selectedFeature.properties).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
                                                        <div key={k} className="flex text-[11px]"><span className="theme-text-muted w-20 truncate flex-shrink-0">{k}:</span><span className="theme-text-primary truncate">{String(v)}</span></div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="pt-2 border-t theme-border flex gap-1">
                                            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(featuresToGeoJSON([selectedFeature]), null, 2))}
                                                className="flex-1 px-2 py-1 text-xs theme-bg-tertiary theme-text-primary rounded hover:theme-bg-primary flex items-center justify-center gap-1"><Copy size={10} /> GeoJSON</button>
                                            <button onClick={() => deleteFeature(selectedFeature.id)} className="px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded hover:bg-red-600/30"><Trash2 size={10} /></button>
                                        </div>
                                    </div>
                                )}
                                {sidebarTab === 'properties' && !selectedFeature && (
                                    <div className="text-xs theme-text-muted text-center mt-8"><Navigation size={24} className="mx-auto mb-2 opacity-50" /><p>Select a feature</p></div>
                                )}

                                {sidebarTab === 'overlays' && (
                                    <div className="space-y-3">
                                        <p className="text-[10px] theme-text-muted">Toggle tile overlays and reference layers.</p>

                                        {/* Tile overlays */}
                                        <div>
                                            <span className="text-[10px] theme-text-muted uppercase tracking-wider font-medium">tile overlays</span>
                                            <div className="mt-1 space-y-0.5">
                                                {Object.entries(TILE_OVERLAYS).map(([key, overlay]) => (
                                                    <label key={key} className="flex items-center gap-2 px-1.5 py-1 rounded hover:theme-bg-tertiary cursor-pointer text-xs">
                                                        <input type="checkbox" checked={activeTileOverlays.has(key)}
                                                            onChange={() => setActiveTileOverlays(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
                                                            className="accent-emerald-500" />
                                                        <span className="theme-text-primary">{overlay.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        {Object.entries(
                                            Object.entries(REFERENCE_LAYERS).reduce((acc, [k, v]) => {
                                                (acc[v.category] = acc[v.category] || []).push([k, v]);
                                                return acc;
                                            }, {} as Record<string, [string, any][]>)
                                        ).map(([category, layers]) => (
                                            <div key={category}>
                                                <span className="text-[10px] theme-text-muted uppercase tracking-wider font-medium">{category}</span>
                                                <div className="mt-1 space-y-0.5">
                                                    {layers.map(([key, layer]: [string, any]) => (
                                                        <label key={key} className="flex items-center gap-2 px-1.5 py-1 rounded hover:theme-bg-tertiary cursor-pointer text-xs">
                                                            <input
                                                                type="checkbox"
                                                                checked={activeOverlays.has(key)}
                                                                onChange={() => setActiveOverlays(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(key)) next.delete(key); else next.add(key);
                                                                    return next;
                                                                })}
                                                                className="accent-emerald-500"
                                                            />
                                                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: layer.style?.color || layer.style?.fillColor || '#666' }} />
                                                            <span className="theme-text-primary">{layer.name}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {activeOverlays.size > 0 && (
                                            <button onClick={() => { setActiveOverlays(new Set()); setActiveTileOverlays(new Set()); }} className="text-[10px] text-red-400 hover:text-red-300">Clear all overlays</button>
                                        )}
                                    </div>
                                )}

                                {sidebarTab === 'osint' && (
                                    <div className="space-y-3">
                                        <p className="text-[10px] theme-text-muted">Toggle OSM data layers for current viewport. Auto-refreshes when you pan.</p>

                                        {/* OSINT toggleable layers by category */}
                                        {Object.entries(
                                            Object.entries(OSINT_PRESETS).reduce((acc, [k, v]) => {
                                                (acc[v.category] = acc[v.category] || []).push([k, v]);
                                                return acc;
                                            }, {} as Record<string, [string, any][]>)
                                        ).map(([category, items]) => (
                                            <div key={category}>
                                                <span className="text-[10px] theme-text-muted uppercase tracking-wider font-medium">{category}</span>
                                                <div className="mt-1 space-y-0.5">
                                                    {items.map(([key, preset]: [string, any]) => (
                                                        <label key={key} className="flex items-center gap-2 px-1.5 py-1 rounded hover:theme-bg-tertiary cursor-pointer text-xs">
                                                            <input type="checkbox" checked={osintVisible.has(key)} onChange={() => toggleOsintLayer(key)} className="accent-emerald-500" />
                                                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: preset.color }} />
                                                            <span className="theme-text-primary flex-1">{preset.label}</span>
                                                            {osintLoading.has(key) && <span className="text-[9px] text-emerald-400 animate-pulse">loading</span>}
                                                            {osintCache[key] && <span className="text-[9px] theme-text-muted">{osintCache[key].results.length}</span>}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}

                                        {osintVisible.size > 0 && (
                                            <button onClick={() => { setOsintVisible(new Set()); }} className="text-[10px] text-red-400 hover:text-red-300">Clear all OSINT layers</button>
                                        )}

                                        <div className="border-t theme-border pt-2">
                                            <label className="text-[10px] theme-text-muted block mb-1">Custom Overpass query</label>
                                            <div className="flex gap-1">
                                                <input type="text" value={osintQuery} onChange={(e) => setOsintQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchOSINT()}
                                                    placeholder="amenity=hospital"
                                                    className="flex-1 px-2 py-1 text-xs theme-bg-tertiary theme-text-primary border theme-border rounded focus:outline-none focus:border-emerald-500" />
                                                <button onClick={() => fetchOSINT()} disabled={isOsintLoading} className="px-2 py-1 text-xs bg-emerald-600 text-white rounded disabled:opacity-50">{isOsintLoading ? '...' : 'Fetch'}</button>
                                            </div>
                                        </div>
                                        {osintResults.length > 0 && (
                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] theme-text-muted">{osintResults.length} results</span>
                                                    <button onClick={() => osintResults.forEach(r => addOsintResult(r))} className="text-[10px] text-emerald-400">Add all</button>
                                                </div>
                                                <div className="space-y-1 max-h-60 overflow-y-auto">
                                                    {osintResults.map((r: any, i: number) => (
                                                        <div key={i} className="flex items-start gap-1.5 p-1.5 theme-bg-tertiary rounded text-[11px]">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="theme-text-primary truncate font-medium">{r.name}</p>
                                                                <p className="theme-text-muted truncate">{r.category} &middot; {r.lat?.toFixed(4)}, {r.lng?.toFixed(4)}</p>
                                                            </div>
                                                            <button onClick={() => { if (r.lat && r.lng) mapRef.current?.setView([r.lat, r.lng], 16); }} className="p-1 theme-text-muted hover:text-emerald-400" title="Go to"><LocateFixed size={10} /></button>
                                                            <button onClick={() => addOsintResult(r)} className="p-1 theme-text-muted hover:text-emerald-400" title="Add"><Plus size={10} /></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Sidebar toggle */}
                    <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="w-4 flex-shrink-0 flex items-center justify-center theme-bg-secondary border-r theme-border hover:theme-bg-tertiary">
                        {sidebarCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} className="rotate-90" />}
                    </button>

                    {/* Map */}
                    <GISMapView
                        project={project}
                        onProjectChange={updateProject}
                        mode={mode}
                        onModeChange={setMode}
                        selectedFeatureId={selectedFeatureId}
                        onSelectFeature={setSelectedFeatureId}
                        mapRef={mapRef}
                        activeOverlays={activeOverlays}
                        activeTileOverlays={activeTileOverlays}
                        osintLayers={Array.from(osintVisible).filter(k => osintCache[k]).map(k => ({
                            key: k,
                            color: OSINT_PRESETS[k]?.color || '#f59e0b',
                            markers: osintCache[k].results,
                        }))}
                    />
                </div>
            )}

            {activeTab === 'mindmap' && (
                <div className="flex-1 overflow-hidden">
                    <NpctsMindMapViewer
                        initialData={mindMapData || undefined}
                        onChange={(data) => setMindMapData(data)}
                        onSave={async (data) => {
                            if (!isStandalone && filePath) {
                                await (window as any).api?.writeFile?.(filePath, JSON.stringify(data, null, 2));
                            }
                        }}
                        defaultEditMode={true}
                    />
                </div>
            )}

            {activeTab === 'radio' && (
                <div className="flex-1 overflow-hidden">
                    <RadioPane
                        fetchFn={async (url: string, options?: any) => {
                            const api = (window as any).api;
                            if (api?.proxyFetch) {
                                const result = await api.proxyFetch(url, options);
                                return { ok: result.status >= 200 && result.status < 300, status: result.status, data: result.data, error: result.error };
                            }
                            try {
                                const resp = await fetch(url, options);
                                const ct = resp.headers.get('content-type') || '';
                                const data = ct.includes('json') ? await resp.json() : await resp.text();
                                return { ok: resp.ok, status: resp.status, data };
                            } catch (err: any) {
                                return { ok: false, status: 0, data: null, error: err.message };
                            }
                        }}
                        onShowOnMap={(markers) => {
                            const newFeatures: GeoFeature[] = markers.map((m, i) => ({
                                id: `radio_${Date.now()}_${i}`,
                                type: 'marker' as const,
                                name: m.label,
                                coordinates: [m.lat, m.lng] as [number, number],
                                color: m.color || '#10b981',
                                visible: true,
                                layerId: 'default',
                                properties: { source: 'radio' },
                            }));
                            updateProject(prev => ({
                                ...prev,
                                features: [...prev.features, ...newFeatures],
                            }));
                            setActiveTab('gis');
                        }}
                    />
                </div>
            )}

            {activeTab === 'data' && (
                <div className="flex-1 overflow-auto p-4">
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold theme-text-primary">Open Geospatial Data Sources</h3>
                        <p className="text-xs theme-text-muted">Browse and import open data into your GIS project</p>

                        {[
                            {
                                name: 'Natural Earth', category: 'Boundaries & Culture', icon: '🌍',
                                desc: 'Countries, states, coastlines, rivers, populated places (1:10m/50m/110m)',
                                datasets: [
                                    { label: 'Countries (110m)', url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson' },
                                    { label: 'States/Provinces (50m)', url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson' },
                                    { label: 'Populated Places (50m)', url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places.geojson' },
                                    { label: 'Rivers (50m)', url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson' },
                                    { label: 'Lakes (50m)', url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson' },
                                    { label: 'Coastline (110m)', url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_coastline.geojson' },
                                ],
                            },
                            {
                                name: 'OpenStreetMap (Overpass)', category: 'Infrastructure & POI', icon: '🗺️',
                                desc: 'Roads, buildings, amenities, land use — query by area',
                                datasets: [
                                    { label: 'Hospitals (viewport)', overpass: '[out:json];node["amenity"="hospital"]({{bbox}});out;' },
                                    { label: 'Schools (viewport)', overpass: '[out:json];node["amenity"="school"]({{bbox}});out;' },
                                    { label: 'Restaurants (viewport)', overpass: '[out:json];node["amenity"="restaurant"]({{bbox}});out;' },
                                    { label: 'Charging Stations (viewport)', overpass: '[out:json];node["amenity"="charging_station"]({{bbox}});out;' },
                                    { label: 'Airports (global)', overpass: '[out:json];node["aeroway"="aerodrome"]["iata"]({{bbox}});out;' },
                                    { label: 'Power Plants (viewport)', overpass: '[out:json];way["power"="plant"]({{bbox}});out center;' },
                                ],
                            },
                            {
                                name: 'GEBCO', category: 'Elevation & Bathymetry', icon: '🌊',
                                desc: 'Global ocean depth + land elevation (15 arc-second grid)',
                                datasets: [
                                    { label: 'GEBCO Grid Viewer', link: 'https://download.gebco.net/' },
                                ],
                            },
                            {
                                name: 'CHIRPS', category: 'Climate & Weather', icon: '🌧️',
                                desc: 'Global precipitation data (0.05° daily, 1981-present)',
                                datasets: [
                                    { label: 'CHIRPS Data Portal', link: 'https://data.chc.ucsb.edu/products/CHIRPS-2.0/' },
                                ],
                            },
                            {
                                name: 'Open-Elevation', category: 'Elevation API', icon: '⛰️',
                                desc: 'Free elevation lookups from SRTM data',
                                datasets: [
                                    { label: 'Elevation API', link: 'https://api.open-elevation.com/api/v1/lookup' },
                                ],
                            },
                            {
                                name: 'GeoJSON.io Samples', category: 'Example Data', icon: '📐',
                                desc: 'Quick test datasets',
                                datasets: [
                                    { label: 'US States', url: 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json' },
                                    { label: 'World Airports', url: 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.json' },
                                ],
                            },
                        ].map((source) => (
                            <div key={source.name} className="theme-bg-secondary rounded-lg p-3 border theme-border">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-lg">{source.icon}</span>
                                    <div>
                                        <div className="text-sm font-medium theme-text-primary">{source.name}</div>
                                        <div className="text-[10px] theme-text-muted">{source.category}</div>
                                    </div>
                                </div>
                                <p className="text-xs theme-text-muted mb-2">{source.desc}</p>
                                <div className="flex flex-wrap gap-1">
                                    {source.datasets.map((ds: any) => (
                                        <button
                                            key={ds.label}
                                            onClick={async () => {
                                                if (ds.url) {
                                                    try {
                                                        const resp = await proxyFetch(ds.url);
                                                        const data = await resp.json();
                                                        const features = geoJSONToFeatures(data);
                                                        updateProject(prev => ({ ...prev, features: [...prev.features, ...features] }));
                                                        setActiveTab('gis');
                                                    } catch (err) {
                                                        console.error('Failed to load dataset:', err);
                                                    }
                                                } else if (ds.overpass) {
                                                    // Would need current map bounds — for now open in browser
                                                    const url = `https://overpass-turbo.eu/?Q=${encodeURIComponent(ds.overpass)}`;
                                                    window.open(url, '_blank');
                                                } else if (ds.link) {
                                                    window.open(ds.link, '_blank');
                                                }
                                            }}
                                            className="px-2 py-1 text-[10px] rounded border theme-border theme-hover theme-text-secondary flex items-center gap-1"
                                        >
                                            {ds.url ? <Download size={10} /> : ds.overpass ? <Search size={10} /> : <Globe size={10} />}
                                            {ds.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const arePropsEqual = (prevProps: any, nextProps: any) => prevProps.nodeId === nextProps.nodeId;
export default memo(CartoglyphPane, arePropsEqual);
