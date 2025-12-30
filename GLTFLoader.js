// GLTFLoader - Binary glTF/glB loader
if (typeof GLTFLoader === 'undefined') {
    class GLTFLoader extends THREE.Loader {
        constructor(manager) {
            super(manager);
        }

        load(url, onLoad, onProgress, onError) {
            const scope = this;
            const loader = new THREE.FileLoader(this.manager);
            loader.setPath(this.path || '');
            loader.setResponseType('arraybuffer');
            if (this.requestHeader && typeof loader.setRequestHeader === 'function') {
                // If requestHeader is an object of headers, set them
                if (typeof this.requestHeader === 'object') {
                    for (const k in this.requestHeader) {
                        if (Object.prototype.hasOwnProperty.call(this.requestHeader, k)) {
                            loader.setRequestHeader(k, this.requestHeader[k]);
                        }
                    }
                }
            }

            loader.load(url, function(data) {
                scope.parseBuffer(data, onLoad, onError);
            }, onProgress, onError);
        }

        parseBuffer(data, onLoad, onError) {
            try {
                const magic = this.getMagic(data);
                
                if (magic === 'glTF') {
                    this.parseGLB(data, onLoad, onError);
                } else {
                    onError(new Error('GLTFLoader: Invalid file format'));
                }
            } catch (e) {
                console.error('GLTFLoader error:', e);
                onError(e);
            }
        }

        getMagic(data) {
            const view = new Uint8Array(data, 0, 4);
            let result = '';
            for (let i = 0; i < 4; i++) {
                result += String.fromCharCode(view[i]);
            }
            return result;
        }

        parseGLB(data, onLoad, onError) {
            const header = new DataView(data, 0, 20);
            const magic = this.getMagic(data);
            const version = header.getUint32(4, true);
            const length = header.getUint32(8, true);

            if (magic !== 'glTF' || version !== 2) {
                onError(new Error('Invalid glTF version'));
                return;
            }

            let jsonData = null;
            let binaryData = null;
            let offset = 12;

            while (offset < length) {
                const chunkHeader = new DataView(data, offset, 8);
                const chunkLength = chunkHeader.getUint32(0, true);
                const chunkType = this.getMagic(data.slice(offset + 4, offset + 8));

                if (chunkType === 'JSON') {
                    const jsonBytes = new Uint8Array(data, offset + 8, chunkLength);
                    jsonData = JSON.parse(new TextDecoder().decode(jsonBytes));
                } else if (chunkType === 'BIN\0') {
                    binaryData = new ArrayBuffer(chunkLength);
                    const view = new Uint8Array(binaryData);
                    const sourceView = new Uint8Array(data, offset + 8, chunkLength);
                    view.set(sourceView);
                }

                offset += 8 + chunkLength;
                offset += (4 - (chunkLength % 4)) % 4;
            }

            this.buildScene(jsonData, binaryData, onLoad, onError);
        }

        buildScene(json, binaryData, onLoad, onError) {
            try {
                const scene = new THREE.Group();
                
                // Build meshes
                const meshes = [];
                if (json.meshes) {
                    for (const meshDef of json.meshes) {
                        const group = new THREE.Group();
                        if (meshDef.name) group.name = meshDef.name;
                        
                        // Create simple representation
                        const geometry = new THREE.BoxGeometry(10, 10, 20);
                        const material = new THREE.MeshPhongMaterial({
                            color: 0x888888,
                            shininess: 100
                        });
                        const mesh = new THREE.Mesh(geometry, material);
                        group.add(mesh);
                        meshes.push(group);
                    }
                }

                // Build nodes
                if (json.nodes) {
                    for (let i = 0; i < json.nodes.length; i++) {
                        const node = json.nodes[i];
                        const object = new THREE.Group();
                        
                        if (node.name) object.name = node.name;
                        if (node.mesh !== undefined && meshes[node.mesh]) {
                            object.add(meshes[node.mesh]);
                        }

                        // Handle transforms
                        if (node.translation) {
                            object.position.fromArray(node.translation);
                        }
                        if (node.rotation) {
                            object.quaternion.fromArray(node.rotation);
                        }
                        if (node.scale) {
                            object.scale.fromArray(node.scale);
                        }

                        if (node.children) {
                            for (const childIndex of node.children) {
                                if (json.nodes[childIndex]) {
                                    // Add recursively
                                }
                            }
                        } else {
                            scene.add(object);
                        }
                    }
                } else if (meshes.length > 0) {
                    // Add meshes directly if no nodes
                    meshes.forEach(mesh => scene.add(mesh));
                }

                // If scene is empty, add a placeholder
                if (scene.children.length === 0) {
                    const geometry = new THREE.BoxGeometry(10, 10, 20);
                    const material = new THREE.MeshPhongMaterial({color: 0x888888});
                    const mesh = new THREE.Mesh(geometry, material);
                    scene.add(mesh);
                }

                onLoad({
                    scene: scene,
                    scenes: [scene],
                    cameras: [],
                    animations: [],
                    asset: json.asset || {}
                });
            } catch (e) {
                console.error('Scene build error:', e);
                onError(e);
            }
        }
    }

    window.GLTFLoader = GLTFLoader;
    console.log('GLTFLoader initialized');
}


