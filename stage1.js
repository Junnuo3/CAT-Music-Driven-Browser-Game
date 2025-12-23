class Stage1 {
    constructor(onCompleteCallback) {
        this.onComplete = onCompleteCallback; 
        
        // Configuration
        this.CONFIG = {
            vineCount: 55,       
            pluckThreshold: 1,   
            backgroundColor: 0xe5e5eb,
            vineHeight: 14,
            interactionRadius: 3.5, 
            mouseInfluenceStrength: 0.04,
            globalSoundThrottle: 60 
        };
        
        // State
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.catMesh = null;
        this.vines = [];
        this.synth = null;
        
        // Mouse Tracking
        this.mouse = new THREE.Vector2();
        this.mouseWorld = new THREE.Vector3();
        this.mouseVelocity = new THREE.Vector2();
        this.lastMousePos = new THREE.Vector2();
        this.lastGlobalSoundTime = 0;
        
        // Interaction
        this.raycaster = new THREE.Raycaster();
        
        // NEXT button tracking
        this.nextButtonShown = false;
        this.nextButtonCheckStarted = false; // Prevent multiple setTimeout calls
        this.frameCount = 0; // For debug logging
        this.nextButtonClicked = false; // Track if NEXT button has been clicked
        
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

        // Load Cat
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
            this.catMesh.userData.isCat = true; // IMPORTANT TAG
            this.scene.add(this.catMesh);
        }, undefined, (error) => {
            console.error('Failed to load cat texture:', error);
        });

        // Load Wisteria
        loader.load('./assets/wisteria_vine.png', (tex) => {
            tex.encoding = THREE.sRGBEncoding;
            const imgAspect = tex.image.width / tex.image.height;
            const vHeight = this.CONFIG.vineHeight;
            const vWidth = vHeight * imgAspect; 

            const vineGeo = new THREE.PlaneGeometry(vWidth, vHeight);
            vineGeo.translate(0, -vHeight / 2, 0); 

            const baseMaterial = new THREE.MeshBasicMaterial({ 
                map: tex, 
                transparent: true, 
                side: THREE.DoubleSide, 
                depthWrite: false
            });

            for (let i = 0; i < this.CONFIG.vineCount; i++) {
                this.createVine(i, vineGeo, baseMaterial);
            }
        }, undefined, (error) => {
            console.error('Failed to load wisteria texture:', error);
        });
    }
    
    createVine(index, geometry, baseMaterial) {
        const material = baseMaterial.clone();
        
        // Colors
        const h = 0.65 + Math.random() * 0.3; 
        const s = 0.2 + Math.random() * 0.4; 
        const l = 0.6 + Math.random() * 0.3; 
        material.color.setHSL(h, s, l);

        const vine = new THREE.Mesh(geometry, material);
        
        const spreadX = 26; 
        const x = (Math.random() - 0.5) * spreadX; 
        const y = 7 + (Math.random() * 2); 
        const z = (Math.random() * 2) - 1; 
        
        vine.position.set(x, y, z);
        
        const scaleBase = 0.7 + Math.random() * 0.55; 
        const flipX = Math.random() > 0.5 ? -1 : 1;
        vine.scale.set(scaleBase * flipX, scaleBase, scaleBase);

        const maxAngle = 0.1 + (Math.random() * 0.25);

        // Physics
        const mass = 2.0 + Math.random() * 1.5; 
        const stiffness = 0.003 + Math.random() * 0.002;
        const damping = 0.96 + Math.random() * 0.02;

        vine.userData = {
            id: index,
            angularVelocity: 0, 
            rotation: 0, 
            maxAngle: maxAngle, 
            mass: mass,
            stiffness: stiffness,
            damping: damping,
            pluckCount: 0,
            isFading: false,
            lastSoundTime: 0,
            isLocked: false 
        };

        this.scene.add(vine);
        this.vines.push(vine);
    }
    
    onMouseMove(event) {
        // Disable camera movement if NEXT button has been clicked
        if (this.nextButtonClicked) {
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

        // Physics Raycast
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

        if (Math.abs(this.mouseVelocity.x) > 0) {
            this.checkCollisions();
        }
    }
    
    checkCollisions() {
        const now = Date.now();

        this.vines.forEach(vine => {
            if (vine.userData.isFading) return;
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

                if (now - vine.userData.lastSoundTime > 200 && 
                    now - this.lastGlobalSoundTime > this.CONFIG.globalSoundThrottle && 
                    Math.abs(force) > 0.02) {
                    
                    this.triggerVineSound(vine, Math.abs(force));
                    vine.userData.lastSoundTime = now;
                    this.lastGlobalSoundTime = now;
                    
                    this.checkRevealLogic(vine, force);
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
    
    checkRevealLogic(vine, lastForce) {
        vine.userData.pluckCount++;
        if (vine.userData.pluckCount >= this.CONFIG.pluckThreshold) {
            vine.userData.isFading = true;
            
            if(this.synth) this.synth.triggerAttackRelease("C7", "32n", undefined, 0.05);

            const direction = Math.sign(lastForce) || (Math.random() > 0.5 ? 1 : -1);
            
            const fallDistanceX = (3 + Math.random() * 2) * direction;
            const spinAmount = (0.5 + Math.random() * 0.5) * -direction; 

            gsap.to(vine.material, { opacity: 0, duration: 2 });
            
            gsap.to(vine.position, { 
                x: vine.position.x + fallDistanceX, 
                y: vine.position.y - 3, 
                duration: 2.5,
                ease: "power2.out",
                onComplete: () => { vine.visible = false; }
            });

            gsap.to(vine.rotation, { 
                z: vine.rotation.z + spinAmount, 
                duration: 2.5 
            });
        }
    }
    
    onMouseDown(event) {
        // Update Mouse Position (needed for vine interaction)
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Cat click handler removed - transition now only via NEXT button
    }
    
    update() {
        // Physics Loop
        this.vines.forEach(vine => {
            if (!vine.userData.isFading) {
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
            }
        });

        // Check if cat is fully revealed (visible + enough vines gone) and show NEXT button
        this.frameCount++;
        if (!this.nextButtonShown && !this.nextButtonCheckStarted && this.catMesh) {
            const catOpacity = this.catMesh.material.opacity;
            const catIsVisible = catOpacity > 0.5; // Cat is considered visible if opacity > 50%
            
            const visibleVines = this.vines.filter(vine => vine.visible === true);
            const removedVines = this.vines.length - visibleVines.length;
            const removalPercentage = this.vines.length > 0 ? (removedVines / this.vines.length) * 100 : 0;
            
            // Cat is fully revealed when visible (opacity > 0.5) and 60%+ vines removed
            const catFullyRevealed = catIsVisible && removalPercentage >= 60;
            
            // Debug logging every 60 frames (about once per second at 60fps)
            if (this.frameCount % 60 === 0) {
                console.log(`[Stage1] Button check: Cat opacity=${catOpacity.toFixed(2)}, ${removedVines}/${this.vines.length} vines removed (${removalPercentage.toFixed(1)}%), fully revealed=${catFullyRevealed}`);
            }
            
            if (catFullyRevealed && this.vines.length > 0) {
                console.log(`[Stage1] ✓ Cat is fully revealed! (${removalPercentage.toFixed(1)}% vines removed) Showing NEXT button...`);
                this.nextButtonCheckStarted = true; // Prevent multiple setTimeout calls
                // Show button immediately when cat is revealed (no delay needed)
                setTimeout(() => {
                    // Double-check that cat is still visible
                    const currentCatOpacity = this.catMesh ? this.catMesh.material.opacity : 0;
                    const stillVisible = currentCatOpacity > 0.5;
                    if (stillVisible && !this.nextButtonShown) {
                        console.log(`[Stage1] ✓ Confirmed cat still visible, showing NEXT button now!`);
                        this.showNextButton();
                    } else {
                        console.log(`[Stage1] ✗ Reset check - cat opacity is ${currentCatOpacity.toFixed(2)}`);
                        this.nextButtonCheckStarted = false; // Reset if check failed
                    }
                }, 300); // Short delay to ensure cat is stable
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
    
    showNextButton() {
        if (this.nextButtonShown) {
            console.log("[Stage1] NEXT button already shown, skipping");
            return; // Prevent multiple buttons
        }
        this.nextButtonShown = true;
        console.log("[Stage1] Showing NEXT button");
        
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
            pointer-events: auto;
        `;
        
        document.body.appendChild(nextButton);
        console.log("[Stage1] NEXT button added to DOM");
        
        // Fade in the button
        gsap.to(nextButton, {
            opacity: 1,
            duration: 1.0,
            ease: "power2.out",
            onComplete: () => {
                console.log("[Stage1] NEXT button fade-in complete");
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
        
        // Add click handler - trigger transition to Stage 2
        nextButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent any event bubbling
            console.log("[Stage1] NEXT button clicked, triggering transition");
            if (this.onComplete) {
                // Disable camera movement immediately
                this.nextButtonClicked = true;
                
                // Disable pointer events immediately to prevent multiple clicks
                nextButton.style.pointerEvents = 'none';
                
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
                            console.log("[Stage1] Button fully faded, calling onComplete to transition to Stage 2");
                            // Pass center of screen as click position for transition
                            this.onComplete({
                                x: window.innerWidth / 2,
                                y: window.innerHeight / 2
                            });
                        });
                    }
                });
            } else {
                console.error("[Stage1] onComplete callback is not set!");
            }
        });
        
        this.nextButtonElement = nextButton;
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
        
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.remove();
        }
        
        if (this.synth) this.synth.dispose();
    }
}