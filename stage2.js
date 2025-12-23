class Stage2 {
    constructor(onCompleteCallback) {
        this.onComplete = onCompleteCallback; // Callback to transition to Stage 3
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.flowers = []; 
        
        this.clock = new THREE.Clock();
        
        // Flower limit tracking
        this.maxFlowers = 10; // Maximum number of flowers allowed
        this.nextButtonShown = false; // Track if NEXT button is already shown
        console.log('[INIT] Stage2 initialized with maxFlowers:', this.maxFlowers);
        
        this.isMouseDown = false;
        this.draggedFlower = null;
        this.clickedFlower = null; // Store the flower that was clicked (for removal)
        this.dragStartY = 0;
        this.initialScale = 1;
        this.didDrag = false; 
        
        // Track click position for drag threshold
        this.mouseDownX = 0;
        this.mouseDownY = 0;
        
        this.pawElement = document.getElementById('paw-cursor');
        
        this.flowerTextures = [];
        this.bgUniforms = null;
        this.sparkles = []; // Array to store sparkle objects
        this.cameraTransitionInProgress = false; // Flag to disable all camera movement during transition 
        
        // Paw cursor settings
        this.pawHeightCSS = '55vh';
        this.pawTipOffset = 30; 
        this.hideBottomAmount = 20; 
        this.pawXOffset = 50;
        this.pawClickRotation = -12; 
        this.pawState = { rotation: 0, scale: 1.0, x: -1000, y: 0 };
        this.pawTarget = { x: -1000, y: 0 };
        this.pawTrackingDisabled = false;
        this.parallaxDisabled = false;

        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onResize = this.onResize.bind(this);
        this.onWheel = this.onWheel.bind(this);
        
        // Track which flower is under cursor
        this.hoveredFlower = null;

        this.init();
    }

    async init() {
        await Tone.start();
        if (Tone.Transport.state !== 'started') Tone.Transport.start();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xaaccff); 

        const aspect = window.innerWidth / window.innerHeight;
        const camDist = 20;
        const fov = 45;
        this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
        this.camera.position.set(0, 0, camDist);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateMatrixWorld(); 

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.sortObjects = true;
        document.body.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);

        // Master audio chain with limiter to prevent clipping
        this.masterLimiter = new Tone.Limiter(-1).toDestination();
        this.masterReverb = new Tone.Reverb({ decay: 4, wet: 0.0 });
        this.masterDelay = new Tone.PingPongDelay("8n", 0.3).connect(this.masterReverb);
        this.masterReverb.connect(this.masterLimiter);
        this.masterVolume = new Tone.Volume(0).connect(this.masterDelay);
        
        // Generate reverb impulse response (required for reverb to work)
        this.masterReverb.generate().then(() => {
            console.log("[Stage2] Reverb generated and ready, initial wet:", this.masterReverb.wet.value);
            // Ensure reverb starts at 0
            this.masterReverb.wet.value = 0.0;
        }).catch(err => {
            console.error("[Stage2] Failed to generate reverb:", err);
        });
        
        // Butterfly reverb effect tracking
        this.baseReverbWet = 0.0; // Base reverb wet level (no butterflies = no reverb)
        this.currentReverbWet = 0.0; // Current reverb wet level (start at 0, for smooth transitions)
        this.reverbRampDuration = 2.0; // Duration for reverb changes (seconds) - gradual transition
        this.lastReverbLogTime = 0; // For debug logging

        const loader = new THREE.TextureLoader();

        // 1. Background
        loader.load('./assets/water.png', (tex) => {
            console.log('Water texture loaded successfully');
            tex.encoding = THREE.sRGBEncoding;
            tex.wrapS = THREE.MirroredRepeatWrapping;
            tex.wrapT = THREE.MirroredRepeatWrapping;

            const vFOV = THREE.MathUtils.degToRad(fov);
            const height = 2 * Math.tan(vFOV / 2) * camDist;
            const width = height * aspect;

            // Use actual image aspect ratio to prevent distortion
            const imageAspect = tex.image.width / tex.image.height;
            const padding = 1.1; // Padding for camera movement
            
            // Calculate geometry size based on image aspect ratio
            // Match width to viewport
            let bgWidth = width * padding;
            let bgHeight = bgWidth / imageAspect; // Maintain image aspect ratio
            
            const bgGeometry = new THREE.PlaneGeometry(bgWidth, bgHeight, 64, 64);

            this.bgUniforms = {
                uTexture: { value: tex },
                uTime: { value: 0 },
                uSpeed: { value: 0.5 },     // Increased from 0.3 to 0.6 for quicker water movement
                uStrength: { value: 0.1 }, 
                uFrequency: { value: 1.5 }  
            };

            const bgMaterial = new THREE.ShaderMaterial({
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

            const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
            bgMesh.position.z = -0.1;
            // Position water so the bottom part is visible (shift UP to show bottom)
            // The image has extra space at top, so we shift it up to show the bottom portion
            // Use 0.7 factor to move down a bit so edges don't show
            const yOffset = (bgHeight - height) / 2 * 0.9; // Shift UP less to keep edges hidden
            bgMesh.position.y = yOffset;
            bgMesh.userData.isBackground = true; // Mark background to exclude from raycasting
            bgMesh.raycast = function() { return []; }; // Disable raycasting on background
            this.scene.add(bgMesh);
            this.waterMesh = bgMesh; // Store reference for parallax
            this.waterBasePos = new THREE.Vector3(0, yOffset, -0.1); // Store base position with offset
            console.log('Background mesh added to scene with yOffset:', yOffset, 'bgHeight:', bgHeight, 'viewportHeight:', height);
            // Keep background color for proper rendering during transitions
            // this.scene.background = null; // Commented out to prevent white flash 
        }, (progress) => {
            console.log('Water texture loading progress:', progress);
        }, (error) => {
            console.error('Failed to load water texture:', error);
            // Fallback: keep the light blue background
        });

        // 1.5. Cat Tail (positioned aside the cat on water)
        loader.load('./assets/cattail.png', (tex) => {
            console.log('Cat tail texture loaded successfully');
            tex.encoding = THREE.sRGBEncoding;
            
            // Calculate appropriate size based on camera view
            const vFOV = THREE.MathUtils.degToRad(fov);
            const height = 2 * Math.tan(vFOV / 2) * camDist;
            const width = height * aspect;
            
            // Get image aspect ratio to maintain proportions
            const imgAspect = tex.image.width / tex.image.height;
            const tailHeight = height * 0.3;
            const tailWidth = tailHeight * imgAspect;
            
            const tailGeometry = new THREE.PlaneGeometry(tailWidth, tailHeight);
            // Translate geometry so pivot point is at the bottom (where tail attaches to cat)
            // This makes the root stay fixed while only the upper part wiggles
            tailGeometry.translate(0, tailHeight / 2, 0); // Move geometry up so bottom is at origin
            
            const tailMaterial = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: true // Enable depth testing so tail renders behind flowers
            });
            
            const tailMesh = new THREE.Mesh(tailGeometry, tailMaterial);
            // Position the root (pivot point) closer to the cat, to the right in lower-middle
            // This position represents where the tail attaches to the cat's body
            const tailRootX = width * 0.12;
            const tailRootY = -height * 0.55;
            const tailRootZ = 0.0; // Behind flowers (flowers are at z: 0.025-0.175)
            tailMesh.position.set(tailRootX, tailRootY, tailRootZ); // Root position (pivot point)
            tailMesh.userData.isBackground = true; // Mark to exclude from raycasting
            tailMesh.raycast = function() { return []; }; // Disable raycasting on tail
            this.scene.add(tailMesh);
            this.catTailMesh = tailMesh; // Store reference for potential future use
            
            // Store the root position (this stays fixed)
            this.tailRootPosition = new THREE.Vector3(tailRootX, tailRootY, tailRootZ);
            
            // Tail wiggle properties for natural cat tail movement
            this.tailWiggleSpeed = 0.8; // Speed of wiggle
            this.tailWiggleAmplitude = 0.05; // Rotation amplitude in radians (~8.6 degrees)
            this.tailWiggleOffset = Math.random() * Math.PI * 2; // Random phase offset
            this.tailBaseRotation = 0;
            
            console.log('Cat tail mesh added to scene');
        }, (progress) => {
            console.log('Cat tail texture loading progress:', progress);
        }, (error) => {
            console.error('Failed to load cat tail texture:', error);
        });

        // 2. Flowers
        const flowerFiles = [
            './assets/flower_water.png',
            './assets/flower_water2.png',
            './assets/flower_water3.png',
            './assets/flower_water4.png',
            './assets/flower_water5.png',
            './assets/flower_water6.png'
        ];

        flowerFiles.forEach(file => {
            loader.load(file, (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                this.flowerTextures.push(tex);
            }, undefined, (error) => {
                console.error('Failed to load flower texture:', file, error);
            });
        });

        // 2.5. Lily Pads and Cattail Plants (around edges, above flowers but below sparkles)
        this.createLilyPadsAndCattails(loader, fov, camDist, aspect);

        // 3. Paw Cursor
        if (this.pawElement) {
            this.pawElement.style.display = 'block'; 
            this.pawElement.style.position = 'fixed';
            this.pawElement.style.pointerEvents = 'none'; 
            this.pawElement.style.zIndex = '9999';
            this.pawElement.style.height = this.pawHeightCSS; 
            this.pawElement.style.width = 'auto'; 
            this.pawElement.style.transformOrigin = 'center bottom';
            this.pawElement.style.transform = 'translateX(-50%) rotate(0deg) scale(1)';
            this.pawElement.style.transition = 'transform 0.1s cubic-bezier(0.25, 1, 0.5, 1)';
            
            // Start paw at bottom center of screen, but hidden
            const screenW = window.innerWidth;
            const screenH = window.innerHeight;
            const startX = screenW / 2;
            const startY = screenH; // Bottom of screen
            
            this.pawState.x = startX;
            this.pawState.y = startY;
            this.pawTarget.x = startX;
            this.pawTarget.y = startY;
            
            this.pawElement.style.left = `${startX}px`;
            this.pawElement.style.top = `${startY}px`;
            this.pawElement.style.opacity = '0'; // Start hidden
            
            // Track if paw has emerged and if emergence animation is complete
            this.pawHasEmerged = false;
            this.pawEmergenceComplete = false;
            this.pawEmergenceTween = null; // Store the emergence animation tween
            this.pawEmergenceDuration = 0.8; // Duration for paw emergence animation (in seconds)
        }
        
        // 4. Glowing Sparkles (on top of everything)
        this.createSparkles();
        
        document.body.style.cursor = 'default'; 

        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mouseup', this.onMouseUp);
        window.addEventListener('resize', this.onResize);
        window.addEventListener('wheel', this.onWheel, { passive: false });
        window.addEventListener('keydown', this.onKeyDown.bind(this));
    }

    createSparkles() {
        // Calculate viewport dimensions for sparkle distribution
        const vFOV = THREE.MathUtils.degToRad(45);
        const camDist = 20;
        const aspect = window.innerWidth / window.innerHeight;
        const height = 2 * Math.tan(vFOV / 2) * camDist;
        const width = height * aspect;
        
        // Create sparkle texture (glowing circle)
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Create radial gradient for glow effect - soft glowing yellow sparkles with exposure
        // Use multiple layers for a softer, more glowing appearance
        const gradient1 = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient1.addColorStop(0, 'rgba(255, 255, 0, 0.3)'); // Soft yellow center (less opaque for glow)
        gradient1.addColorStop(0.2, 'rgba(255, 255, 100, 0.4)'); // Bright yellow glow
        gradient1.addColorStop(0.4, 'rgba(255, 240, 80, 0.3)'); // Golden yellow
        gradient1.addColorStop(0.6, 'rgba(255, 220, 60, 0.2)'); // Softer yellow
        gradient1.addColorStop(0.8, 'rgba(255, 200, 40, 0.1)'); // Fading yellow
        gradient1.addColorStop(1, 'rgba(255, 180, 20, 0)'); // Fully transparent edge
        
        ctx.fillStyle = gradient1;
        ctx.fillRect(0, 0, 64, 64);
        
        // Add a second, larger glow layer for more exposure
        const gradient2 = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
        gradient2.addColorStop(0, 'rgba(255, 255, 150, 0.2)'); // Outer glow layer
        gradient2.addColorStop(0.5, 'rgba(255, 240, 100, 0.15)');
        gradient2.addColorStop(1, 'rgba(255, 220, 80, 0)');
        
        ctx.globalCompositeOperation = 'screen'; // Blend mode for glow
        ctx.fillStyle = gradient2;
        ctx.fillRect(0, 0, 64, 64);
        ctx.globalCompositeOperation = 'source-over'; // Reset
        
        const sparkleTexture = new THREE.CanvasTexture(canvas);
        sparkleTexture.needsUpdate = true;
        
        // Create sparkle material with additive blending for enhanced glow
        const sparkleMaterial = new THREE.SpriteMaterial({
            map: sparkleTexture,
            color: 0xffffaa, // Slightly warmer yellow for better glow
            transparent: true,
            blending: THREE.AdditiveBlending, // Makes sparkles glow with exposure
            depthWrite: false,
            depthTest: false // Render on top of everything
        });
        
        // Store sparkles array for animation
        this.sparkles = [];
        const numSparkles = 25; // Number of sparkles
        
        // Create sparkles
        for (let i = 0; i < numSparkles; i++) {
            const material = sparkleMaterial.clone();
            const sprite = new THREE.Sprite(material);
            
            // Random position across the viewport
            const x = (Math.random() - 0.5) * width * 1.2;
            const y = (Math.random() - 0.5) * height * 1.2;
            const z = 0.7; // Above butterfly (butterfly at z: 0.6) and flowers (flowers at z: 0.025-0.175)
            
            sprite.position.set(x, y, z);
            
            // Random size
            const size = 0.3 + Math.random() * 0.4; // 0.3 to 0.7
            sprite.scale.set(size, size, 1);
            
            // Set render order to ensure sparkles render above butterfly
            sprite.renderOrder = 200; // Higher than butterfly (100)
            
            // Start with opacity 0, then fade in
            material.opacity = 0;
            
            // Store animation properties
            const sparkle = {
                sprite: sprite,
                material: material, // Store material reference for opacity control
                baseX: x,
                baseY: y,
                baseZ: z,
                flowSpeed: 0.1 + Math.random() * 0.15, // Slow flow speed
                flowDirection: new THREE.Vector2(
                    (Math.random() - 0.5) * 0.5,
                    (Math.random() - 0.5) * 0.5
                ).normalize(),
                twinkleSpeed: 0.5 + Math.random() * 1.0, // Twinkle animation speed
                twinkleOffset: Math.random() * Math.PI * 2,
                baseSize: size,
                isWrapping: false // Track if sparkle is currently wrapping (fading)
            };
            
            this.sparkles.push(sparkle);
            this.scene.add(sprite);
            
            // Fade in with random delay for organic appearance
            const fadeInDelay = Math.random() * 1.0; // 0-1 second delay
            gsap.to(material, {
                opacity: 1,
                duration: 1.5 + Math.random() * 0.5, // 1.5-2 seconds fade in
                delay: fadeInDelay,
                ease: "power2.out"
            });
        }
        
        console.log(`Created ${numSparkles} sparkles`);
    }

    createLilyPadsAndCattails(loader, fov, camDist, aspect) {
        // Calculate viewport dimensions - same as water background
        const vFOV = THREE.MathUtils.degToRad(fov);
        const height = 2 * Math.tan(vFOV / 2) * camDist;
        const width = height * aspect;
        
        // Use same padding as water background for consistency
        const padding = 1;
        
        // Load lily pad texture - maintain aspect ratio like water.png
        loader.load('./assets/lilypad.png', (lilyTex) => {
            lilyTex.encoding = THREE.sRGBEncoding;
            
            // Use actual image aspect ratio to prevent distortion
            const imageAspect = lilyTex.image.width / lilyTex.image.height;
            let lilyWidth = width * padding;
            let lilyHeight = lilyWidth / imageAspect; // Maintain image aspect ratio
            
            const lilyGeometry = new THREE.PlaneGeometry(lilyWidth, lilyHeight);
            const lilyMaterial = new THREE.MeshBasicMaterial({
                map: lilyTex,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: true
            });
            
            const lilyMesh = new THREE.Mesh(lilyGeometry, lilyMaterial);
            // Position lily pad so bottom part is visible (shift UP to show bottom)
            // Use 0.7 factor to move down a bit so edges don't show
            const yOffset = (lilyHeight - height) / 2 * 0.95; // Shift UP less to keep edges hidden
            lilyMesh.position.set(0, yOffset, 0.2); // Above flowers (0.1), below cattail plants (0.25)
            lilyMesh.userData.isBackground = true;
            lilyMesh.raycast = function() { return []; }; // Disable raycasting
            this.scene.add(lilyMesh);
            this.lilyPadMesh = lilyMesh; // Store reference for parallax
            this.lilyPadBasePos = new THREE.Vector3(0, yOffset, 0.2); // Store base position with offset
            
            // Lily pad wiggle properties for floating on water effect
            this.lilyPadWiggleSpeed = 0.3; // Very slow wiggle speed
            this.lilyPadWiggleAmplitude = 0.1; // Small amplitude for subtle movement
            this.lilyPadWiggleOffset = Math.random() * Math.PI * 2; // Random phase offset
            
            // Create shadow for lily pad - same shape as lily pad
            const lilyShadowGeometry = new THREE.PlaneGeometry(lilyWidth, lilyHeight);
            const lilyShadowMaterial = new THREE.MeshBasicMaterial({
                map: lilyTex, // Use same texture as lily pad
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: true,
                color: 0x000000, // Darken the texture to create shadow effect
                alphaTest: 0.1
            });
            const lilyShadowMesh = new THREE.Mesh(lilyShadowGeometry, lilyShadowMaterial);
            // Position shadow below the lily pad (lower Z, slightly lower Y)
            lilyShadowMesh.position.set(0, yOffset - 0.2, 0.1); // Below lily pad (z: 0.2 -> 0.1), slightly lower Y
            lilyShadowMesh.userData.isBackground = true;
            lilyShadowMesh.userData.isShadow = true;
            lilyShadowMesh.raycast = function() { return []; }; // Disable raycasting on shadow
            this.scene.add(lilyShadowMesh);
            this.lilyPadShadowMesh = lilyShadowMesh; // Store reference for parallax
            this.lilyPadShadowBasePos = new THREE.Vector3(0, yOffset - 0.2, 0.1); // Store base position with offset
            
            console.log('Created lily pads layer with shadow');
        }, undefined, (error) => {
            console.error('Failed to load lily pad texture:', error);
        });
        
        // Load cattail plant texture - maintain aspect ratio like water.png
        loader.load('./assets/cattailplant.png', (cattailTex) => {
            cattailTex.encoding = THREE.sRGBEncoding;
            
            // Use actual image aspect ratio to prevent distortion
            const imageAspect = cattailTex.image.width / cattailTex.image.height;
            let cattailWidth = width * padding;
            let cattailHeight = cattailWidth / imageAspect; // Maintain image aspect ratio
            
            const cattailGeometry = new THREE.PlaneGeometry(cattailWidth, cattailHeight);
            const cattailMaterial = new THREE.MeshBasicMaterial({
                map: cattailTex,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: true
            });
            
            const cattailMesh = new THREE.Mesh(cattailGeometry, cattailMaterial);
            // Position cattail plant so bottom part is visible (shift UP to show bottom)
            // Use 0.7 factor to move down a bit so edges don't show
            const yOffset = (cattailHeight - height) / 2 * 0.9; // Shift UP less to keep edges hidden
            cattailMesh.position.set(0, yOffset, 0.25); // Above lily pads (0.2), below sparkles (0.3)
            cattailMesh.userData.isBackground = true;
            cattailMesh.raycast = function() { return []; }; // Disable raycasting
            this.scene.add(cattailMesh);
            this.cattailPlantMesh = cattailMesh; // Store reference for parallax
            this.cattailPlantBasePos = new THREE.Vector3(0, yOffset, 0.25); // Store base position with offset
            
            // Create shadow for cattail plant - same shape as cattail plant
            const cattailShadowGeometry = new THREE.PlaneGeometry(cattailWidth, cattailHeight);
            const cattailShadowMaterial = new THREE.MeshBasicMaterial({
                map: cattailTex, // Use same texture as cattail plant
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: true,
                color: 0x000000, // Darken the texture to create shadow effect
                alphaTest: 0.1
            });
            const cattailShadowMesh = new THREE.Mesh(cattailShadowGeometry, cattailShadowMaterial);
            // Position shadow above lily pad (z: 0.22, between lily pad 0.2 and cattail 0.25)
            cattailShadowMesh.position.set(0, yOffset - 0.2, 0.22); // Above lily pad, below cattail plant
            cattailShadowMesh.userData.isBackground = true;
            cattailShadowMesh.userData.isShadow = true;
            cattailShadowMesh.raycast = function() { return []; }; // Disable raycasting on shadow
            this.scene.add(cattailShadowMesh);
            this.cattailPlantShadowMesh = cattailShadowMesh; // Store reference for parallax
            this.cattailPlantShadowBasePos = new THREE.Vector3(0, yOffset - 0.2, 0.22); // Store base position with offset
            
            console.log('Created cattail plants layer with shadow');
        }, undefined, (error) => {
            console.error('Failed to load cattail plant texture:', error);
        });
    }

    hasFlowerAtPosition(position, minDistance = 3.5) {
        // Check if there's already a flower at or near this position
        // Increased minDistance to prevent overlapping
        return this.flowers.some(f => {
            if (f.isRemoving || !f.mesh.visible) return false;
            const dist = f.mesh.position.distanceTo(position);
            return dist < minDistance;
        });
    }

    pushNearbyFlowers(newFlowerPosition, newFlower) {
        // Find nearby flowers and push them away (like floating on water)
        const pushRadius = 5.0; // Distance within which flowers will be pushed
        const pushStrength = 3.5; // Increased significantly - larger movement distance
        const pushDelay = 0; // No delay - start immediately
        const pushDuration = 10.0; // Much slower movement - increased from 2.5
        
        this.flowers.forEach(flower => {
            // Skip the new flower itself, flowers being removed, and flowers still initializing
            if (flower === newFlower || flower.isRemoving || flower.isInitializing || !flower.mesh) return;
            
            const distance = flower.mesh.position.distanceTo(newFlowerPosition);
            
            if (distance < pushRadius && distance > 0.1) { // Don't push if too close (avoid division by zero)
                // Cancel any existing push animations to prevent conflicts
                if (flower.isBeingPushed) {
                    // Kill existing animations
                    gsap.killTweensOf(flower.mesh.position);
                    if (flower.shadowMesh) {
                        gsap.killTweensOf(flower.shadowMesh.position);
                    }
                    flower.basePos.copy(flower.mesh.position);
                }
                
                const direction = new THREE.Vector3()
                    .subVectors(flower.mesh.position, newFlowerPosition)
                    .normalize();
                
                const pushDistance = pushStrength * (1 - (distance / pushRadius));
                
                const currentPosition = flower.mesh.position.clone();
                const targetPosition = currentPosition.clone().add(
                    direction.multiplyScalar(pushDistance)
                );
                
                const originalBasePos = flower.basePos.clone();
                const targetBasePos = targetPosition.clone();
                
                flower.isBeingPushed = true;
                
                gsap.to(flower.mesh.position, {
                    x: targetPosition.x,
                    y: targetPosition.y,
                    duration: pushDuration,
                    delay: pushDelay,
                    ease: "power2.out",
                    onUpdate: () => {
                        const currentX = flower.mesh.position.x;
                        const currentY = flower.mesh.position.y;
                        const dx = currentX - originalBasePos.x;
                        const dy = currentY - originalBasePos.y;
                        const totalDx = targetBasePos.x - originalBasePos.x;
                        const totalDy = targetBasePos.y - originalBasePos.y;
                        const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
                        const currentDist = Math.sqrt(dx * dx + dy * dy);
                        
                        if (totalDist > 0.001) {
                            const progress = Math.min(1, Math.max(0, currentDist / totalDist));
                            flower.basePos.lerpVectors(originalBasePos, targetBasePos, progress);
                        }
                    },
                    onComplete: () => {
                        // Ensure final position is set correctly
                        flower.basePos.copy(targetBasePos);
                        flower.isBeingPushed = false;
                    }
                });
                
                // Also update shadow position gradually
                if (flower.shadowMesh) {
                    gsap.to(flower.shadowMesh.position, {
                        x: targetPosition.x,
                        y: targetPosition.y - 0.2,
                        duration: pushDuration,
                        delay: pushDelay,
                        ease: "power2.out"
                    });
                }
            }
        });
    }

    createFlower(position) {
        if (this.flowerTextures.length === 0) return;
        
        // Prevent creating flowers on top of each other
        // Use larger minimum distance to prevent overlapping
        if (this.hasFlowerAtPosition(position, 3.5)) {
            console.log("Cannot create flower - position too close to existing flower");
            return;
        } 

        // Ripple - Multiple circular contours with minimal discontinuity
        const numRings = 1 + Math.floor(Math.random() * 3); // 1-3 rings
        const rippleGroup = new THREE.Group();
        rippleGroup.position.set(position.x, position.y, -0.05);
        rippleGroup.userData.isRipple = true;
        rippleGroup.raycast = function() { return []; }; // Disable raycasting on ripples
        
        const materials = []; // Store materials for animation
        
        // Add solid circle at the center - bigger than all contours
        // Largest contour: radius 0.15 + (2 * 0.1) = 0.35, plus width ~0.02 = 0.37 max
        const solidCircleRadius = 0.45; // Bigger than all contour rings, but smaller overall
        const solidCircleGeom = new THREE.CircleGeometry(solidCircleRadius, 32);
        const solidCircleMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.4, // Reduced opacity from 0.7
            side: THREE.DoubleSide,
            depthWrite: false
        });
        materials.push(solidCircleMat);
        const solidCircleMesh = new THREE.Mesh(solidCircleGeom, solidCircleMat);
        rippleGroup.add(solidCircleMesh);
        
        for (let i = 0; i < numRings; i++) {
            const ringRadius = 0.15 + (i * 0.1); // 0.15-0.35
            const ringWidth = 0.01 + Math.random() * 0.01; // 0.01-0.02
            const numGaps = 1 + Math.floor(Math.random() * 2); // 1-2 gaps per ring
            
            // Create gaps with varying sizes
            const gaps = [];
            let totalGapAngle = 0;
            for (let g = 0; g < numGaps; g++) {
                const gapSize = (Math.PI * 2) * (0.03 + Math.random() * 0.05); // 3-8% of circle
                gaps.push(gapSize);
                totalGapAngle += gapSize;
            }
            
            // Create arc segments with minimal variation
            const remainingAngle = Math.PI * 2 - totalGapAngle;
            const numSegments = numGaps;
            const baseSegmentAngle = remainingAngle / numSegments;
            
            let currentAngle = 0;
            for (let j = 0; j < numSegments; j++) {
                // Minimal variation for symmetry
                const segmentVariation = (Math.random() - 0.5) * 0.1; // ±5% variation
                const segmentAngle = baseSegmentAngle * (1 + segmentVariation);
                
                const arcStart = currentAngle;
                const arcEnd = arcStart + segmentAngle;
                
                // No additional small gaps (less discontinuity)
                currentAngle = arcEnd + (gaps[j] || 0);
                
                // Create ring arc segment
                const arcGeom = new THREE.RingGeometry(ringRadius, ringRadius + ringWidth, 32, 1, arcStart, arcEnd - arcStart);
                const arcMat = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.7 - (i * 0.15), // 0.7-0.4
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                materials.push(arcMat);
                
                const arcMesh = new THREE.Mesh(arcGeom, arcMat);
                rippleGroup.add(arcMesh);
            }
        }
        
        this.scene.add(rippleGroup);

        gsap.to(rippleGroup.scale, { x: 4, y: 4, duration: 1.5, ease: "power2.out" });
        gsap.to(materials, { 
            opacity: 0, 
            duration: 1.5, 
            ease: "power2.out",
            onComplete: () => {
                this.scene.remove(rippleGroup);
                rippleGroup.children.forEach(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            }
        });

        // Flower
        const randomIndex = Math.floor(Math.random() * this.flowerTextures.length);
        const selectedTexture = this.flowerTextures[randomIndex];

        const size = 1.5 + Math.random() * 0.8;
        const geometry = new THREE.PlaneGeometry(size, size, 2, 2);
        
        const material = new THREE.MeshBasicMaterial({ 
            map: selectedTexture, 
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: true,  // Enable depth writing for proper sorting
            depthTest: true,   // Enable depth testing
            alphaTest: 0.1,    // Discard pixels below this alpha threshold
            color: 0xffffff 
        });

        const mesh = new THREE.Mesh(geometry, material);
        // Vary Z position slightly to create depth and prevent complete overlap
        const zVariation = (Math.random() - 0.5) * 0.15; // Random Z between -0.075 and 0.075
        mesh.position.set(position.x, position.y, 0.1 + zVariation);
        mesh.rotation.z = Math.random() * Math.PI * 2;
        mesh.userData = { isFlower: true };
        
        // Make sure the mesh is actually raycastable
        mesh.visible = true;
        mesh.matrixAutoUpdate = true;
        mesh.updateMatrixWorld();
        
        // Create shadow for the flower
        const shadowSize = size * 0.85;
        const shadowGeometry = new THREE.PlaneGeometry(shadowSize, shadowSize, 2, 2);
        const shadowMaterial = new THREE.MeshBasicMaterial({
            map: selectedTexture, // Use same texture as flower
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true,
            color: 0x000000, // Darken the texture to create shadow effect
            alphaTest: 0.1
        });
        const shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
        // Position shadow below the flower (lower Z, slightly lower Y)
        // Flower is at z: 0.1 + zVariation, shadow should be at lower z
        shadowMesh.position.set(position.x, position.y - 0.2, -0.05);
        shadowMesh.rotation.z = mesh.rotation.z; // Match flower rotation
        shadowMesh.userData = { isShadow: true };
        shadowMesh.raycast = function() { return []; }; // Disable raycasting on shadows
        this.scene.add(shadowMesh);
        
        // Debug: Log flower position
        console.log("Created flower at:", mesh.position, "scale:", mesh.scale);

        this.scene.add(mesh);
        
        // Start at scale 0 for animation (but still raycastable)
        mesh.scale.set(0, 0, 0);
        shadowMesh.scale.set(0, 0, 0);
        
        // Override raycast to work even when scale is 0
        const originalRaycast = mesh.raycast.bind(mesh);
        mesh.raycast = function(raycaster, intersects) {
            const originalScale = this.scale.clone();
            this.scale.set(1, 1, 1);
            this.updateMatrixWorld();
            originalRaycast(raycaster, intersects);
            this.scale.copy(originalScale);
            this.updateMatrixWorld();
        };
        
        // Store basePos and create reference holder for flowerObj
        const basePos = position.clone();
        let flowerObjRef = null;
        
        // Animate scale to 1 for both flower and shadow, and update volume when animation completes
        gsap.to(mesh.scale, { 
            x: 1, 
            y: 1, 
            duration: 0.5, 
            ease: "back.out(1.7)",
            onComplete: () => {
                mesh.position.x = basePos.x;
                mesh.position.y = basePos.y;
                // Start drift animation with offset so it begins at 0
                if (flowerObjRef) {
                    flowerObjRef.driftStartTime = this.clock.getElapsedTime();
                    flowerObjRef.driftOffset = -Math.PI / 2;
                    flowerObjRef.isInitializing = false;
                }
            }
        });
        
        gsap.to(shadowMesh.scale, {
            x: 1,
            y: 1,
            duration: 0.5,
            ease: "back.out(1.7)",
            onComplete: () => {
                // Set volume to match final scale (1.0) = -6dB
                const finalScale = 1.0;
                const minScale = 0.5;
                const maxScale = 3.0;
                const minVol = -18; // Smallest size
                const maxVol = 0;   // Largest size (limiter prevents clipping)
                const finalVol = THREE.MathUtils.mapLinear(finalScale, minScale, maxScale, minVol, maxVol);
                if (synth) {
                    synth.volume.value = finalVol;
                }
            }
        });

        // Audio - Map Y position to timbre (brightness), keep pitch the same
        const bellNotes = ["C5", "E5", "G5", "A5", "C6", "E6"]; 
        
        // Map Y position to timbre (filter cutoff frequency)
        // Get viewport height in world units
        const vFOV = THREE.MathUtils.degToRad(45);
        const camDist = 20;
        const aspect = window.innerWidth / window.innerHeight;
        const viewportHeight = 2 * Math.tan(vFOV / 2) * camDist;
        
        // Normalize Y position to 0-1 range
        // Y ranges roughly from -viewportHeight/2 to +viewportHeight/2
        const normalizedY = (position.y + viewportHeight * 0.5) / viewportHeight;
        const clampedY = Math.max(0, Math.min(1, normalizedY));
        
        // Map Y to filter cutoff frequency: bottom = dull (low cutoff), top = bright (high cutoff)
        // Lower flowers = duller, higher flowers = brighter
        const minCutoff = 200; // Dull: low cutoff frequency (filters out high frequencies)
        const maxCutoff = 8000; // Bright: high cutoff frequency (allows all frequencies)
        // Gate enabled: all flowers use maxCutoff (8000) regardless of Y position
        const filterCutoff = maxCutoff; // THREE.MathUtils.mapLinear(clampedY, 0, 1, minCutoff, maxCutoff);
        
        // Create filter for timbre control
        const filter = new Tone.Filter({
            frequency: filterCutoff,
            type: "lowpass", // Low-pass filter: lower cutoff = duller, higher cutoff = brighter
            Q: 1
        });
        
        const synth = new Tone.PolySynth(Tone.FMSynth, {
            harmonicity: 3.0,
            modulationIndex: 10,
            volume: -8, 
            oscillator: { type: "sine" },
            envelope: { attack: 0.01, decay: 2.0, sustain: 0.0, release: 2.0 },
            modulation: { type: "square" },
            modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0 },
            detune: 0 // No pitch variation - all flowers have the same pitch
        }).connect(filter); // Connect synth through filter
        
        filter.connect(this.masterVolume); // Then connect filter to master volume 

        const startNote = bellNotes[Math.floor(Math.random() * bellNotes.length)];
        synth.triggerAttackRelease(startNote, "8n");
        
        // Map initial rotation speed to loop interval
        // Rotation speed ranges from -0.004 to +0.004 (set below)
        // Map to BPM: slower rotation = slower BPM, faster rotation = faster BPM
        // Use absolute value so both directions increase speed
        const initialRotSpeed = (Math.random() - 0.5) * 0.004;
        const absRotSpeed = Math.abs(initialRotSpeed);
        const maxRotSpeed = 0.02;
        
        // Map rotation speed to interval: slow rotation = slow BPM, fast = fast BPM
        // Base interval "8n" = 8th note. We'll vary from "4n" (slow) to "16n" (fast)
        // Let's use time values instead: slower = longer interval
        const minInterval = "16n"; // Fastest (shortest interval)
        const maxInterval = "4n";  // Slowest (longest interval)
        
        // For now, start with a medium interval based on initial rotation speed
        const initialInterval = "8n";
        
        const loop = new Tone.Loop(time => {
            if (Math.random() < 0.2) {
                const note = bellNotes[Math.floor(Math.random() * bellNotes.length)];
                const vel = 0.5 + Math.random() * 0.5;
                synth.triggerAttackRelease(note, "16n", time, vel);
            }
        }, initialInterval);

        loop.start(); 
        
        // Set initial volume based on initial scale (will be 1 after animation)
        // Scale 1.0 = -6dB (starting volume)
        const initialScale = 1.0; // After pop-up animation completes
        const minScale = 0.5;
        const maxScale = 3.0;
        const minVol = -18; // Smallest size
        const maxVol = 0;   // Largest size (limiter prevents clipping)
        const initialVol = THREE.MathUtils.mapLinear(initialScale, minScale, maxScale, minVol, maxVol);
        synth.volume.value = initialVol;

        const flowerObj = { 
            mesh, shadowMesh, synth, loop, filter,
            rotSpeed: initialRotSpeed, // Rotation speed controls BPM
            baseRotSpeed: initialRotSpeed, // Store original speed
            wiggleSpeed: 0.3 + Math.random() * 0.4,
            wiggleOffset: Math.random() * Math.PI * 2,
            basePos: basePos.clone(), // Use the same basePos as in the callback
            driftSpeed: 0.2 + Math.random() * 0.3,
            driftOffset: Math.random() * Math.PI * 2,
            isRemoving: false,
            currentScale: initialScale, // Track current scale
            filterCutoff: filterCutoff, // Timbre determined by Y position (fixed per flower)
            isInitializing: true // Flag to prevent drift until pop-up animation completes
        };
        
        // Set the reference so the callback can access it
        flowerObjRef = flowerObj;
        
        this.flowers.push(flowerObj);
        console.log(`[CREATE] Flower added. Array length: ${this.flowers.length}, Max: ${this.maxFlowers}`);
        
        // Push nearby flowers away (like floating on water) - start immediately
        this.pushNearbyFlowers(position, flowerObj);
        
        // Check immediately and also in next frame to catch any timing issues
        this.checkAndRemoveOldestFlower();
        
        // Also check in next frame as backup
        requestAnimationFrame(() => {
            this.checkAndRemoveOldestFlower();
        });
        
        // Check if we've reached 10 flowers and show NEXT button
        const activeFlowers = this.flowers.filter(f => f && !f.isRemoving && f.mesh && f.mesh.visible);
        if (activeFlowers.length >= 10 && !this.nextButtonShown) {
            this.showNextButton();
        }
    }
    
    showNextButton() {
        if (this.nextButtonShown) return; // Prevent multiple buttons
        this.nextButtonShown = true;
        
        // Start preloading Stage 3 assets in the background
        // This ensures they're ready when the user clicks NEXT
        console.log("[Stage2] Starting Stage 3 asset preload...");
        if (typeof stage3Preloader !== 'undefined') {
            stage3Preloader.preloadAll(() => {
                console.log("[Stage2] Stage 3 assets preloaded and ready!");
            });
        }
        
        // Create NEXT button element - simple symmetric rounded rectangle
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
        nextButton.addEventListener('click', () => {
            if (this.onComplete) {
                // Disable pointer events immediately to prevent multiple clicks
                nextButton.style.pointerEvents = 'none';
                
                // Disable parallax to prevent camera movement
                this.parallaxDisabled = true;
                console.log("[Stage2] Parallax disabled - camera locked");
                
                // Stop paw tracking - paw will stay at last position
                this.pawTrackingDisabled = true;
                
                // Kill any ongoing paw animations to prevent flashing
                if (this.pawState) {
                    gsap.killTweensOf(this.pawState);
                }
                if (this.pawElement) {
                    gsap.killTweensOf(this.pawElement);
                }
                
                // Kill all camera animations to lock it in place
                if (this.camera) {
                    gsap.killTweensOf(this.camera.position);
                    console.log("[Stage2] Camera animations killed - position locked");
                }
                
                // Kill all background layer animations
                if (this.waterMesh) gsap.killTweensOf(this.waterMesh.position);
                if (this.lilyPadMesh) gsap.killTweensOf(this.lilyPadMesh.position);
                if (this.lilyPadShadowMesh) gsap.killTweensOf(this.lilyPadShadowMesh.position);
                if (this.cattailPlantMesh) gsap.killTweensOf(this.cattailPlantMesh.position);
                if (this.cattailPlantShadowMesh) gsap.killTweensOf(this.cattailPlantShadowMesh.position);
                
                // Ensure button stays on top during fadeout
                nextButton.style.zIndex = '100000';
                
                // Quickly fade out button - transition only starts after button is completely gone
                gsap.to(nextButton, {
                    opacity: 0,
                    duration: 0.3, // Quick fade: 0.3 seconds
                    ease: "power2.in",
                    onComplete: () => {
                        // Wait one more frame to ensure opacity is truly 0 before transitioning
                        requestAnimationFrame(() => {
                            nextButton.remove();
                            console.log("[Stage2] Button fully faded, calling onComplete to transition to Stage 3");
                            this.onComplete();
                        });
                    }
                });
            }
        });
        
        this.nextButtonElement = nextButton;
    }
    
    checkAndRemoveOldestFlower() {
        // Count only active (non-removing) flowers
        const activeFlowers = this.flowers.filter(f => {
            return f && !f.isRemoving && f.mesh && f.mesh.visible;
        });
        
        console.log(`[CHECK] Total flowers: ${this.flowers.length}, Active: ${activeFlowers.length}, Max: ${this.maxFlowers}`);
        
        if (activeFlowers.length > this.maxFlowers) {
            const oldestFlower = this.flowers.find(f => {
                return f && !f.isRemoving && f.mesh && f.mesh.visible;
            });
            
            if (oldestFlower) {
                console.log(`[REMOVAL TRIGGERED] Removing oldest flower. Total: ${this.flowers.length}, Active: ${activeFlowers.length}, Max: ${this.maxFlowers}`);
                this.removeFlower(oldestFlower);
            } else {
                console.error('[REMOVAL FAILED] Could not find oldest flower to remove!');
                console.error('Active flowers count:', activeFlowers.length);
                console.error('All flowers status:');
                this.flowers.forEach((f, i) => {
                    console.error(`  [${i}] isRemoving=${f?.isRemoving}, hasMesh=${!!f?.mesh}, visible=${f?.mesh?.visible}, isRemoving=${f?.isRemoving}`);
                });
            }
        } else {
            console.log(`[NO REMOVAL] ${activeFlowers.length} active <= ${this.maxFlowers} max`);
        }
    }

    removeFlower(flowerObj) {
        if (flowerObj.isRemoving) {
            console.log("Flower already being removed, skipping");
            return;
        }
        
        if (!flowerObj || !flowerObj.mesh) {
            console.warn("Cannot remove flower - invalid object:", flowerObj);
            return;
        }
        
        console.log("Removing flower:", flowerObj);
        flowerObj.isRemoving = true;

        // Immediately make flower non-interactive by removing from scene's raycastable objects
        // The mesh will still be visible during animation, but won't be hit by raycasts
        flowerObj.mesh.userData.isFlower = false;
        flowerObj.mesh.userData.isRemoving = true;

        // Audio Cleanup
        if (flowerObj.loop) {
            flowerObj.loop.stop();
            flowerObj.loop.dispose();
        }
        if (flowerObj.filter) {
            flowerObj.filter.dispose();
        }
        if (flowerObj.synth) {
            flowerObj.synth.volume.rampTo(-Infinity, 0.1);
            setTimeout(() => { 
                if (flowerObj.synth) {
                    flowerObj.synth.dispose(); 
                }
            }, 200);
        }

        // Visual Cleanup - Reverse of pop-up animation (back.in instead of back.out)
        // Animate both flower and shadow
        gsap.to(flowerObj.mesh.scale, { 
            x: 0, y: 0, 
            duration: 0.5, 
            ease: "back.in(1.7)", // Reverse of "back.out(1.7)" used in createFlower
        });
        
        if (flowerObj.shadowMesh) {
            gsap.to(flowerObj.shadowMesh.scale, {
                x: 0, y: 0,
                duration: 0.5,
                ease: "back.in(1.7)"
            });
        }
        
        gsap.to(flowerObj.mesh.scale, {
            onComplete: () => {
                if (this.scene && flowerObj.mesh) {
                    this.scene.remove(flowerObj.mesh);
                    if (flowerObj.mesh.geometry) flowerObj.mesh.geometry.dispose();
                    if (flowerObj.mesh.material) flowerObj.mesh.material.dispose();
                }
                
                if (this.scene && flowerObj.shadowMesh) {
                    this.scene.remove(flowerObj.shadowMesh);
                    if (flowerObj.shadowMesh.geometry) flowerObj.shadowMesh.geometry.dispose();
                    if (flowerObj.shadowMesh.material) flowerObj.shadowMesh.material.dispose();
                }
                
                const idx = this.flowers.indexOf(flowerObj);
                if (idx > -1) this.flowers.splice(idx, 1);
                console.log("Flower removed from array");
            }
        });
    }

    animatePawTap() {
        if (!this.pawElement) return;
        gsap.killTweensOf(this.pawState);
        this.pawState.rotation = 0;
        this.pawState.scale = 1.0;

        gsap.to(this.pawState, {
            rotation: this.pawClickRotation, 
            scale: 0.95,                     
            duration: 0.12,                  
            yoyo: true,                      
            repeat: 1,                       
            ease: "power1.out"               
        });
    }

    onMouseDown(event) {
        this.isMouseDown = true;
        this.didDrag = false;
        
        // Reset pointers
        this.draggedFlower = null;
        this.clickedFlower = null;
        this.bgClickPos = null;
        
        // Track Start
        this.mouseDownX = event.clientX;
        this.mouseDownY = event.clientY;
        
        this.animatePawTap();
        
        // Update mouse coordinates for raycasting
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Ensure camera matrices are updated
        this.camera.updateMatrixWorld();
        
        // Set up raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Debug raycaster
        console.log("Mouse coords:", this.mouse.x, this.mouse.y);
        console.log("Camera position:", this.camera.position);
        console.log("Camera rotation:", this.camera.rotation);
        console.log("Raycaster ray:", this.raycaster.ray);

        // Strict flower count check
        
        // Debug: Check what's in the scene
        console.log("Scene children count:", this.scene.children.length);
        console.log("Flowers array length:", this.flowers.length);
        this.flowers.forEach((f, i) => {
            console.log(`Flower ${i}: visible=${f.mesh.visible}, position=`, f.mesh.position, "userData=", f.mesh.userData);
        });
        
        // Intersect ALL scene objects first, then filter for flowers
        const allIntersects = this.raycaster.intersectObjects(this.scene.children, true); // Try recursive
        console.log("All intersects:", allIntersects.length, allIntersects);
        
        const flowerIntersects = allIntersects.filter(intersect => {
            const obj = intersect.object;
            return obj.userData.isFlower === true && 
                   !obj.userData.isBackground &&
                   obj.visible;
        });
        
        // Also verify the flower is in our flowers array and not being removed
        const validFlowerIntersects = flowerIntersects.filter(intersect => {
            const flower = this.flowers.find(f => f.mesh === intersect.object);
            return flower && !flower.isRemoving;
        });
        
        console.log(`Raycast check: ${this.flowers.length} total flowers, ${allIntersects.length} total intersections, ${flowerIntersects.length} flower intersections, ${validFlowerIntersects.length} valid`);
        
        if (validFlowerIntersects.length > 0) {
            // WE HIT A FLOWER
            const hitMesh = validFlowerIntersects[0].object;
            console.log("Hit mesh:", hitMesh, "userData:", hitMesh.userData);
            this.draggedFlower = this.flowers.find(f => 
                f.mesh === hitMesh && 
                !f.isRemoving
            );
            
            if (this.draggedFlower) {
                console.log("Flower detected on mousedown:", this.draggedFlower);
                this.clickedFlower = this.draggedFlower; // Store for potential removal
                this.dragStartY = event.clientY;
                this.initialScale = this.draggedFlower.mesh.scale.x;
                // STOP HERE. Do not check background.
                return; 
            } else {
                console.log("Flower mesh found but not in flowers array");
            }
        } else {
            console.log("No valid flower intersection found");
        }

        // 3. IF NO FLOWER HIT -> Calculate Background Click
        const vec = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5);
        vec.unproject(this.camera);
        const dir = vec.sub(this.camera.position).normalize();
        const distance = -this.camera.position.z / dir.z;
        const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));
        
        // Check if this position is too close to existing flowers
        if (!this.hasFlowerAtPosition(pos, 3.5)) {
            this.bgClickPos = pos;
        } else {
            // Try to find a nearby position that's not overlapping
            let attempts = 0;
            let validPos = null;
            while (attempts < 10 && !validPos) {
                const offsetX = (Math.random() - 0.5) * 4;
                const offsetY = (Math.random() - 0.5) * 4;
                const testPos = new THREE.Vector3(pos.x + offsetX, pos.y + offsetY, pos.z);
                if (!this.hasFlowerAtPosition(testPos, 3.5)) {
                    validPos = testPos;
                }
                attempts++;
            }
            this.bgClickPos = validPos || pos; // Use original if no valid position found
        }
    }

    onMouseMove(event) {
        // Ignore mouse movement during camera transitions
        // This prevents the camera from moving during Stage 2 to Stage 3 transition
        if (this.cameraTransitionInProgress) {
            return; // Exit immediately - no paw, no parallax, no camera movement
        }
        
        // Update paw cursor
        if (this.pawElement && !this.pawTrackingDisabled) {
            // Handle paw emergence on first mouse move
            if (!this.pawHasEmerged) {
                this.pawHasEmerged = true;
                
                // Show paw (fade in)
                gsap.to(this.pawElement, {
                    opacity: 1,
                    duration: 0.3,
                    ease: "power2.out"
                });
                
                // Calculate target position
                const screenH = window.innerHeight;
                const pawH = this.pawElement.offsetHeight || 150;
                let targetTop = event.clientY - this.pawTipOffset;
                const minTop = screenH - pawH + this.hideBottomAmount;
                targetTop = Math.max(targetTop, minTop);
                
                this.pawTarget.x = event.clientX + this.pawXOffset;
                this.pawTarget.y = targetTop;
                
                // Animate paw emerging from bottom to cursor position
                this.pawEmergenceTween = gsap.to(this.pawState, {
                    x: this.pawTarget.x,
                    y: this.pawTarget.y,
                    duration: this.pawEmergenceDuration,
                    ease: "power2.out",
                    onComplete: () => {
                        // Mark emergence as complete
                        this.pawEmergenceComplete = true;
                        this.pawEmergenceTween = null;
                    }
                });
            } else if (this.pawEmergenceComplete) {
                // Normal tracking only after emergence animation completes
                const screenH = window.innerHeight;
                const pawH = this.pawElement.offsetHeight; 
                let targetTop = event.clientY - this.pawTipOffset;
                const minTop = screenH - pawH + this.hideBottomAmount;
                
                // Update target position (cursor position)
                this.pawTarget.y = Math.max(targetTop, minTop);
                this.pawTarget.x = event.clientX + this.pawXOffset;
                
                // Animate paw to target with 0.4s lag
                gsap.to(this.pawState, {
                    x: this.pawTarget.x,
                    y: this.pawTarget.y,
                    duration: 0.4,
                    ease: "power2.out"
                });
            } else {
                // During emergence animation, smoothly update target without interrupting
                const screenH = window.innerHeight;
                const pawH = this.pawElement.offsetHeight || 150;
                let targetTop = event.clientY - this.pawTipOffset;
                const minTop = screenH - pawH + this.hideBottomAmount;
                targetTop = Math.max(targetTop, minTop);
                
                // Update target
                this.pawTarget.x = event.clientX + this.pawXOffset;
                this.pawTarget.y = targetTop;
                
                // Update the ongoing emergence animation to smoothly move to new target
                // Calculate remaining time in the animation
                if (this.pawEmergenceTween) {
                    const progress = this.pawEmergenceTween.progress();
                    const remainingTime = this.pawEmergenceDuration * (1 - progress); // Remaining duration
                    
                    // Kill the old animation and create a new one from current position to new target
                    this.pawEmergenceTween.kill();
                    
                    this.pawEmergenceTween = gsap.to(this.pawState, {
                        x: this.pawTarget.x,
                        y: this.pawTarget.y,
                        duration: Math.max(remainingTime, 0.5), // At least 0.5s, or remaining time
                        ease: "power2.out",
                        onComplete: () => {
                            this.pawEmergenceComplete = true;
                            this.pawEmergenceTween = null;
                        }
                    });
                }
            }
        }
        
        // Parallax camera movement
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Skip parallax during transitions
        if (this.parallaxDisabled) {
            return; // Exit early, no parallax movement
        }
        
        // Smooth camera parallax movement (smaller movement)
        const targetX = this.mouse.x * 0.5; // Reduced from 1.5 to 0.5
        const targetY = this.mouse.y * 0.5; // Reduced from 1.5 to 0.5
        gsap.to(this.camera.position, {
            x: targetX,
            y: targetY,
            duration: 1.2,
            ease: "power2.out"
        });
        
        // Parallax movement for background layers based on depth
        // Deeper layers (lower z) move less, creating depth effect
        if (this.waterMesh && this.waterBasePos) {
            // Water is deepest (z: -0.1), moves least
            const waterParallax = 0.15; // Smallest movement
            gsap.to(this.waterMesh.position, {
                x: this.waterBasePos.x + this.mouse.x * waterParallax,
                y: this.waterBasePos.y + this.mouse.y * waterParallax,
                duration: 1.2,
                ease: "power2.out"
            });
        }
        
        if (this.lilyPadMesh && this.lilyPadBasePos) {
            // Lily pads are middle depth (z: 0.2), move moderately
            const lilyParallax = 0.3; // Medium movement
            gsap.to(this.lilyPadMesh.position, {
                x: this.lilyPadBasePos.x + this.mouse.x * lilyParallax,
                y: this.lilyPadBasePos.y + this.mouse.y * lilyParallax,
                duration: 1.2,
                ease: "power2.out"
            });
            
            // Move shadow with lily pad (same parallax)
            if (this.lilyPadShadowMesh && this.lilyPadShadowBasePos) {
                gsap.to(this.lilyPadShadowMesh.position, {
                    x: this.lilyPadShadowBasePos.x + this.mouse.x * lilyParallax,
                    y: this.lilyPadShadowBasePos.y + this.mouse.y * lilyParallax,
                    duration: 1.2,
                    ease: "power2.out"
                });
            }
        }
        
        if (this.cattailPlantMesh && this.cattailPlantBasePos) {
            // Cattail plants are closer (z: 0.25), move more
            const cattailParallax = 0.4; // Larger movement
            gsap.to(this.cattailPlantMesh.position, {
                x: this.cattailPlantBasePos.x + this.mouse.x * cattailParallax,
                y: this.cattailPlantBasePos.y + this.mouse.y * cattailParallax,
                duration: 1.2,
                ease: "power2.out"
            });
            
            // Move shadow with cattail plant (same parallax)
            if (this.cattailPlantShadowMesh && this.cattailPlantShadowBasePos) {
                gsap.to(this.cattailPlantShadowMesh.position, {
                    x: this.cattailPlantShadowBasePos.x + this.mouse.x * cattailParallax,
                    y: this.cattailPlantShadowBasePos.y + this.mouse.y * cattailParallax,
                    duration: 1.2,
                    ease: "power2.out"
                });
            }
        }
        
        // Check which flower is under cursor for scroll interaction
        this.camera.updateMatrixWorld();
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const allIntersects = this.raycaster.intersectObjects(this.scene.children, true);
        const flowerIntersects = allIntersects.filter(intersect => {
            const obj = intersect.object;
            return obj.userData.isFlower === true && 
                   !obj.userData.isBackground &&
                   obj.visible;
        });
        
        if (flowerIntersects.length > 0) {
            const hitMesh = flowerIntersects[0].object;
            this.hoveredFlower = this.flowers.find(f => 
                f.mesh === hitMesh && !f.isRemoving
            );
        } else {
            this.hoveredFlower = null;
        }

            // Check if this was a click or drag
        if (this.isMouseDown) {
            const moveDist = Math.sqrt(
                Math.pow(event.clientX - this.mouseDownX, 2) + 
                Math.pow(event.clientY - this.mouseDownY, 2)
            );
            
            // Threshold: 10px. If you move less than this, it's a CLICK.
            if (moveDist > 10) {
                this.didDrag = true;
            }
        }

        // Handle window resize
        if (this.isMouseDown && this.draggedFlower && this.didDrag) {
            const deltaY = this.dragStartY - event.clientY;
            let newScale = this.initialScale + (deltaY * 0.01);
            newScale = Math.max(0.5, Math.min(3.0, newScale));
            this.draggedFlower.mesh.scale.set(newScale, newScale, 1);
            
            // Update shadow scale to match flower scale
            if (this.draggedFlower.shadowMesh) {
                this.draggedFlower.shadowMesh.scale.set(newScale, newScale, 1);
            }
            
            // Update sequencer volume based on scale
            // Map scale (0.5-3.0) to volume for audible range
            const minScale = 0.5;
            const maxScale = 3.0;
            const minVol = -18; // Quiet at small size
            const maxVol = 0;   // Loud at large size (limiter prevents clipping)
            
            // Linear mapping: scale 1.0 (starting size) = -6dB
            // Scale 0.5 (smallest) = -18dB, Scale 3.0 (largest) = 0dB
            const vol = THREE.MathUtils.mapLinear(newScale, minScale, maxScale, minVol, maxVol);
            
            // Update both synth and loop volumes
            if (this.draggedFlower.synth) {
                this.draggedFlower.synth.volume.rampTo(vol, 0.1);
            }
            if (this.draggedFlower.loop) {
                // Tone.Sequence doesn't have volume, but we can control it via the synth
                // The synth volume is already updated above
            }
            
            // Store the current scale for reference
            this.draggedFlower.currentScale = newScale;
        }
    }

    onMouseUp(event) {
        this.isMouseDown = false; 

        if (!this.didDrag) {
            // Handle click to create flower
            // Re-check raycast on mouseUp to ensure we have the correct flower
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            // Ensure camera matrices are updated
            this.camera.updateMatrixWorld();
            
            // Set up raycaster
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            console.log("MouseUp - Mouse coords:", this.mouse.x, this.mouse.y);
            
            // Intersect ALL scene objects first, then filter for flowers
            const allIntersects = this.raycaster.intersectObjects(this.scene.children, true); // Try recursive
            console.log("onMouseUp - All intersects:", allIntersects.length, allIntersects);
            
            const flowerIntersects = allIntersects.filter(intersect => {
                const obj = intersect.object;
                return obj.userData.isFlower === true && 
                       !obj.userData.isBackground &&
                       obj.visible;
            });
            
            // Also verify the flower is in our flowers array and not being removed
            const validFlowerIntersects = flowerIntersects.filter(intersect => {
                const flower = this.flowers.find(f => f.mesh === intersect.object);
                return flower && !flower.isRemoving;
            });
            
            console.log(`onMouseUp: ${this.flowers.length} total flowers, ${allIntersects.length} total intersections, ${flowerIntersects.length} flower intersections, ${validFlowerIntersects.length} valid, didDrag: ${this.didDrag}`);
            
            if (validFlowerIntersects.length > 0) {
                // WE HIT A FLOWER - Remove it
                const hitMesh = validFlowerIntersects[0].object;
                console.log("Hit mesh on mouseUp:", hitMesh);
                const flowerToRemove = this.flowers.find(f => 
                    f.mesh === hitMesh && 
                    !f.isRemoving
                );
                
                if (flowerToRemove) {
                    console.log("Removing flower on click", flowerToRemove);
                    this.removeFlower(flowerToRemove);
                    // Clear bgClickPos to prevent creating a new flower
                    this.bgClickPos = null;
                    this.draggedFlower = null;
                    this.clickedFlower = null;
                    return;
                } else {
                    console.log("Flower mesh found but not in flowers array on mouseUp");
                }
            } else {
                console.log("No valid flower intersection on mouseUp");
            }
            
            // If no flower was hit, check if we should create a new one
            if (this.bgClickPos) {
                // Clicked on empty space - create new flower (createFlower will check for overlaps)
                this.createFlower(this.bgClickPos);
            }
        }
        
        this.draggedFlower = null;
        this.clickedFlower = null;
        this.bgClickPos = null;
    }
    
    onWheel(event) {
        // Only affect flowers when cursor is over one
        if (!this.hoveredFlower || this.hoveredFlower.isRemoving) return;
        
        event.preventDefault();
        
        // Determine scroll direction
        // deltaY > 0 means scrolling down (decrease speed)
        // deltaY < 0 means scrolling up (increase speed)
        const scrollDelta = event.deltaY > 0 ? -1 : 1;
            const speedChange = scrollDelta * 0.0005;
        
        // Update rotation speed
        const minSpeed = -0.02; // Maximum reverse rotation
        const maxSpeed = 0.02;  // Maximum forward rotation
        const newRotSpeed = this.hoveredFlower.rotSpeed + speedChange;
        this.hoveredFlower.rotSpeed = Math.max(minSpeed, Math.min(maxSpeed, newRotSpeed));
        
        // Map rotation speed to loop BPM/interval
        // Use absolute speed: faster rotation (either direction) = faster BPM
        // Speed range: 0 (stopped) to 0.02 (max speed in either direction)
        const absSpeed = Math.abs(this.hoveredFlower.rotSpeed); // 0 to 0.02
        const maxAbsSpeed = 0.02;
        
        // Normalize absolute speed: 0 (stopped) to 1 (max speed)
        const normalizedSpeed = Math.max(0, Math.min(1, absSpeed / maxAbsSpeed)); // 0 to 1
        
        // Map to interval time: 
        // Speed 0 (stopped) = very slow (1.0 seconds = "2n" whole note)
        // Speed 0.5 (medium) = medium ("8n" eighth note = default)
        // Speed 1.0 (max) = very fast ("32n" thirty-second note)
        // Use seconds for more granular control
        const minIntervalTime = 0.1; // Fast (like "32n")
        const maxIntervalTime = 2.0; // Slow (like "2n")
        
        // Inverse mapping: higher speed = shorter interval
        const intervalTime = maxIntervalTime - (normalizedSpeed * (maxIntervalTime - minIntervalTime));
        
        // Update the loop interval
        if (this.hoveredFlower.loop) {
            // Dispose old loop and create new one with updated interval
            const wasStarted = this.hoveredFlower.loop.state === "started";
            this.hoveredFlower.loop.stop();
            this.hoveredFlower.loop.dispose();
            
            const bellNotes = ["C5", "E5", "G5", "A5", "C6", "E6"];
            const newLoop = new Tone.Loop(time => {
                if (Math.random() < 0.2) {
                    const note = bellNotes[Math.floor(Math.random() * bellNotes.length)];
                    const vel = 0.5 + Math.random() * 0.5;
                    this.hoveredFlower.synth.triggerAttackRelease(note, "16n", time, vel);
                }
            }, intervalTime);
            
            if (wasStarted) {
                newLoop.start();
            }
            
            this.hoveredFlower.loop = newLoop;
        }
        
        console.log(`Scroll: ${scrollDelta > 0 ? 'UP' : 'DOWN'}, RotSpeed: ${this.hoveredFlower.rotSpeed.toFixed(4)}, BPM interval: ${intervalTime.toFixed(3)}s`);
    }

    update() {
        if(!this.renderer) return;

        const time = this.clock.getElapsedTime();

        if (this.bgUniforms) {
            this.bgUniforms.uTime.value = time;
        }

        if (this.pawElement && !this.pawTrackingDisabled) {
            // Only update paw position if tracking is not disabled
            // When disabled, the transition animation handles the paw movement
            this.pawElement.style.left = `${this.pawState.x}px`;
            this.pawElement.style.top = `${this.pawState.y}px`;
            this.pawElement.style.transform = `translateX(-50%) rotate(${this.pawState.rotation}deg) scale(${this.pawState.scale})`;
        }
        
        // Cat tail wiggle animation (like a real cat shaking its tail)
        // Root stays fixed, only upper part wiggles
        if (this.catTailMesh && this.tailRootPosition) {
            // Keep root position fixed (where tail attaches to cat)
            this.catTailMesh.position.copy(this.tailRootPosition);
            
            // Create a natural wiggle using sine wave with slight variation
            // Combine two sine waves at different frequencies for more organic movement
            const wiggle1 = Math.sin(time * this.tailWiggleSpeed + this.tailWiggleOffset) * this.tailWiggleAmplitude;
            const wiggle2 = Math.sin(time * this.tailWiggleSpeed * 1.7 + this.tailWiggleOffset * 1.3) * this.tailWiggleAmplitude * 0.5;
            const totalWiggle = wiggle1 + wiggle2;
            
            // Apply rotation around Z axis (swinging left/right from the root)
            // Since geometry pivot is at bottom, rotation happens around the root
            this.catTailMesh.rotation.z = this.tailBaseRotation + totalWiggle;
            
            // No X rotation to keep root position stable
            this.catTailMesh.rotation.x = 0;
        }

        // Lily pad wiggle animation - slow floating on water effect
        if (this.lilyPadMesh && this.lilyPadBasePos) {
            // Very slow, subtle wiggle like floating on water
            // Use multiple sine waves for organic movement
            const wiggleX = Math.sin(time * this.lilyPadWiggleSpeed + this.lilyPadWiggleOffset) * this.lilyPadWiggleAmplitude;
            const wiggleY = Math.cos(time * this.lilyPadWiggleSpeed * 0.7 + this.lilyPadWiggleOffset * 1.3) * this.lilyPadWiggleAmplitude;
            const wiggleRot = Math.sin(time * this.lilyPadWiggleSpeed * 0.5 + this.lilyPadWiggleOffset * 0.8) * this.lilyPadWiggleAmplitude * 0.3;
            
            // Store previous wiggle values to calculate delta
            const lastWiggleX = this.lilyPadMesh.userData.lastWiggleX || 0;
            const lastWiggleY = this.lilyPadMesh.userData.lastWiggleY || 0;
            
            // Apply wiggle as delta offset (works with GSAP parallax)
            this.lilyPadMesh.position.x += wiggleX - lastWiggleX;
            this.lilyPadMesh.position.y += wiggleY - lastWiggleY;
            this.lilyPadMesh.userData.lastWiggleX = wiggleX;
            this.lilyPadMesh.userData.lastWiggleY = wiggleY;
            
            // Apply subtle rotation
            this.lilyPadMesh.rotation.z = wiggleRot;
            
            // Update shadow to follow lily pad wiggle
            if (this.lilyPadShadowMesh && this.lilyPadShadowBasePos) {
                const shadowLastWiggleX = this.lilyPadShadowMesh.userData.lastWiggleX || 0;
                const shadowLastWiggleY = this.lilyPadShadowMesh.userData.lastWiggleY || 0;
                this.lilyPadShadowMesh.position.x += wiggleX - shadowLastWiggleX;
                this.lilyPadShadowMesh.position.y += wiggleY - shadowLastWiggleY;
                this.lilyPadShadowMesh.userData.lastWiggleX = wiggleX;
                this.lilyPadShadowMesh.userData.lastWiggleY = wiggleY;
                this.lilyPadShadowMesh.rotation.z = wiggleRot;
            }
        }

        // Sparkle animation - slow flowing movement with twinkling
        if (this.sparkles) {
            const vFOV = THREE.MathUtils.degToRad(45);
            const camDist = 20;
            const aspect = window.innerWidth / window.innerHeight;
            const height = 2 * Math.tan(vFOV / 2) * camDist;
            const width = height * aspect;
            
            this.sparkles.forEach(sparkle => {
                // Skip if currently wrapping (fading)
                if (sparkle.isWrapping) return;
                
                // Slow flowing movement
                sparkle.sprite.position.x = sparkle.baseX + sparkle.flowDirection.x * time * sparkle.flowSpeed;
                sparkle.sprite.position.y = sparkle.baseY + sparkle.flowDirection.y * time * sparkle.flowSpeed;
                
                // Wrap around edges for continuous flow with fade in/out
                const margin = 2;
                let wrapped = false;
                
                if (sparkle.sprite.position.x > width * 0.6 + margin) {
                    sparkle.baseX = -width * 0.6 - margin;
                    sparkle.sprite.position.x = sparkle.baseX;
                    wrapped = true;
                } else if (sparkle.sprite.position.x < -width * 0.6 - margin) {
                    sparkle.baseX = width * 0.6 + margin;
                    sparkle.sprite.position.x = sparkle.baseX;
                    wrapped = true;
                }
                if (sparkle.sprite.position.y > height * 0.6 + margin) {
                    sparkle.baseY = -height * 0.6 - margin;
                    sparkle.sprite.position.y = sparkle.baseY;
                    wrapped = true;
                } else if (sparkle.sprite.position.y < -height * 0.6 - margin) {
                    sparkle.baseY = height * 0.6 + margin;
                    sparkle.sprite.position.y = sparkle.baseY;
                    wrapped = true;
                }
                
                // If sparkle wrapped around, fade out then fade in at new position
                if (wrapped && sparkle.material && !sparkle.isWrapping) {
                    sparkle.isWrapping = true; // Prevent multiple fade animations
                    
                    // Fade out quickly
                    gsap.to(sparkle.material, {
                        opacity: 0,
                        duration: 0.3,
                        ease: "power2.in",
                        onComplete: () => {
                            // Fade in at new position
                            if (sparkle.material) {
                                gsap.to(sparkle.material, {
                                    opacity: 1,
                                    duration: 0.5,
                                    ease: "power2.out",
                                    onComplete: () => {
                                        sparkle.isWrapping = false; // Allow wrapping again
                                    }
                                });
                            }
                        }
                    });
                }
                
                // Twinkling effect (size pulsing)
                const twinkle = Math.sin(time * sparkle.twinkleSpeed + sparkle.twinkleOffset) * 0.2 + 1.0;
                sparkle.sprite.scale.set(
                    sparkle.baseSize * twinkle,
                    sparkle.baseSize * twinkle,
                    1
                );
            });
        }

        // Butterfly wing flapping animation and height fluctuation
        if (this.butterflies) {
            this.butterflies.forEach(butterfly => {
                if (!butterfly.group || !butterfly.group.parent) return; // Skip if removed
                
                const elapsed = time - butterfly.startTime;
                // Wing flapping: top wing rotates down, bottom wing rotates up (opposite)
                const flapAngle = Math.sin(elapsed * butterfly.flapSpeed * Math.PI * 2) * butterfly.flapAmplitude;
                
                // Top wing rotates around X axis (tilting down/up)
                butterfly.topWing.rotation.x = flapAngle;
                // Bottom wing rotates opposite (mirror effect)
                butterfly.bottomWing.rotation.x = -flapAngle;
                
                // Shadow follows wing rotations (same perspective)
                if (butterfly.topWingShadow) {
                    butterfly.topWingShadow.rotation.x = flapAngle;
                }
                if (butterfly.bottomWingShadow) {
                    butterfly.bottomWingShadow.rotation.x = -flapAngle;
                }
                
                // Add slight Y rotation for depth effect (butterfly tilting as it flies)
                const tiltAngle = Math.sin(elapsed * 0.5) * 0.1; // Slow tilting
                butterfly.group.rotation.y = tiltAngle;
                // Shadow group automatically follows the same tilt since it's a child of butterfly.group
                
                // Height fluctuation - organic up and down movement using multiple sine waves
                const heightWave1 = Math.sin(elapsed * butterfly.heightSpeed) * butterfly.heightVariation;
                const heightWave2 = Math.sin(elapsed * butterfly.heightSpeed * 1.7 + 1.3) * butterfly.heightVariation * 0.5;
                const heightOffset = heightWave1 + heightWave2;
                butterfly.group.position.y = butterfly.baseY + heightOffset;
            });
        }
        
        // Update reverb based on number of active butterflies
        // More butterflies increases reverb
        const activeButterflies = this.butterflies ? this.butterflies.filter(b => b.group && b.group.parent).length : 0;
        const reverbIncreasePerButterfly = 0.35; // Each butterfly adds 35% reverb (more obvious effect)
        const maxReverbWet = 0.9; // Maximum reverb to prevent too much (clipping prevention)
        const targetReverbWet = Math.min(
            this.baseReverbWet + (activeButterflies * reverbIncreasePerButterfly),
            maxReverbWet
        );
        
        // Gradually ramp reverb to target level (only if change is significant)
        if (Math.abs(this.currentReverbWet - targetReverbWet) > 0.005) {
            // Use Tone's rampTo for smooth audio transitions
            const currentWet = this.masterReverb.wet.value;
            this.masterReverb.wet.rampTo(targetReverbWet, this.reverbRampDuration);
            this.currentReverbWet = targetReverbWet;
            
            // Debug logging (once per second to avoid spam)
            if (time - this.lastReverbLogTime > 1.0) {
                console.log(`[Stage2] Reverb update: ${activeButterflies} butterflies, target=${targetReverbWet.toFixed(2)}, current=${currentWet.toFixed(2)}, ramping over ${this.reverbRampDuration}s`);
                this.lastReverbLogTime = time;
            }
        }

        // Backup check: ensure we don't exceed max flowers (runs every frame as safety)
        const activeCount = this.flowers.filter(f => f && !f.isRemoving && f.mesh && f.mesh.visible).length;
        if (activeCount > this.maxFlowers) {
            // Find and remove oldest active flower
            const oldest = this.flowers.find(f => f && !f.isRemoving && f.mesh && f.mesh.visible);
            if (oldest) {
                console.log(`[BACKUP REMOVAL] Active count ${activeCount} > ${this.maxFlowers}, removing oldest`);
                this.removeFlower(oldest);
            }
        }
        
        this.flowers.forEach(f => {
            if (f.isRemoving) return;
            
            f.mesh.rotation.z += f.rotSpeed; 
            f.mesh.rotation.x = Math.sin(time * f.wiggleSpeed + f.wiggleOffset) * 0.05;
            f.mesh.rotation.y = Math.cos(time * f.wiggleSpeed + f.wiggleOffset) * 0.05;
            
            // During initialization (pop-up animation), lock position to basePos
            if (f.isInitializing) {
                f.mesh.position.x = f.basePos.x;
                f.mesh.position.y = f.basePos.y;
            }
            // Only apply drift if not being pushed and not initializing (GSAP is handling the movement)
            else if (!f.isBeingPushed) {
                // Apply base position + drift (no parallax - flowers move same as water)
                // Use driftStartTime to ensure drift starts smoothly from 0
                const driftTime = f.driftStartTime !== undefined ? (time - f.driftStartTime) : time;
                
                // Fade in drift over 1 second to prevent sudden jump
                const driftFadeInDuration = 1.0; // 1 second fade-in
                const driftFadeIn = f.driftStartTime !== undefined 
                    ? Math.min(1, driftTime / driftFadeInDuration) 
                    : 1;
                
                const driftX = Math.sin(driftTime * f.driftSpeed + f.driftOffset) * 0.1 * driftFadeIn;
                const driftY = Math.cos(driftTime * f.driftSpeed + f.driftOffset) * 0.1 * driftFadeIn;
                
                f.mesh.position.x = f.basePos.x + driftX;
                f.mesh.position.y = f.basePos.y + driftY;
            }
            
            // Update shadow position and rotation to follow flower (slightly below)
            if (f.shadowMesh) {
                f.shadowMesh.position.x = f.mesh.position.x;
                f.shadowMesh.position.y = f.mesh.position.y - 0.2;
                f.shadowMesh.position.z = f.mesh.position.z - 0.15; // Keep shadow below flower (lower Z)
                f.shadowMesh.rotation.z = f.mesh.rotation.z; // Match flower rotation
            }
        });

        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        const aspect = window.innerWidth / window.innerHeight;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onKeyDown(event) {
        // Trigger butterfly on spacebar
        if (event.code === 'Space' || event.key === ' ') {
            event.preventDefault();
            this.createButterfly();
        }
    }

    createButterfly() {
        const loader = new THREE.TextureLoader();
        
        // Load both butterfly wing textures
        loader.load('./assets/butterflyabove.png', (topTex) => {
            topTex.encoding = THREE.sRGBEncoding;
            
            loader.load('./assets/butterflybelow.png', (bottomTex) => {
                bottomTex.encoding = THREE.sRGBEncoding;
                
                // Calculate viewport dimensions
                const fov = this.camera.fov;
                const camDist = this.camera.position.z;
                const vFOV = THREE.MathUtils.degToRad(fov);
                const height = 2 * Math.tan(vFOV / 2) * camDist;
                const aspect = window.innerWidth / window.innerHeight;
                const width = height * aspect;
                
                // Random butterfly size: 2.7 to 3.3
                const butterflySize = 3.0 + (Math.random() - 0.5) * 0.9;
                
                // Create butterfly group
                const butterflyGroup = new THREE.Group();
                
                // Generate random vibrant color
                const hue = Math.random();
                const saturation = 0.4 + Math.random() * 0.4;
                const lightness = 0.7 + Math.random() * 0.2;
                const butterflyColor = new THREE.Color().setHSL(hue, saturation, lightness);
                
                // Top wing (butterflyabove.png)
                const topWingAspect = topTex.image.width / topTex.image.height;
                const topWingWidth = butterflySize * topWingAspect;
                const topWingHeight = butterflySize;
                const topWingGeometry = new THREE.PlaneGeometry(
                    topWingWidth,
                    topWingHeight
                );
                // Pivot at wing base for natural rotation
                const topWingPivotY = topWingHeight * 0.6;
                topWingGeometry.translate(0, -topWingHeight / 2 + topWingPivotY, 0);
                
                const topWingMaterial = new THREE.MeshBasicMaterial({
                    map: topTex,
                    color: butterflyColor, // Apply mild, light color tint
                    transparent: true,
                    side: THREE.DoubleSide,
                    depthTest: true,
                    depthWrite: false
                });
                const topWing = new THREE.Mesh(topWingGeometry, topWingMaterial);
                
                // Bottom wing (butterflybelow.png) - same color for consistency
                const bottomWingAspect = bottomTex.image.width / bottomTex.image.height;
                const bottomWingWidth = butterflySize * bottomWingAspect;
                const bottomWingHeight = butterflySize;
                const bottomWingGeometry = new THREE.PlaneGeometry(
                    bottomWingWidth,
                    bottomWingHeight
                );
                const bottomWingPivotY = bottomWingHeight * 0.6;
                bottomWingGeometry.translate(0, -bottomWingHeight / 2 + bottomWingPivotY, 0); // Move pivot to wing base
                
                const bottomWingMaterial = new THREE.MeshBasicMaterial({
                    map: bottomTex,
                    color: butterflyColor, // Same color as top wing
                    transparent: true,
                    side: THREE.DoubleSide,
                    depthTest: true,
                    depthWrite: false
                });
                const bottomWing = new THREE.Mesh(bottomWingGeometry, bottomWingMaterial);
                
                // Position wings to form a complete butterfly
                // Both images should overlap at the body (center) to create one butterfly
                const bodyOverlap = butterflySize * 0.25; // 25% overlap for body connection
                
                // Position wings: top wing above, bottom wing below
                // Wings now rotate around their base (pivot point), not center
                // Top wing (butterflyabove.png) - positioned higher (positive y)
                topWing.position.set(0, bodyOverlap, 0.02); // Top wing: above, forward in z
                // Bottom wing (butterflybelow.png) - positioned lower (negative y)
                // ADJUST THIS VALUE to move butterflybelow.png up/down:
                bottomWing.position.set(0, -bodyOverlap * 0.5 +1.2, 0); // Bottom wing: below, behind top wing (ADJUST HERE)
                
                // Set render order so top wing always renders on top
                topWing.renderOrder = 2;
                bottomWing.renderOrder = 1;
                
                // Ensure materials respect render order
                topWingMaterial.depthTest = true;
                topWingMaterial.depthWrite = false;
                bottomWingMaterial.depthTest = true;
                bottomWingMaterial.depthWrite = false;
                
                // Start from right side of screen with random initial height
                const initialY = (Math.random() - 0.5) * height * 0.4; // Random height within 40% of screen
                // Butterfly z-position: high enough so rotating wings don't overlap with flowers
                // Flowers are at z: 0.025-0.175, wing rotation amplitude 0.25 rad creates ~0.37 unit z-variation
                // Set butterfly at z: 0.6 to ensure wings stay above flowers even when rotated
                butterflyGroup.position.set(width * 0.6, initialY, 0.6); // High enough to prevent wing/flower overlap
                
                // Set render order to ensure butterfly renders above other 3D elements (but below sparkles)
                butterflyGroup.renderOrder = 100; // High render order
                
                // Create shadow for butterfly - same shape as butterfly wings with same pivot point
                // Top wing shadow
                const topWingShadowGeometry = new THREE.PlaneGeometry(
                    topWingWidth,
                    topWingHeight
                );
                // Use same pivot point as top wing
                topWingShadowGeometry.translate(0, -topWingHeight / 2 + topWingPivotY, 0);
                
                const topWingShadowMaterial = new THREE.MeshBasicMaterial({
                    map: topTex, // Use same texture as top wing
                    color: 0x000000, // Darken to create shadow effect
                    transparent: true,
                    opacity: 0.3,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    depthTest: true,
                    alphaTest: 0.1
                });
                const topWingShadow = new THREE.Mesh(topWingShadowGeometry, topWingShadowMaterial);
                topWingShadow.position.set(0, bodyOverlap, -0.15); // Same position as top wing, but lower z
                topWingShadow.userData.isShadow = true;
                topWingShadow.raycast = function() { return []; }; // Disable raycasting on shadow
                
                // Bottom wing shadow
                const bottomWingShadowGeometry = new THREE.PlaneGeometry(
                    bottomWingWidth,
                    bottomWingHeight
                );
                // Use same pivot point as bottom wing
                bottomWingShadowGeometry.translate(0, -bottomWingHeight / 2 + bottomWingPivotY, 0);
                
                const bottomWingShadowMaterial = new THREE.MeshBasicMaterial({
                    map: bottomTex, // Use same texture as bottom wing
                    color: 0x000000, // Darken to create shadow effect
                    transparent: true,
                    opacity: 0.3,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    depthTest: true,
                    alphaTest: 0.1
                });
                const bottomWingShadow = new THREE.Mesh(bottomWingShadowGeometry, bottomWingShadowMaterial);
                bottomWingShadow.position.set(0, -bodyOverlap * 0.5 + 1.2, -0.15); // Same position as bottom wing, but lower z
                bottomWingShadow.userData.isShadow = true;
                bottomWingShadow.raycast = function() { return []; }; // Disable raycasting on shadow
                
                // Create shadow group to keep them together
                const shadowGroup = new THREE.Group();
                shadowGroup.add(topWingShadow);
                shadowGroup.add(bottomWingShadow);
                
                // Add shadows first (lowest z), then bottom wing, then top wing (for proper transparent rendering order)
                butterflyGroup.add(shadowGroup);
                butterflyGroup.add(bottomWing);
                butterflyGroup.add(topWing);
                this.scene.add(butterflyGroup);
                
                // Wing flapping animation
                const flapSpeed = 0.3 + Math.random() * 1.7; // 0.3-2.0 flaps per second
                const flapAmplitude = 0.3; // ~17 degrees
                
                // Store animation state
                const butterflyState = {
                    group: butterflyGroup,
                    topWing: topWing,
                    bottomWing: bottomWing,
                    shadowGroup: shadowGroup, // Store shadow group reference
                    topWingShadow: topWingShadow,
                    bottomWingShadow: bottomWingShadow,
                    startTime: this.clock.getElapsedTime(),
                    flapSpeed: flapSpeed,
                    flapAmplitude: flapAmplitude,
                    baseY: initialY,
                    heightVariation: (Math.random() - 0.5) * height * 0.3,
                    heightSpeed: 0.5 + Math.random() * 1
                };
                
                // Animate flying from right to left - slower movement with height fluctuation
                const flightDuration = 8.0; // 8 seconds to cross screen
                
                // Animate horizontal movement
                gsap.to(butterflyGroup.position, {
                    x: -width * 0.6, // End at left side
                    duration: flightDuration,
                    ease: "power1.inOut",
                    onComplete: () => {
                        // Remove butterfly after flight
                        this.scene.remove(butterflyGroup);
                        topWingGeometry.dispose();
                        topWingMaterial.dispose();
                        bottomWingGeometry.dispose();
                        bottomWingMaterial.dispose();
                        topWingShadowGeometry.dispose();
                        topWingShadowMaterial.dispose();
                        bottomWingShadowGeometry.dispose();
                        bottomWingShadowMaterial.dispose();
                        
                        // Remove from animation list if we're tracking it
                        if (this.butterflies) {
                            const idx = this.butterflies.indexOf(butterflyState);
                            if (idx > -1) this.butterflies.splice(idx, 1);
                        }
                    }
                });
                
                // Store butterfly for wing flapping animation
                if (!this.butterflies) this.butterflies = [];
                this.butterflies.push(butterflyState);
            });
        });
    }

    dispose() {
        if (this.pawElement) this.pawElement.style.display = 'none';
        document.body.style.cursor = 'auto';
        
        // Remove NEXT button if it exists
        if (this.nextButtonElement) {
            this.nextButtonElement.remove();
        }
        const nextButton = document.getElementById('next-button');
        if (nextButton) nextButton.remove();
        
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('wheel', this.onWheel);
        window.removeEventListener('keydown', this.onKeyDown);

        // Keep canvas visible during transition to prevent black flash
        // Check if canvas has high z-index (9999) - if so, it's being used for transition
        // Don't remove it - let the transition code handle it
        if (this.renderer && this.renderer.domElement) {
            const canvas = this.renderer.domElement;
            const zIndex = window.getComputedStyle(canvas).zIndex;
            
            if (zIndex === '9999' || zIndex === '9999px') {
                console.log("[Stage2] Canvas kept for transition (z-index 9999), not removing");
                // Just stop updates, but keep canvas visible
                // The transition code will remove it later
            } else {
                // Normal disposal - remove canvas
                if (canvas.parentNode) {
                    canvas.remove();
                    console.log("[Stage2] Canvas removed from DOM");
                }
            }
        }
        
        if(this.masterReverb) this.masterReverb.dispose();
        if(this.masterDelay) this.masterDelay.dispose();
        if(this.masterLimiter) this.masterLimiter.dispose();
        
        this.flowers.forEach(f => {
            if(f.loop) f.loop.dispose();
            if(f.synth) f.synth.dispose();
        });
        
        // Clean up sparkles - fade out before removing
        if (this.sparkles) {
            this.sparkles.forEach(sparkle => {
                if (sparkle.sprite && sparkle.material) {
                    // Fade out before removing
                    gsap.to(sparkle.material, {
                        opacity: 0,
                        duration: 1.0,
                        ease: "power2.in",
                        onComplete: () => {
                            if (sparkle.sprite) {
                                this.scene.remove(sparkle.sprite);
                                if (sparkle.sprite.material) {
                                    sparkle.sprite.material.dispose();
                                }
                            }
                        }
                    });
                }
            });
            // Clear array after a delay to allow fade-out to complete
            setTimeout(() => {
                this.sparkles = [];
            }, 1100); // Slightly longer than fade duration
        }
        
        // Clean up butterflies
        if (this.butterflies) {
            this.butterflies.forEach(butterfly => {
                if (butterfly.group && butterfly.group.parent) {
                    this.scene.remove(butterfly.group);
                    butterfly.group.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) child.material.dispose();
                    });
                }
            });
            this.butterflies = [];
        }
        
        Tone.Transport.stop();
    }
}