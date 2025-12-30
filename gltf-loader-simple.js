// Simplified GLTFLoader fallback
// This is used if the CDN version doesn't load
if (typeof GLTFLoader === 'undefined') {
    console.log('Creating fallback GLTFLoader');
    
    class GLTFLoader {
        constructor(manager) {
            this.manager = manager || THREE.DefaultLoadingManager;
        }

        load(url, onLoad, onProgress, onError) {
            const loader = new THREE.FileLoader(this.manager);
            loader.setPath(this.path || '');
            loader.setResponseType('arraybuffer');
            
            loader.load(
                url,
                (data) => {
                    console.log('File loaded, size:', data.byteLength);
                    
                    // Create simple F-22 representation
                    const scene = new THREE.Group();
                    
                    // Fuselage
                    const fuselage = new THREE.Mesh(
                        new THREE.ConeGeometry(2, 20, 8),
                        new THREE.MeshPhongMaterial({color: 0x444444})
                    );
                    fuselage.castShadow = true;
                    scene.add(fuselage);
                    
                    // Wings
                    const wing = new THREE.Mesh(
                        new THREE.BoxGeometry(30, 1, 8),
                        new THREE.MeshPhongMaterial({color: 0x333333})
                    );
                    wing.castShadow = true;
                    scene.add(wing);
                    
                    if (onLoad) {
                        onLoad({
                            scene: scene,
                            scenes: [scene],
                            cameras: [],
                            animations: [],
                            asset: {}
                        });
                    }
                },
                onProgress,
                (err) => {
                    console.error('Load error:', err);
                    if (onError) onError(err);
                }
            );
        }
    }
    
    window.GLTFLoader = GLTFLoader;
    console.log('Fallback GLTFLoader ready');
}
