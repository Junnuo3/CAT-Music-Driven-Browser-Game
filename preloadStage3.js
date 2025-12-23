// Preload all Stage 3 assets before transition
class Stage3Preloader {
    constructor() {
        this.loaded = false;
        this.callbacks = [];
        this.loadedAssets = {
            water: false,
            flowers: false,
            circles: false,
            audio: false
        };
    }
    
    preloadAll(onComplete) {
        if (this.loaded) {
            onComplete();
            return;
        }
        
        if (onComplete) {
            this.callbacks.push(onComplete);
        }
        
        console.log("[Stage3 Preloader] Starting preload of all Stage 3 assets...");
        
        // Preload water texture
        this.preloadWater();
        
        // Preload flower textures
        this.preloadFlowers();
        
        // Preload circle textures
        this.preloadCircles();
        
        // Preload audio files
        this.preloadAudio();
    }
    
    preloadWater() {
        const loader = new THREE.TextureLoader();
        loader.load('./assets/water.png', (tex) => {
            tex.encoding = THREE.sRGBEncoding;
            this.loadedAssets.water = true;
            console.log("[Stage3 Preloader] Water texture loaded");
            this.checkAllLoaded();
        }, undefined, (err) => {
            console.error("[Stage3 Preloader] Failed to load water texture:", err);
            this.loadedAssets.water = true; // Continue anyway
            this.checkAllLoaded();
        });
    }
    
    preloadFlowers() {
        const loader = new THREE.TextureLoader();
        const flowerFiles = [
            '樱花.png',
            '珠子.png',
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
        
        const biggerFlowers = ['珠子.png', '艾草.png', '蔓藤1.png', '蔓藤2.png', '雏菊.png', '鸢尾.png', '黄叶.png', '黄花.png', '蓝花束.png'];
        
        let loadedCount = 0;
        const total = flowerFiles.length;
        
        flowerFiles.forEach(fileName => {
            loader.load(`./assets/flower/${fileName}`, (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                tex.userData = {
                    isBigger: biggerFlowers.includes(fileName)
                };
                loadedCount++;
                if (loadedCount === total) {
                    this.loadedAssets.flowers = true;
                    console.log("[Stage3 Preloader] All flower textures loaded");
                    this.checkAllLoaded();
                }
            }, undefined, (err) => {
                console.error(`[Stage3 Preloader] Failed to load flower: ${fileName}`, err);
                loadedCount++;
                if (loadedCount === total) {
                    this.loadedAssets.flowers = true;
                    this.checkAllLoaded();
                }
            });
        });
    }
    
    preloadCircles() {
        const loader = new THREE.TextureLoader();
        const circleFiles = ['1.png', '2.png', '3.png', '4.png', '5.png'];
        
        let loadedCount = 0;
        const total = circleFiles.length;
        
        circleFiles.forEach(fileName => {
            loader.load(`./assets/circle/${fileName}`, (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                loadedCount++;
                if (loadedCount === total) {
                    this.loadedAssets.circles = true;
                    console.log("[Stage3 Preloader] All circle textures loaded");
                    this.checkAllLoaded();
                }
            }, undefined, (err) => {
                console.error(`[Stage3 Preloader] Failed to load circle: ${fileName}`, err);
                loadedCount++;
                if (loadedCount === total) {
                    this.loadedAssets.circles = true;
                    this.checkAllLoaded();
                }
            });
        });
    }
    
    preloadAudio() {
        const audioDirs = {
            kicks: './audio/kicks/',
            snare: './audio/snare/',
            openhihats: './audio/openhihats/',
            closedhihats: './audio/closedhihats/'
        };
        
        const audioFileLists = {
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
        
        let totalAudioFiles = 0;
        let loadedAudioCount = 0;
        
        Object.keys(audioFileLists).forEach(audioType => {
            const files = audioFileLists[audioType];
            totalAudioFiles += files.length;
            
            files.forEach(fileName => {
                const encodedFileName = encodeURIComponent(fileName);
                const audioPath = audioDirs[audioType] + encodedFileName;
                
                const preloadAudio = new Audio(audioPath);
                preloadAudio.preload = 'auto';
                
                preloadAudio.addEventListener('canplaythrough', () => {
                    loadedAudioCount++;
                    if (loadedAudioCount === totalAudioFiles) {
                        this.loadedAssets.audio = true;
                        console.log("[Stage3 Preloader] All audio files loaded");
                        this.checkAllLoaded();
                    }
                });
                
                preloadAudio.addEventListener('error', () => {
                    loadedAudioCount++;
                    if (loadedAudioCount === totalAudioFiles) {
                        this.loadedAssets.audio = true;
                        this.checkAllLoaded();
                    }
                });
                
                preloadAudio.load();
            });
        });
    }
    
    checkAllLoaded() {
        const allLoaded = Object.values(this.loadedAssets).every(loaded => loaded === true);
        
        if (allLoaded && !this.loaded) {
            this.loaded = true;
            console.log("[Stage3 Preloader] ALL Stage 3 assets preloaded!");
            this.callbacks.forEach(callback => callback());
            this.callbacks = [];
        }
    }
}

// Global preloader instance
const stage3Preloader = new Stage3Preloader();

