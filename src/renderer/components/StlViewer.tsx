import { getFileName } from './utils';
import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

interface StlViewerProps {
    nodeId: string;
    contentDataRef: React.MutableRefObject<any>;
}

const AXIS_COLORS = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' };

const StlViewer: React.FC<StlViewerProps> = ({ nodeId, contentDataRef }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const axesRef = useRef<THREE.Group | null>(null);
    const gridRef = useRef<THREE.GridHelper | null>(null);
    const frameRef = useRef<number>(0);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAxes, setShowAxes] = useState(true);
    const [showGrid, setShowGrid] = useState(true);
    const [wireframe, setWireframe] = useState(false);
    const [meshColor, setMeshColor] = useState('#6b9bd2');
    const [opacity, setOpacity] = useState(1);
    const [meshInfo, setMeshInfo] = useState<{ vertices: number; triangles: number; size: string } | null>(null);

    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;

    const resetCamera = useCallback(() => {
        if (!cameraRef.current || !controlsRef.current || !meshRef.current) return;
        const box = new THREE.Box3().setFromObject(meshRef.current);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 2;

        cameraRef.current.position.set(center.x + distance * 0.5, center.y + distance * 0.5, center.z + distance);
        cameraRef.current.lookAt(center);
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
    }, []);

    const viewAxis = useCallback((axis: 'x' | 'y' | 'z' | '-x' | '-y' | '-z') => {
        if (!cameraRef.current || !controlsRef.current || !meshRef.current) return;
        const box = new THREE.Box3().setFromObject(meshRef.current);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) * 2;

        const positions: Record<string, THREE.Vector3> = {
            'x':  new THREE.Vector3(center.x + maxDim, center.y, center.z),
            '-x': new THREE.Vector3(center.x - maxDim, center.y, center.z),
            'y':  new THREE.Vector3(center.x, center.y + maxDim, center.z),
            '-y': new THREE.Vector3(center.x, center.y - maxDim, center.z),
            'z':  new THREE.Vector3(center.x, center.y, center.z + maxDim),
            '-z': new THREE.Vector3(center.x, center.y, center.z - maxDim),
        };

        cameraRef.current.position.copy(positions[axis]);
        cameraRef.current.lookAt(center);
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
    }, []);

    const takeScreenshot = useCallback(() => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${getFileName(filePath) || 'stl'}_screenshot.png`;
        link.href = dataUrl;
        link.click();
    }, [filePath]);

    useEffect(() => {
        if (paneData) {
            paneData.resetCamera = resetCamera;
            paneData.viewAxis = viewAxis;
            paneData.toggleWireframe = () => setWireframe(prev => !prev);
            paneData.toggleAxes = () => setShowAxes(prev => !prev);
            paneData.toggleGrid = () => setShowGrid(prev => !prev);
            paneData.takeScreenshot = takeScreenshot;
            paneData.opacity = opacity;
            paneData.setOpacity = setOpacity;
            paneData.wireframe = wireframe;
            paneData.showAxes = showAxes;
            paneData.showGrid = showGrid;
        }
    }, [paneData, resetCamera, viewAxis, wireframe, showAxes, showGrid, takeScreenshot, opacity]);

    useEffect(() => {
        if (meshRef.current) {
            (meshRef.current.material as THREE.MeshStandardMaterial).wireframe = wireframe;
        }
    }, [wireframe]);

    useEffect(() => {
        if (meshRef.current) {
            (meshRef.current.material as THREE.MeshStandardMaterial).color.set(meshColor);
        }
    }, [meshColor]);

    useEffect(() => {
        if (meshRef.current) {
            const mat = meshRef.current.material as THREE.MeshStandardMaterial;
            mat.opacity = opacity;
            mat.transparent = opacity < 1;
            mat.depthWrite = opacity >= 1;
        }
    }, [opacity]);

    useEffect(() => {
        if (axesRef.current) axesRef.current.visible = showAxes;
    }, [showAxes]);

    useEffect(() => {
        if (gridRef.current) gridRef.current.visible = showGrid;
    }, [showGrid]);

    useEffect(() => {
        if (!containerRef.current || !filePath) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#1a1a2e');
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 10000);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.zoomSpeed = 0.6;
        controls.rotateSpeed = 0.8;
        controls.panSpeed = 0.6;
        controlsRef.current = controls;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight1.position.set(5, 10, 7);
        dirLight1.castShadow = true;
        scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
        dirLight2.position.set(-5, -5, -5);
        scene.add(dirLight2);

        const grid = new THREE.GridHelper(100, 50, 0x444466, 0x333355);
        grid.position.y = 0;
        scene.add(grid);
        gridRef.current = grid;

        const axesGroup = new THREE.Group();
        const axisLength = 50;

        const createAxis = (dir: THREE.Vector3, color: string) => {
            const mat = new THREE.LineBasicMaterial({ color });
            const points = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(axisLength)];
            const geom = new THREE.BufferGeometry().setFromPoints(points);
            return new THREE.Line(geom, mat);
        };

        axesGroup.add(createAxis(new THREE.Vector3(1, 0, 0), AXIS_COLORS.x));
        axesGroup.add(createAxis(new THREE.Vector3(0, 1, 0), AXIS_COLORS.y));
        axesGroup.add(createAxis(new THREE.Vector3(0, 0, 1), AXIS_COLORS.z));
        scene.add(axesGroup);
        axesRef.current = axesGroup;

        const loader = new STLLoader();
        (async () => {
            try {
                const buffer = await (window as any).api?.readFileBuffer(filePath);
                if (!buffer) throw new Error('Could not read file');

                const uint8 = new Uint8Array(buffer);
                const geometry = loader.parse(uint8.buffer);
                geometry.computeVertexNormals();

                geometry.computeBoundingBox();
                const bbox = geometry.boundingBox!;
                const center = new THREE.Vector3();
                bbox.getCenter(center);
                geometry.translate(-center.x, -center.y, -center.z);

                geometry.computeBoundingBox();
                const minY = geometry.boundingBox!.min.y;
                geometry.translate(0, -minY, 0);

                const material = new THREE.MeshStandardMaterial({
                    color: meshColor,
                    metalness: 0.2,
                    roughness: 0.6,
                    flatShading: false,
                    wireframe,
                });

                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                scene.add(mesh);
                meshRef.current = mesh;

                const modelBox = new THREE.Box3().setFromObject(mesh);
                const modelSize = modelBox.getSize(new THREE.Vector3());
                const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
                grid.scale.setScalar(Math.ceil(maxDim / 50) || 1);

                const verts = geometry.attributes.position.count;
                const tris = geometry.index ? geometry.index.count / 3 : verts / 3;
                setMeshInfo({
                    vertices: verts,
                    triangles: Math.round(tris),
                    size: `${modelSize.x.toFixed(1)} x ${modelSize.y.toFixed(1)} x ${modelSize.z.toFixed(1)}`,
                });

                const distance = maxDim * 2;
                camera.position.set(distance * 0.5, distance * 0.5, distance);
                camera.lookAt(0, modelSize.y / 2, 0);
                controls.target.set(0, modelSize.y / 2, 0);
                controls.update();

                setLoading(false);
            } catch (err: any) {
                console.error('[StlViewer] Error loading STL:', err);
                setError(err.message || 'Failed to load STL file');
                setLoading(false);
            }
        })();

        const animate = () => {
            frameRef.current = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        const handleResize = () => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w === 0 || h === 0) return;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(container);

        return () => {
            cancelAnimationFrame(frameRef.current);
            resizeObserver.disconnect();
            controls.dispose();
            renderer.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }

            scene.traverse((obj) => {
                if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
                if ((obj as THREE.Mesh).material) {
                    const mat = (obj as THREE.Mesh).material;
                    if (Array.isArray(mat)) mat.forEach(m => m.dispose());
                    else (mat as THREE.Material).dispose();
                }
            });
        };
    }, [filePath]);

    return (
        <div className="flex-1 flex flex-col overflow-hidden theme-bg-primary">
            <div ref={containerRef} className="flex-1 relative overflow-hidden">
                {loading && !error && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div className="text-center theme-text-muted">
                            <div className="text-lg mb-2">Failed to load STL</div>
                            <div className="text-sm text-red-400">{error}</div>
                        </div>
                    </div>
                )}

                {!loading && !error && (
                    <div className="absolute bottom-2 left-2 z-20 flex flex-col gap-1" style={{ pointerEvents: 'auto' }}>
                        <div className="flex gap-1">
                            <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); viewAxis('x'); }} className="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }} title="View from +X">X</button>
                            <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); viewAxis('y'); }} className="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: 'rgba(34,197,94,0.3)', color: '#22c55e' }} title="View from +Y">Y</button>
                            <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); viewAxis('z'); }} className="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: 'rgba(59,130,246,0.3)', color: '#3b82f6' }} title="View from +Z">Z</button>
                        </div>
                        <div className="flex items-center gap-1">
                            <input
                                type="color"
                                value={meshColor}
                                onChange={(e) => setMeshColor(e.target.value)}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                                title="Mesh color"
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="px-3 py-1 text-xs theme-bg-secondary border-t theme-border theme-text-muted flex items-center gap-4">
                <span>{getFileName(filePath)}</span>
                {meshInfo && (
                    <>
                        <span>{meshInfo.triangles.toLocaleString()} tris</span>
                        <span>{meshInfo.vertices.toLocaleString()} verts</span>
                        <span>{meshInfo.size}</span>
                    </>
                )}
            </div>
        </div>
    );
};

const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(StlViewer, arePropsEqual);
