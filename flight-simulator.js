// F-22 Raptor Flight Simulator
// Realistic flight mechanics with combat capabilities

class F22FlightSimulator {
    constructor() {
        console.log('Initializing F-22 Flight Simulator...');
        
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
            this.orbitDistance = 60;

            // Controls tuning
            this.controlSensitivity = 1.5; // multiplier for keyboard/mouse (reduced for smoother feel)
            this.controlSmoothFactor = 0.15; // smoothing interpolation (higher = smoother, more responsive)
            this.invertKeys = true; // invert key controls as requested
            this.targetPitch = 0;
            this.targetRoll = 0;

            // Sky and environment
            this.setupEnvironment();
            console.log('Environment setup complete');

            // Aircraft state
            this.aircraft = {
                position: new THREE.Vector3(0, 3000, 0), // Start at 3,000 feet for better initial visibility
                velocity: new THREE.Vector3(150, 0, 0),
                acceleration: new THREE.Vector3(0, 0, 0),
                rotation: new THREE.Euler(0, 0, 0),
                angularVelocity: new THREE.Vector3(0, 0, 0),
                
                // Flight parameters
                mass: 15000, // kg (reduced for faster acceleration)
                maxThrust: 400000, // N (increased thrust)
                normalThrust: 180000, // N (increased military power)
                currentThrust: 0,
                throttle: 0.6, // Start with 60% throttle for immediate movement
                afterburner: false,
                
                // Aerodynamic properties
                wingArea: 78.04, // m^2
                dragCoefficient: 0.015,
                liftCoefficient: 0.5,
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
            this.gravity = 9.81;
            this.airDensity = 1.225; // kg/m^3 at sea level
            this.speedOfSound = 343; // m/s at sea level

            // Input handling
            this.keys = {};
            this.setupInput();
            console.log('Input setup complete');

            // Camera control
            this.cameraMode = 0; // 0: first person, 1: third person
            this.cameraDistance = 50;

            // Targeting system
            this.targets = [];
            this.targetLocked = null;
            this.targetDistance = Infinity;

            // Game state
            this.paused = false;
            this.time = 0;

            // Enemy aircraft
            this.enemies = [];
            this.createEnemies();
            console.log('Enemies created');

            // Handle window resize
            window.addEventListener('resize', () => this.onWindowResize());

            // Start animation loop
            console.log('Starting animation loop');
            this.animate();
            
            // Delay model loading slightly to ensure everything is initialized
            setTimeout(() => {
                this.loadGLTFModel();
            }, 1000);
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
    }

    createTerrainGrid() {
        // Create infinite scrolling grid system for motion cues (like geo-fs)
        
        // Multiple grids at different altitudes for depth perception
        const gridConfigs = [
            { altitude: -500, size: 8000, divisions: 40, color1: 0x00dd99, color2: 0x004433 },
            { altitude: -2000, size: 12000, divisions: 30, color1: 0x00aa77, color2: 0x003322 },
            { altitude: -4000, size: 20000, divisions: 20, color1: 0x008855, color2: 0x002211 },
        ];

        this.grids = [];

        // Create scrolling grids using GridHelper
        gridConfigs.forEach(config => {
            const gridHelper = new THREE.GridHelper(
                config.size,
                config.divisions,
                config.color1,
                config.color2
            );
            gridHelper.position.y = config.altitude;
            this.scene.add(gridHelper);

            this.grids.push({
                mesh: gridHelper,
                size: config.size,
                baseAltitude: config.altitude,
                divisions: config.divisions
            });
        });

        // Add ground plane as reference
        const groundGeometry = new THREE.PlaneGeometry(500000, 500000);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a4d1a,
            roughness: 0.9,
            metalness: 0.1,
            wireframe: false
        });
        const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.y = -5000;
        groundPlane.receiveShadow = true;
        this.scene.add(groundPlane);

        this.terrainGrids = [{ mesh: groundPlane, gridSize: 500000, baseY: -5000 }];
    }

    createAircraft() {
        console.log('Loading aircraft model...');
        
        // Create default model first
        this.createDefaultAircraft();
        console.log('Default model created');
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
                'f22_raptor.glb',
                (gltf) => {
                    console.log('✓ Successfully loaded f22_raptor.glb');
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
                            console.log('Found mesh:', node.name);
                        }
                    });
                    
                    // Add all children from loaded scene
                    loadedScene.children.forEach(child => {
                        this.f22Model.add(child.clone());
                    });
                    
                    console.log('F-22 model successfully added to scene');
                    this.addMessage('✓ F-22 Model Loaded');
                    if (document.getElementById('model-status')) {
                        document.getElementById('model-status').textContent = '✓ F-22 Model Loaded';
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
                    console.error('✗ Failed to load f22_raptor.glb:', error);
                    console.error('Error stack:', error.stack);
                    this.addMessage('Model load failed - check console');
                    if (document.getElementById('model-status')) {
                        document.getElementById('model-status').textContent = '✗ Load failed';
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

        console.log('Creating default F-22 model');
        
        // Create a simplified F-22 model using basic shapes (fallback)
        this.f22Model = new THREE.Group();

        // Fuselage
        const fuselageGeometry = new THREE.ConeGeometry(2, 20, 8);
        const fuselageMaterial = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 30 });
        const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
        fuselage.castShadow = true;
        fuselage.receiveShadow = true;
        this.f22Model.add(fuselage);

        // Wings
        const wingGeometry = new THREE.BoxGeometry(30, 1, 8);
        const wingMaterial = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 20 });
        
        const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
        leftWing.position.set(-8, 0, 0);
        leftWing.castShadow = true;
        leftWing.receiveShadow = true;
        this.f22Model.add(leftWing);

        const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
        rightWing.position.set(8, 0, 0);
        rightWing.castShadow = true;
        rightWing.receiveShadow = true;
        this.f22Model.add(rightWing);

        // Canopy
        const canopyGeometry = new THREE.SphereGeometry(1.5, 8, 8);
        const canopyMaterial = new THREE.MeshPhongMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6, shininess: 80 });
        const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
        canopy.position.set(0, 1.5, 3);
        canopy.castShadow = true;
        this.f22Model.add(canopy);

        // Tail
        const tailGeometry = new THREE.BoxGeometry(6, 8, 2);
        const tail = new THREE.Mesh(tailGeometry, wingMaterial);
        tail.position.set(0, 0, -9);
        tail.castShadow = true;
        tail.receiveShadow = true;
        this.f22Model.add(tail);

        // Vertical stabilizers
        const stabilizerGeometry = new THREE.BoxGeometry(1, 6, 2);
        const leftStabilizer = new THREE.Mesh(stabilizerGeometry, wingMaterial);
        leftStabilizer.position.set(-3, 2, -9);
        leftStabilizer.castShadow = true;
        this.f22Model.add(leftStabilizer);

        const rightStabilizer = new THREE.Mesh(stabilizerGeometry, wingMaterial);
        rightStabilizer.position.set(3, 2, -9);
        rightStabilizer.castShadow = true;
        this.f22Model.add(rightStabilizer);

        // Engines (visual only)
        const engineGeometry = new THREE.CylinderGeometry(1, 1.2, 3, 8);
        const engineMaterial = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 10 });
        
        const leftEngine = new THREE.Mesh(engineGeometry, engineMaterial);
        leftEngine.position.set(-3, -1, -5);
        leftEngine.castShadow = true;
        this.f22Model.add(leftEngine);

        const rightEngine = new THREE.Mesh(engineGeometry, engineMaterial);
        rightEngine.position.set(3, -1, -5);
        rightEngine.castShadow = true;
        this.f22Model.add(rightEngine);

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
            if (e.key === 'c' || e.key === 'C') {
                this.cameraMode = (this.cameraMode + 1) % 2;
            }
            if (e.key === 'b' || e.key === 'B') {
                this.aircraft.afterburner = !this.aircraft.afterburner;
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // Mouse controls
        document.addEventListener('mousemove', (e) => {
            const prevX = this.mouseX;
            const prevY = this.mouseY;
            this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;

            // If rotating camera (right mouse) and in third-person, adjust orbit offsets
            if (this.rotatingCamera && this.cameraMode === 1) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                this.cameraYaw -= dx * 0.005 * this.controlSensitivity;
                this.cameraPitch -= dy * 0.005 * this.controlSensitivity;
                this.cameraPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.cameraPitch));
            }

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        // Mouse wheel to zoom in/out when in third-person
        document.addEventListener('wheel', (e) => {
            // only adjust when not over inputs; always allow for convenience
            const delta = Math.sign(e.deltaY);
            this.orbitDistance = Math.max(10, Math.min(800, this.orbitDistance + delta * 6));
        }, { passive: true });

        document.addEventListener('mousedown', (e) => {
            // Right mouse button to orbit camera
            if (e.button === 2) {
                this.rotatingCamera = true;
            } else {
                this.mouseDown = true;
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                this.rotatingCamera = false;
            } else {
                this.mouseDown = false;
            }
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

        // Mouse controls - inverted pitch (moving mouse up = pitch up)
        targetPitch += (-this.mouseY * 1.0) * this.controlSensitivity;
        targetRoll += (this.mouseX * 1.0) * this.controlSensitivity;

        // Clamp target values
        targetPitch = Math.max(-1, Math.min(1, targetPitch));
        targetRoll = Math.max(-1, Math.min(1, targetRoll));
        targetYaw = Math.max(-1, Math.min(1, targetYaw));

        // Smooth interpolation to target values (much smoother)
        const smoothFactor = this.controlSmoothFactor;
        this.aircraft.pitchControl += (targetPitch * this.controlSensitivity - this.aircraft.pitchControl) * smoothFactor;
        this.aircraft.rollControl += (targetRoll * this.controlSensitivity - this.aircraft.rollControl) * smoothFactor;
        this.aircraft.yawControl += (targetYaw * this.controlSensitivity - this.aircraft.yawControl) * smoothFactor;

        // Throttle (Up/Down arrows) - also smooth
        if (this.keys['arrowup']) this.aircraft.throttle = Math.min(1, this.aircraft.throttle + 0.06 * this.controlSensitivity);
        if (this.keys['arrowdown']) this.aircraft.throttle = Math.max(0, this.aircraft.throttle - 0.06 * this.controlSensitivity);
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

        // Thrust vector (in aircraft forward direction)
        const thrustVector = new THREE.Vector3(0, 0, 1)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), aircraft.rotation.x)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), aircraft.rotation.y)
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), aircraft.rotation.z)
            .normalize()
            .multiplyScalar(aircraft.currentThrust / aircraft.mass);

        // Dynamic pressure
        const dynamicPressure = 0.5 * airDensity * speed * speed;

        // Lift calculation (perpendicular to velocity)
        let lift = 0;
        if (speed > 5) {
            const liftCoeff = aircraft.liftCoefficient + aircraft.pitchControl * 0.5;
            lift = dynamicPressure * aircraft.wingArea * liftCoeff / aircraft.mass;
        }

        // Drag calculation
        let dragForce = 0;
        if (speed > 0) {
            let effectiveDragCoeff = aircraft.dragCoefficient;
            if (aircraft.afterburner) effectiveDragCoeff *= 1.2;
            dragForce = dynamicPressure * aircraft.wingArea * effectiveDragCoeff / aircraft.mass;
        }

        // Drag vector (opposite to velocity)
        const dragVector = aircraft.velocity.clone().normalize().multiplyScalar(-dragForce);

        // Gravity
        const gravityVector = new THREE.Vector3(0, -this.gravity, 0);

        // Lift vector (up)
        const liftVector = new THREE.Vector3(0, lift, 0);

        // Angular acceleration from control inputs
        const angularAccel = new THREE.Vector3(
            aircraft.pitchControl * 1.2,
            aircraft.yawControl * 0.9,
            aircraft.rollControl * 1.2
        );

        // Apply stronger damping to angular velocity but allow snappier response
        aircraft.angularVelocity.multiplyScalar(0.8);
        aircraft.angularVelocity.add(angularAccel.multiplyScalar(deltaTime * 2.5));

        // Limit angular velocity
        const maxAngularVel = aircraft.afterburner ? 6 : 5;
        if (aircraft.angularVelocity.length() > maxAngularVel) {
            aircraft.angularVelocity.normalize().multiplyScalar(maxAngularVel);
        }

        // Update rotation
        aircraft.rotation.x += aircraft.angularVelocity.x * deltaTime;
        aircraft.rotation.y += aircraft.angularVelocity.y * deltaTime;
        aircraft.rotation.z += aircraft.angularVelocity.z * deltaTime;

        // Limit rotation angles
        aircraft.rotation.x = Math.max(-Math.PI, Math.min(Math.PI, aircraft.rotation.x));
        aircraft.rotation.z = Math.max(-Math.PI * 0.5, Math.min(Math.PI * 0.5, aircraft.rotation.z));

        // Total acceleration
        const totalAccel = new THREE.Vector3()
            .add(thrustVector)
            .add(dragVector)
            .add(gravityVector)
            .add(liftVector);

        // Update velocity
        aircraft.velocity.add(totalAccel.multiplyScalar(deltaTime));

        // Limit max speed (speed of sound * 2.4 for F-22 supercruise)
        const maxSpeed = speedOfSound * 2.4;
        if (aircraft.velocity.length() > maxSpeed) {
            aircraft.velocity.normalize().multiplyScalar(maxSpeed);
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
        
        if (this.cameraMode === 0) {
            // First person view
            const offset = new THREE.Vector3(0, 1.5, 3);
            offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), aircraft.rotation.x);
            offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), aircraft.rotation.y);
            offset.applyAxisAngle(new THREE.Vector3(0, 0, 1), aircraft.rotation.z);
            
            this.camera.position.copy(aircraft.position).add(offset);
            
            const lookAhead = new THREE.Vector3(0, 0, -100);
            lookAhead.applyAxisAngle(new THREE.Vector3(1, 0, 0), aircraft.rotation.x);
            lookAhead.applyAxisAngle(new THREE.Vector3(0, 1, 0), aircraft.rotation.y);
            lookAhead.applyAxisAngle(new THREE.Vector3(0, 0, 1), aircraft.rotation.z);
            
            this.camera.lookAt(aircraft.position.clone().add(lookAhead));
        } else {
            // Third person view (chase/orbit camera)
            const distance = this.orbitDistance || 60;

            // Compute spherical offset from yaw/pitch
            const yaw = this.cameraYaw + aircraft.rotation.y;
            const pitch = this.cameraPitch + aircraft.rotation.x * 0.3;

            const offset = new THREE.Vector3();
            // Place camera behind the aircraft (note the negated Z)
            offset.x = Math.sin(yaw) * distance * Math.cos(pitch);
            offset.z = -Math.cos(yaw) * distance * Math.cos(pitch);
            offset.y = Math.sin(pitch) * distance + 8;

            this.camera.position.copy(aircraft.position).add(offset);
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
        this.aircraft.velocity.set(150, 0, 0);
        this.aircraft.rotation.set(0, 0, 0);
        this.aircraft.fuel = 100;
        this.aircraft.missiles = 4;
        this.aircraft.throttle = 0.6; // Start with 60% throttle for movement
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

        const deltaTime = 1 / 60; // Assume 60 FPS

        if (!this.paused) {
            this.updateControls();
            this.updatePhysics(deltaTime);
            this.updateEnemies(deltaTime);
            this.time += deltaTime;
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
        new F22FlightSimulator();
    } catch (error) {
        console.error('Fatal error:', error);
        alert('Fatal error initializing simulator: ' + error.message);
    }
});
