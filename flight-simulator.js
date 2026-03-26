// Su-30 Flanker Flight Simulator
// Realistic flight mechanics with combat capabilities

class Su30FlightSimulator {
    constructor() {
        console.log('Initializing Su-30 Flight Simulator...');
        
        try {
            // Scene setup
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500000);
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            document.body.appendChild(this.renderer.domElement);
            
            console.log('WebGL Renderer initialized');

            // Mouse controls
            this.mouseX = 0;
            this.mouseY = 0;
            this.mouseDown = false;
            this.lastMouseX = 0;
            this.lastMouseY = 0;
            this.rotatingCamera = false;
            this.cameraYaw = 0;
            this.cameraPitch = 0;
            this.cameraPanX = 0;
            this.cameraPanY = 0;
            this.cameraPanZ = 0;
            this.orbitDistance = 60;

            // Controls tuning
            this.controlSensitivity = 2.2; // reduced to make input feel smoother and less twitchy
            this.controlSmoothFactor = 0.035; // slower smoothing for gentler transitions
            this.invertKeys = false; // no inversion for natural controls
            this.targetPitch = 0;
            this.targetRoll = 0;

            // Sky and environment
            this.setupEnvironment();
            console.log('Environment setup complete');

            // Aircraft state
            this.aircraft = {
                position: new THREE.Vector3(0, 180, 0), // Start at 180m for visible scene
                velocity: new THREE.Vector3(0, 0, 220), // Start flying forward along nose (+Z)
                acceleration: new THREE.Vector3(0, 0, 0),
                rotation: new THREE.Euler(0, 0, 0),
                angularVelocity: new THREE.Vector3(0, 0, 0),
                
                // Flight parameters
                mass: 8000, // kg (reduced for faster acceleration and responsiveness)
                maxThrust: 500000, // N (increased thrust)
                normalThrust: 250000, // N (increased military power)
                currentThrust: 0,
                throttle: 0.75, // Start with 75% throttle for immediate responsive movement
                afterburner: false,
                
                // Aerodynamic properties
                wingArea: 78.04, // m^2
                dragCoefficient: 0.025, // increased for realistic air resistance
                liftCoefficient: 0.25, // realistic lift coefficient
                aspectRatio: 3.56,
                
                // Control surfaces
                pitchControl: 0, // -1 to 1
                rollControl: 0, // -1 to 1
                yawControl: 0, // -1 to 1
                
                // Fuel
                fuel: 100, // percentage
                fuelConsumption: 0.05, // per frame at full throttle
                
                // Weapons
                missiles: 4,
                ammunition: 500,
                lastShotTime: 0,
                
                // Damage/Status
                health: 100
            };

            this.f22Model = null;
            this.createAircraft();
            console.log('Aircraft model created');

            // Terrain grid for visual movement feedback
            this.terrainGrids = [];
            this.createTerrainGrid();
            console.log('Terrain grid created');

            // Physics
            this.gravity = 12; // increased gravity for atmospheric feel
            this.airDensity = 1.225; // kg/m^3 at sea level
            this.speedOfSound = 343; // m/s at sea level

            // Input handling
            this.keys = {};
            this.setupInput();
            console.log('Input setup complete');

            // Camera control
            this.cameraMode = 1; // only third person
            this.cameraDistance = 60;

            // Follow-camera state for game-inspired chase
            this.cameraFollowDistance = 60;
            this.cameraFollowHeight = 14;
            this.cameraFollowLookAhead = 40;
            this.cameraFollowSpeed = 0.12;
            this.cameraLookAtOffset = new THREE.Vector3(0, 6, 0);
            this.cameraTargetPosition = new THREE.Vector3();

            // Right-click camera hold controls
            this.cameraRightHold = false;
            this.cameraHoldPosition = new THREE.Vector3();
            this.cameraHoldLookAt = new THREE.Vector3();

            // Targeting system
            this.targets = [];
            this.targetLocked = null;
            this.targetDistance = Infinity;

            // Game state
            this.paused = false;
            this.time = 0;
            this.lastTime = performance.now();

            // Enemy aircraft
            this.enemies = [];
            this.createEnemies();
            console.log('Enemies created');

            // Handle window resize
            window.addEventListener('resize', () => this.onWindowResize());

            // Start animation loop
            console.log('Starting animation loop');
            this.animate();
            
            // Skip loading external GLTF model - use the B2-Bomber arrow model instead
            // setTimeout(() => {
            //     this.loadGLTFModel();
            // }, 1000);
        } catch (error) {
            console.error('Error initializing simulator:', error);
            alert('Error initializing flight simulator: ' + error.message);
        }
    }

    setupEnvironment() {
        // Sky dome - gradient sky
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 512);
        gradient.addColorStop(0, '#87CEEB'); // Sky blue at top
        gradient.addColorStop(1, '#E0F6FF'); // Light blue at horizon
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);
        
        const texture = new THREE.CanvasTexture(canvas);
        this.scene.background = new THREE.Color(0x87CEEB);

        // Lighting
        const sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.position.set(100000, 100000, 50000);
        sunLight.castShadow = true;
        sunLight.shadow.camera.left = -100000;
        sunLight.shadow.camera.right = 100000;
        sunLight.shadow.camera.top = 100000;
        sunLight.shadow.camera.bottom = -100000;
        sunLight.shadow.mapSize.width = 4096;
        sunLight.shadow.mapSize.height = 4096;
        this.scene.add(sunLight);

        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        // Environment is now a single infinite-like ground texture, no debug helpers.
    }

    createTerrainGrid() {
        // Remove previous helpers/plane if present.
        if (this.grids) {
            this.grids.forEach(g => this.scene.remove(g.mesh));
            this.grids = [];
        }
        if (this.terrainGrids) {
            this.terrainGrids.forEach(g => this.scene.remove(g.mesh));
            this.terrainGrids = [];
        }

        // Canvas-based texture for grass / dirt surface.
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#3c7a3c';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add small noise splotches
        for (let i = 0; i < 12000; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const alpha = 0.05 + Math.random() * 0.15;
            const size = 1 + Math.random() * 3;
            ctx.fillStyle = `rgba(35, 60, 38, ${alpha})`;
            ctx.fillRect(x, y, size, size);
        }

        const groundTexture = new THREE.CanvasTexture(canvas);
        groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(300, 300);
        groundTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

        const terrainGeometry = new THREE.PlaneGeometry(1200000, 1200000, 200, 200);
        const terrainMaterial = new THREE.MeshStandardMaterial({
            map: groundTexture,
            roughness: 1.0,
            metalness: 0.0,
        });

        // Displace vertices for hills and a few peaks.
        for (let i = 0; i < terrainGeometry.attributes.position.count; i++) {
            const x = terrainGeometry.attributes.position.getX(i);
            const y = terrainGeometry.attributes.position.getY(i);

            const hillBase = Math.sin(x * 0.00009) * 40 + Math.cos(y * 0.00011) * 40;
            const mountain = Math.max(0, 1 - Math.hypot(x * 0.00001, y * 0.00001)) * 250;
            const noise = (Math.random() - 0.5) * 8;

            const height = hillBase + mountain + noise;
            terrainGeometry.attributes.position.setZ(i, height);
        }
        terrainGeometry.computeVertexNormals();

        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.y = -20;
        terrain.receiveShadow = true;
        this.scene.add(terrain);

        this.terrainGrids = [{ mesh: terrain, gridSize: 1200000, baseY: -20 }];

        // Add a few mountain cones with larger size/darker top for visual landmarks.
        this.hills = [];
        for (let i = 0; i < 25; i++) {
            const radius = 400 + Math.random() * 1200;
            const height = 140 + Math.random() * 420;
            const hillGeo = new THREE.ConeGeometry(radius, height, 32);
            const hillMat = new THREE.MeshStandardMaterial({
                color: 0x2e582e,
                roughness: 1.0,
                metalness: 0.0
            });
            const hillMesh = new THREE.Mesh(hillGeo, hillMat);
            hillMesh.position.set(
                (Math.random() - 0.5) * 100000,
                height * 0.5 - 20,
                (Math.random() - 0.5) * 100000
            );
            hillMesh.rotateY(Math.random() * Math.PI * 2);
            hillMesh.castShadow = true;
            hillMesh.receiveShadow = true;
            this.scene.add(hillMesh);
            this.hills.push(hillMesh);
        }
    }

    createAircraft() {
        console.log('Loading aircraft model...');
        
        // Create default model first
        this.createDefaultAircraft();
        console.log('Default B2-Bomber arrow model created');
        
        // Update status
        if (document.getElementById('model-status')) {
            document.getElementById('model-status').textContent = '✓ Su-30 Ready';
            document.getElementById('model-status').style.color = '#00ff00';
        }
    }

    loadGLTFModel() {
        console.log('Attempting to load GLTF model...');
        
        try {
            // Detect available GLTF loader (support globals added by non-module examples or our fallback)
            const LoaderClass = (typeof GLTFLoader !== 'undefined' && GLTFLoader) ||
                                (typeof THREE !== 'undefined' && THREE.GLTFLoader) ||
                                (typeof window !== 'undefined' && window.GLTFLoader) ||
                                null;

            if (!LoaderClass) {
                console.warn('GLTFLoader not available');
                this.addMessage('GLTFLoader not found');
                return;
            }

            console.log('Using GLTF loader:', LoaderClass.name || LoaderClass);
            const loader = new LoaderClass();

            loader.load(
                'sukhoi_su-30/scene.gltf',
                (gltf) => {
                    console.log('✓ Successfully loaded sukhoi_su-30/scene.gltf');
                    console.log('GLTF Object:', gltf);
                    
                    if (!gltf.scene) {
                        console.error('No scene in loaded model');
                        return;
                    }
                    
                    // Clear default model
                    while (this.f22Model.children.length > 0) {
                        this.f22Model.remove(this.f22Model.children[0]);
                    }
                    
                    // Add loaded model
                    const loadedScene = gltf.scene;
                    console.log('Loaded scene children:', loadedScene.children.length);
                    
                    loadedScene.traverse((node) => {
                        if (node.isMesh) {
                            node.castShadow = true;
                            node.receiveShadow = true;
                            if (!node.material) {
                                node.material = new THREE.MeshPhongMaterial({color: 0xcccccc});
                            }
                            console.log('Found mesh:', node.name, 'geometry:', node.geometry, 'material:', node.material);
                        }
                    });
                    
                    // Scale and add the entire loaded scene
                    loadedScene.scale.set(2, 2, 2);
                    this.f22Model.add(loadedScene);
                    
                    console.log('Su-30 model successfully added to scene');
                    this.addMessage('✓ Su-30 Model Loaded');
                    if (document.getElementById('model-status')) {
                        document.getElementById('model-status').textContent = '✓ Su-30 Model Loaded';
                        document.getElementById('model-status').style.color = '#00ff00';
                    }
                },
                (progressEvent) => {
                    if (progressEvent.lengthComputable) {
                        const percentComplete = (progressEvent.loaded / progressEvent.total * 100);
                        console.log('Loading: ' + percentComplete.toFixed(1) + '%');
                    }
                },
                (error) => {
                    console.error('✗ Failed to load sukhoi_su-30/scene.gltf:', error);
                    console.error('Error stack:', error.stack);
                    this.addMessage('Model load failed - check console');
                    if (document.getElementById('model-status')) {
                        document.getElementById('model-status').textContent = '✗ Su-30 Load Failed';
                        document.getElementById('model-status').style.color = '#ff0000';
                    }
                }
            );
        } catch (error) {
            console.error('Exception in loadGLTFModel:', error);
            this.addMessage('Error: ' + error.message);
        }
    }

    createDefaultAircraft() {
        // If model already exists (from GLTF load), don't create default
        if (this.f22Model && this.f22Model.children.length > 0) {
            return;
        }

        console.log('Creating Su-30 aircraft model');
        
        // Create actual Su-30 Flanker shape
        this.f22Model = new THREE.Group();

        // Main fuselage - elongated body pointing forward (Z+)
        const fuselageGeometry = new THREE.BoxGeometry(8, 2, 20);
        const fuselageMaterial = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 40 });
        const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
        fuselage.castShadow = true;
        fuselage.receiveShadow = true;
        this.f22Model.add(fuselage);

        // Nose cone (pointed forward in +Z direction)
        const noseGeometry = new THREE.ConeGeometry(4, 8, 8);
        const noseMaterial = new THREE.MeshPhongMaterial({ color: 0x2a2a2a, shininess: 50 });
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        nose.rotation.x = Math.PI / 2; // point nose toward +Z
        nose.position.z = 14;
        nose.castShadow = true;
        this.f22Model.add(nose);

        // Wings - large delta wings for flying wing appearance
        const wingGeometry = new THREE.BoxGeometry(40, 1, 25);
        const wingMaterial = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 30 });
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.position.y = -0.5;
        wings.castShadow = true;
        wings.receiveShadow = true;
        this.f22Model.add(wings);

        // Cockpit bubble (on top, forward)
        const cockpitGeometry = new THREE.SphereGeometry(2, 8, 8);
        const cockpitMaterial = new THREE.MeshPhongMaterial({ color: 0x4488ff, transparent: true, opacity: 0.7, shininess: 80 });
        const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
        cockpit.position.set(0, 2, 3);
        cockpit.scale.set(1.5, 1, 1.8);
        cockpit.castShadow = true;
        this.f22Model.add(cockpit);

        // Engine inlets on wings
        const inletGeometry = new THREE.ConeGeometry(2.5, 3, 8);
        const inletMaterial = new THREE.MeshPhongMaterial({ color: 0x0a0a0a, shininess: 20 });
        
        const leftInlet = new THREE.Mesh(inletGeometry, inletMaterial);
        leftInlet.position.set(-12, 0.5, 2);
        leftInlet.rotation.x = -Math.PI / 2;
        leftInlet.castShadow = true;
        this.f22Model.add(leftInlet);

        const rightInlet = new THREE.Mesh(inletGeometry, inletMaterial);
        rightInlet.position.set(12, 0.5, 2);
        rightInlet.rotation.x = -Math.PI / 2;
        rightInlet.castShadow = true;
        this.f22Model.add(rightInlet);

        // Engine nozzles at rear pointing backward (Z-)
        const nozzleGeometry = new THREE.ConeGeometry(1.5, 3, 12);
        const nozzleMaterial = new THREE.MeshPhongMaterial({ color: 0x0a0a0a, shininess: 10 });
        
        const leftNozzle = new THREE.Mesh(nozzleGeometry, nozzleMaterial);
        leftNozzle.position.set(-6, -1.5, -12);
        leftNozzle.rotation.x = -Math.PI / 2; // Point backward (toward -Z)
        leftNozzle.castShadow = true;
        this.f22Model.add(leftNozzle);

        const rightNozzle = new THREE.Mesh(nozzleGeometry, nozzleMaterial);
        rightNozzle.position.set(6, -1.5, -12);
        rightNozzle.rotation.x = -Math.PI / 2; // Point backward (toward -Z)
        rightNozzle.castShadow = true;
        this.f22Model.add(rightNozzle);

        // Thrust flames - at rear, pointing backward (-Z direction)
        // Left engine thrust
        this.thrustFlameLeft = new THREE.Group();
        this.thrustFlameLeft.position.set(-6, -1.5, -15);
        
        const flameMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff6600,
            emissive: 0xffaa00
        });
        const flameGeometry = new THREE.ConeGeometry(1.8, 6, 16);
        const flameLeft = new THREE.Mesh(flameGeometry, flameMaterial);
        flameLeft.rotation.x = -Math.PI / 2; // Point backward -Z
        flameLeft.position.z = -3;
        this.thrustFlameLeft.add(flameLeft);
        
        const flameGeometry2 = new THREE.ConeGeometry(1, 4, 16);
        const flameMaterial2 = new THREE.MeshBasicMaterial({ 
            color: 0xffff00,
            emissive: 0xffff00
        });
        const flameLeft2 = new THREE.Mesh(flameGeometry2, flameMaterial2);
        flameLeft2.rotation.x = -Math.PI / 2;
        flameLeft2.position.z = -4.5;
        this.thrustFlameLeft.add(flameLeft2);
        
        this.thrustFlameLeft.scale.set(0, 0, 0);
        this.f22Model.add(this.thrustFlameLeft);

        // Right engine thrust
        this.thrustFlameRight = new THREE.Group();
        this.thrustFlameRight.position.set(6, -1.5, -15);
        
        const flameRight = new THREE.Mesh(flameGeometry, flameMaterial);
        flameRight.rotation.x = -Math.PI / 2;
        flameRight.position.z = -3;
        this.thrustFlameRight.add(flameRight);
        
        const flameRight2 = new THREE.Mesh(flameGeometry2, flameMaterial2);
        flameRight2.rotation.x = -Math.PI / 2;
        flameRight2.position.z = -4.5;
        this.thrustFlameRight.add(flameRight2);
        
        this.thrustFlameRight.scale.set(0, 0, 0);
        this.f22Model.add(this.thrustFlameRight);

        // Make the model big enough to see easily
        this.f22Model.scale.set(2.5, 2.5, 2.5);
        this.scene.add(this.f22Model);
    }

    createEnemies() {
        // Create 2 enemy aircraft as simple groups
        for (let i = 0; i < 2; i++) {
            const enemy = {
                position: new THREE.Vector3(
                    Math.random() * 5000 - 2500,
                    8000 + Math.random() * 3000,
                    -10000 - Math.random() * 5000
                ),
                velocity: new THREE.Vector3(50 + Math.random() * 30, 0, 50),
                rotation: new THREE.Euler(0, 0, 0),
                model: null,
                health: 100,
                missiles: 2,
                lastShot: 0,
                targetPlayer: false
            };

            const enemyModel = new THREE.Group();
            const fuselage = new THREE.Mesh(
                new THREE.ConeGeometry(1.5, 15, 8),
                new THREE.MeshPhongMaterial({ color: 0x883333 })
            );
            fuselage.castShadow = true;
            enemyModel.add(fuselage);

            const wing = new THREE.Mesh(
                new THREE.BoxGeometry(20, 0.8, 6),
                new THREE.MeshPhongMaterial({ color: 0x662222 })
            );
            wing.castShadow = true;
            enemyModel.add(wing);

            enemyModel.position.copy(enemy.position);
            this.scene.add(enemyModel);
            enemy.model = enemyModel;

            this.enemies.push(enemy);
        }
    }

    setupInput() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            
            // Special keys
            if (e.code === 'Space') {
                this.fireWeapon();
            }
            if (e.key === 'b' || e.key === 'B') {
                this.aircraft.afterburner = !this.aircraft.afterburner;
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // Mouse controls
            this.isLeftMouseDown = false;
            this.isRightMouseDown = false;

            document.addEventListener('mousemove', (e) => {
                this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
                this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;

                // Right mouse pan (third-person only)
                if (this.isRightMouseDown && this.cameraMode === 1) {
                    const dx = e.clientX - this.lastMouseX;
                    const dy = e.clientY - this.lastMouseY;

                    const panSpeed = 0.05 * this.controlSensitivity;
                this.cameraPanY = Math.max(-200, Math.min(200, this.cameraPanY + dy * panSpeed));
                this.cameraPanZ = Math.max(-250, Math.min(250, this.cameraPanZ + dy * panSpeed * 0.25));
            }

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        // Mouse wheel to zoom in/out when in third-person follow camera
        document.addEventListener('wheel', (e) => {
            const delta = Math.sign(e.deltaY);
            this.cameraFollowDistance = Math.max(20, Math.min(180, (this.cameraFollowDistance || this.cameraDistance || 60) + delta * 4));
            this.orbitDistance = this.cameraFollowDistance; // keep any legacy behavior aligned
        }, { passive: true });

        document.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                this.isRightMouseDown = true;
                this.cameraRightHold = true;
                this.rotatingCamera = true;

                // freeze current camera pose while right button is held
                this.cameraHoldPosition.copy(this.camera.position);
                const forward = this.camera.getWorldDirection(new THREE.Vector3()).normalize();
                this.cameraHoldLookAt.copy(this.camera.position).add(forward.multiplyScalar(200));
            } else if (e.button === 0) {
                this.isLeftMouseDown = true;
                this.mouseDown = true;
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                this.isRightMouseDown = false;
                this.cameraRightHold = false;
                this.rotatingCamera = false;
            } else if (e.button === 0) {
                this.isLeftMouseDown = false;
                this.mouseDown = false;
            }
        });

        // Clear on window leave to avoid stuck mouse state.
        document.addEventListener('mouseleave', () => {
            this.isLeftMouseDown = false;
            this.isRightMouseDown = false;
            this.mouseDown = false;
            this.rotatingCamera = false;
        });

        // Prevent context menu when using right-drag
        document.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    updateControls() {
        // Target values based on input
        let targetPitch = 0;
        let targetRoll = 0;
        let targetYaw = 0;

        // Keyboard controls - direct input
        // Respect invertKeys setting
        if (this.keys['w']) targetPitch += this.invertKeys ? 1 : -1;
        if (this.keys['s']) targetPitch += this.invertKeys ? -1 : 1;
        if (this.keys['a']) targetRoll += this.invertKeys ? 1 : -1;
        if (this.keys['d']) targetRoll += this.invertKeys ? -1 : 1;
        if (this.keys['q']) targetYaw -= 1;
        if (this.keys['e']) targetYaw += 1;

        // Mouse controls - only when left button is down for precision (right button is camera pan mode)
        if (this.isLeftMouseDown) {
            targetPitch += (this.mouseY * 0.22) * this.controlSensitivity; // slower response
            targetRoll += (-this.mouseX * 0.22) * this.controlSensitivity; // slower response
        }

        // Clamp target values
        targetPitch = Math.max(-1, Math.min(1, targetPitch));
        targetRoll = Math.max(-1, Math.min(1, targetRoll));
        targetYaw = Math.max(-1, Math.min(1, targetYaw));

        // Smooth interpolation to target values (much smoother)
        const smoothFactor = this.controlSmoothFactor;
        this.aircraft.pitchControl += (targetPitch * this.controlSensitivity - this.aircraft.pitchControl) * smoothFactor;
        this.aircraft.rollControl += (targetRoll * this.controlSensitivity - this.aircraft.rollControl) * smoothFactor;
        this.aircraft.yawControl += (targetYaw * this.controlSensitivity - this.aircraft.yawControl) * smoothFactor;

        // Throttle (Up/Down arrows) - faster response
        if (this.keys['arrowup']) this.aircraft.throttle = Math.min(1, this.aircraft.throttle + 0.08 * this.controlSensitivity);
        if (this.keys['arrowdown']) this.aircraft.throttle = Math.max(0, this.aircraft.throttle - 0.08 * this.controlSensitivity);
    }

    calculateAirDensity(altitude) {
        // Barometric formula for air density at altitude
        const altitudeKm = altitude / 1000;
        return this.airDensity * Math.exp(-altitudeKm / 8.5);
    }

    calculateSpeedOfSound(altitude) {
        // Speed of sound decreases with altitude (temperature)
        const temp = 288.15 - 0.0065 * altitude;
        return Math.sqrt(1.4 * 287 * Math.max(temp, 216.65));
    }

    updatePhysics(deltaTime) {
        const aircraft = this.aircraft;

        // Current air density and speed of sound
        const airDensity = this.calculateAirDensity(aircraft.position.y);
        const speedOfSound = this.calculateSpeedOfSound(aircraft.position.y);

        // Velocity magnitude
        const speed = aircraft.velocity.length();
        const mach = speed / speedOfSound;

        // Thrust calculation
        if (aircraft.fuel > 0) {
            const thrustMultiplier = aircraft.afterburner ? 1.5 : 1.0;
            aircraft.currentThrust = aircraft.throttle * aircraft.normalThrust * thrustMultiplier;
            
            // Fuel consumption
            const fuelBurn = (aircraft.throttle * 0.02 + (aircraft.afterburner ? 0.03 : 0)) * deltaTime;
            aircraft.fuel = Math.max(0, aircraft.fuel - fuelBurn);
        } else {
            aircraft.currentThrust = 0;
            aircraft.throttle = 0;
        }

        // Thrust vector (in aircraft forward direction, +Z)
        const forwardDir = new THREE.Vector3(0, 0, 1).applyEuler(aircraft.rotation).normalize();
        const upDir = new THREE.Vector3(0, 1, 0).applyEuler(aircraft.rotation).normalize();
        const rightDir = new THREE.Vector3(1, 0, 0).applyEuler(aircraft.rotation).normalize();

        const thrustVector = forwardDir.clone().multiplyScalar(aircraft.currentThrust / aircraft.mass);

        // Dynamic pressure
        const dynamicPressure = 0.5 * airDensity * speed * speed;

        // Drag calculation
        let dragForce = 0;
        if (speed > 0.5) {
            let effectiveDragCoeff = aircraft.dragCoefficient;
            if (aircraft.afterburner) effectiveDragCoeff *= 1.2;
            dragForce = dynamicPressure * aircraft.wingArea * effectiveDragCoeff / aircraft.mass;
        }

        const dragVector = aircraft.velocity.length() > 0.1 ?
            aircraft.velocity.clone().normalize().multiplyScalar(-dragForce) :
            new THREE.Vector3(0, 0, 0);

        // Lift calculation using angle of attack and velocity direction
        let liftVector = new THREE.Vector3(0, 0, 0);
        if (speed > 10) {
            const velocityDir = aircraft.velocity.clone().normalize();
            const aoa = Math.acos(Math.max(-1, Math.min(1, forwardDir.dot(velocityDir))));
            const maxAoA = Math.PI / 4; // 45 degrees stall
            const aoaFactor = Math.max(0, 1 - (aoa / maxAoA));

            const liftMag = dynamicPressure * aircraft.wingArea * aircraft.liftCoefficient * aoaFactor / aircraft.mass;
            const liftDirection = new THREE.Vector3().crossVectors(velocityDir, rightDir).cross(velocityDir).normalize();
            if (isNaN(liftDirection.x) || liftDirection.length() < 0.0001) {
                liftDirection.copy(upDir);
            }
            liftVector = liftDirection.multiplyScalar(liftMag);

            // Add moderate pitch-based lift shift for intuitive handling
            const pitchLift = upDir.clone().multiplyScalar(aircraft.pitchControl * 0.6 * Math.abs(aircraft.pitchControl) * 0.002);
            liftVector.add(pitchLift);
        }

        // Gravity
        const gravityVector = new THREE.Vector3(0, -this.gravity, 0);

        // Aerodynamic side-slip damping & alignment
        if (aircraft.velocity.length() > 1) {
            const lateral = aircraft.velocity.clone().sub(forwardDir.clone().multiplyScalar(aircraft.velocity.dot(forwardDir)));
            const damping = lateral.clone().multiplyScalar(-0.09);
            liftVector.add(damping);
        }

        // Angular acceleration from control inputs (MUCH more responsive)
        const angularAccel = new THREE.Vector3(
            aircraft.pitchControl * 3.5,
            aircraft.yawControl * 2.8,
            aircraft.rollControl * 3.5
        );

        // Apply lighter damping for snappier control response
        aircraft.angularVelocity.multiplyScalar(0.9);
        aircraft.angularVelocity.add(angularAccel.multiplyScalar(deltaTime * 4.0));

        // Limit angular velocity (higher limits for snappier response)
        const maxAngularVel = aircraft.afterburner ? 8 : 7;
        if (aircraft.angularVelocity.length() > maxAngularVel) {
            aircraft.angularVelocity.normalize().multiplyScalar(maxAngularVel);
        }

        // Update rotation
        aircraft.rotation.x += aircraft.angularVelocity.x * deltaTime;
        aircraft.rotation.y += aircraft.angularVelocity.y * deltaTime;
        aircraft.rotation.z += aircraft.angularVelocity.z * deltaTime;

        // Remove hard clamps so full loops are possible. Euler will continue beyond 180°.
        // Optionally wrap z to keep values stable.
        if (aircraft.rotation.z > Math.PI) aircraft.rotation.z -= Math.PI * 2;
        if (aircraft.rotation.z < -Math.PI) aircraft.rotation.z += Math.PI * 2;

        // Total acceleration
        const totalAccel = new THREE.Vector3()
            .add(thrustVector)
            .add(dragVector)
            .add(gravityVector)
            .add(liftVector);

        // Update velocity
        aircraft.velocity.add(totalAccel.multiplyScalar(deltaTime));

        // Limit max speed (speed of sound * 2.0 for atmospheric realism)
        const maxSpeed = speedOfSound * 2.0;
        if (aircraft.velocity.length() > maxSpeed) {
            aircraft.velocity.normalize().multiplyScalar(maxSpeed);
        }

        // Align velocity with aircraft forward direction (aerodynamic turning)
        const noseDir = new THREE.Vector3(0, 0, 1).applyEuler(aircraft.rotation).normalize();
        const speedValue = aircraft.velocity.length();
        if (speedValue > 1) {
            const desiredVel = noseDir.clone().multiplyScalar(speedValue);
            // steering toward forward direction
            aircraft.velocity.lerp(desiredVel, Math.min(1, 0.35 * deltaTime * 60));
        }

        // Add small air resistance component (drag is orientation-aware)
        if (aircraft.velocity.length() > 1) {
            const airResistance = aircraft.velocity.clone().multiplyScalar(-0.0008 * airDensity);
            aircraft.velocity.add(airResistance);
        }

        // Update position
        aircraft.position.add(aircraft.velocity.clone().multiplyScalar(deltaTime));

        // Altitude boundary
        if (aircraft.position.y < 0) {
            aircraft.position.y = 0;
            aircraft.velocity.y = 0;
            this.addMessage('CRASHED!');
            this.resetAircraft();
        }

        // Update model position and rotation
        this.f22Model.position.copy(aircraft.position);
        this.f22Model.rotation.copy(aircraft.rotation);

        // Update grids to follow aircraft (creates scrolling effect)
        // The grids follow the X and Z position but stay at their base altitudes
        if (this.grids) {
            this.grids.forEach(gridData => {
                // Follow aircraft horizontally (X, Z)
                gridData.mesh.position.x = aircraft.position.x;
                gridData.mesh.position.z = aircraft.position.z;
                // Keep altitude fixed at base level
                gridData.mesh.position.y = gridData.baseAltitude;
            });
        }

        // Update ground plane grid to follow aircraft
        for (const gridData of this.terrainGrids) {
            const grid = gridData.mesh;
            grid.position.x = aircraft.position.x;
            grid.position.z = aircraft.position.z;
            grid.position.y = gridData.baseY;
        }
    }

    updateEnemies(deltaTime) {
        for (const enemy of this.enemies) {
            if (enemy.health <= 0) continue;

            // Simple AI - move toward player
            const dirToPlayer = this.aircraft.position.clone().sub(enemy.position).normalize();
            enemy.velocity.copy(dirToPlayer.multiplyScalar(100));

            // Update position
            enemy.position.add(enemy.velocity.clone().multiplyScalar(deltaTime));

            // Look at player
            const targetDir = this.aircraft.position.clone().sub(enemy.position);
            const distance = targetDir.length();
            
            if (distance > 50) {
                targetDir.normalize();
                const angle = Math.atan2(targetDir.x, targetDir.z);
                enemy.rotation.y = angle;
                enemy.rotation.x = -Math.atan2(targetDir.y, new THREE.Vector2(targetDir.x, targetDir.z).length());
            }

            // Update model
            enemy.model.position.copy(enemy.position);
            enemy.model.rotation.copy(enemy.rotation);

            // Enemy tries to shoot
            if (Math.random() > 0.99 && distance < 20000) {
                this.fireEnemyWeapon(enemy);
            }
        }
    }

    fireWeapon() {
        if (this.aircraft.missiles > 0) {
            const now = Date.now();
            if (now - this.aircraft.lastShotTime > 500) {
                this.aircraft.missiles--;
                this.aircraft.lastShotTime = now;
                this.addMessage('MISSILE FIRED');

                // Create missile trail effect
                this.createMissileTrail();
            }
        }
    }

    fireEnemyWeapon(enemy) {
        if (enemy.missiles > 0) {
            enemy.missiles--;
            this.addMessage('INCOMING MISSILE!');
        }
    }

    createMissileTrail() {
        // Create a visual missile trail
        const trailGeometry = new THREE.BufferGeometry();
        const positions = [
            0, 0, 0,
            0, 0, 100
        ];
        trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        
        const trailMaterial = new THREE.LineBasicMaterial({ color: 0xff6600 });
        const trail = new THREE.Line(trailGeometry, trailMaterial);
        
        // Position at aircraft rear
        const worldPos = this.f22Model.getWorldPosition(new THREE.Vector3());
        trail.position.copy(worldPos);
        trail.rotation.copy(this.f22Model.rotation);
        
        this.scene.add(trail);
        
        // Remove after short time
        setTimeout(() => this.scene.remove(trail), 2000);
    }

    updateCamera() {
        const aircraft = this.aircraft;

        // If we ever support multiple modes, keep this as game-centered third-person follow
        // Using spring-damped camera to avoid instant jumps and feel more natural like modern games.
        const forwardDir = new THREE.Vector3(0, 0, 1).applyEuler(aircraft.rotation).normalize();
        const upDir = new THREE.Vector3(0, 1, 0).applyEuler(aircraft.rotation).normalize();
        const rightDir = new THREE.Vector3(1, 0, 0).applyEuler(aircraft.rotation).normalize();

        // Orbit distance still controls aggressiveness of follow distance
        const followDistance = this.cameraFollowDistance || this.orbitDistance || 60;

        // Desired camera position is behind and above the plane, with optional pan offset.
        const desiredCamPos = aircraft.position.clone()
            .add(forwardDir.clone().multiplyScalar(-followDistance))
            .add(upDir.clone().multiplyScalar(this.cameraFollowHeight))
            .add(rightDir.clone().multiplyScalar(this.cameraPanX * 0.05))
            .add(upDir.clone().multiplyScalar(this.cameraPanY * 0.035))
            .add(forwardDir.clone().multiplyScalar(this.cameraPanZ * 0.03));

        if (this.cameraRightHold) {
            // When right button is held, lock the camera movement and only apply pan offsets.
            this.camera.position.copy(this.cameraHoldPosition);
            this.camera.position.add(new THREE.Vector3(this.cameraPanX * 0.02, this.cameraPanY * 0.02, this.cameraPanZ * 0.02));
            this.camera.lookAt(this.cameraHoldLookAt);
            return;
        }

        // Smooth movement toward desired position
        this.camera.position.lerp(desiredCamPos, this.cameraFollowSpeed);

        // Look at a point ahead of aircraft for better anticipation in turns
        const lookAhead = aircraft.position.clone()
            .add(forwardDir.clone().multiplyScalar(this.cameraFollowLookAhead))
            .add(this.cameraLookAtOffset);

        this.camera.lookAt(lookAhead);

        // Apply small incremental yaw/pitch from right-button panning for fine adjustments
        if (this.cameraMode !== 1) {
            // fallback safety: keep existing behavior for other modes
            this.camera.position.copy(aircraft.position).add(desiredCamPos);
            this.camera.lookAt(aircraft.position.clone().add(new THREE.Vector3(0, 5, 0)));
        }
    }

    updateHUD() {
        const aircraft = this.aircraft;
        const airDensity = this.calculateAirDensity(aircraft.position.y);
        const speedOfSound = this.calculateSpeedOfSound(aircraft.position.y);
        const speed = aircraft.velocity.length();
        const mach = speed / speedOfSound;

        // Speed in knots (1 m/s = 1.94384 knots)
        const speedKnots = speed * 1.94384;

        // G-Force calculation
        const gForce = aircraft.velocity.length() > 10 ? 
            Math.sqrt(
                aircraft.angularVelocity.x ** 2 +
                aircraft.angularVelocity.y ** 2 +
                aircraft.angularVelocity.z ** 2
            ) / 9.81 : 1;

        // Update HUD elements
        document.getElementById('speed-value').textContent = Math.floor(speedKnots);
        document.getElementById('mach-value').textContent = mach.toFixed(2);
        document.getElementById('altitude-value').textContent = Math.floor(aircraft.position.y * 3.28084); // Convert to feet
        document.getElementById('missile-count').textContent = aircraft.missiles;
        document.getElementById('fuel-value').textContent = Math.floor(aircraft.fuel);
        document.getElementById('gforce-value').textContent = gForce.toFixed(1);
        document.getElementById('heading-value').textContent = Math.floor((aircraft.rotation.y * 180 / Math.PI + 360) % 360);
        document.getElementById('throttle-value').textContent = Math.floor(aircraft.throttle * 100);
    }

    addMessage(text) {
        const messagesDiv = document.getElementById('messages');
        const message = document.createElement('div');
        message.className = 'message';
        message.textContent = text;
        messagesDiv.appendChild(message);
        setTimeout(() => message.remove(), 3000);
        
        // Also update model status if relevant
        if (text.includes('Model') || text.includes('model')) {
            const statusDiv = document.getElementById('model-status');
            if (statusDiv) {
                statusDiv.textContent = text;
                statusDiv.style.color = text.includes('Loaded') ? '#00ff00' : '#ff6600';
            }
        }
    }

    resetAircraft() {
        this.aircraft.position.set(0, 3000, 0);
        this.aircraft.velocity.set(0, 0, 200); // Start moving forward along nose (+Z)
        this.aircraft.rotation.set(0, 0, 0);
        this.aircraft.fuel = 100;
        this.aircraft.missiles = 4;
        this.aircraft.throttle = 0.75; // Start with 75% throttle
        this.aircraft.afterburner = false;
    }

    onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const currentTime = performance.now();
        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 1 / 30); // Cap at 30 FPS min
        this.lastTime = currentTime;

        if (!this.paused) {
            this.updateControls();
            this.updatePhysics(deltaTime);
            this.updateEnemies(deltaTime);
            this.time += deltaTime;
            
            // Update model position and rotation
            if (this.f22Model) {
                this.f22Model.position.copy(this.aircraft.position);
                this.f22Model.rotation.copy(this.aircraft.rotation);
                
                // Update thrust visualization
                const throttleIntensity = this.aircraft.throttle;
                const flameLengthMultiplier = 1 + throttleIntensity * 2;
                
                if (this.thrustFlameLeft) {
                    this.thrustFlameLeft.scale.set(
                        throttleIntensity,
                        throttleIntensity,
                        throttleIntensity * flameLengthMultiplier
                    );
                    this.thrustFlameLeft.position.z = -11 - throttleIntensity * 4;
                }
                
                if (this.thrustFlameRight) {
                    this.thrustFlameRight.scale.set(
                        throttleIntensity,
                        throttleIntensity,
                        throttleIntensity * flameLengthMultiplier
                    );
                    this.thrustFlameRight.position.z = -11 - throttleIntensity * 4;
                }
            }
            
            // Update terrain grids to follow aircraft
            if (this.grids) {
                this.grids.forEach(grid => {
                    grid.mesh.position.x = Math.floor(this.aircraft.position.x / grid.size) * grid.size;
                    grid.mesh.position.z = Math.floor(this.aircraft.position.z / grid.size) * grid.size;
                });
            }
        }

        this.updateCamera();
        this.updateHUD();
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize simulator when page loads
window.addEventListener('load', () => {
    console.log('Page loaded, initializing simulator');
    try {
        new Su30FlightSimulator();
    } catch (error) {
        console.error('Fatal error:', error);
        alert('Fatal error initializing simulator: ' + error.message);
    }
});
