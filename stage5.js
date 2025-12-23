class Stage5 {
    constructor(onCompleteCallback) {
        this.onComplete = onCompleteCallback; 
        
        // Configuration
        this.CONFIG = {
            maxVineCount: 55,       // Maximum number of vines that can be created
            backgroundColor: 0xe5e5eb,
            vineHeight: 14,
            interactionRadius: 3.5, // Radius for creating new vines
            mouseInfluenceStrength: 0.04,
            globalSoundThrottle: 60, // Minimum time between sounds (ms)
            vineSpawnCooldown: 300,  // Minimum time between vine spawns at same location (ms)
            minVineDistance: 2.0     // Minimum distance between vines
        };
        
        // State
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.catMesh = null;
        this.vines = [];
        this.synth = null;
        this.vineTexture = null;
        this.vineGeometry = null;
        this.vineBaseMaterial = null;
        
        // Mouse Tracking
        this.mouse = new THREE.Vector2();
        this.mouseWorld = new THREE.Vector3();
        this.mouseVelocity = new THREE.Vector2();
        this.lastMousePos = new THREE.Vector2();
        this.lastGlobalSoundTime = 0;
        this.lastVineSpawnTime = {}; // Track last spawn time per grid cell
        
        // Interaction
        this.raycaster = new THREE.Raycaster();
        
        // NEXT button and ending sequence tracking
        this.nextButtonShown = false;
        this.nextButtonCheckStarted = false;
        this.endingStarted = false;
        this.frameCount = 0;
        this.nextButtonElement = null;
        this.whiteOverlay = null;
        this.thankYouText = null;
        
        // Bindings
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
        this.update = this.update.bind(this); 
        
        this.init();
    }
    
    init() {
        // 1. Scene & Camera
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.CONFIG.backgroundColor);
        this.scene.fog = new THREE.FogExp2(this.CONFIG.backgroundColor, 0.05);
        
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.z = 12; 
        
        // 2. Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        document.body.appendChild(this.renderer.domElement);
        
        // 3. Audio
        this.setupAudio();

        // 4. Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xfffaed, 0.6);
        dirLight.position.set(5, 10, 7);
        this.scene.add(dirLight);

        // 5. Assets
        this.loadAssets();

        // 6. Events
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('resize', this.onWindowResize);
    }

    setupAudio() {
        // Your "Big Sound" Setup
        const limiter = new Tone.Limiter(-1).toDestination();
        const compressor = new Tone.Compressor({
            threshold: -20, ratio: 3, attack: 0.01, release: 0.1
        }).connect(limiter);
        const reverb = new Tone.Reverb({ decay: 5, wet: 0.4 }).connect(compressor);

        this.synth = new Tone.PolySynth(Tone.FMSynth, {
            harmonicity: 3,
            modulationIndex: 10,
            volume: -6, 
            oscillator: { type: "sine" },
            envelope: { attack: 0.05, decay: 0.3, sustain: 0.1, release: 1.5 },
            modulation: { type: "square" },
            modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 }
        }).connect(reverb);
        
        this.noteScale = ["C4", "D4", "E4", "G4", "A4", "C5", "D5", "E5", "G5", "A5", "C6", "D6"];
    }
    
    loadAssets() {
        const loader = new THREE.TextureLoader();

        // Load Cat - visible from start
        loader.load('./assets/sleeping_cat.png', (tex) => {
            tex.encoding = THREE.sRGBEncoding;
            const catAspect = tex.image.width / tex.image.height;
            const catHeight = 8; 
            const catWidth = catHeight * catAspect;
            
            const geometry = new THREE.PlaneGeometry(catWidth, catHeight);
            const material = new THREE.MeshBasicMaterial({ 
                map: tex, 
                transparent: true, 
                opacity: 1.0 
            });
            
            this.catMesh = new THREE.Mesh(geometry, material);
            this.catMesh.position.z = -5;
            this.catMesh.userData.isCat = true;
            this.scene.add(this.catMesh);
        }, undefined, (error) => {
            console.error('Failed to load cat texture:', error);
        });

        // Load Wisteria - prepare for dynamic creation
        loader.load('./assets/wisteria_vine.png', (tex) => {
            tex.encoding = THREE.sRGBEncoding;
            const imgAspect = tex.image.width / tex.image.height;
            const vHeight = this.CONFIG.vineHeight;
            const vWidth = vHeight * imgAspect; 

            this.vineGeometry = new THREE.PlaneGeometry(vWidth, vHeight);
            this.vineGeometry.translate(0, -vHeight / 2, 0); 

            this.vineBaseMaterial = new THREE.MeshBasicMaterial({ 
                map: tex, 
                transparent: true, 
                side: THREE.DoubleSide, 
                depthWrite: false
            });
            
            this.vineTexture = tex;
        }, undefined, (error) => {
            console.error('Failed to load wisteria texture:', error);
        });
    }
    
    createVineAtPosition(x, y, z) {
        if (!this.vineGeometry || !this.vineBaseMaterial) {
            return null; // Assets not loaded yet
        }
        
        if (this.vines.length >= this.CONFIG.maxVineCount) {
            return null; // Max vines reached
        }
        
        // Check if there's already a vine too close
        for (let vine of this.vines) {
            const dx = x - vine.position.x;
            const dy = y - vine.position.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < this.CONFIG.minVineDistance) {
                return null; // Too close to existing vine
            }
        }
        
        const material = this.vineBaseMaterial.clone();
        
        // Colors
        const h = 0.65 + Math.random() * 0.3; 
        const s = 0.2 + Math.random() * 0.4; 
        const l = 0.6 + Math.random() * 0.3; 
        material.color.setHSL(h, s, l);

        const vine = new THREE.Mesh(this.vineGeometry, material);
        
        // Position at cursor location with some variation
        const spreadX = 1.5; // Small random spread
        const spreadY = 1.5;
        const finalX = x + (Math.random() - 0.5) * spreadX;
        const finalY = y + (Math.random() - 0.5) * spreadY;
        const finalZ = z + (Math.random() * 2) - 1;
        
        vine.position.set(finalX, finalY, finalZ);
        
        const scaleBase = 0.7 + Math.random() * 0.55; 
        const flipX = Math.random() > 0.5 ? -1 : 1;
        vine.scale.set(scaleBase * flipX, scaleBase, scaleBase);

        const maxAngle = 0.1 + (Math.random() * 0.25);

        // Physics
        const mass = 2.0 + Math.random() * 1.5; 
        const stiffness = 0.003 + Math.random() * 0.002;
        const damping = 0.96 + Math.random() * 0.02;

        vine.userData = {
            id: this.vines.length,
            angularVelocity: 0, 
            rotation: 0, 
            maxAngle: maxAngle, 
            mass: mass,
            stiffness: stiffness,
            damping: damping,
            isLocked: false 
        };

        // Start invisible and fade in
        vine.material.opacity = 0;
        this.scene.add(vine);
        this.vines.push(vine);
        
        // Fade in animation
        gsap.to(vine.material, { 
            opacity: 1, 
            duration: 0.5, 
            ease: "power2.out" 
        });
        
        // Trigger sound when vine appears
        this.triggerVineSound(vine, 0.5);
        
        return vine;
    }
    
    onMouseMove(event) {
        // Disable camera movement if ending has started
        if (this.endingStarted) {
            return;
        }
        
        // Mouse Calc
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Parallax
        const targetX = this.mouse.x * 1.5; 
        const targetY = this.mouse.y * 1.5;
        gsap.to(this.camera.position, {
            x: targetX, y: targetY, duration: 1.2, ease: "power2.out"
        });

        // Physics Raycast to get world position
        const vec = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5);
        vec.unproject(this.camera);
        const dir = vec.sub(this.camera.position).normalize();
        const distance = -this.camera.position.z / dir.z;
        const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));
        this.mouseWorld.copy(pos);

        // Velocity
        const currentMouseX = event.clientX;
        const dx = currentMouseX - this.lastMousePos.x;
        this.mouseVelocity.x = dx; 
        this.lastMousePos.x = currentMouseX;

        // Check if we should create a new vine
        if (Math.abs(this.mouseVelocity.x) > 0 || Math.abs(dx) > 0) {
            this.checkVineCreation();
        }
        
        // Also check for interactions with existing vines
        if (Math.abs(this.mouseVelocity.x) > 0) {
            this.checkCollisions();
        }
    }
    
    checkVineCreation() {
        const now = Date.now();
        
        // Create a grid cell key for cooldown tracking
        const gridSize = 2.0; // Grid cell size
        const gridX = Math.floor(this.mouseWorld.x / gridSize);
        const gridY = Math.floor(this.mouseWorld.y / gridSize);
        const gridKey = `${gridX},${gridY}`;
        
        // Check cooldown for this grid cell
        if (this.lastVineSpawnTime[gridKey] && 
            now - this.lastVineSpawnTime[gridKey] < this.CONFIG.vineSpawnCooldown) {
            return; // Still in cooldown
        }
        
        // Check if we're in a valid area
        // Allow vines to appear in a wider vertical range where they would naturally hang
        const validY = this.mouseWorld.y > 3 && this.mouseWorld.y < 12;
        const validX = Math.abs(this.mouseWorld.x) < 18; // Within reasonable bounds
        
        if (validY && validX) {
            // Check if there's already a vine very close
            let tooClose = false;
            for (let vine of this.vines) {
                const dx = this.mouseWorld.x - vine.position.x;
                const dy = this.mouseWorld.y - vine.position.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < this.CONFIG.minVineDistance) {
                    tooClose = true;
                    break;
                }
            }
            
            if (!tooClose && this.vines.length < this.CONFIG.maxVineCount) {
                const newVine = this.createVineAtPosition(
                    this.mouseWorld.x, 
                    this.mouseWorld.y, 
                    (Math.random() * 2) - 1
                );
                
                if (newVine) {
                    this.lastVineSpawnTime[gridKey] = now;
                }
            }
        }
    }
    
    checkCollisions() {
        const now = Date.now();

        this.vines.forEach(vine => {
            if (vine.userData.isLocked) return;

            const dx = this.mouseWorld.x - vine.position.x;
            const dy = this.mouseWorld.y - (vine.position.y - 4); 
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < this.CONFIG.interactionRadius) {
                let force = (this.mouseVelocity.x * this.CONFIG.mouseInfluenceStrength) / (dist + 0.5);
                
                let acceleration = force / vine.userData.mass;
                acceleration = Math.max(-0.012, Math.min(0.012, acceleration)); 

                vine.userData.angularVelocity += acceleration;
                
                if (Math.abs(acceleration) > 0.0001) {
                    vine.userData.isLocked = true;
                }

                if (now - this.lastGlobalSoundTime > this.CONFIG.globalSoundThrottle && 
                    Math.abs(force) > 0.02) {
                    
                    this.triggerVineSound(vine, Math.abs(force));
                    this.lastGlobalSoundTime = now;
                }
            }
        });
    }
    
    triggerVineSound(vine, intensity) {
        if(!this.synth) return;
        let normY = (vine.position.y - 4) / 6; 
        normY = Math.max(0, Math.min(1, normY));
        const noteIndex = Math.floor(normY * (this.noteScale.length - 1));
        const note = this.noteScale[noteIndex];
        
        const vel = Math.max(0.1, Math.min(1.0, intensity * 8));
        this.synth.triggerAttackRelease(note, "16n", undefined, vel);
    }
    
    onMouseDown(event) {
        // Update Mouse Position (needed for vine interaction)
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }
    
    update() {
        // Physics Loop
        this.vines.forEach(vine => {
            const k = vine.userData.stiffness; 
            const damping = vine.userData.damping;
            const restAngle = 0;
            
            const springForce = -k * (vine.userData.rotation - restAngle);
            const acceleration = springForce / vine.userData.mass;

            vine.userData.angularVelocity += acceleration;
            vine.userData.angularVelocity *= damping;
            
            const MAX_SPEED = 0.008; 
            if (vine.userData.angularVelocity > MAX_SPEED) vine.userData.angularVelocity = MAX_SPEED;
            if (vine.userData.angularVelocity < -MAX_SPEED) vine.userData.angularVelocity = -MAX_SPEED;

            vine.userData.rotation += vine.userData.angularVelocity;

            const limit = vine.userData.maxAngle;
            if (vine.userData.rotation > limit) {
                vine.userData.rotation = limit;
                vine.userData.angularVelocity *= -0.5; 
            }
            else if (vine.userData.rotation < -limit) {
                vine.userData.rotation = -limit;
                vine.userData.angularVelocity *= -0.5;
            }

            const time = Date.now() * 0.0005; 
            const wind = Math.sin(time + vine.userData.id) * (0.015 / vine.userData.mass);

            vine.rotation.z = vine.userData.rotation + wind;

            if (vine.userData.isLocked) {
                if (Math.abs(vine.userData.rotation) < 0.02 && Math.abs(vine.userData.angularVelocity) < 0.001) {
                    vine.userData.isLocked = false;
                }
            }
        });

        // Check if enough vines are created and show NEXT button
        // Show button when at least 20 vines are created
        this.frameCount++;
        if (!this.nextButtonShown && !this.nextButtonCheckStarted && !this.endingStarted) {
            const vineCount = this.vines.length;
            const enoughVines = vineCount >= 25;
            
            // Debug logging every 60 frames
            if (this.frameCount % 60 === 0) {
                console.log(`[Stage5] Button check: ${vineCount} vines created (need 20+)`);
            }
            
            if (enoughVines && vineCount > 0) {
                console.log(`[Stage5] ✓ Enough vines created! (${vineCount}/20+) Showing NEXT button...`);
                this.nextButtonCheckStarted = true;
                setTimeout(() => {
                    const currentVineCount = this.vines.length;
                    const stillEnough = currentVineCount >= 20;
                    if (stillEnough && !this.nextButtonShown && !this.endingStarted) {
                        console.log(`[Stage5] ✓ Confirmed enough vines, showing NEXT button now!`);
                        this.showNextButton();
                    } else {
                        console.log(`[Stage5] ✗ Reset check - vine count is ${currentVineCount}`);
                        this.nextButtonCheckStarted = false;
                    }
                }, 300);
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
    
    showNextButton() {
        if (this.nextButtonShown) {
            console.log("[Stage5] NEXT button already shown, skipping");
            return;
        }
        this.nextButtonShown = true;
        console.log("[Stage5] Showing NEXT button");
        
        // Create NEXT button element
        this.nextButtonElement = document.createElement('div');
        this.nextButtonElement.id = 'next-button';
        this.nextButtonElement.innerHTML = 'NEXT';
        this.nextButtonElement.style.cssText = `
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
        
        document.body.appendChild(this.nextButtonElement);
        console.log("[Stage5] NEXT button added to DOM");
        
        // Fade in the button
        gsap.to(this.nextButtonElement, {
            opacity: 1,
            duration: 1.0,
            ease: "power2.out",
            onComplete: () => {
                console.log("[Stage5] NEXT button fade-in complete");
            }
        });
        
        // Add hover effect
        this.nextButtonElement.addEventListener('mouseenter', () => {
            gsap.to(this.nextButtonElement, {
                scale: 1.05,
                duration: 0.2,
                ease: "power2.out"
            });
        });
        
        this.nextButtonElement.addEventListener('mouseleave', () => {
            gsap.to(this.nextButtonElement, {
                scale: 1.0,
                duration: 0.2,
                ease: "power2.out"
            });
        });
        
        // Add click handler - trigger ending sequence
        this.nextButtonElement.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log("[Stage5] NEXT button clicked, starting ending sequence");
            
            // Disable pointer events immediately to prevent multiple clicks
            this.nextButtonElement.style.pointerEvents = 'none';
            
            // Ensure button stays on top during fadeout
            this.nextButtonElement.style.zIndex = '100000';
            
            // Quickly fade out button
            gsap.to(this.nextButtonElement, {
                opacity: 0,
                duration: 0.3,
                ease: "power2.in",
                onComplete: () => {
                    requestAnimationFrame(() => {
                        if (this.nextButtonElement) {
                            this.nextButtonElement.remove();
                        }
                        console.log("[Stage5] Button removed, starting ending sequence");
                        this.startEndingSequence();
                    });
                }
            });
        });
    }
    
    startEndingSequence() {
        if (this.endingStarted) {
            console.log("[Stage5] Ending sequence already started, skipping");
            return;
        }
        this.endingStarted = true;
        console.log("[Stage5] Starting ending sequence - fade to white");
        
        // Create white overlay
        this.whiteOverlay = document.createElement('div');
        this.whiteOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: white;
            z-index: 99999;
            opacity: 0;
            pointer-events: none;
        `;
        document.body.appendChild(this.whiteOverlay);
        
        // Create "THANK YOU FOR PLAYING" text
        this.thankYouText = document.createElement('div');
        this.thankYouText.innerHTML = 'THANK YOU FOR PLAYING';
        this.thankYouText.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #2c2c2c;
            font-family: 'Playfair Display', serif;
            font-size: 5rem;
            font-weight: 700;
            letter-spacing: 8px;
            text-align: center;
            z-index: 100000;
            opacity: 0;
            pointer-events: none;
            white-space: nowrap;
            text-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        `;
        document.body.appendChild(this.thankYouText);
        
        // Fade in white overlay gradually
        gsap.to(this.whiteOverlay, {
            opacity: 1,
            duration: 4.0, // 4 seconds to fade to white
            ease: "power2.inOut",
            onComplete: () => {
                console.log("[Stage5] White overlay fully faded in");
            }
        });
        
        // Fade in text when overlay is about halfway
        gsap.to(this.thankYouText, {
            opacity: 1,
            duration: 2.0,
            delay: 2.0, // Start fading in text after 2 seconds
            ease: "power2.out",
            onComplete: () => {
                console.log("[Stage5] Thank you text fully visible");
            }
        });
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    dispose() {
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('resize', this.onWindowResize);
        
        // Remove NEXT button if it exists
        if (this.nextButtonElement) {
            this.nextButtonElement.remove();
        }
        const nextButton = document.getElementById('next-button');
        if (nextButton) nextButton.remove();
        
        // Remove ending elements if they exist
        if (this.whiteOverlay) {
            this.whiteOverlay.remove();
        }
        if (this.thankYouText) {
            this.thankYouText.remove();
        }
        
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.remove();
        }
        
        if (this.synth) this.synth.dispose();
    }
}

