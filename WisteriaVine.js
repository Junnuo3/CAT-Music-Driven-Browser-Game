class WisteriaVine {
    constructor(scene, texture, x, y, z, width, height, colorVar) {
        this.scene = scene;
        this.originalX = x;
        this.originalY = y;
        this.originalZ = z;
        
        this.rotation = 0;
        this.angularVelocity = 0;

        const geometry = new THREE.PlaneGeometry(width, height);
        geometry.translate(0, -height / 2, 0); // Pivot top

        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            color: new THREE.Color().setRGB(colorVar.r, colorVar.g, colorVar.b)
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, y, z);
        this.mesh.userData.vine = this;
        this.scene.add(this.mesh);
    }

    updateDrag(mousePos) {
        // Simple angle calculation based on drag
        const diff = mousePos.x - this.originalX;
        this.rotation = Math.max(-0.5, Math.min(0.5, diff * 0.1));
    }

    endDrag(audioManager) {
        const force = Math.abs(this.rotation);
        // Play sound if manager exists
        if(audioManager && audioManager.playVineSound) {
            audioManager.playVineSound(this.originalY, force);
        }
        // Snap back physics logic
        this.angularVelocity = -this.rotation * 0.1;
    }

    update(dt) {
        // Simple pendulum physics
        const gravity = -0.005 * this.rotation;
        this.angularVelocity += gravity;
        this.angularVelocity *= 0.95; // Damping
        this.rotation += this.angularVelocity;
        
        if(this.mesh) {
            this.mesh.rotation.z = this.rotation;
            // Wind
            this.mesh.rotation.z += Math.sin(Date.now()*0.001 + this.originalX)*0.01; 
        }
    }
}
