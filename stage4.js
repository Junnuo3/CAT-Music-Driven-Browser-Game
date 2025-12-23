class Stage4 {
    constructor(onCompleteCallback) {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.onComplete = onCompleteCallback;
        this.clock = new THREE.Clock();
        
        // Asset arrays
        this.plantMeshes = [];
        this.birdMeshes = [];
        this.branchCircles = []; // Store circles for each branch
        this.floatingSparkles = []; // Store floating sparkles in the air
        
        // Track loaded assets
        this.plantsLoaded = 0;
        this.birdsLoaded = 0;
        this.totalPlants = 17; // background.png + 4 folders * 4 images = 17
        this.totalBirds = 8; // 4 folders * 2 images = 8
        
        // Audio manager
        this.audioManager = new AudioManager();
        this.audioInitialized = false;
        
        // NEXT button tracking
        this.nextButtonShown = false;
        this.allSparklesLitTime = null; // Timestamp when all sparkles became lit
        this.lastDebugLogTime = 0; // Track last debug log time to avoid spam
        
        // Mouse tracking for camera movement
        this.mouse = new THREE.Vector2();
        
        // Raycaster for click detection
        this.raycaster = new THREE.Raycaster();
        
        // Camera base position
        this.cameraBasePos = new THREE.Vector3(0, 0, 20);
        
        // Camera movement control - disabled during transition
        this.cameraMovementEnabled = false;
        
        // Plant configuration by folder and image
        this.PLANT_CONFIG = {
            0: { // background.png
                scale: 50,
                x: 0,
                y: 0,
                z: -100.0
            },
            1: { // Top-left area (around bird 1)
                1: { scale: 1, x: 22, y: 14, z: -20 },
                2: { scale: 2, x: 32, y: 8, z: -30 },
                3: { scale: 2.8, x: 13, y: 18, z: -40 },
                4: { scale: 2.3, x: 15, y: 5, z: -45 }
            },
            2: { // Top-right area (around bird 2)
                1: { scale: 1.3, x: -24, y: 12, z: -20 },
                2: { scale: 2, x: -13, y: 15, z: -30 },
                3: { scale: 2.5, x: -18, y: 5, z: -40 },
                4: { scale: 3.3, x: -5, y: 8, z: -50 }
            },
            3: { // Bottom-right area (around bird 3)
                1: { scale: 1, x: 24, y: -6, z: -20 },
                2: { scale: 2.3, x: 32, y: -14, z: -30 },
                3: { scale: 2.5, x: 17, y: -19, z: -40 },
                4: { scale: 1.2, x: 6, y: -5, z: -20 }
            },
            4: { // Bottom-left area (around bird 4)
                1: { scale: 1.3, x: -23, y: -12, z: -20 },
                2: { scale: 2.5, x: -33, y: -2, z: -30 },
                3: { scale: 1.5, x: -10, y: -4, z: -25 },
                4: { scale: 2, x: -7, y: -18, z: -30 }
            }
        };
        
        // Bird configuration by folder
        this.BIRD_CONFIG = {
            1: { scale: 0.25, x: 9, y: 5, z: 0 },
            2: { scale: 0.28, x: -13.5, y: 3.7, z: -5 },
            3: { scale: 0.3, x: 14, y: 0, z: -10 },
            4: { scale: 0.39, x: -16, y: -5, z: -10 }
        };
        
        // Internal offsets between files in same folder
        this.BIRD_OFFSETS = {
            1: {
                2: { scale: 1.67, x: 1, y: -1, z: -0.1 }
            },
            2: {
                2: { scale: 2.0, x: 4, y: -4.5, z: -0.1 }
            },
            3: {
                2: { scale: 1.92, x: 0.5, y: -3.5, z: -0.1 }
            },
            4: {
                2: { scale: 2.0, x: 6, y: -3, z: -0.1 }
            }
        };
        
        // Sparkle positions on each branch (normalized coordinates: -0.5 to 0.5)
        this.SPARKLE_POSITIONS = {
            1: [
                { x: -0.42, y: -0.35},
                { x: -0.15, y: -0.15 },
                { x: 0.15, y: 0.05 },
                { x: 0.35, y: 0.2}
            ],
            2: [
                { x: -0.35, y: 0.3 },
                { x: -0.15, y: 0.1 },
                { x: 0.1, y: 0.1 },
                { x: 0.45, y: 0.05 }
            ],
            3: [
                { x: -0.45, y: -0.2 },
                { x: -0.2, y: -0.15 },
                { x: 0.05, y: -0.05 },
                { x: 0.35, y: 0.15 }
            ],
            4: [
                { x: -0.3, y: 0.1 },
                { x: -0.1, y: -0.15 },
                { x: 0.2, y: -0.3 },
                { x: 0.4, y: -0.15 }
            ]
        };
        
        this.init();
    }
    
    animateCameraUp() {
        // Animate camera from lower position to final position (0, 0, 20)
        const finalY = 0;
        const currentY = this.camera.position.y;
        
        console.log("[Stage4] Animating camera from y:", currentY, "to y:", finalY);
        
        gsap.to(this.camera.position, {
            y: finalY,
            duration: 5.0, // 5 seconds for longer, smoother upward movement
            ease: "power2.out",
            onUpdate: () => {
                // Update lookAt to follow camera movement
                this.camera.lookAt(0, this.camera.position.y, 0);
                this.camera.updateMatrixWorld();
            },
            onComplete: () => {
                console.log("[Stage4] Camera animation complete, final position:", this.camera.position.y);
                // Enable camera movement control after camera reaches final position
                this.enableCameraMovement();
            }
        });
    }

    init() {
        // Setup Three.js scene
        this.scene = new THREE.Scene();
        // Light beige/off-white background matching the image
        this.scene.background = new THREE.Color(0xf5f5f0);
        
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        // Start camera much lower (below final position) for upward animation
        this.camera.position.set(0, -20, 20);
        this.camera.lookAt(0, -20, 0);
        this.camera.updateMatrixWorld();
        
        // Animate camera moving up to final position
        this.animateCameraUp();
        
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.setClearColor(0xf5f5f0, 1.0);
        
        const canvas = this.renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.zIndex = '1';
        canvas.style.opacity = '1';
        
        this.canvas = canvas;
        document.body.appendChild(canvas);
        
        // Handle window resize
        window.addEventListener('resize', this.onResize.bind(this));
        
        // Handle mouse movement for camera control
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        
        // Handle mouse clicks for circle interaction
        window.addEventListener('click', this.onMouseClick.bind(this));
        
        // Load all assets
        this.loadPlants();
        this.loadBirds();
    }
    
    loadPlants() {
        const loader = new THREE.TextureLoader();
        
        // Load background first
        loader.load('./assets/plants/background.png', (tex) => {
            tex.encoding = THREE.sRGBEncoding;
            this.createPlantMesh(tex, 0, 'background');
            this.plantsLoaded++;
            this.checkAllAssetsLoaded();
        }, undefined, (err) => {
            console.error('[Stage4] Failed to load plant background:', err);
            this.plantsLoaded++;
            this.checkAllAssetsLoaded();
        });
        
        // Load plants from folders 1-4, each with images 1-4
        for (let folder = 1; folder <= 4; folder++) {
            for (let img = 1; img <= 4; img++) {
                const path = `./assets/plants/${folder}/${img}.png`;
                loader.load(path, (tex) => {
                    tex.encoding = THREE.sRGBEncoding;
                    this.createPlantMesh(tex, folder, `${folder}-${img}`);
                    this.plantsLoaded++;
                    this.checkAllAssetsLoaded();
                }, undefined, (err) => {
                    console.error(`[Stage4] Failed to load plant ${folder}/${img}:`, err);
                    this.plantsLoaded++;
                    this.checkAllAssetsLoaded();
                });
            }
        }
    }
    
    loadBirds() {
        const loader = new THREE.TextureLoader();
        
        // Load birds from folders 1-4, each with images 1-2
        for (let folder = 1; folder <= 4; folder++) {
            for (let img = 1; img <= 2; img++) {
                const path = `./assets/birds/${folder}/${img}.png`;
                loader.load(path, (tex) => {
                    tex.encoding = THREE.sRGBEncoding;
                    
                    this.createBirdMesh(tex, folder, `${folder}-${img}`);
                    this.birdsLoaded++;
                    this.checkAllAssetsLoaded();
                }, undefined, (err) => {
                    console.error(`[Stage4] Failed to load bird ${folder}/${img}:`, err);
                    this.birdsLoaded++;
                    this.checkAllAssetsLoaded();
                });
            }
        }
    }
    
    updateSparklePositions(branchMesh, folder) {
        const branchData = this.branchCircles.find(data => data.branchMesh === branchMesh);
        if (!branchData || !branchData.circles || branchData.circles.length === 0) {
            console.warn(`[Stage4] updateSparklePositions: No sparkles found for branch ${folder}`);
            return;
        }
        
        // Get positions from manual config only
        let positions = [];
        if (this.SPARKLE_POSITIONS && this.SPARKLE_POSITIONS[folder] && this.SPARKLE_POSITIONS[folder].length > 0) {
            // Make a copy to avoid modifying the original
            positions = this.SPARKLE_POSITIONS[folder].map(p => ({ x: p.x, y: p.y }));
            console.log(`[Stage4] updateSparklePositions: Using manual config for branch ${folder}:`, positions);
        } else {
            console.warn(`[Stage4] updateSparklePositions: No manual config found for branch ${folder}`);
            return; // No positions available
        }
        
        // Sort positions by x-coordinate (left to right)
        positions.sort((a, b) => a.x - b.x);
        positions = positions.slice(0, 4);
        
        const branchWidth = branchMesh.geometry.parameters.width;
        const branchHeight = branchMesh.geometry.parameters.height;
        
        console.log(`[Stage4] updateSparklePositions: Updating ${branchData.circles.length} sparkles for branch ${folder}, branch size: (${branchWidth.toFixed(2)}, ${branchHeight.toFixed(2)})`);
        
        branchData.circles.forEach((sparkle, i) => {
            if (i < positions.length) {
                const pos = positions[i];
                const circleX = pos.x * branchWidth;
                const circleY = pos.y * branchHeight;
                sparkle.userData.relativePos.set(circleX, circleY, 0);
                console.log(`[Stage4] Updated sparkle ${i+1} for branch ${folder}: normalized (${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}), world offset (${circleX.toFixed(2)}, ${circleY.toFixed(2)})`);
            } else {
                console.warn(`[Stage4] updateSparklePositions: Sparkle ${i+1} has no position data`);
            }
        });
    }
    
    createPlantMesh(texture, folder, identifier) {
        if (!texture.image || !texture.image.width) {
            console.warn(`[Stage4] Plant texture ${identifier} not ready yet`);
            return;
        }
        
        // Calculate viewport dimensions
        const fov = this.camera.fov;
        const camDist = this.camera.position.z;
        const aspect = window.innerWidth / window.innerHeight;
        const vFOV = THREE.MathUtils.degToRad(fov);
        const viewportHeight = 2 * Math.tan(vFOV / 2) * camDist;
        const viewportWidth = viewportHeight * aspect;
        
        // Get image aspect ratio to maintain proportions
        const imageAspect = texture.image.width / texture.image.height;
        
        // Get configuration for this specific file (folder and image number)
        let config;
        if (folder === 0) {
            // Background - use folder-level config
            config = this.PLANT_CONFIG[0] || { scale: 1.2, x: 0, y: 0 };
        } else {
            // Extract image number from identifier (format: "folder-img")
            const imgNum = parseInt(identifier.split('-')[1]);
            // Get per-file configuration
            const folderConfig = this.PLANT_CONFIG[folder];
            config = (folderConfig && folderConfig[imgNum]) || { scale: 1, x: 0, y: 0 };
        }
        const scaleFactor = config.scale;
        
        // Calculate z-position - use configured z if provided, otherwise calculate automatically
        let zPosition;
        if (folder === 0) {
            // Background - use configured z or default
            zPosition = (config.z !== undefined) ? config.z : -5.0;
        } else {
            const imgNum = parseInt(identifier.split('-')[1]);
            // Use configured z if provided, otherwise calculate automatically
            if (config.z !== undefined) {
                zPosition = config.z;
            } else {
                // Auto-calculate depth
                const folderZBase = -4.5 + (4 - folder) * 1.0;
                // Depth variation within subfolder
                const imgZOffset = (4 - imgNum) * 4.0;
                zPosition = folderZBase + imgZOffset;
            }
        }
        
        // Calculate scale compensation based on z-depth
        // Objects further back (more negative z) need to be scaled larger to appear the same size
        // Formula: scaleCompensation = referenceDistance / actualDistance
        // Reference: objects at z=0 (camDist units away)
        // Actual: objects at zPosition (camDist - zPosition units away)
        // This ensures all plant files appear the same size regardless of their depth
        const scaleCompensation = camDist / (camDist - zPosition);
        const adjustedScale = config.scale * scaleCompensation;
        
        // Scale to fill viewport (plants should fill the screen)
        // Scale factor compensating for depth
        let plantWidth, plantHeight;
        
        if (imageAspect > aspect) {
            // Image is wider than viewport - use width to fill
            plantWidth = viewportWidth * adjustedScale;
            plantHeight = plantWidth / imageAspect;
        } else {
            // Image is taller than viewport - use height to fill
            plantHeight = viewportHeight * adjustedScale;
            plantWidth = plantHeight * imageAspect;
        }
        
        const geometry = new THREE.PlaneGeometry(plantWidth, plantHeight);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: folder === 0 ? 1.0 : 0.2, // Background at 100%, plants at 50% initially
            side: THREE.DoubleSide,
            depthWrite: true,
            depthTest: true
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        // Store base position for parallax (before applying offsets)
        mesh.userData.basePos = new THREE.Vector3(config.x, config.y, zPosition);
        
        // Store scale compensation for reference (helps verify compensation is working)
        mesh.userData.scaleCompensation = scaleCompensation;
        mesh.userData.adjustedScale = adjustedScale;
        
        // Apply configured position offsets
        mesh.position.set(config.x, config.y, zPosition);
        mesh.userData.isPlant = true;
        mesh.userData.identifier = identifier;
        mesh.userData.folder = folder;
        mesh.userData.imgNum = folder === 0 ? 0 : parseInt(identifier.split('-')[1]);
        
        // Set background to render first (behind everything)
        if (folder === 0) {
            mesh.renderOrder = -2; // Background renders first
        } else {
            mesh.renderOrder = 0; // Regular plants render on top
            
            // Add randomized wiggle parameters
            // Frequency: how fast it wiggles (0.3 to 0.8 radians per second)
            mesh.userData.wiggleFrequency = 0.3 + Math.random() * 0.5;
            // Amplitude: how much it wiggles (0.02 to 0.08 radians, about 1-4.5 degrees)
            mesh.userData.wiggleAmplitude = 0.02 + Math.random() * 0.06;
            // Random phase offset so plants don't all wiggle in sync
            mesh.userData.wigglePhase = Math.random() * Math.PI * 2;
        }
        
        this.scene.add(mesh);
        this.plantMeshes.push(mesh);
        
        console.log(`[Stage4] Created plant mesh: ${identifier} at position (${config.x}, ${config.y}, ${zPosition.toFixed(3)}) with base scale ${config.scale}, adjusted scale ${adjustedScale.toFixed(3)}`);
    }
    
    createBirdMesh(texture, folder, identifier) {
        if (!texture.image || !texture.image.width) {
            console.warn(`[Stage4] Bird texture ${identifier} not ready yet`);
            return;
        }
        
        // Calculate viewport dimensions
        const fov = this.camera.fov;
        const camDist = this.camera.position.z;
        const aspect = window.innerWidth / window.innerHeight;
        const vFOV = THREE.MathUtils.degToRad(fov);
        const viewportHeight = 2 * Math.tan(vFOV / 2) * camDist;
        const viewportWidth = viewportHeight * aspect;
        
        // Get image aspect ratio to maintain proportions
        const imageAspect = texture.image.width / texture.image.height;
        
        // Get folder-level base configuration
        const folderConfig = this.BIRD_CONFIG[folder] || { scale: 1.2, x: 0, y: 0, z: undefined };
        
        // Extract image number from identifier (format: "folder-img")
        const imgNum = parseInt(identifier.split('-')[1]);
        
        // Get relative offset for this image (if it exists) from internal offsets
        const folderOffsets = this.BIRD_OFFSETS[folder] || {};
        const offset = folderOffsets[imgNum] || { scale: 1, x: 0, y: 0, z: 0 };
        
        // Calculate the center point of all images in this folder (at reference scale = 1)
        // This is the point around which scaling will happen
        // Image 1 position at scale=1: (folderConfig.x, folderConfig.y, folderConfig.z)
        // Image 2 position at scale=1: (folderConfig.x + offset.x, folderConfig.y + offset.y, folderConfig.z + offset.z)
        // Center = average of all image positions
        const numImages = 2;
        const centerX = folderConfig.x + (offset.x || 0) / numImages;
        const centerY = folderConfig.y + (offset.y || 0) / numImages;
        let baseZ = folderConfig.z;
        if (baseZ === undefined) {
            baseZ = 1.0 + (4 - folder) * 0.4;
        }
        const centerZ = baseZ + (offset.z || 0) / numImages;
        
        // Calculate offset from center for this image (at reference scale = 1)
        // Image 1 offset from center
        let offsetFromCenterX, offsetFromCenterY, offsetFromCenterZ;
        if (imgNum === 1) {
            offsetFromCenterX = folderConfig.x - centerX;
            offsetFromCenterY = folderConfig.y - centerY;
            offsetFromCenterZ = baseZ - centerZ;
        } else {
            // Image 2 offset from center
            offsetFromCenterX = (folderConfig.x + (offset.x || 0)) - centerX;
            offsetFromCenterY = (folderConfig.y + (offset.y || 0)) - centerY;
            offsetFromCenterZ = (baseZ + (offset.z || 0)) - centerZ;
        }
        
        // Apply scale to the offset from center, then add to center
        // This ensures scaling happens around the combined center
        const scaleFactor = folderConfig.scale * (offset.scale || 1);
        const finalX = centerX + offsetFromCenterX * folderConfig.scale;
        const finalY = centerY + offsetFromCenterY * folderConfig.scale;
        
        // Scale to fill viewport (birds should fill the screen)
        // Use configured scale factor
        let birdWidth, birdHeight;
        
        if (imageAspect > aspect) {
            // Image is wider than viewport - use width to fill
            birdWidth = viewportWidth * scaleFactor;
            birdHeight = birdWidth / imageAspect;
        } else {
            // Image is taller than viewport - use height to fill
            birdHeight = viewportHeight * scaleFactor;
            birdWidth = birdHeight * imageAspect;
        }
        
        const geometry = new THREE.PlaneGeometry(birdWidth, birdHeight);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide,
            depthWrite: true,
            depthTest: true
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        // Set renderOrder to render above plants
        mesh.renderOrder = 2;
        
        // Calculate z-position - scale the offset from center
        const finalZ = centerZ + offsetFromCenterZ * folderConfig.scale;
        
        mesh.userData.isBird = true;
        mesh.userData.identifier = identifier;
        mesh.userData.folder = folder;
        mesh.userData.imgNum = imgNum;
        
        // Set rotation pivot at bottom for bird bodies (1.png)
        if (imgNum === 1) {
            geometry.translate(0, birdHeight / 2, 0);
            
            mesh.userData.bottomOffset = birdHeight / 2;
            mesh.userData.isBirdBody = true;
            
            mesh.userData.animationStartOffset = Math.random() * 6.0;
            mesh.userData.holdDuration = 4.0 + Math.random() * 3.0;
            
            mesh.position.set(finalX, finalY - birdHeight / 2, finalZ);
        } else {
            // Branch/feet (2.png)
            mesh.userData.bottomOffset = 0;
            mesh.userData.isBirdBody = false;
            mesh.position.set(finalX, finalY, finalZ);
            
            this.createBranchCircles(mesh, birdWidth, birdHeight, finalZ);
        }
        
        mesh.userData.basePos = new THREE.Vector3(
            mesh.position.x, 
            mesh.position.y, 
            finalZ
        );
        
        this.scene.add(mesh);
        this.birdMeshes.push(mesh);
        
        console.log(`[Stage4] Created bird mesh: ${identifier} at position (${finalX.toFixed(2)}, ${finalY.toFixed(2)}, ${finalZ.toFixed(3)}) with scale ${scaleFactor.toFixed(3)}`);
    }
    
    createBranchCircles(branchMesh, branchWidth, branchHeight, branchZ) {
        // Create 4 sparkles positioned along the branch
        const numCircles = 4;
        const sparkleSize = 0.65; // Bigger sparkle size for more visibility
        
        // Create blue and yellow sparkle textures
        // Use more vibrant, deeper blue colors for better visibility
        const blueSparkleTexture = this.createSparkleTexture(0x0080ff, 0x00aaff, 1.8); // More vibrant blue colors with higher opacity
        const yellowSparkleTexture = this.createSparkleTexture(0xffd700, 0xffeb3b); // Yellow colors
        
        const folder = branchMesh.userData.folder;
        const circles = [];
        
        // Get positions: check manual config first, then use default
        let positions = [];
        
        // Priority 1: Use manual configuration if provided
        if (this.SPARKLE_POSITIONS && this.SPARKLE_POSITIONS[folder] && this.SPARKLE_POSITIONS[folder].length > 0) {
            // Make a copy to avoid modifying the original
            positions = this.SPARKLE_POSITIONS[folder].map(p => ({ x: p.x, y: p.y }));
            console.log(`[Stage4] createBranchCircles: Using manual sparkle positions for branch ${folder}:`, positions);
        }
        // Priority 2: Use default evenly spaced positions as fallback
        else {
            for (let i = 0; i < numCircles; i++) {
                const t = i / (numCircles - 1);
                positions.push({
                    x: (t - 0.5) * 0.6, // -0.3 to 0.3
                    y: 0.1 // Slightly above center
                });
            }
            console.log(`[Stage4] Using default sparkle positions for branch ${folder}`);
        }
        
        // Sort positions by x-coordinate (left to right) to ensure sparkles 1-4 are ordered correctly
        positions.sort((a, b) => a.x - b.x);
        
        // Limit to 4 sparkles
        const sparklePositions = positions.slice(0, numCircles);
        
        for (let i = 0; i < sparklePositions.length; i++) {
            // Get position from manual config (normalized coordinates -0.5 to 0.5, but can be outside this range)
            const pos = sparklePositions[i];
            
            // Convert normalized coordinates to world coordinates relative to branch center
            // Scale by branch dimensions
            // Note: normalized coordinates are relative to branch center, where:
            //   x: -0.5 = left edge, 0 = center, +0.5 = right edge
            //   y: -0.5 = bottom edge, 0 = center, +0.5 = top edge
            const circleX = pos.x * branchWidth;
            const circleY = pos.y * branchHeight;
            
            console.log(`[Stage4] Sparkle ${i+1} for branch ${folder}: normalized (${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}), world offset (${circleX.toFixed(2)}, ${circleY.toFixed(2)}), branch size (${branchWidth.toFixed(2)}, ${branchHeight.toFixed(2)})`);
            
            // Create sparkle material with blue texture initially
            // Textures can be shared between sprites, so we use the same texture
            const sparkleMaterial = new THREE.SpriteMaterial({
                map: blueSparkleTexture,
                color: 0x0080ff, // More vibrant, deeper blue
                transparent: true,
                blending: THREE.AdditiveBlending, // Makes sparkles glow
                depthWrite: false, // Don't write to depth buffer (render on top)
                depthTest: false // Ignore depth test to always render on top of birds
            });
            
            // Create sparkle sprite
            const sparkle = new THREE.Sprite(sparkleMaterial);
            
            // Set size
            sparkle.scale.set(sparkleSize, sparkleSize, 1);
            
            // Position relative to branch center (will be updated in update loop)
            // Use branch position directly to ensure sparkles are at exact same depth
            // The update loop will handle the final positioning with parallax
            sparkle.position.set(
                branchMesh.position.x + circleX,
                branchMesh.position.y + circleY,
                branchMesh.position.z // Same depth as branch (use branch's actual z-position)
            );
            
            console.log(`[Stage4] Set sparkle ${i+1} initial position: (${sparkle.position.x.toFixed(2)}, ${sparkle.position.y.toFixed(2)}, ${sparkle.position.z.toFixed(2)})`);
            
            sparkle.userData.isCircle = true;
            sparkle.userData.branchMesh = branchMesh;
            sparkle.userData.isLit = false;
            sparkle.userData.relativePos = new THREE.Vector3(circleX, circleY, 0);
            sparkle.userData.normalizedPos = pos; // Store normalized position for resize
            sparkle.userData.folder = branchMesh.userData.folder;
            sparkle.userData.sparkleIndex = i; // Store index to look up position in SPARKLE_POSITIONS
            sparkle.userData.material = sparkleMaterial;
            // Store texture references for switching
            sparkle.userData.blueTexture = blueSparkleTexture;
            sparkle.userData.yellowTexture = yellowSparkleTexture;
            sparkle.userData.baseSize = sparkleSize;
            
            // Set high render order to render on top of everything
            sparkle.renderOrder = 200;
            
            // Add rotation animation for sparkle effect
            sparkle.userData.rotationSpeed = 0.5 + Math.random() * 0.5; // Random rotation speed
            
            // Add breathing animation parameters
            sparkle.userData.breathingSpeed = 0.8 + Math.random() * 0.6; // Breathing speed: 0.8 to 1.4 cycles per second
            sparkle.userData.breathingAmplitude = 0.15 + Math.random() * 0.1; // Breathing amplitude: 0.15 to 0.25 (15-25% size variation)
            sparkle.userData.breathingPhase = Math.random() * Math.PI * 2; // Random phase offset so sparkles don't all breathe in sync
            // Store scale multiplier as a regular property so GSAP can animate it
            sparkle.scaleMultiplier = 1.0; // Base scale multiplier (1.0 = normal, 1.4 = lit up)
            
            // Add wiggle animation parameters
            sparkle.userData.wiggleSpeedX = 0.5 + Math.random() * 0.4; // Wiggle speed X: 0.5 to 0.9 cycles per second
            sparkle.userData.wiggleSpeedY = 0.5 + Math.random() * 0.4; // Wiggle speed Y: 0.5 to 0.9 cycles per second (different from X)
            sparkle.userData.wiggleAmplitude = 0.08 + Math.random() * 0.05; // Wiggle amplitude: 0.08 to 0.13 units
            sparkle.userData.wigglePhaseX = Math.random() * Math.PI * 2; // Random phase offset for X
            sparkle.userData.wigglePhaseY = Math.random() * Math.PI * 2; // Random phase offset for Y
            
            // Add sparkle to scene (not as child of branch, so it stays on top)
            this.scene.add(sparkle);
            
            circles.push(sparkle);
        }
        
        // Store circles for this branch
        this.branchCircles.push({
            branchMesh: branchMesh,
            circles: circles
        });
        
        // Link sparkles to their corresponding plants
        this.linkSparklesToPlants(circles, folder);
    }
    
    linkSparklesToPlants(sparkles, branchFolder) {
        // Map sparkle array index to sparkle number (1-4)
        // For birds/1 and birds/3: sparkles numbered 1-4 from right to left
        //   (array sorted left to right, so index 0 = leftmost = sparkle 4, index 3 = rightmost = sparkle 1)
        // For birds/2 and birds/4: sparkles numbered 1-4 from left to right
        //   (array sorted left to right, so index 0 = leftmost = sparkle 1, index 3 = rightmost = sparkle 4)
        
        sparkles.forEach((sparkle, arrayIndex) => {
            let sparkleNumber;
            if (branchFolder === 1 || branchFolder === 3) {
                // Right to left numbering: index 0 = sparkle 4, index 3 = sparkle 1
                sparkleNumber = 4 - arrayIndex;
            } else {
                // Left to right numbering: index 0 = sparkle 1, index 3 = sparkle 4
                sparkleNumber = arrayIndex + 1;
            }
            
            // Find the corresponding plant: plants/{branchFolder}/{sparkleNumber}.png
            const correspondingPlant = this.plantMeshes.find(plant => {
                return plant.userData.folder === branchFolder && 
                       plant.userData.imgNum === sparkleNumber;
            });
            
            if (correspondingPlant) {
                sparkle.userData.correspondingPlant = correspondingPlant;
                console.log(`[Stage4] Linked sparkle ${sparkleNumber} (array index ${arrayIndex}) on branch ${branchFolder} to plant ${branchFolder}/${sparkleNumber}`);
            } else {
                console.warn(`[Stage4] Could not find corresponding plant for sparkle ${sparkleNumber} on branch ${branchFolder}`);
            }
        });
    }
    
    createSparkleTexture(centerColor, outerColor, opacityMultiplier = 1.0) {
        // Create sparkle texture (glowing circle) similar to stage2
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Convert hex colors to RGB
        const centerR = (centerColor >> 16) & 255;
        const centerG = (centerColor >> 8) & 255;
        const centerB = centerColor & 255;
        
        const outerR = (outerColor >> 16) & 255;
        const outerG = (outerColor >> 8) & 255;
        const outerB = outerColor & 255;
        
        // Apply opacity multiplier to make sparkles more visible
        const clampOpacity = (opacity) => Math.min(1.0, opacity * opacityMultiplier);
        
        // Create radial gradient for glow effect
        const gradient1 = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient1.addColorStop(0, `rgba(${centerR}, ${centerG}, ${centerB}, ${clampOpacity(0.6)})`); // Bright center
        gradient1.addColorStop(0.2, `rgba(${centerR}, ${centerG}, ${centerB}, ${clampOpacity(0.5)})`); // Bright glow
        gradient1.addColorStop(0.4, `rgba(${outerR}, ${outerG}, ${outerB}, ${clampOpacity(0.4)})`); // Outer glow
        gradient1.addColorStop(0.6, `rgba(${outerR}, ${outerG}, ${outerB}, ${clampOpacity(0.3)})`); // Softer
        gradient1.addColorStop(0.8, `rgba(${outerR}, ${outerG}, ${outerB}, ${clampOpacity(0.15)})`); // Fading
        gradient1.addColorStop(1, `rgba(${outerR}, ${outerG}, ${outerB}, 0)`); // Fully transparent edge
        
        ctx.fillStyle = gradient1;
        ctx.fillRect(0, 0, 64, 64);
        
        // Add a second, larger glow layer for more exposure
        const gradient2 = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
        gradient2.addColorStop(0, `rgba(${centerR}, ${centerG}, ${centerB}, ${clampOpacity(0.3)})`); // Outer glow layer
        gradient2.addColorStop(0.5, `rgba(${outerR}, ${outerG}, ${outerB}, ${clampOpacity(0.2)})`);
        gradient2.addColorStop(1, `rgba(${outerR}, ${outerG}, ${outerB}, 0)`);
        
        ctx.globalCompositeOperation = 'screen'; // Blend mode for glow
        ctx.fillStyle = gradient2;
        ctx.fillRect(0, 0, 64, 64);
        ctx.globalCompositeOperation = 'source-over'; // Reset
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }
    
    createFloatingSparkles() {
        // Create floating sparkles that float in the air
        const numFloatingSparkles = 60; // Total number of floating sparkles (more for gradual emergence)
        const sparkleSize = 0.4; // Slightly smaller than branch sparkles
        
        // Create blue and yellow sparkle textures (reuse the same textures)
        const blueSparkleTexture = this.createSparkleTexture(0x0080ff, 0x00aaff, 1.8);
        const yellowSparkleTexture = this.createSparkleTexture(0xffd700, 0xffeb3b);
        
        // Calculate viewport dimensions for positioning
        const fov = this.camera.fov;
        const camDist = this.camera.position.z;
        const aspect = window.innerWidth / window.innerHeight;
        const vFOV = THREE.MathUtils.degToRad(fov);
        const viewportHeight = 2 * Math.tan(vFOV / 2) * camDist;
        const viewportWidth = viewportHeight * aspect;
        
        for (let i = 0; i < numFloatingSparkles; i++) {
            // Create sparkle material with blue texture initially
            const sparkleMaterial = new THREE.SpriteMaterial({
                map: blueSparkleTexture,
                color: 0x0080ff,
                transparent: true,
                opacity: 0, // Start invisible - will fade in gradually
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                depthTest: false
            });
            
            // Create sparkle sprite
            const sparkle = new THREE.Sprite(sparkleMaterial);
            
            // Set size
            sparkle.scale.set(sparkleSize, sparkleSize, 1);
            
            // Random position in the air (spread across viewport, at various z-depths)
            const x = (Math.random() - 0.5) * viewportWidth * 1.2;
            const y = (Math.random() - 0.5) * viewportHeight * 1.2;
            const z = -5 + Math.random() * 10; // Random z between -5 and 5 (in front of most objects)
            
            sparkle.position.set(x, y, z);
            
            // Store initial position for floating animation
            sparkle.userData.initialPos = new THREE.Vector3(x, y, z);
            sparkle.userData.isFloatingSparkle = true;
            sparkle.userData.material = sparkleMaterial;
            sparkle.userData.blueTexture = blueSparkleTexture;
            sparkle.userData.yellowTexture = yellowSparkleTexture;
            sparkle.userData.baseSize = sparkleSize;
            sparkle.userData.isLit = false; // Track if this sparkle should be yellow
            sparkle.userData.isActive = false; // Track if this sparkle is visible/active
            sparkle.userData.targetOpacity = 0; // Target opacity for smooth transitions
            
            // Floating animation parameters
            sparkle.userData.floatSpeedX = 0.08 + Math.random() * 0.12; // Horizontal float speed (slower)
            sparkle.userData.floatSpeedY = 0.08 + Math.random() * 0.12; // Vertical float speed (slower)
            sparkle.userData.floatAmplitudeX = 2 + Math.random() * 3; // Horizontal float range
            sparkle.userData.floatAmplitudeY = 2 + Math.random() * 3; // Vertical float range
            sparkle.userData.floatPhaseX = Math.random() * Math.PI * 2; // Random phase offset
            sparkle.userData.floatPhaseY = Math.random() * Math.PI * 2; // Random phase offset
            
            // Rotation animation (slower)
            sparkle.userData.rotationSpeed = 0.15 + Math.random() * 0.2;
            
            // Breathing animation (slower)
            sparkle.userData.breathingSpeed = 0.3 + Math.random() * 0.25;
            sparkle.userData.breathingAmplitude = 0.1 + Math.random() * 0.1;
            sparkle.userData.breathingPhase = Math.random() * Math.PI * 2;
            sparkle.scaleMultiplier = 1.0;
            
            // Set very high render order to render on top of everything
            sparkle.renderOrder = 300;
            
            // Add to scene
            this.scene.add(sparkle);
            this.floatingSparkles.push(sparkle);
        }
        
        console.log(`[Stage4] Created ${numFloatingSparkles} floating sparkles (starting invisible)`);
    }
    
    updateFloatingSparkles() {
        // Calculate the proportion of lit sparkles across all branches
        let totalSparkles = 0;
        let litSparkles = 0;
        
        this.branchCircles.forEach(branchData => {
            branchData.circles.forEach(sparkle => {
                totalSparkles++;
                if (sparkle.userData.isLit) {
                    litSparkles++;
                }
            });
        });
        
        // Calculate proportion (0.0 to 1.0)
        const litProportion = totalSparkles > 0 ? litSparkles / totalSparkles : 0;
        
        // Calculate how many floating sparkles should be active based on proportion
        const numSparklesToActivate = Math.round(this.floatingSparkles.length * litProportion);
        
        // Calculate how many of the active sparkles should be yellow (same proportion)
        const numSparklesToLight = Math.round(numSparklesToActivate * litProportion);
        
        // Update floating sparkles: activate them gradually and set their colors
        this.floatingSparkles.forEach((sparkle, index) => {
            const shouldBeActive = index < numSparklesToActivate;
            const shouldBeLit = index < numSparklesToLight;
            
            // Activate/deactivate sparkles gradually
            if (shouldBeActive && !sparkle.userData.isActive) {
                // Activate this sparkle - fade in gradually
                sparkle.userData.isActive = true;
                sparkle.userData.targetOpacity = 1.0;
                
                // Fade in animation
                gsap.to(sparkle.userData.material, {
                    opacity: 1.0,
                    duration: 0.8,
                    ease: "power2.out"
                });
            } else if (!shouldBeActive && sparkle.userData.isActive) {
                // Deactivate this sparkle - fade out gradually
                sparkle.userData.isActive = false;
                sparkle.userData.targetOpacity = 0;
                
                // Fade out animation
                gsap.to(sparkle.userData.material, {
                    opacity: 0,
                    duration: 0.8,
                    ease: "power2.out"
                });
                
                // Reset to blue when deactivating
                sparkle.userData.material.map = sparkle.userData.blueTexture;
                sparkle.userData.material.color.setHex(0x0080ff);
                sparkle.userData.material.needsUpdate = true;
                sparkle.userData.isLit = false;
                sparkle.scaleMultiplier = 1.0;
            }
            
            // Update color for active sparkles
            if (sparkle.userData.isActive) {
                if (shouldBeLit && !sparkle.userData.isLit) {
                    // Change to yellow
                    sparkle.userData.material.map = sparkle.userData.yellowTexture;
                    sparkle.userData.material.color.setHex(0xffd700);
                    sparkle.userData.material.needsUpdate = true;
                    sparkle.userData.isLit = true;
                    
                    // Slight glow effect
                    gsap.to(sparkle, {
                        scaleMultiplier: 1.3,
                        duration: 0.3,
                        ease: "power2.out"
                    });
                } else if (!shouldBeLit && sparkle.userData.isLit) {
                    // Change back to blue
                    sparkle.userData.material.map = sparkle.userData.blueTexture;
                    sparkle.userData.material.color.setHex(0x0080ff);
                    sparkle.userData.material.needsUpdate = true;
                    sparkle.userData.isLit = false;
                    
                    // Scale back down
                    gsap.to(sparkle, {
                        scaleMultiplier: 1.0,
                        duration: 0.3,
                        ease: "power2.out"
                    });
                }
            }
        });
    }
    
    checkAllAssetsLoaded() {
        if (this.plantsLoaded === this.totalPlants && this.birdsLoaded === this.totalBirds) {
            console.log(`[Stage4] All assets loaded! Plants: ${this.plantsLoaded}, Birds: ${this.birdsLoaded}`);
            
            // Link all sparkles to their corresponding plants (in case plants loaded after sparkles)
            this.branchCircles.forEach(branchData => {
                const folder = branchData.branchMesh.userData.folder;
                this.linkSparklesToPlants(branchData.circles, folder);
            });
            
            // Create floating sparkles after all assets are loaded
            this.createFloatingSparkles();
            
            // Initialize audio
            this.initAudio();
        }
    }
    
    async initAudio() {
        if (this.audioInitialized) return;
        
        try {
            await this.audioManager.init();
            this.audioInitialized = true;
            console.log('[Stage4] Audio initialized');
            
            // Initialize all instruments at level 0
            this.updateAudioForAllBranches();
        } catch (error) {
            console.error('[Stage4] Failed to initialize audio:', error);
        }
    }
    
    getLitSparkleCount(branchFolder) {
        // Find the branch data for this folder
        const branchData = this.branchCircles.find(data => 
            data.branchMesh.userData.folder === branchFolder
        );
        
        if (!branchData) return 0;
        
        // Count lit sparkles
        return branchData.circles.filter(sparkle => sparkle.userData.isLit).length;
    }
    
    getTrackIndexForBranch(branchFolder) {
        // Map branch folder (1-4) to track index
        // AudioManager expects 1-4: 1=melody, 2=chords, 3=drums, 4=bass
        // Currently AudioManager uses 1-4 directly, but this helper provides clarity
        // and allows for future changes if needed
        const map = {
            1: 1, // melody
            2: 2, // chords
            3: 3, // drums
            4: 4  // bass
        };
        return map[branchFolder] ?? 1;
    }
    
    updateAudioForAllBranches() {
        if (!this.audioInitialized) return;
        
        // Update audio based on lit sparkles
        // Bird 1 = melody, Bird 2 = chords, Bird 3 = drums, Bird 4 = bass
        for (let birdNumber = 1; birdNumber <= 4; birdNumber++) {
            const litCount = this.getLitSparkleCount(birdNumber);
            const trackIndex = this.getTrackIndexForBranch(birdNumber);
            console.log('[Stage4] updateAudioForAllBranches', {
                birdNumber,
                litCount,
                trackIndex
            });
            this.audioManager.updateComplexity(trackIndex, litCount);
        }
    }
    
    onMouseMove(event) {
        // Disable camera movement during transition
        if (!this.cameraMovementEnabled) {
            return;
        }
        
        // Normalize mouse coordinates to -1 to 1 range
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Smooth camera parallax movement (like Stage 2)
        const targetX = this.mouse.x * 0.5;
        const targetY = this.mouse.y * 0.5;
        gsap.to(this.camera.position, {
            x: targetX,
            y: targetY,
            duration: 1.2,
            ease: "power2.out"
        });
        
        // Update camera matrix for parallax calculations
        this.camera.updateMatrixWorld();
    }
    
    enableCameraMovement() {
        console.log("[Stage4] Enabling camera movement");
        this.cameraMovementEnabled = true;
    }
    
    onMouseClick(event) {
        // Update mouse coordinates for raycasting
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Update camera matrix
        this.camera.updateMatrixWorld();
        
        // Set up raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Check for intersections with circles
        const allCircles = [];
        this.branchCircles.forEach(branchData => {
            allCircles.push(...branchData.circles);
        });
        
        const intersects = this.raycaster.intersectObjects(allCircles, false);
        
        if (intersects.length > 0) {
            const clickedSparkle = intersects[0].object;
            
            if (clickedSparkle && clickedSparkle.userData.isCircle) {
                this.toggleCircleLight(clickedSparkle);
            }
        }
    }
    
    setSparkleLight(sparkle, isLit, updateAudio = true) {
        // Set the light state (without toggling)
        sparkle.userData.isLit = isLit;
        
        if (isLit) {
            // Light up: change to bright yellow/gold
            sparkle.userData.material.map = sparkle.userData.yellowTexture;
            sparkle.userData.material.color.setHex(0xffd700); // Gold color
            sparkle.userData.material.needsUpdate = true;
            
            // Add a slight glow effect by increasing scale multiplier
            // The breathing animation will apply this multiplier
            gsap.to(sparkle, {
                scaleMultiplier: 1.4,
                duration: 0.3,
                ease: "power2.out"
            });
            
            // Update corresponding plant opacity to 100%
            if (sparkle.userData.correspondingPlant) {
                gsap.to(sparkle.userData.correspondingPlant.material, {
                    opacity: 1.0,
                    duration: 0.3,
                    ease: "power2.out"
                });
            }
        } else {
            // Turn off: return to shiny blue
            sparkle.userData.material.map = sparkle.userData.blueTexture;
            sparkle.userData.material.color.setHex(0x0080ff); // More vibrant, deeper blue
            sparkle.userData.material.needsUpdate = true;
            
            // Scale back down by reducing scale multiplier
            gsap.to(sparkle, {
                scaleMultiplier: 1.0,
                duration: 0.3,
                ease: "power2.out"
            });
            
            // Update corresponding plant opacity to 50%
            if (sparkle.userData.correspondingPlant) {
                gsap.to(sparkle.userData.correspondingPlant.material, {
                    opacity: 0.5,
                    duration: 0.3,
                    ease: "power2.out"
                });
            }
        }
        
        // Update audio after sparkle state changes (only if updateAudio is true)
        if (updateAudio) {
            this.updateAudioForBranch(sparkle.userData.folder);
        }
    }
    
    updateAudioForBranch(branchFolder) {
        if (!this.audioInitialized) return;
        
        // Get lit sparkle count for this branch
        const litCount = this.getLitSparkleCount(branchFolder);
        const trackIndex = this.getTrackIndexForBranch(branchFolder);
        console.log('[Stage4] updateAudioForBranch', {
            branchFolder,
            litCount,
            trackIndex
        });
        
        // Check if drum samples are loaded
        if (trackIndex === 3 && !this.audioManager.hasLoadedSamples()) {
            console.warn('[Stage4] No drum samples loaded yet, skipping audio update for branch', branchFolder);
            return;
        }
        
        // Update audio complexity for this bird
        // Bird 1 = melody, Bird 2 = chords, Bird 3 = drums, Bird 4 = bass
        this.audioManager.updateComplexity(trackIndex, litCount);
    }
    
    areAllSparklesLit() {
        // Check if all branch sparkles are lit (not floating sparkles)
        let totalSparkles = 0;
        let litSparkles = 0;
        
        this.branchCircles.forEach(branchData => {
            branchData.circles.forEach(sparkle => {
                totalSparkles++;
                if (sparkle.userData.isLit) {
                    litSparkles++;
                }
            });
        });
        
        const allLit = totalSparkles > 0 && litSparkles === totalSparkles;
        
        // Debug logging (only log occasionally to avoid spam)
        if (allLit && Math.random() < 0.01) { // Log 1% of the time when all are lit
            console.log(`[Stage4] areAllSparklesLit: ${litSparkles}/${totalSparkles} sparkles lit`);
        }
        
        return allLit;
    }
    
    toggleCircleLight(sparkle) {
        // Find the branch data for this sparkle
        const branchData = this.branchCircles.find(data => 
            data.circles.includes(sparkle)
        );
        
        if (!branchData) {
            // Fallback to simple toggle if branch not found
            this.setSparkleLight(sparkle, !sparkle.userData.isLit);
            return;
        }
        
        const folder = sparkle.userData.folder;
        const circles = branchData.circles;
        
        // Find the index of the clicked sparkle in the sorted array
        // Sparkles are sorted by x-coordinate (left to right) during creation
        const clickedIndex = circles.indexOf(sparkle);
        
        if (clickedIndex === -1) {
            // Fallback to simple toggle if index not found
            this.setSparkleLight(sparkle, !sparkle.userData.isLit);
            return;
        }
        
        console.log('[Stage4] toggleCircleLight click', {
            folder,
            clickedIndex,
            beforeStates: circles.map(c => c.userData.isLit)
        });
        
        // Check if sparkle is already lit
        const isAlreadyLit = sparkle.userData.isLit;
        
        if (isAlreadyLit) {
            // Clicking a lit sparkle: unlight it and unlight all lit sparkles in the opposite direction
            // First, unlight the clicked sparkle (don't update audio yet)
            this.setSparkleLight(sparkle, false, false);
            
            // Find all lit sparkles in the opposite direction to unlight them
            let unlightIndices = [];
            
            if (folder === 1 || folder === 3) {
                // For birds/1 and birds/3: unlight all lit sparkles to the left (lower indices)
                for (let i = 0; i < clickedIndex; i++) {
                    if (circles[i].userData.isLit) {
                        unlightIndices.push(i);
                    }
                }
            } else if (folder === 2 || folder === 4) {
                // For birds/2 and birds/4: unlight all lit sparkles to the right (higher indices)
                for (let i = clickedIndex + 1; i < circles.length; i++) {
                    if (circles[i].userData.isLit) {
                        unlightIndices.push(i);
                    }
                }
            }
            
            // Unlight all lit sparkles in the appropriate direction (don't update audio yet)
            unlightIndices.forEach(index => {
                if (index >= 0 && index < circles.length) {
                    this.setSparkleLight(circles[index], false, false);
                }
            });
            
            // Update audio once after all sparkles have been unlit
            const litCountAfter = this.getLitSparkleCount(folder);
            console.log('[Stage4] toggleCircleLight after (unlit)', {
                folder,
                afterStates: circles.map(c => c.userData.isLit),
                litCount: litCountAfter
            });
            this.updateAudioForBranch(folder);
        } else {
            // Normal toggle: clicking an unlit sparkle
            // Determine which sparkles to cascade based on folder and clicked index
            let cascadeIndices = [];
            
            if (folder === 1 || folder === 3) {
                // For birds/1 and birds/3: cascade to the right
                // When clicking any sparkle, all sparkles to its right (higher indices) should also be lit
                for (let i = clickedIndex + 1; i < circles.length; i++) {
                    cascadeIndices.push(i);
                }
            } else if (folder === 2 || folder === 4) {
                // For birds/2 and birds/4: cascade to the left
                // When clicking any sparkle, all sparkles to its left (lower indices) should also be lit
                for (let i = 0; i < clickedIndex; i++) {
                    cascadeIndices.push(i);
                }
            }
            
            // Toggle the clicked sparkle on (don't update audio yet)
            this.setSparkleLight(sparkle, true, false);
            
            // Cascade: also light up the sparkles in the appropriate direction (don't update audio yet)
            if (cascadeIndices.length > 0) {
                cascadeIndices.forEach(index => {
                    if (index >= 0 && index < circles.length) {
                        this.setSparkleLight(circles[index], true, false);
                    }
                });
            }
            
            // Update audio once after all sparkles have been lit
            const litCountAfter = this.getLitSparkleCount(folder);
            console.log('[Stage4] toggleCircleLight after (lit)', {
                folder,
                afterStates: circles.map(c => c.userData.isLit),
                litCount: litCountAfter
            });
            this.updateAudioForBranch(folder);
        }
    }
    
    update() {
        // Calculate parallax for all meshes based on their z-depth
        const camDist = this.camera.position.z;
        
        // Update plant meshes with parallax
        this.plantMeshes.forEach(mesh => {
            if (mesh.userData.basePos) {
                // Calculate parallax factor based on z-depth
                // Deeper objects (more negative z) move less
                // Formula: parallax = (camDist - objectZ) / camDist
                const objectZ = mesh.userData.basePos.z;
                const parallaxFactor = (camDist - objectZ) / camDist;
                
                // Apply parallax movement (deeper = less movement)
                // Use smaller multipliers for subtle effect
                const parallaxStrength = 0.3; // Overall parallax strength
                const parallaxX = this.mouse.x * parallaxFactor * parallaxStrength;
                const parallaxY = this.mouse.y * parallaxFactor * parallaxStrength;
                
                mesh.position.x = mesh.userData.basePos.x + parallaxX;
                mesh.position.y = mesh.userData.basePos.y + parallaxY;
                mesh.position.z = mesh.userData.basePos.z; // Keep z unchanged
                
                // Apply slow wiggle animation (skip background)
                if (mesh.userData.folder !== 0 && mesh.userData.wiggleFrequency !== undefined) {
                    const time = this.clock.getElapsedTime();
                    const wiggle = Math.sin(time * mesh.userData.wiggleFrequency + mesh.userData.wigglePhase) * mesh.userData.wiggleAmplitude;
                    mesh.rotation.z = wiggle;
                } else {
                    mesh.rotation.z = 0;
                }
            }
        });
        
        // Update bird meshes with parallax
        this.birdMeshes.forEach(mesh => {
            if (mesh.userData.basePos) {
                // Calculate parallax factor based on z-depth
                // Closer objects (more positive z) move more
                const objectZ = mesh.userData.basePos.z;
                const parallaxFactor = (camDist - objectZ) / camDist;
                
                // Apply parallax movement (closer = more movement)
                const parallaxStrength = 0.3; // Overall parallax strength
                const parallaxX = this.mouse.x * parallaxFactor * parallaxStrength;
                const parallaxY = this.mouse.y * parallaxFactor * parallaxStrength;
                
                mesh.position.x = mesh.userData.basePos.x + parallaxX;
                mesh.position.y = mesh.userData.basePos.y + parallaxY;
                mesh.position.z = mesh.userData.basePos.z; // Keep z unchanged
                
                // Apply quick rotation animation with hold positions for bird bodies only (1.png)
                if (mesh.userData.isBirdBody && mesh.userData.imgNum === 1) {
                    const time = this.clock.getElapsedTime();
                    
                    // Animation timing parameters
                    const moveDuration = 0.4; // Quick movement: 0.4 seconds to rotate
                    // Use randomized hold duration
                    const holdDuration = mesh.userData.holdDuration || 2.5;
                    
                    // Apply random start offset so birds don't all animate in sync
                    const animationTime = time + (mesh.userData.animationStartOffset || 0);
                    
                    // Cycle phases:
                    // Phase 1: Move to max rotation (0 to moveDuration)
                    // Phase 2: Hold at max rotation (moveDuration to moveDuration + holdDuration)
                    // Phase 3: Move back to 0 (moveDuration + holdDuration to 2*moveDuration + holdDuration)
                    // Phase 4: Hold at 0 (2*moveDuration + holdDuration to 2*moveDuration + 2*holdDuration)
                    const cycleDuration = 2 * moveDuration + 2 * holdDuration;
                    
                    // Get position within current cycle (0 to cycleDuration)
                    const cycleTime = animationTime % cycleDuration;
                    
                    // Rotation amplitude (about 8.6 degrees)
                    // Folders 2 and 4 rotate in opposite direction
                    const baseRotationAmplitude = 0.15;
                    const direction = (mesh.userData.folder === 2 || mesh.userData.folder === 4) ? -1 : 1;
                    const rotationAmplitude = baseRotationAmplitude * direction;
                    
                    if (cycleTime < moveDuration) {
                        // Phase 1: Quick move to max rotation
                        const t = cycleTime / moveDuration; // 0 to 1
                        // Smooth easing using ease-out curve
                        const eased = 1 - Math.pow(1 - t, 3); // Cubic ease-out
                        mesh.rotation.z = eased * rotationAmplitude;
                    } else if (cycleTime < moveDuration + holdDuration) {
                        // Phase 2: Hold at max rotation
                        mesh.rotation.z = rotationAmplitude;
                    } else if (cycleTime < 2 * moveDuration + holdDuration) {
                        // Phase 3: Quick move back to 0 (same speed as Phase 1)
                        const t = (cycleTime - moveDuration - holdDuration) / moveDuration; // 0 to 1
                        // Use same ease-out curve for consistent speed
                        const eased = 1 - Math.pow(1 - t, 3); // Cubic ease-out
                        mesh.rotation.z = rotationAmplitude * (1 - eased);
                    } else {
                        // Phase 4: Hold at 0 (original position)
                        mesh.rotation.z = 0;
                    }
                } else {
                    // Branch/feet (2.png) - no rotation
                    mesh.rotation.z = 0;
                }
            }
        });
        
        // Update sparkle positions and rotations for animation
        const time = this.clock.getElapsedTime();
        this.branchCircles.forEach(branchData => {
            const branchMesh = branchData.branchMesh;
            if (!branchMesh.userData.basePos) return;
            
            // Calculate parallax for the branch
            const objectZ = branchMesh.userData.basePos.z;
            const parallaxFactor = (camDist - objectZ) / camDist;
            const parallaxStrength = 0.3;
            const parallaxX = this.mouse.x * parallaxFactor * parallaxStrength;
            const parallaxY = this.mouse.y * parallaxFactor * parallaxStrength;
            
            // Get branch world position (including z for depth matching)
            const branchWorldPos = new THREE.Vector3();
            branchMesh.getWorldPosition(branchWorldPos);
            
            branchData.circles.forEach((sparkle, index) => {
                // Get current position from SPARKLE_POSITIONS config (allows live editing)
                const folder = sparkle.userData.folder;
                let relativePos = sparkle.userData.relativePos; // Fallback to stored position
                
                // Try to read current position from config
                if (this.SPARKLE_POSITIONS && this.SPARKLE_POSITIONS[folder]) {
                    const configPositions = this.SPARKLE_POSITIONS[folder];
                    if (configPositions && configPositions.length > 0) {
                        // Sort positions the same way as during creation (by x-coordinate)
                        const sortedPositions = [...configPositions].sort((a, b) => a.x - b.x);
                        
                        if (sortedPositions[index]) {
                            const configPos = sortedPositions[index];
                            const branchWidth = branchMesh.geometry.parameters.width;
                            const branchHeight = branchMesh.geometry.parameters.height;
                            // Convert normalized position to world coordinates
                            const circleX = configPos.x * branchWidth;
                            const circleY = configPos.y * branchHeight;
                            relativePos = new THREE.Vector3(circleX, circleY, 0);
                        }
                    }
                }
                
                // Calculate wiggle offset (random position variation)
                let wiggleX = 0;
                let wiggleY = 0;
                if (sparkle.userData.wiggleSpeedX && sparkle.userData.wiggleAmplitude) {
                    const wigglePhaseX = time * sparkle.userData.wiggleSpeedX + sparkle.userData.wigglePhaseX;
                    const wigglePhaseY = time * sparkle.userData.wiggleSpeedY + sparkle.userData.wigglePhaseY;
                    wiggleX = Math.sin(wigglePhaseX) * sparkle.userData.wiggleAmplitude;
                    wiggleY = Math.cos(wigglePhaseY) * sparkle.userData.wiggleAmplitude;
                }
                
                // Update position to follow branch with parallax and wiggle
                // Use branch's world z-position to ensure sparkles are at exact same depth
                sparkle.position.set(
                    branchWorldPos.x + relativePos.x + parallaxX + wiggleX,
                    branchWorldPos.y + relativePos.y + parallaxY + wiggleY,
                    branchWorldPos.z // Same depth as branch (use world z-position)
                );
                
                // Rotate sparkle
                if (sparkle.userData.rotationSpeed) {
                    sparkle.rotation.z = time * sparkle.userData.rotationSpeed;
                }
                
                // Animate sparkle breathing (size pulsing)
                // Combine breathing animation with scale multiplier (for lit/unlit states)
                if (sparkle.userData.breathingSpeed && sparkle.userData.baseSize) {
                    const breathingPhase = time * sparkle.userData.breathingSpeed + sparkle.userData.breathingPhase;
                    const breathingScale = 1.0 + Math.sin(breathingPhase) * sparkle.userData.breathingAmplitude;
                    const scaleMultiplier = sparkle.scaleMultiplier !== undefined ? sparkle.scaleMultiplier : 1.0;
                    const currentSize = sparkle.userData.baseSize * breathingScale * scaleMultiplier;
                    sparkle.scale.set(currentSize, currentSize, 1);
                }
            });
        });
        
        // Update floating sparkles
        const floatTime = this.clock.getElapsedTime();
        this.floatingSparkles.forEach(sparkle => {
            // Floating animation (gentle movement)
            if (sparkle.userData.floatSpeedX && sparkle.userData.initialPos) {
                const floatX = Math.sin(floatTime * sparkle.userData.floatSpeedX + sparkle.userData.floatPhaseX) * sparkle.userData.floatAmplitudeX;
                const floatY = Math.cos(floatTime * sparkle.userData.floatSpeedY + sparkle.userData.floatPhaseY) * sparkle.userData.floatAmplitudeY;
                
                sparkle.position.x = sparkle.userData.initialPos.x + floatX;
                sparkle.position.y = sparkle.userData.initialPos.y + floatY;
                sparkle.position.z = sparkle.userData.initialPos.z;
            }
            
            // Rotate sparkle
            if (sparkle.userData.rotationSpeed) {
                sparkle.rotation.z = floatTime * sparkle.userData.rotationSpeed;
            }
            
            // Breathing animation (size pulsing)
            if (sparkle.userData.breathingSpeed && sparkle.userData.baseSize) {
                const breathingPhase = floatTime * sparkle.userData.breathingSpeed + sparkle.userData.breathingPhase;
                const breathingScale = 1.0 + Math.sin(breathingPhase) * sparkle.userData.breathingAmplitude;
                const scaleMultiplier = sparkle.scaleMultiplier !== undefined ? sparkle.scaleMultiplier : 1.0;
                const currentSize = sparkle.userData.baseSize * breathingScale * scaleMultiplier;
                sparkle.scale.set(currentSize, currentSize, 1);
            }
        });
        
        // Update floating sparkles based on branch sparkle states
        this.updateFloatingSparkles();
        
        // Check if all sparkles are lit and show NEXT button after 3 seconds
        if (!this.nextButtonShown && this.branchCircles.length > 0) {
            const allLit = this.areAllSparklesLit();
            
            // Periodic debug logging (every 2 seconds)
            const currentTime = this.clock.getElapsedTime();
            if (currentTime - this.lastDebugLogTime >= 2.0) {
                let totalSparkles = 0;
                let litSparkles = 0;
                this.branchCircles.forEach(branchData => {
                    branchData.circles.forEach(sparkle => {
                        totalSparkles++;
                        if (sparkle.userData.isLit) {
                            litSparkles++;
                        }
                    });
                });
                console.log(`[Stage4] Sparkle status: ${litSparkles}/${totalSparkles} lit, allLit: ${allLit}, timer: ${this.allSparklesLitTime !== null ? (currentTime - this.allSparklesLitTime).toFixed(2) + 's' : 'not started'}`);
                this.lastDebugLogTime = currentTime;
            }
            
            if (allLit) {
                // If all sparkles are lit, track when this happened
                if (this.allSparklesLitTime === null) {
                    this.allSparklesLitTime = this.clock.getElapsedTime();
                    console.log('[Stage4] All sparkles are now lit, starting 3 second timer at time:', this.allSparklesLitTime.toFixed(2));
                } else {
                    // Check if 3 seconds have passed since all sparkles became lit
                    const elapsedSinceAllLit = this.clock.getElapsedTime() - this.allSparklesLitTime;
                    if (elapsedSinceAllLit >= 3.0) {
                        console.log('[Stage4] 3 seconds have passed since all sparkles lit, showing NEXT button');
                        console.log('[Stage4] Elapsed time:', elapsedSinceAllLit.toFixed(2), 'seconds');
                        this.showNextButton();
                    }
                }
            } else {
                // If not all sparkles are lit, reset the timer
                if (this.allSparklesLitTime !== null) {
                    const wasWaiting = this.clock.getElapsedTime() - this.allSparklesLitTime;
                    this.allSparklesLitTime = null;
                    console.log('[Stage4] Not all sparkles are lit, resetting timer (was waiting for', wasWaiting.toFixed(2), 'seconds)');
                }
            }
        } else if (!this.nextButtonShown && this.branchCircles.length === 0) {
            // Debug: log if branchCircles is empty (only once)
            const currentTime = this.clock.getElapsedTime();
            if (currentTime - this.lastDebugLogTime >= 5.0) {
                console.log('[Stage4] Waiting for branchCircles to be created... (branchCircles.length =', this.branchCircles.length + ')');
                this.lastDebugLogTime = currentTime;
            }
        }
        
        // Render the scene
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    onResize() {
        const aspect = window.innerWidth / window.innerHeight;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Update all meshes to maintain correct size
        // Recalculate viewport dimensions
        const fov = this.camera.fov;
        const camDist = this.camera.position.z;
        const vFOV = THREE.MathUtils.degToRad(fov);
        const viewportHeight = 2 * Math.tan(vFOV / 2) * camDist;
        const viewportWidth = viewportHeight * aspect;
        const scaleFactor = 1.2;
        
        // Update plant meshes
        this.plantMeshes.forEach(mesh => {
            if (mesh.material && mesh.material.map && mesh.material.map.image) {
                const texture = mesh.material.map;
                const imageAspect = texture.image.width / texture.image.height;
                const folder = mesh.userData.folder;
                const imgNum = mesh.userData.imgNum;
                
                // Get configuration for this specific file
                let config;
                if (folder === 0) {
                    config = this.PLANT_CONFIG[0] || { scale: 1.2, x: 0, y: 0 };
                } else {
                    const folderConfig = this.PLANT_CONFIG[folder];
                    config = (folderConfig && folderConfig[imgNum]) || { scale: 1, x: 0, y: 0 };
                }
                
                // Apply scale compensation based on z-depth
                // This ensures all plant files appear the same size regardless of their depth
                // Objects further back (more negative z) are scaled larger to compensate
                const objectZ = mesh.userData.basePos ? mesh.userData.basePos.z : mesh.position.z;
                const scaleCompensation = camDist / (camDist - objectZ);
                const adjustedScale = config.scale * scaleCompensation;
                
                // Update stored scale compensation
                if (mesh.userData) {
                    mesh.userData.scaleCompensation = scaleCompensation;
                }
                
                let newWidth, newHeight;
                
                if (imageAspect > aspect) {
                    newWidth = viewportWidth * adjustedScale;
                    newHeight = newWidth / imageAspect;
                } else {
                    newHeight = viewportHeight * adjustedScale;
                    newWidth = newHeight * imageAspect;
                }
                
                mesh.geometry.dispose();
                mesh.geometry = new THREE.PlaneGeometry(newWidth, newHeight);
                
                // Update position with config
                mesh.position.x = config.x;
                mesh.position.y = config.y;
                
                // Update base position for parallax
                if (mesh.userData.basePos) {
                    mesh.userData.basePos.x = config.x;
                    mesh.userData.basePos.y = config.y;
                }
                
                // Preserve wiggle parameters if they already exist (only initialize once)
                if (folder !== 0) {
                    if (mesh.userData.wiggleFrequency === undefined) {
                        mesh.userData.wiggleFrequency = 0.3 + Math.random() * 0.5;
                    }
                    if (mesh.userData.wiggleAmplitude === undefined) {
                        mesh.userData.wiggleAmplitude = 0.02 + Math.random() * 0.06;
                    }
                    if (mesh.userData.wigglePhase === undefined) {
                        mesh.userData.wigglePhase = Math.random() * Math.PI * 2;
                    }
                }
            }
        });
        
        // Update bird meshes
        this.birdMeshes.forEach(mesh => {
            if (mesh.material && mesh.material.map && mesh.material.map.image) {
                const texture = mesh.material.map;
                const imageAspect = texture.image.width / texture.image.height;
                const folder = mesh.userData.folder;
                const imgNum = mesh.userData.imgNum;
                
                // Get folder-level base configuration
                const folderConfig = this.BIRD_CONFIG[folder] || { scale: 1.2, x: 0, y: 0, z: undefined };
                
                // Get relative offset for this image (if it exists) from internal offsets
                const folderOffsets = this.BIRD_OFFSETS[folder] || {};
                const offset = folderOffsets[imgNum] || { scale: 1, x: 0, y: 0, z: 0 };
                
                // Calculate the center point of all images in this folder (at reference scale = 1)
                const numImages = 2;
                const centerX = folderConfig.x + (offset.x || 0) / numImages;
                const centerY = folderConfig.y + (offset.y || 0) / numImages;
                let baseZ = folderConfig.z;
                if (baseZ === undefined) {
                    baseZ = 1.0 + (4 - folder) * 0.4;
                }
                const centerZ = baseZ + (offset.z || 0) / numImages;
                
                // Calculate offset from center for this image (at reference scale = 1)
                let offsetFromCenterX, offsetFromCenterY, offsetFromCenterZ;
                if (imgNum === 1) {
                    offsetFromCenterX = folderConfig.x - centerX;
                    offsetFromCenterY = folderConfig.y - centerY;
                    offsetFromCenterZ = baseZ - centerZ;
                } else {
                    offsetFromCenterX = (folderConfig.x + (offset.x || 0)) - centerX;
                    offsetFromCenterY = (folderConfig.y + (offset.y || 0)) - centerY;
                    offsetFromCenterZ = (baseZ + (offset.z || 0)) - centerZ;
                }
                
                // Apply scale to the offset from center, then add to center
                const scaleFactor = folderConfig.scale * (offset.scale || 1);
                const finalX = centerX + offsetFromCenterX * folderConfig.scale;
                const finalY = centerY + offsetFromCenterY * folderConfig.scale;
                const finalZ = centerZ + offsetFromCenterZ * folderConfig.scale;
                
                let newWidth, newHeight;
                
                if (imageAspect > aspect) {
                    newWidth = viewportWidth * scaleFactor;
                    newHeight = newWidth / imageAspect;
                } else {
                    newHeight = viewportHeight * scaleFactor;
                    newWidth = newHeight * imageAspect;
                }
                
                mesh.geometry.dispose();
                mesh.geometry = new THREE.PlaneGeometry(newWidth, newHeight);
                
                // For bird bodies (1.png), set rotation pivot at the bottom
                if (imgNum === 1) {
                    // Translate geometry so bottom is at origin (pivot point)
                    mesh.geometry.translate(0, newHeight / 2, 0);
                    
                    // Store the bottom offset for position adjustment
                    mesh.userData.bottomOffset = newHeight / 2;
                    mesh.userData.isBirdBody = true;
                    
                    // Preserve randomized animation values if they already exist
                    // (only initialize them once when mesh is first created)
                    if (mesh.userData.animationStartOffset === undefined) {
                        mesh.userData.animationStartOffset = Math.random() * 6.0;
                    }
                    if (mesh.userData.holdDuration === undefined) {
                        mesh.userData.holdDuration = 4.0 + Math.random() * 3.0;
                    }
                    
                    // Adjust position to account for geometry translation
                    mesh.position.x = finalX;
                    mesh.position.y = finalY - newHeight / 2;
                    mesh.position.z = finalZ;
                } else {
                    // Branch/feet (2.png) - no rotation, no offset
                    mesh.userData.bottomOffset = 0;
                    mesh.userData.isBirdBody = false;
                    mesh.position.x = finalX;
                    mesh.position.y = finalY;
                    mesh.position.z = finalZ;
                    
                    // Update circle positions for this branch
                    this.updateBranchCircles(mesh, newWidth, newHeight);
                }
                
                // Update base position for parallax
                if (mesh.userData.basePos) {
                    mesh.userData.basePos.x = mesh.position.x;
                    mesh.userData.basePos.y = mesh.position.y;
                    mesh.userData.basePos.z = finalZ;
                }
            }
        });
    }
    
    updateBranchCircles(branchMesh, branchWidth, branchHeight) {
        // Find the branch data for this mesh
        const branchData = this.branchCircles.find(data => data.branchMesh === branchMesh);
        if (!branchData) return;
        
        const folder = branchMesh.userData.folder;
        
        branchData.circles.forEach((sparkle, index) => {
            // Get current position from SPARKLE_POSITIONS config (allows live editing)
            let normalizedPos = sparkle.userData.normalizedPos; // Fallback
            
            // Try to read current position from config
            if (this.SPARKLE_POSITIONS && this.SPARKLE_POSITIONS[folder]) {
                const configPositions = this.SPARKLE_POSITIONS[folder];
                if (configPositions && configPositions.length > 0) {
                    // Sort positions the same way as during creation (by x-coordinate)
                    const sortedPositions = [...configPositions].sort((a, b) => a.x - b.x);
                    if (sortedPositions[index]) {
                        normalizedPos = sortedPositions[index];
                    }
                }
            }
            
            if (normalizedPos) {
                // Convert normalized coordinates to world coordinates relative to branch
                const circleX = normalizedPos.x * branchWidth;
                const circleY = normalizedPos.y * branchHeight;
                
                // Update relative position (actual position will be updated in update loop)
                sparkle.userData.relativePos.set(circleX, circleY, 0);
            }
        });
    }
    
    showNextButton() {
        console.log('[Stage4] showNextButton() called');
        if (this.nextButtonShown) {
            console.log('[Stage4] Button already shown, returning early');
            return; // Prevent multiple buttons
        }
        this.nextButtonShown = true;
        console.log('[Stage4] Creating NEXT button element...');
        
        // Create NEXT button element - same style as other stages
        const nextButton = document.createElement('div');
        nextButton.id = 'next-button';
        nextButton.innerHTML = 'NEXT';
        nextButton.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 200px;
            height: 60px;
            background-color: #6a7391;
            color: white;
            font-family: sans-serif;
            font-size: 18px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 100000;
            border: 3px solid #e5e5eb;
            border-radius: 20px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
            opacity: 0;
            pointer-events: auto;
        `;
        
        document.body.appendChild(nextButton);
        console.log('[Stage4] NEXT button added to DOM, element:', nextButton);
        console.log('[Stage4] Button position:', nextButton.getBoundingClientRect());
        
        // Fade in the button
        gsap.to(nextButton, {
            opacity: 1,
            duration: 1.0,
            ease: "power2.out",
            onComplete: () => {
                console.log('[Stage4] NEXT button fade-in complete');
            }
        });
        
        // Add hover effect
        nextButton.addEventListener('mouseenter', () => {
            gsap.to(nextButton, {
                scale: 1.05,
                duration: 0.2,
                ease: "power2.out"
            });
        });
        
        nextButton.addEventListener('mouseleave', () => {
            gsap.to(nextButton, {
                scale: 1.0,
                duration: 0.2,
                ease: "power2.out"
            });
        });
        
        // Add click handler
        nextButton.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log("[Stage4] NEXT button clicked");
            if (this.onComplete) {
                // Disable pointer events immediately
                nextButton.style.pointerEvents = 'none';
                
                // Ensure button stays on top during fadeout
                nextButton.style.zIndex = '100000';
                
                // Fade out button
                gsap.to(nextButton, {
                    opacity: 0,
                    duration: 0.3,
                    ease: "power2.in",
                    onComplete: () => {
                        requestAnimationFrame(() => {
                            nextButton.remove();
                            console.log("[Stage4] Button fully faded, calling onComplete");
                            this.onComplete();
                        });
                    }
                });
            } else {
                console.warn("[Stage4] onComplete callback not set");
            }
        });
        
        this.nextButtonElement = nextButton;
    }
    
    dispose() {
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('click', this.onMouseClick);
        
        // Remove NEXT button if it exists
        if (this.nextButtonElement && this.nextButtonElement.parentNode) {
            this.nextButtonElement.remove();
        }
        
        // Clean up audio
        if (this.audioManager) {
            this.audioManager.dispose();
        }
        
        // Clean up floating sparkles
        this.floatingSparkles.forEach(sparkle => {
            if (sparkle.parent) {
                this.scene.remove(sparkle);
            }
            if (sparkle.material) {
                if (sparkle.material.map) {
                    sparkle.material.map.dispose();
                }
                sparkle.material.dispose();
            }
        });
        this.floatingSparkles = [];
        
        // Clean up branch sparkles
        this.branchCircles.forEach(branchData => {
            branchData.circles.forEach(sparkle => {
                if (sparkle.parent) {
                    this.scene.remove(sparkle);
                }
                if (sparkle.material) {
                    if (sparkle.material.map) {
                        sparkle.material.map.dispose();
                    }
                    sparkle.material.dispose();
                }
            });
        });
        this.branchCircles = [];
        
        // Clean up plant meshes
        this.plantMeshes.forEach(mesh => {
            if (mesh.parent) {
                this.scene.remove(mesh);
            }
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (mesh.material.map) mesh.material.map.dispose();
                mesh.material.dispose();
            }
        });
        this.plantMeshes = [];
        
        // Clean up bird meshes
        this.birdMeshes.forEach(mesh => {
            if (mesh.parent) {
                this.scene.remove(mesh);
            }
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (mesh.material.map) mesh.material.map.dispose();
                mesh.material.dispose();
            }
        });
        this.birdMeshes = [];
        
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.remove();
        }
    }
}

