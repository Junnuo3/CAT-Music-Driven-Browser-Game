class Stage3 {
    constructor(waterState, onCompleteCallback) {
        // Drum volume settings
        this.CONFIG = {
            drumVolumes: {
                kicks: 0.7,
                snare: 0.7,
                openhihats: 0.7,
                closedhihats: 0.3
            }
        };
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.waterState = waterState; // Store water state from Stage 2
        this.onComplete = onCompleteCallback; // Callback for NEXT button
        this.clock = new THREE.Clock();
        
        // Flower system
        this.flowerTextures = [];
        this.flowers = []; // Array of { mesh, shadowMesh, speed, width, height }
        
        // Circle system for speed stages
        this.circleTextures = [];
        this.circles = []; // Array of { mesh, stage, targetOpacity, currentOpacity }
        this.keyPressTimes = []; // Track timestamps of key presses
        this.currentSpeed = 0; // Current speed (presses per second)
        this.speedThreshold = 3.5; // Speed threshold to maintain (presses per second)
        this.rotationCenterX = -1; // X position of red dot in 5.png (rotation center)
        this.rotationCenterY = 0; // Y position of red dot in 5.png (will be set to camera.position.y)
        this.timeAtThreshold = 0; // Time spent at or above threshold (in seconds)
        this.timeBelowThreshold = 0; // Time spent below threshold (in seconds)
        this.maxStageReached = 0; // Maximum stage reached (0-5)
        this.currentVisibleStage = 0; // Current visible stage (0-5) - tracks what's actually visible
        this.speedUpdateInterval = null;
        this.timePerStage = 2.0; // 5 seconds per stage
        this.timeCircle5Visible = 0; // Time circle 5 has been visible (in seconds)
        this.circle5Locked = false; // Whether circle 5 is locked (won't disappear)
        this.nextButtonShown = false; // Whether NEXT button has been shown
        
        // Water animation
        this.initialTime = 0; // Will be set from waterState if available
        
        this.init();
    }

    init() {
        // Setup Three.js scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xaaccff);
        
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        
        // Use camera position from water state if available
        if (this.waterState && this.waterState.cameraPosition) {
            this.camera.position.copy(this.waterState.cameraPosition);
            this.camera.lookAt(0, this.waterState.cameraPosition.y, 0);
            this.camera.updateMatrixWorld();
            if (this.waterState.cameraRotation) {
                this.camera.rotation.copy(this.waterState.cameraRotation);
            }
        } else {
            // Initial position for direct load
            this.camera.position.set(0, 0, 20);
            this.camera.lookAt(0, 0, 0);
            this.camera.updateMatrixWorld();
        }
        
        // Create renderer with matching background to prevent black flash
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: false,
            preserveDrawingBuffer: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.setClearColor(0xaaccff, 1.0);
        
        const canvas = this.renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.zIndex = '1';
        canvas.style.opacity = '0';
        
        this.canvas = canvas;
        document.body.appendChild(canvas);
        
        // Create water mesh immediately if state exists
        if (this.waterState) {
            this.createWaterBackground();
        } else {
            canvas.style.opacity = '1';
            this.createDefaultWaterBackground();
        }
        
        // Force first render to prevent black flash
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        
        // Handle window resize
        window.addEventListener('resize', this.onResize.bind(this));
        
        // Setup audio triggers for arrow keys
        this.setupAudioTriggers();
        
        // Load flower textures
        this.loadFlowerTextures();
        
        // Load circle textures
        this.loadCircleTextures();
        
        // Start speed tracking
        this.startSpeedTracking();
    }
    
    setupAudioTriggers() {
        // Define audio file paths (relative to project root)
        this.audioDirs = {
            kicks: './audio/kicks/',
            snare: './audio/snare/',
            openhihats: './audio/openhihats/',
            closedhihats: './audio/closedhihats/'
        };
        
        // Audio file lists for each directory
        this.audioFileLists = {
            kicks: [
                'KSHMR Acoustic Kick 01 - Light.wav',
                'KSHMR Acoustic Kick 02 - Light.wav',
                'KSHMR Acoustic Kick 03 - Light.wav',
                'KSHMR Acoustic Kick 04 - Light.wav'
            ],
            snare: [
                'KSHMR Acoustic Snare 01 (A#).wav',
                'KSHMR Acoustic Snare 02 (A#).wav',
                'KSHMR Acoustic Snare 03 (B).wav',
                'KSHMR Acoustic Snare 04 (C#).wav'
            ],
            openhihats: [
                'KSHMR Acoustic Open Hat 01 - Full Open.wav',
                'KSHMR Acoustic Open Hat 02 - Full Open.wav'
            ],
            closedhihats: [
                'KSHMR Acoustic Closed Hat 01 - A.wav',
                'KSHMR Acoustic Closed Hat 01 - B.wav',
                'KSHMR Acoustic Closed Hat 01 - C.wav',
                'KSHMR Acoustic Closed Hat 01 - D.wav'
            ]
        };
        
        // Preload all audio files
        this.preloadAudioFiles();
        
        // Bind keydown handler
        this.onKeyDown = this.onKeyDown.bind(this);
        window.addEventListener('keydown', this.onKeyDown);
    }
    
    preloadAudioFiles() {
        // Store audio file paths for each type
        // We'll create fresh Audio elements each time to avoid cloning issues
        this.preloadedAudio = {};
        
        Object.keys(this.audioFileLists).forEach(audioType => {
            this.preloadedAudio[audioType] = [];
            const files = this.audioFileLists[audioType];
            
            files.forEach(fileName => {
                // URL encode only the filename to handle special characters like #, (, )
                // Split the path and encode just the filename part
                const encodedFileName = encodeURIComponent(fileName);
                const audioPath = this.audioDirs[audioType] + encodedFileName;
                
                // Preload by creating and loading an audio element
                const preloadAudio = new Audio(audioPath);
                preloadAudio.preload = 'auto';
                preloadAudio.volume = this.CONFIG.drumVolumes[audioType] || 0.7;
                
                // Add error handler to detect loading issues
                preloadAudio.addEventListener('error', (e) => {
                    console.error(`[Stage3] Failed to load audio: ${audioPath}`, e, preloadAudio.error);
                });
                
                preloadAudio.addEventListener('canplaythrough', () => {
                    console.log(`[Stage3] Audio ready: ${fileName}`);
                });
                
                // Start loading
                preloadAudio.load();
                
                // Store both the encoded path (for Audio constructor) and original filename
                this.preloadedAudio[audioType].push({
                    path: audioPath,
                    fileName: fileName
                });
            });
        });
        
        console.log("[Stage3] Audio files preloading...");
    }
    
    playRandomAudio(audioType) {
        const audioList = this.preloadedAudio[audioType];
        if (!audioList || audioList.length === 0) {
            console.warn(`[Stage3] No audio files found for ${audioType}`);
            return;
        }
        
        // Log all available files for debugging
        console.log(`[Stage3] Available ${audioType} files:`, audioList.map(a => a.fileName));
        
        // Pick a random file
        const randomIndex = Math.floor(Math.random() * audioList.length);
        const audioData = audioList[randomIndex];
        
        console.log(`[Stage3] Selected ${audioType}: ${audioData.fileName} (index: ${randomIndex}/${audioList.length})`);
        console.log(`[Stage3] Using path: ${audioData.path}`);
        
        // Create a fresh Audio element each time (more reliable than cloning)
        const audio = new Audio(audioData.path);
        audio.volume = this.CONFIG.drumVolumes[audioType] || 0.7;
        
        // Add multiple event listeners for debugging
        audio.addEventListener('loadstart', () => {
            console.log(`[Stage3] Load started: ${audioData.fileName}`);
        });
        
        audio.addEventListener('loadeddata', () => {
            console.log(`[Stage3] Data loaded: ${audioData.fileName}`);
        });
        
        audio.addEventListener('canplay', () => {
            console.log(`[Stage3] Can play: ${audioData.fileName}`);
        });
        
        audio.addEventListener('error', (e) => {
            console.error(`[Stage3] Error loading/playing audio ${audioData.path}:`, e);
            if (audio.error) {
                console.error(`[Stage3] Audio error code: ${audio.error.code}, message: ${audio.error.message}`);
            }
        });
        
        // Reset to beginning and play
        audio.currentTime = 0;
        
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log(`[Stage3] Successfully started playing: ${audioData.fileName}`);
            }).catch(err => {
                console.error(`[Stage3] Error playing audio ${audioData.path}:`, err);
                console.error(`[Stage3] Failed file: ${audioData.fileName}`);
            });
        }
    }
    
    onKeyDown(event) {
        // Prevent default arrow key behavior (scrolling)
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
        }
        
        // Track key press for speed calculation
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            this.recordKeyPress();
        }
        
        // Play audio
        switch(event.key) {
            case 'ArrowLeft':
                this.playRandomAudio('kicks');
                break;
            case 'ArrowRight':
                this.playRandomAudio('snare');
                break;
            case 'ArrowUp':
                this.playRandomAudio('openhihats');
                break;
            case 'ArrowDown':
                this.playRandomAudio('closedhihats');
                break;
        }
        
        // Create falling flower for any arrow key
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            this.createFallingFlower();
        }
    }
    
    recordKeyPress() {
        const now = Date.now();
        this.keyPressTimes.push(now);
        
        // Keep only the last 10 key presses (for speed calculation)
        if (this.keyPressTimes.length > 10) {
            this.keyPressTimes.shift();
        }
    }
    
    calculateSpeed() {
        if (this.keyPressTimes.length < 2) {
            return 0;
        }
        
        // Only consider recent key presses (within last 2 seconds)
        const now = Date.now();
        const recentTimes = this.keyPressTimes.filter(time => now - time < 2000); // Last 2 seconds
        
        if (recentTimes.length < 2) {
            return 0; // Not enough recent presses
        }
        
        // Calculate presses per second based on time span
        // If we have N presses in the last 2 seconds, speed = (N-1) / (timeSpan / 1000)
        const timeSpan = recentTimes[recentTimes.length - 1] - recentTimes[0]; // Time from first to last press
        if (timeSpan === 0) {
            return 0; // All presses at same time
        }
        
        const pressesPerSecond = (recentTimes.length - 1) / (timeSpan / 1000);
        
        return pressesPerSecond;
    }
    
    startSpeedTracking() {
        // Update speed and stage every 100ms
        this.speedUpdateInterval = setInterval(() => {
            this.currentSpeed = this.calculateSpeed();
            this.updateSpeedStage();
        }, 100);
    }
    
    updateSpeedStage() {
        const deltaTime = 0.1; // Update interval is 100ms = 0.1 seconds
        
        // Check if circle 5 is visible and track time
        const circle5 = this.circles.find(c => c.stage === 5);
        if (circle5 && circle5.currentOpacity > 0.5) {
            // Circle 5 is visible - track time
            this.timeCircle5Visible += deltaTime;
            
            // After 3 seconds, lock circle 5 and show NEXT button
            if (this.timeCircle5Visible >= 3.0 && !this.circle5Locked) {
                this.circle5Locked = true;
                console.log("[Stage3] Circle 5 locked after 3 seconds");
                this.showNextButton();
            }
        } else {
            // Circle 5 is not visible - reset timer (unless locked)
            if (!this.circle5Locked) {
                this.timeCircle5Visible = 0;
            }
        }
        
        // Debug: Log speed and threshold
        if (this.currentSpeed > 0) {
            console.log(`[Stage3] Speed: ${this.currentSpeed.toFixed(2)}/s, Threshold: ${this.speedThreshold}, At threshold: ${this.currentSpeed >= this.speedThreshold}`);
        }
        
        // Check if speed is at or above threshold
        if (this.currentSpeed >= this.speedThreshold) {
            // Speed is good - increment time at threshold
            this.timeAtThreshold += deltaTime;
            this.timeBelowThreshold = 0; // Reset time below threshold
            
            // Calculate which stage should be visible based on time maintained
            // Each stage requires timePerStage seconds of maintaining speed
            // Stage 1 appears after 0-2s, Stage 2 after 2-4s, Stage 3 after 4-6s, etc.
            // timeAtThreshold = 0.0-2.0 -> stage 1, 2.0-4.0 -> stage 2, etc.
            const newStage = Math.floor(this.timeAtThreshold / this.timePerStage) + 1; // +1 because stage 1 should appear immediately
            const clampedStage = Math.min(5, Math.max(1, newStage)); // Min 1, Max 5 stages
            
            // Update max stage reached
            if (clampedStage > this.maxStageReached) {
                this.maxStageReached = clampedStage;
            }
            
            // Update current visible stage
            this.currentVisibleStage = clampedStage;
            
            // Debug: Log stage calculation
            console.log(`[Stage3] Time at threshold: ${this.timeAtThreshold.toFixed(2)}s, Calculated stage: ${newStage}, Clamped stage: ${clampedStage}`);
            
            // Update circles based on time maintained
            this.updateCircles(clampedStage);
        } else {
            // Speed is below threshold (including when stopped/speed is 0)
            // If circle 5 is locked (NEXT button appeared), keep all circles visible
            if (this.circle5Locked) {
                // All circles should stay visible - don't update based on speed
                this.currentVisibleStage = 5; // Keep all 5 circles visible
                this.updateCircles(5);
            } else {
                // Speed is below threshold (including when stopped/speed is 0)
                // When speed first drops below threshold, capture the current visible stage
                if (this.timeBelowThreshold === 0) {
                    // Just dropped below threshold - use maxStageReached as starting point
                    // This ensures we start disappearing from what was actually visible
                    if (this.currentVisibleStage === 0) {
                        this.currentVisibleStage = this.maxStageReached;
                    }
                }
                
                this.timeBelowThreshold += deltaTime;
                this.timeAtThreshold = 0; // Reset time at threshold
                
                // Calculate which circles should remain based on time below threshold
                // Each circle disappears after 2 second intervals in sequence: 5, 4, 3, 2, 1
                // Circle 5 starts disappearing after 2s, circle 4 after 4s, etc.
                const timePerCircle = 2.0; // 2 seconds per circle
                
                // Calculate which stage should remain
                // Start from the stage that was visible when speed dropped (stored in currentVisibleStage)
                // After 2s: remove circle 5 (stage becomes 4)
                // After 4s: remove circle 4 (stage becomes 3)
                // After 6s: remove circle 3 (stage becomes 2)
                // After 8s: remove circle 2 (stage becomes 1)
                // After 10s: remove circle 1 (stage becomes 0)
                const circlesToRemove = Math.floor(this.timeBelowThreshold / timePerCircle);
                const startingStage = this.currentVisibleStage > 0 ? this.currentVisibleStage : this.maxStageReached;
                const newStage = Math.max(0, startingStage - circlesToRemove);
                
                // Update current visible stage
                this.currentVisibleStage = newStage;
                
                // Update circles - remove stages in reverse order (5 to 1), 2 seconds per circle
                this.updateCircles(newStage);
                
                // If all stages are removed, reset max stage reached
                if (newStage === 0) {
                    this.maxStageReached = 0;
                    this.currentVisibleStage = 0;
                }
            }
        }
    }
    
    loadCircleTextures() {
        const loader = new THREE.TextureLoader();
        const circleFiles = ['1.png', '2.png', '3.png', '4.png', '5.png'];
        
        let loadedCount = 0;
        circleFiles.forEach((fileName, index) => {
            loader.load(`./assets/circle/${fileName}`, (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                this.circleTextures[index] = tex; // Store by index (0-4 for stages 1-5)
                loadedCount++;
                if (loadedCount === circleFiles.length) {
                    console.log(`[Stage3] All ${loadedCount} circle textures loaded`);
                    // Create initial circles (hidden)
                    this.createCircles();
                }
            }, undefined, (err) => {
                console.error(`[Stage3] Failed to load circle texture: ${fileName}`, err);
            });
        });
    }
    
    createCircles() {
        // Calculate viewport dimensions for positioning
        const fov = this.camera.fov;
        const camDist = this.camera.position.z;
        const aspect = window.innerWidth / window.innerHeight;
        const vFOV = THREE.MathUtils.degToRad(fov);
        const viewportHeight = 2 * Math.tan(vFOV / 2) * camDist;
        const viewportWidth = viewportHeight * aspect;
        
        // Store rotation center (center of circle 1) - will be set after circle 1 is created
        let rotationCenterX = 0;
        let rotationCenterY = 0;
        
        // Create circles for each stage (1-5)
        // Layer them: 1 at top (closest to camera), 5 at bottom (furthest)
        for (let stage = 1; stage <= 5; stage++) {
            const texture = this.circleTextures[stage - 1];
            if (!texture || !texture.image) continue;
            
            // Get image aspect ratio
            const imageAspect = texture.image.width / texture.image.height;
            
            // Scale circles to fill the screen completely
            // Use the larger dimension to ensure full coverage with extra margin
            // Circles 1-3 have different sizes, circles 4-5 fill the screen
            let circleWidth, circleHeight;
            let scaleFactor;
            if (stage === 1) {
                scaleFactor = 0.4; // Circle 1 is smallest
            } else if (stage === 2) {
                scaleFactor = 0.6; // Circle 2 is medium
            } else if (stage === 3) {
                scaleFactor = 0.8; // Circle 3 is larger
            } else {
                scaleFactor = 2.3; // Circles 4-5 are 230% size
            }
            
            if (imageAspect > aspect) {
                // Image is wider than viewport - use width to fill
                circleWidth = viewportWidth * scaleFactor;
                circleHeight = circleWidth / imageAspect;
            } else {
                // Image is taller than viewport - use height to fill
                circleHeight = viewportHeight * scaleFactor;
                circleWidth = circleHeight * imageAspect;
            }
            
            const geometry = new THREE.PlaneGeometry(circleWidth, circleHeight);
            // Geometry is centered by default - the center of the plane is at (0,0,0) in local space
            // Since the PNGs are cropped so edges are at image edges, the image center = circle center
            // No translation needed - the geometry center is already the circle center
            
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 0, // Start invisible
                side: THREE.DoubleSide,
                depthWrite: true, // Enable depth writing for proper z-sorting
                depthTest: true
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            
            // Position all circles at the exact same center point
            // Since PNGs are cropped with edges at image edges, the image center = circle center
            // All circles are moved up a bit
            const yOffset = stage <= 3 ? -0.3 : -1.0; // All circles moved up: 1-3 at -0.3, 4-5 at -1.0
            const centerX = 0; // X center - same for all circles
            const centerY = this.camera.position.y + yOffset; // Y center - all circles moved up
            
            // Layer circles: 1 at top (z: -0.02), 5 at bottom (z: -0.08)
            // Behind flowers (z: 0.1) but above background (z: -0.1)
            const zOffset = -0.02 - (stage - 1) * 0.015; // 1: -0.02, 2: -0.035, 3: -0.05, 4: -0.065, 5: -0.08
            
            // Position mesh center at the same world position for all circles
            // The geometry center (0,0,0) will be at this position, which is the circle center
            mesh.position.set(centerX, centerY, zOffset);
            
            mesh.userData.isCircle = true;
            mesh.userData.stage = stage;
            
            this.scene.add(mesh);
            
            // For circles 1-3, start at scale 0 for pop-out animation
            // For circles 4-5, start at scale 1 for fade-in only
            if (stage <= 3) {
                mesh.scale.set(0, 0, 0);
            } else {
                mesh.scale.set(1, 1, 1);
            }
            
            // For circles 1-4, add rotation properties (different speeds and directions)
            let rotationSpeed = 0;
            let rotationDirection = 1;
            let initialOffsetX = 0;
            let initialOffsetY = 0;
            
            if (stage <= 4) {
                if (stage === 4) {
                    // Circle 4 spins much slower
                    rotationSpeed = 0.05 + Math.random() * 0.1; // 0.05 to 0.15 radians per second
                    rotationDirection = Math.random() > 0.5 ? 1 : -1;
                } else {
                    // Circles 1-3: Different slow speeds and directions
                    if (stage === 1) {
                        rotationSpeed = 0.08; // Circle 1: slow speed
                        rotationDirection = 1; // Clockwise
                    } else if (stage === 2) {
                        rotationSpeed = 0.12; // Circle 2: slightly faster
                        rotationDirection = -1; // Counter-clockwise
                    } else if (stage === 3) {
                        rotationSpeed = 0.15; // Circle 3: fastest of the three
                        rotationDirection = 1; // Clockwise
                    }
                }
                
                // Store initial offset from rotation center (will be set after circle 1 is created)
                // For now, all circles start at the same position, so offset is 0
                initialOffsetX = 0;
                initialOffsetY = 0;
            }
            
            // Create shadow for circles 1-3
            let shadowMesh = null;
            if (stage <= 3) {
                const shadowGeometry = new THREE.PlaneGeometry(circleWidth, circleHeight);
                const shadowMaterial = new THREE.MeshBasicMaterial({
                    map: texture, // Use same texture as circle
                    transparent: true,
                    opacity: 0.3,
                    side: THREE.DoubleSide,
                    depthWrite: true, // Enable depth writing so shadows render behind circles 1-3
                    depthTest: true, // Enable depth testing
                    color: 0x000000, // Darken the texture to create shadow effect
                    alphaTest: 0.1
                });
                shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
                // Position shadow below circles 1-3 but above circles 4-5
                // Circle 1-3 z: -0.02 to -0.05, Circle 4-5 z: -0.065 to -0.08
                // Shadow should be between: below circle 3 (-0.05) but above circle 4 (-0.065)
                // Use -0.062 to ensure it's clearly below circle 3 but above circle 4
                // In Three.js, lower (more negative) z = further from camera = behind
                const shadowZ = -0.062; // Below circles 1-3 (z: -0.02 to -0.05), above circles 4-5 (z: -0.065 to -0.08)
                shadowMesh.position.set(centerX, centerY - 0.2, shadowZ);
                shadowMesh.userData.isShadow = true;
                shadowMesh.userData.isCircle = false;
                shadowMesh.raycast = function() { return []; }; // Disable raycasting on shadows
                // Don't set renderOrder - let z-depth determine rendering order
                // Shadow z: -0.062 is below circles 1-3 (z: -0.02 to -0.05) and above circles 4-5 (z: -0.065 to -0.08)
                this.scene.add(shadowMesh);
                
                // Shadow also starts at scale 0 for pop-out animation
                shadowMesh.scale.set(0, 0, 0);
            }
            
            this.circles.push({
                mesh: mesh,
                shadowMesh: shadowMesh, // Shadow mesh for circles 1-3
                stage: stage,
                targetOpacity: 0,
                currentOpacity: 0,
                hasPoppedOut: false, // Track if pop-out animation has been done
                isAnimating: false, // Track if currently animating
                rotationSpeed: rotationSpeed, // Rotation speed in radians per second
                rotationDirection: rotationDirection, // 1 or -1 for direction
                rotationAngle: 0, // Current rotation angle
                initialOffsetX: initialOffsetX, // Initial X offset from rotation center
                initialOffsetY: initialOffsetY // Initial Y offset from rotation center
            });
            
            // All circles are positioned at the same center point
            // Circle 5 has a red dot marking the rotation center
            // The rotation center will be stored after all circles are created
        }
        
        // The red dot in 5.png marks the rotation center
        // All circles are already aligned in their PNG files
        // The rotation happens around the mesh's local center (0,0,0)
        // Since the PNGs are aligned, the red dot position is the same relative position in all images
        // We just need to ensure rotation happens around the mesh center, which is already the case
    }
    
    updateCircles(currentStage) {
        // Update target opacity for each circle based on current stage
        this.circles.forEach(circle => {
            const previousTargetOpacity = circle.targetOpacity;
            
            // If circle 5 is locked (NEXT button appeared), keep all circles visible
            if (this.circle5Locked) {
                circle.targetOpacity = 1.0; // All circles stay visible
            } else {
                // Circle should be visible if current stage >= circle's stage
                // Stage 1 = circle 1 visible, Stage 2 = circles 1-2 visible, etc.
                circle.targetOpacity = currentStage >= circle.stage ? 1.0 : 0.0;
            }
            
            // Debug log for visibility changes
            if (previousTargetOpacity !== circle.targetOpacity) {
                console.log(`[Stage3] Circle ${circle.stage} opacity: ${previousTargetOpacity} -> ${circle.targetOpacity} (currentStage: ${currentStage})`);
            }
            
            // For circles 1-3: Trigger pop-out animation when appearing (0 -> 1)
            // For circles 4-5: Just fade in (handled in update loop)
            if (circle.stage <= 3 && !circle.hasPoppedOut && !circle.isAnimating) {
                if (previousTargetOpacity === 0 && circle.targetOpacity === 1.0) {
                    // Circle is appearing - trigger pop-out animation
                    circle.isAnimating = true;
                    circle.mesh.scale.set(0, 0, 0);
                    circle.mesh.material.opacity = 1.0; // Set opacity to 1 immediately for pop-out
                    circle.currentOpacity = 1.0;
                    
                    gsap.to(circle.mesh.scale, {
                        x: 1,
                        y: 1,
                        duration: 0.8, // Longer duration for gentler animation
                        ease: "power2.out", // Gentler easing (less bouncy than back.out)
                        onComplete: () => {
                            circle.hasPoppedOut = true;
                            circle.isAnimating = false;
                        }
                    });
                    
                    // Animate shadow scale as well
                    if (circle.shadowMesh) {
                        gsap.to(circle.shadowMesh.scale, {
                            x: 1,
                            y: 1,
                            duration: 0.8,
                            ease: "power2.out"
                        });
                    }
                }
            }
            
            // For circles 4-5: Handle fade-out (if disappearing)
            if (circle.stage >= 4 && previousTargetOpacity === 1.0 && circle.targetOpacity === 0.0) {
                // Circle is disappearing - ensure scale is 1 for fade-out
                if (circle.mesh.scale.x === 0) {
                    circle.mesh.scale.set(1, 1, 1);
                }
            }
        });
    }
    
    showNextButton() {
        if (this.nextButtonShown) return; // Prevent multiple buttons
        this.nextButtonShown = true;
        
        // Create NEXT button element - same style as Stage 1 and 2
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
        `;
        
        document.body.appendChild(nextButton);
        
        // Fade in the button
        gsap.to(nextButton, {
            opacity: 1,
            duration: 1.0,
            ease: "power2.out"
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
            console.log("[Stage3] NEXT button clicked");
            if (this.onComplete) {
                // Disable pointer events immediately
                nextButton.style.pointerEvents = 'none';
                
                // Ensure button stays on top during fadeout
                nextButton.style.zIndex = '100000';
                
                // Start elements falling immediately when button is clicked
                if (this.startElementsFall) {
                    this.startElementsFall();
                    console.log("[Stage3] Elements fall animation started immediately on button click");
                }
                
                // Fade out button
                gsap.to(nextButton, {
                    opacity: 0,
                    duration: 0.3,
                    ease: "power2.in",
                    onComplete: () => {
                        requestAnimationFrame(() => {
                            nextButton.remove();
                            console.log("[Stage3] Button fully faded, calling onComplete");
                            this.onComplete();
                        });
                    }
                });
            } else {
                console.warn("[Stage3] onComplete callback not set");
            }
        });
        
        this.nextButtonElement = nextButton;
    }
    
    loadFlowerTextures() {
        const loader = new THREE.TextureLoader();
        
        // Define which flowers should be bigger
        const biggerFlowers = [
            '珠子.png',
            '艾草.png',
            '蔓藤1.png',
            '蔓藤2.png',
            '雏菊.png',
            '粉花束.png',
            '鸢尾.png',
            '黄叶.png',
            '黄花.png',
            '白花.png',
            '紫花.png',
            '蓝花束.png',
        ];
        
        const flowerFiles = [
            '樱花.png',
            '珠子.png',
            '白花.png',
            '粉花束.png',
            '紫花.png',
            '艾草.png',
            '蓝花1.png',
            '蓝花2.png',
            '蓝花3.png',
            '蓝花束.png',
            '蔓藤1.png',
            '蔓藤2.png',
            '雏菊.png',
            '鸢尾.png',
            '黄叶.png',
            '黄花.png'
        ];
        
        let loadedCount = 0;
        flowerFiles.forEach(fileName => {
            loader.load(`./assets/flower/${fileName}`, (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                // Store filename with texture for size determination
                tex.userData = { fileName: fileName, isBigger: biggerFlowers.includes(fileName) };
                this.flowerTextures.push(tex);
                loadedCount++;
                if (loadedCount === flowerFiles.length) {
                    console.log(`[Stage3] All ${loadedCount} flower textures loaded`);
                }
            }, undefined, (err) => {
                console.error(`[Stage3] Failed to load flower texture: ${fileName}`, err);
            });
        });
    }
    
    createFallingFlower() {
        if (this.flowerTextures.length === 0) {
            console.warn("[Stage3] Flower textures not loaded yet");
            return;
        }
        
        // Pick a random flower texture
        const randomTexture = this.flowerTextures[Math.floor(Math.random() * this.flowerTextures.length)];
        
        // Wait for texture to load if not ready
        if (!randomTexture.image) {
            console.warn("[Stage3] Texture image not available yet, skipping");
            return;
        }
        
        // Check if image is fully loaded and decoded
        const image = randomTexture.image;
        if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
            // Image not fully loaded - wait for it
            const onLoad = () => {
                // Remove listener to prevent memory leaks
                image.removeEventListener('load', onLoad);
                image.removeEventListener('error', onError);
                // Now create the flower
                this.createFallingFlowerWithTexture(randomTexture);
            };
            const onError = () => {
                image.removeEventListener('load', onLoad);
                image.removeEventListener('error', onError);
                console.warn("[Stage3] Failed to load flower texture image");
            };
            image.addEventListener('load', onLoad);
            image.addEventListener('error', onError);
            return;
        }
        
        // Image is ready - create flower
        this.createFallingFlowerWithTexture(randomTexture);
    }
    
    createFallingFlowerWithTexture(randomTexture) {
        // Calculate viewport dimensions
        const fov = this.camera.fov;
        const camDist = this.camera.position.z;
        const aspect = window.innerWidth / window.innerHeight;
        const vFOV = THREE.MathUtils.degToRad(fov);
        const viewportHeight = 2 * Math.tan(vFOV / 2) * camDist;
        const viewportWidth = viewportHeight * aspect;
        
        // Get image aspect ratio to maintain proportions
        const image = randomTexture.image;
        const imageAspect = image.naturalWidth / image.naturalHeight;
        
        // Determine size based on flower type
        const isBigger = randomTexture.userData && randomTexture.userData.isBigger;
        let baseHeight;
        if (isBigger) {
            // Bigger flowers: 4.5 to 7.0 units tall
            baseHeight = 4.5 + Math.random() * 2.5;
        } else {
            // Smaller flowers: 2.0 to 3.5 units tall
            baseHeight = 2.0 + Math.random() * 1.5;
        }
        const width = baseHeight * imageAspect; // Maintain aspect ratio
        
        // Start position: random X at top of viewport
        const startX = (Math.random() - 0.5) * viewportWidth * 0.8; // 80% of width
        const startY = this.camera.position.y + viewportHeight / 2 + 2; // Above viewport
        
        // Create geometry with correct aspect ratio
        const geometry = new THREE.PlaneGeometry(width, baseHeight);
        const material = new THREE.MeshBasicMaterial({
            map: randomTexture,
            transparent: true,
            opacity: 0, // Start invisible until texture is confirmed ready
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(startX, startY, 0.1); // Slightly above water
        
        // Add random rotation (0 to 360 degrees)
        const randomRotation = Math.random() * Math.PI * 2; // 0 to 2π radians
        mesh.rotation.z = randomRotation;
        
        mesh.userData.isFlower = true;
        
        this.scene.add(mesh);
        
        // Create shadow mesh with same shape
        const shadowGeometry = new THREE.PlaneGeometry(width, baseHeight);
        const shadowMaterial = new THREE.MeshBasicMaterial({
            map: randomTexture,
            transparent: true,
            opacity: 0, // Start invisible until texture is confirmed ready
            color: 0x000000, // Black shadow
            side: THREE.DoubleSide,
            depthWrite: false,
            alphaTest: 0.1
        });
        
        const shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
        shadowMesh.position.set(startX, startY - 0.15, 0.05); // Slightly below and behind the flower
        shadowMesh.rotation.z = randomRotation; // Same rotation as flower
        shadowMesh.userData.isShadow = true;
        
        this.scene.add(shadowMesh);
        
        // Ensure texture is ready for rendering
        // Force texture update to ensure it's fully loaded
        randomTexture.needsUpdate = true;
        
        // Wait one frame to ensure texture is ready, then fade in
        requestAnimationFrame(() => {
            // Double-check texture is ready
            if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
                // Fade in the flower
                gsap.to(material, {
                    opacity: 1,
                    duration: 0.3,
                    ease: "power2.out"
                });
                
                // Fade in the shadow
                gsap.to(shadowMaterial, {
                    opacity: 0.3,
                    duration: 0.3,
                    ease: "power2.out"
                });
            } else {
                // Still not ready - keep invisible
                console.warn("[Stage3] Texture still not ready after frame, keeping flower invisible");
            }
        });
        
        // Add to falling flowers array - store both width and height
        const flower = {
            mesh: mesh,
            shadowMesh: shadowMesh,
            speed: 2.0 + Math.random() * 1.5, // 2.0 to 3.5 units per second
            width: width,
            height: baseHeight
        };
        
        this.flowers.push(flower);
        console.log(`[Stage3] Created falling flower at x: ${startX.toFixed(2)}, y: ${startY.toFixed(2)}, size: ${width.toFixed(2)}x${baseHeight.toFixed(2)}, total flowers: ${this.flowers.length}`);
        console.log(`[Stage3] Flower mesh in scene: ${mesh.parent === this.scene}, shadow in scene: ${shadowMesh.parent === this.scene}`);
    }
    
    createWaterBackground() {
        const loader = new THREE.TextureLoader();
        
        // Use the texture from water state, or load it if not available
        const waterTex = this.waterState.texture;
        
        if (waterTex) {
            // Reuse the existing texture
            this.setupWaterMesh(waterTex);
        } else {
            // Load texture if not provided
            loader.load('./assets/water.png', (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                tex.wrapS = THREE.MirroredRepeatWrapping;
                tex.wrapT = THREE.MirroredRepeatWrapping;
                this.setupWaterMesh(tex);
            });
        }
    }
    
    setupWaterMesh(texture) {
        const geometry = new THREE.PlaneGeometry(
            this.waterState.geometry.width,
            this.waterState.geometry.height,
            64, 64
        );
        
        // Store initial time from Stage 2 to continue animation smoothly
        // Access .value for uniform values
        this.initialTime = this.waterState.uniforms.uTime.value;
        
        this.bgUniforms = {
            uTexture: { value: texture },
            uTime: { value: this.waterState.uniforms.uTime.value },
            uSpeed: { value: this.waterState.uniforms.uSpeed.value },
            uStrength: { value: this.waterState.uniforms.uStrength.value },
            uFrequency: { value: this.waterState.uniforms.uFrequency.value }
        };
        
        const material = new THREE.ShaderMaterial({
            uniforms: this.bgUniforms,
            vertexShader: `
                uniform float uTime;
                uniform float uSpeed;
                uniform float uStrength;
                uniform float uFrequency;
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    vec3 pos = position;
                    float movement = uTime * uSpeed;
                    pos.x += sin(pos.y * uFrequency + movement) * uStrength;
                    pos.x += cos(pos.x * uFrequency * 0.5 + movement) * uStrength * 0.5;
                    pos.y += sin(pos.x * uFrequency + movement + 1.0) * uStrength;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                varying vec2 vUv;
                void main() {
                    gl_FragColor = texture2D(uTexture, vUv);
                }
            `,
            lights: false,
            depthWrite: false
        });
        
        const waterMesh = new THREE.Mesh(geometry, material);
        waterMesh.position.copy(this.waterState.position);
        waterMesh.userData.isBackground = true;
        waterMesh.raycast = function() { return []; };
        this.scene.add(waterMesh);
        this.waterMesh = waterMesh;
        
        console.log("[Stage3] Water background created with position:", waterMesh.position, "size:", this.waterState.geometry);
    }
    
    createDefaultWaterBackground() {
        const loader = new THREE.TextureLoader();
        
        // Calculate viewport dimensions (same as Stage 2)
        const fov = 45;
        const camDist = 20;
        const aspect = window.innerWidth / window.innerHeight;
        const vFOV = THREE.MathUtils.degToRad(fov);
        const height = 2 * Math.tan(vFOV / 2) * camDist;
        const width = height * aspect;
        
        loader.load('./assets/water.png', (tex) => {
            tex.encoding = THREE.sRGBEncoding;
            tex.wrapS = THREE.MirroredRepeatWrapping;
            tex.wrapT = THREE.MirroredRepeatWrapping;
            
            // Use actual image aspect ratio to prevent distortion
            const imageAspect = tex.image.width / tex.image.height;
            const padding = 1.1; // Padding for camera movement
            
            // Calculate geometry size based on image aspect ratio
            let bgWidth = width * padding;
            let bgHeight = bgWidth / imageAspect; // Maintain image aspect ratio
            
            const geometry = new THREE.PlaneGeometry(bgWidth, bgHeight, 64, 64);
            
            // Calculate Y offset to show bottom part (same as Stage 2)
            const yOffset = (bgHeight - height) / 2 * 0.9;
            
            // Default uniforms (water movement stopped - uStrength = 0)
            this.initialTime = 0; // Start from 0 for direct load
            this.bgUniforms = {
                uTexture: { value: tex },
                uTime: { value: 0 },
                uSpeed: { value: 0.5 },
                uStrength: { value: 0 }, // No movement (like end of Stage 2 transition)
                uFrequency: { value: 1.5 }
            };
            
            const material = new THREE.ShaderMaterial({
                uniforms: this.bgUniforms,
                vertexShader: `
                    uniform float uTime;
                    uniform float uSpeed;
                    uniform float uStrength;
                    uniform float uFrequency;
                    varying vec2 vUv;

                    void main() {
                        vUv = uv;
                        vec3 pos = position;
                        float movement = uTime * uSpeed;
                        pos.x += sin(pos.y * uFrequency + movement) * uStrength;
                        pos.x += cos(pos.x * uFrequency * 0.5 + movement) * uStrength * 0.5;
                        pos.y += sin(pos.x * uFrequency + movement + 1.0) * uStrength;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D uTexture;
                    varying vec2 vUv;
                    void main() {
                        gl_FragColor = texture2D(uTexture, vUv);
                    }
                `,
                lights: false,
                depthWrite: false
            });
            
            const waterMesh = new THREE.Mesh(geometry, material);
            waterMesh.position.set(0, yOffset, -0.1);
            waterMesh.userData.isBackground = true;
            waterMesh.raycast = function() { return []; };
            this.scene.add(waterMesh);
            this.waterMesh = waterMesh;
            
            // Set camera to end position of Stage 2 transition (moved up)
            const extraHeight = bgHeight - height;
            const margin = height * 0.20;
            const maxMoveUp = extraHeight - margin;
            this.camera.position.y = maxMoveUp; // Camera at end position
            this.camera.lookAt(0, maxMoveUp, 0);
            this.camera.updateMatrixWorld();
            
            console.log("[Stage3] Default water background created, camera at end position:", this.camera.position.y);
        });
    }
    
    update() {
        const deltaTime = this.clock.getDelta();
        
        // Always render to keep background color visible
        if (!this.waterMesh) {
            // Water not ready yet - just render the background color
            this.renderer.clear();
            this.renderer.render(this.scene, this.camera);
            return;
        }
        
        
        // Update water animation time - continue from Stage 2's time
        if (this.bgUniforms) {
            const time = this.initialTime + this.clock.getElapsedTime();
            this.bgUniforms.uTime.value = time;
        }
        
        // Update circle opacity (fade in/out) and position
        this.circles.forEach(circle => {
            // For circles 1-3: Opacity is handled during pop-out animation (set to 1 immediately)
            // For circles 4-5: Fade in/out normally
            if (circle.stage <= 3) {
                // Circles 1-3: Opacity is set during pop-out, only handle fade-out
                if (circle.targetOpacity === 0.0 && circle.currentOpacity > 0) {
                    // Fading out
                    const fadeSpeed = 2.0;
                    circle.currentOpacity -= fadeSpeed * deltaTime;
                    circle.currentOpacity = Math.max(0, circle.currentOpacity);
                    circle.mesh.material.opacity = circle.currentOpacity;
                    
                    // Update shadow opacity to match
                    if (circle.shadowMesh) {
                        circle.shadowMesh.material.opacity = circle.currentOpacity * 0.3;
                    }
                    
                    // When fully faded out, reset scale for next appearance
                    if (circle.currentOpacity === 0) {
                        circle.mesh.scale.set(0, 0, 0);
                        if (circle.shadowMesh) {
                            circle.shadowMesh.scale.set(0, 0, 0);
                        }
                        circle.hasPoppedOut = false; // Allow pop-out again next time
                    }
                } else if (circle.targetOpacity === 1.0 && !circle.isAnimating) {
                    // Already visible (after pop-out) - keep opacity at 1
                    circle.currentOpacity = 1.0;
                    circle.mesh.material.opacity = 1.0;
                    // Update shadow opacity
                    if (circle.shadowMesh) {
                        circle.shadowMesh.material.opacity = 0.3;
                    }
                }
            } else {
                // Circles 4-5: Normal fade in/out
                const fadeSpeed = 2.0; // Fade speed per second
                const opacityDiff = circle.targetOpacity - circle.currentOpacity;
                
                if (Math.abs(opacityDiff) > 0.01) {
                    // Gradually fade towards target
                    circle.currentOpacity += Math.sign(opacityDiff) * fadeSpeed * deltaTime;
                    circle.currentOpacity = Math.max(0, Math.min(1, circle.currentOpacity)); // Clamp
                    circle.mesh.material.opacity = circle.currentOpacity;
                } else {
                    // Snap to target if very close
                    circle.currentOpacity = circle.targetOpacity;
                    circle.mesh.material.opacity = circle.currentOpacity;
                }
            }
            
            // Update all circles to share the exact same center position
            // Since PNGs are cropped with edges at image edges, image center = circle center
            // All circles are moved up a bit
            // BUT: Don't override position if circle is falling (animation in progress)
            if (!circle.isFalling) {
                const yOffset = circle.stage <= 3 ? -0.3 : -1.0; // All circles moved up: 1-3 at -0.3, 4-5 at -1.0
                const centerX = 0; // X center - same for all circles
                const centerY = this.camera.position.y + yOffset; // Y center - all circles moved up
                
                // Keep all circles at their respective center positions
                // Circles 1-3 are higher, circles 4-5 are lower, but all share the same X center
                circle.mesh.position.x = centerX;
                circle.mesh.position.y = centerY;
            }
            
            // For circles 1-4, rotate the mesh itself (not the position)
            if (circle.stage <= 4 && circle.currentOpacity > 0 && circle.rotationSpeed > 0) {
                // Update rotation angle
                circle.rotationAngle += circle.rotationSpeed * circle.rotationDirection * deltaTime;
                // Keep rotation angle in reasonable range (prevent overflow)
                if (circle.rotationAngle > Math.PI * 2) {
                    circle.rotationAngle -= Math.PI * 2;
                } else if (circle.rotationAngle < -Math.PI * 2) {
                    circle.rotationAngle += Math.PI * 2;
                }
                
                // Rotate the mesh itself around its center (which is the same for all circles)
                circle.mesh.rotation.z = circle.rotationAngle;
                
                // Rotate shadow to match circle rotation
                if (circle.shadowMesh) {
                    circle.shadowMesh.rotation.z = circle.rotationAngle;
                }
            } else {
                // Circle 5 or invisible circles: no rotation
                if (circle.stage === 5 || circle.currentOpacity === 0) {
                    circle.mesh.rotation.z = 0;
                    if (circle.shadowMesh) {
                        circle.shadowMesh.rotation.z = 0;
                    }
                }
            }
            
            // Update shadow position and opacity to follow circle (for circles 1-3)
            // This must happen for all circles 1-3, regardless of rotation state
            // Shadows should be below circles 1-3 but above circles 4-5
            // BUT: Don't override shadow position if circle is falling (animation in progress)
            if (circle.shadowMesh && circle.stage <= 3) {
                if (!circle.isFalling) {
                    circle.shadowMesh.position.x = circle.mesh.position.x;
                    circle.shadowMesh.position.y = circle.mesh.position.y - 0.2; // Slightly below
                }
                // Keep shadow at fixed z-position: below circles 1-3, above circles 4-5
                circle.shadowMesh.position.z = -0.062; // Below circles 1-3 (z: -0.02 to -0.05), above circles 4-5 (z: -0.065 to -0.08)
                // Shadow opacity matches circle opacity (30% of circle opacity)
                circle.shadowMesh.material.opacity = circle.currentOpacity * 0.3;
                // Ensure shadow is visible when circle is visible
                if (circle.currentOpacity > 0) {
                    circle.shadowMesh.visible = true;
                } else {
                    circle.shadowMesh.visible = false;
                }
            }
        });
        
        // Update falling flowers - just let them fall and remove when out of scene
        const fov = this.camera.fov;
        const camDist = this.camera.position.z;
        const vFOV = THREE.MathUtils.degToRad(fov);
        const viewportHeight = 2 * Math.tan(vFOV / 2) * camDist;
        const bottomOfViewport = this.camera.position.y - viewportHeight / 2;
        const topOfViewport = this.camera.position.y + viewportHeight / 2;
        
        
        for (let i = this.flowers.length - 1; i >= 0; i--) {
            const flower = this.flowers[i];
            
            if (!flower.mesh || !flower.mesh.parent) {
                // Flower was already removed, skip
                this.flowers.splice(i, 1);
                continue;
            }
            
            // Move flower down
            flower.mesh.position.y -= flower.speed * deltaTime;
            
            // Update shadow position
            if (flower.shadowMesh && flower.shadowMesh.parent) {
                flower.shadowMesh.position.x = flower.mesh.position.x;
                flower.shadowMesh.position.y = flower.mesh.position.y - 0.15;
                flower.shadowMesh.rotation.z = flower.mesh.rotation.z;
            }
            
            // Remove flower if it's completely out of view (below viewport)
            const flowerTop = flower.mesh.position.y + (flower.height / 2);
            const flowerBottom = flower.mesh.position.y - (flower.height / 2);
            
            // Only remove if flower is completely below the viewport
            // Use a larger margin (5 units) to ensure flowers stay visible longer
            if (flowerTop < bottomOfViewport - 5) { // Remove when 5 units below viewport
                // Clean up and remove
                if (flower.mesh.parent) {
                    this.scene.remove(flower.mesh);
                }
                if (flower.mesh.geometry) flower.mesh.geometry.dispose();
                if (flower.mesh.material) flower.mesh.material.dispose();
                
                if (flower.shadowMesh) {
                    if (flower.shadowMesh.parent) {
                        this.scene.remove(flower.shadowMesh);
                    }
                    if (flower.shadowMesh.geometry) flower.shadowMesh.geometry.dispose();
                    if (flower.shadowMesh.material) flower.shadowMesh.material.dispose();
                }
                
                this.flowers.splice(i, 1);
            }
        }
        
        // Always render, even if canvas opacity is 0
        // This ensures flowers are rendered and ready to be visible when canvas fades in
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    startElementsFall() {
        console.log("[Stage3] Starting elements fall animation...");
        
        // Make next button fall down first (fastest, since it's on top)
        const nextButton = document.getElementById('next-button');
        if (nextButton) {
            const windowHeight = window.innerHeight;
            const buttonFallDistance = windowHeight + 200; // Fall completely off screen
            gsap.to(nextButton, {
                top: buttonFallDistance + 'px',
                duration: 1.5, // Fast fall for button
                ease: "power2.in"
            });
        }
        
        // Calculate viewport dimensions for fall distance
        const fov = this.camera.fov;
        const camDist = this.camera.position.z;
        const aspect = window.innerWidth / window.innerHeight;
        const vFOV = THREE.MathUtils.degToRad(fov);
        const viewportHeight = 2 * Math.tan(vFOV / 2) * camDist;
        
        // Fall distance: much smaller movement (only 30% of viewport height)
        const fallDistance = viewportHeight * 0.5;
        
        // Duration for the fall animation - much slower
        const baseDuration = 5.0; // Base duration in seconds (much slower)
        
        // Set flag to prevent update loop from overriding positions
        this.elementsFalling = true;
        
        // Make circles fall at different speeds based on their z-depth
        // Closer objects (less negative z) fall faster, further objects (more negative z) fall slower
        this.circles.forEach(circle => {
            // Mark circle as falling
            circle.isFalling = true;
            
            const zDepth = circle.mesh.position.z;
            // Convert z-depth to speed multiplier
            // z: -0.02 (closest) -> speed 1.5x, z: -0.08 (furthest) -> speed 0.5x
            // Linear interpolation: speed = 1.5 - (z + 0.02) / 0.06 * 1.0
            const normalizedZ = (zDepth + 0.02) / 0.07; // 0 to 1 (0 = closest, 1 = furthest)
            const speedMultiplier = 1.5 - normalizedZ * 1.0; // 1.5 to 0.5
            const duration = baseDuration / speedMultiplier;
            
            // Animate circle falling down
            const targetY = circle.mesh.position.y - fallDistance;
            gsap.to(circle.mesh.position, {
                y: targetY,
                duration: duration,
                ease: "power2.in"
            });
            
            // Animate shadow falling down at same speed
            if (circle.shadowMesh) {
                gsap.to(circle.shadowMesh.position, {
                    y: circle.shadowMesh.position.y - fallDistance,
                    duration: duration,
                    ease: "power2.in"
                });
            }
        });
        
        // Note: Flowers are NOT animated to fall - they remain in place during transition
        
        // Make water background fall (slowest, since it's furthest back at z: -0.1)
        if (this.waterMesh) {
            const zDepth = this.waterMesh.position.z;
            // Water is furthest back (z: -0.1), so it falls slowest
            // Speed multiplier: 0.4x for water (slowest)
            const speedMultiplier = 0.4;
            const duration = baseDuration / speedMultiplier;
            
            // Animate water falling down
            const targetY = this.waterMesh.position.y - fallDistance;
            gsap.to(this.waterMesh.position, {
                y: targetY,
                duration: duration,
                ease: "power2.in"
            });
        }
        
        console.log("[Stage3] Elements fall animation started");
    }
    
    onResize() {
        const aspect = window.innerWidth / window.innerHeight;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
    }
    
    dispose() {
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('keydown', this.onKeyDown);
        
        // Stop speed tracking
        if (this.speedUpdateInterval) {
            clearInterval(this.speedUpdateInterval);
        }
        
        // Clean up flowers
        this.flowers.forEach(flower => {
            if (flower.mesh) {
                this.scene.remove(flower.mesh);
                flower.mesh.geometry.dispose();
                flower.mesh.material.dispose();
            }
            if (flower.shadowMesh) {
                this.scene.remove(flower.shadowMesh);
                flower.shadowMesh.geometry.dispose();
                flower.shadowMesh.material.dispose();
            }
        });
        this.flowers = [];
        
        // Clean up circles
        this.circles.forEach(circle => {
            if (circle.mesh) {
                this.scene.remove(circle.mesh);
                circle.mesh.geometry.dispose();
                circle.mesh.material.dispose();
            }
            if (circle.shadowMesh) {
                this.scene.remove(circle.shadowMesh);
                circle.shadowMesh.geometry.dispose();
                circle.shadowMesh.material.dispose();
            }
        });
        this.circles = [];
        
        // Remove NEXT button if it exists
        const nextButton = document.getElementById('next-button');
        if (nextButton) {
            nextButton.remove();
        }
        
        // Remove placeholder
        const placeholder = document.getElementById('stage3-placeholder');
        if (placeholder) placeholder.remove();
        
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.remove();
        }
    }
}


