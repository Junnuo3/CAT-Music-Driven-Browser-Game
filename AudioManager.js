class AudioManager {
    constructor() {
        this.melodySynth = null;
        this.chordSynth = null;
        this.bassSynth = null;
        
        // Drum samples
        this.kickSamples = [];
        this.snareSamples = [];
        this.closedHatSamples = [];
        this.openHatSamples = [];
        
        // Sequencers
        this.melodySequence = null;
        this.chordSequence = null;
        this.drumSequence = null;
        this.bassSequence = null;
        
        // Current complexity levels (0-4)
        this.melodyLevel = 0;
        this.chordLevel = 0;
        this.drumLevel = 0;
        this.bassLevel = 0;
        
        // Master volume
        this.masterVolume = new Tone.Volume(-6).toDestination();
        
        // Compressors per instrument
        this.melodyCompressor = new Tone.Compressor({
            threshold: -24,
            ratio: 4,
            attack: 0.003,
            release: 0.1
        });
        
        this.chordCompressor = new Tone.Compressor({
            threshold: -24,
            ratio: 4,
            attack: 0.003,
            release: 0.1
        });
        
        this.bassCompressor = new Tone.Compressor({
            threshold: -24,
            ratio: 4,
            attack: 0.003,
            release: 0.1
        });
        
        this.drumCompressor = new Tone.Compressor({
            threshold: -24,
            ratio: 4,
            attack: 0.003,
            release: 0.1
        });
        
        // Low pass filter for warmer chord sound
        this.chordFilter = new Tone.Filter({
            type: "lowpass",
            frequency: 1000,
            Q: 1
        });
        
        // Volume nodes for balancing
        this.melodyVolume = new Tone.Volume(0);
        this.chordVolume = new Tone.Volume(-8);
        this.bassVolume = new Tone.Volume(9);
        this.drumVolume = new Tone.Volume(-4);
        
        // Connect audio chain: compressor -> filter (chords only) -> volume -> master
        this.melodyCompressor.connect(this.melodyVolume);
        this.chordCompressor.connect(this.chordFilter);
        this.chordFilter.connect(this.chordVolume);
        this.bassCompressor.connect(this.bassVolume);
        this.drumCompressor.connect(this.drumVolume);
        
        this.melodyVolume.connect(this.masterVolume);
        this.chordVolume.connect(this.masterVolume);
        this.bassVolume.connect(this.masterVolume);
        this.drumVolume.connect(this.masterVolume);
        
        // Tempo (BPM)
        this.tempo = 120;
        Tone.Transport.bpm.value = this.tempo;
        
        // Key and scale
        this.key = "C";
        this.scale = ["C", "D", "E", "F", "G", "A", "B"]; // C major
        this.scaleNotes = ["C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
    }
    
    async init() {
        await Tone.start();
        
        // Initialize synths connected through compressors
        this.melodySynth = new Tone.FMSynth({
            harmonicity: 3,
            modulationIndex: 10,
            detune: 0,
            oscillator: {
                type: "sine"
            },
            envelope: {
                attack: 0.01,
                decay: 0.3,
                sustain: 0.1,
                release: 0.5
            },
            modulation: {
                type: "square"
            },
            modulationEnvelope: {
                attack: 0.01,
                decay: 0.2,
                sustain: 0.1,
                release: 0.3
            }
        }).connect(this.melodyCompressor);
        
        this.chordSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "sawtooth" },
            envelope: { attack: 0.04, decay: 0.5, sustain: 0.00, release: 0.1 }
        }).connect(this.chordCompressor);
        
        this.bassSynth = new Tone.FMSynth({
            harmonicity: 2,
            modulationIndex: 5,
            detune: 0,
            oscillator: {
                type: "sine"
            },
            envelope: {
                attack: 0.01,
                decay: 0.2,
                sustain: 0.4,
                release: 0.3
            },
            modulation: {
                type: "triangle"
            },
            modulationEnvelope: {
                attack: 0.01,
                decay: 0.15,
                sustain: 0.3,
                release: 0.2
            }
        }).connect(this.bassCompressor);
        
        // Subbass synth (one octave lower) for thicker bass sound
        this.subbassSynth = new Tone.Synth({
            oscillator: { type: "sine" }, // Pure sine for clean subbass
            envelope: { 
                attack: 0.01, 
                decay: 0.2, 
                sustain: 0.5, 
                release: 0.3 
            }
        }).connect(this.bassCompressor);
        
        // Load drum samples (creates players, but doesn't wait for loading)
        this.loadDrumSamples();
        
        // Wait for audio buffers to load
        await Tone.loaded();
        
        console.log(
            `[AudioManager] All samples loaded: ${this.kickSamples.length} kicks, ${this.snareSamples.length} snares, ${this.closedHatSamples.length} closed hats, ${this.openHatSamples.length} toms/open hats`
        );
        
        // Start transport
        Tone.Transport.start();
    }
    
    loadDrumSamples() {
        // Helper function to create a Player (Tone.js 14 loads automatically)
        const loadOne = (type, fileName, folder) => {
            const url = `./audio/birds/${folder}/${fileName}`;
            
            // Debug: Log URL before creating player
            console.log(`[AudioManager] about to create Player ${type} ${fileName}, url =`, url);
            
            // Validate URL is not undefined
            if (!url || typeof url !== 'string') {
                console.error(`[AudioManager] Invalid URL for ${type} ${fileName}:`, url);
                return null;
            }
            
            try {
                // Tone.js 14: Create player with { url } - it loads automatically
                // Connect drums through compressor for consistent dynamics
                const player = new Tone.Player({
                    url,
                    autostart: false
                }).connect(this.drumCompressor);
                
                console.log(`[AudioManager] Created Player for ${type}: ${fileName}`);
                return player;
            } catch (err) {
                console.warn(`[AudioManager] Failed to create Player for ${type} ${fileName}:`, err);
                return null;
            }
        };
        
        // Clear arrays first
        this.kickSamples = [];
        this.snareSamples = [];
        this.closedHatSamples = [];
        this.openHatSamples = [];
        
        // Create all players (Tone.js will load them automatically)
        const kickFiles = ["kick1.wav", "kick2.wav", "kick3.wav"];
        this.kickSamples = kickFiles.map(file => loadOne("kick", file, "kick")).filter(Boolean);
        
        const snareFiles = ["snare1.wav", "snare2.wav", "snare3.wav"];
        this.snareSamples = snareFiles.map(file => loadOne("snare", file, "snare")).filter(Boolean);
        
        const hihatFiles = ["hihat1.wav", "hihat2.wav", "hihat3.wav"];
        this.closedHatSamples = hihatFiles.map(file => loadOne("hihat", file, "hihat")).filter(Boolean);
        
        const tomFiles = ["tom1.wav", "tom2.wav", "tom3.wav"];
        this.openHatSamples = tomFiles.map(file => loadOne("tom", file, "tom")).filter(Boolean);
        
        console.log(`[AudioManager] Created ${this.kickSamples.length} kick players, ${this.snareSamples.length} snare players, ${this.closedHatSamples.length} hihat players, ${this.openHatSamples.length} tom players`);
    }
    
    hasLoadedSamples() {
        return (
            this.kickSamples.length > 0 ||
            this.snareSamples.length > 0 ||
            this.closedHatSamples.length > 0 ||
            this.openHatSamples.length > 0
        );
    }
    
    updateMelody(level) {
        this.melodyLevel = level;
        
        // Stop and clear existing sequence
        if (this.melodySequence) {
            this.melodySequence.stop();
            Tone.Transport.clear(this.melodySequence);
            this.melodySequence = null;
        }
        
        if (level === 0) {
            // Silent - no sound at all
            this.melodySequence = null;
        } else if (level === 1) {
            // Simple motif - short phrase every few bars
            const motif = ["C4", "E4", "G4"];
            this.melodySequence = new Tone.Sequence((time, index) => {
                if (index % 8 === 0) { // Every 2 bars
                    motif.forEach((note, i) => {
                        this.melodySynth.triggerAttackRelease(note, "8n", time + i * 0.25, 0.4);
                    });
                }
            }, [0, 1, 2, 3, 4, 5, 6, 7], "4n");
        } else if (level === 2) {
            // Regular phrasing - motif every bar or two with small variations
            const motifs = [
                ["C4", "E4", "G4"],
                ["D4", "F4", "A4"],
                ["E4", "G4", "B4"],
                ["C4", "E4", "G4"]
            ];
            this.melodySequence = new Tone.Sequence((time, index) => {
                const motif = motifs[index % motifs.length];
                motif.forEach((note, i) => {
                    this.melodySynth.triggerAttackRelease(note, "8n", time + i * 0.25, 0.5);
                });
            }, [0, 1, 2, 3], "4n");
        } else if (level === 3) {
            // Active - more notes, some leaps, call-and-response shapes
            const phrases = [
                ["C4", "E4", "G4", "C5"],
                ["G4", "B4", "D5"],
                ["A4", "C5", "E5"],
                ["G4", "E4", "C4"]
            ];
            this.melodySequence = new Tone.Sequence((time, index) => {
                const phrase = phrases[index % phrases.length];
                phrase.forEach((note, i) => {
                    this.melodySynth.triggerAttackRelease(note, "8n", time + i * 0.25, 0.6);
                });
            }, [0, 1, 2, 3], "4n");
        } else if (level === 4) {
            // Flourishes - fast runs, trills, ornamentation
            const flourishes = [
                ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"],
                ["C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"],
                ["C4", "E4", "G4", "C5", "E5"],
                ["G4", "B4", "D5", "G5"]
            ];
            this.melodySequence = new Tone.Sequence((time, index) => {
                const flourish = flourishes[index % flourishes.length];
                flourish.forEach((note, i) => {
                    this.melodySynth.triggerAttackRelease(note, "16n", time + i * 0.125, 0.7);
                });
            }, [0, 1, 2, 3], "4n");
        }
        
        if (this.melodySequence) {
            this.melodySequence.start(0);
        }
    }
    
    updateChords(level) {
        this.chordLevel = level;
        
        // Stop and clear existing sequence
        if (this.chordSequence) {
            this.chordSequence.stop();
            Tone.Transport.clear(this.chordSequence);
            this.chordSequence = null;
        }
        
        // Chords in C major key (matching melody and bass) - spread across octaves
        const chords = {
            "C": ["C3", "G3", "E4"],
            "F": ["F3", "C4", "A4"],
            "G": ["G3", "D4", "B4"],
            "Am": ["A3", "E4", "C5"]
        };
        
        // Extended chords with 7ths (still in C major) - spread across octaves
        const extendedChords = {
            "C": ["C3", "G3", "E4", "B4"],
            "F": ["F3", "C4", "A4", "E5"],
            "G": ["G3", "D4", "B4", "F#5"],
            "Am": ["A3", "E4", "C5", "G5"]
        };
        
        // Single chord progression in C major - doesn't change frequently
        const chordProgression = ["C", "F", "G", "C"];
        
        if (level === 0) {
            // No chords - harmonic space left to bass + melody
            // Do nothing
        } else if (level === 1) {
            // Hit chord once every several seconds (very sparse)
            // Sequence runs every 8 beats (slower), but only play on index 0 (once per 8-bar cycle = 32 beats = ~16 seconds at 120 BPM)
            this.chordSequence = new Tone.Sequence((time, index) => {
                // Only play on the first beat of every 8-bar cycle (every 32 beats)
                if (index === 0) {
                    const chordName = chordProgression[Math.floor(index / 8) % chordProgression.length];
                    // Longer sustained chord (quarter note duration)
                    this.chordSynth.triggerAttackRelease(chords[chordName], "4n", time, 0.3);
                }
            }, [0, 1, 2, 3, 4, 5, 6, 7], "8n");
        } else if (level === 2) {
            // More frequent: chords on downbeats of every other bar (slower)
            this.chordSequence = new Tone.Sequence((time, index) => {
                // Change chord every 4 bars (16 beats), play on beats 1 of every other bar
                const chordIndex = Math.floor(index / 8) % chordProgression.length;
                const chordName = chordProgression[chordIndex];
                // Play on beat 1 of every other bar (index 0, 4, 8, 12) - longer sustain
                if (index % 4 === 0) {
                    this.chordSynth.triggerAttackRelease(chords[chordName], "4n", time, 0.35);
                }
            }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], "8n");
        } else if (level === 3) {
            // More complex rhythm: chords on beats 1 and 3 with some syncopation (slower)
            this.chordSequence = new Tone.Sequence((time, index) => {
                // Change chord every 4 bars (16 beats)
                const chordIndex = Math.floor(index / 16) % chordProgression.length;
                const chordName = chordProgression[chordIndex];
                // Play on beats 1 and 3, with slight syncopation on some hits - longer sustain
                if (index % 8 === 0 || index % 8 === 4) {
                    const offset = index % 8 === 4 ? 0.25 : 0; // Slight syncopation on beat 3
                    this.chordSynth.triggerAttackRelease(chords[chordName], "4n", time + offset, 0.4);
                }
            }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], "8n");
        } else if (level === 4) {
            // Most complex rhythm: syncopated patterns, triplets, and intricate rhythms with extended chords (slower)
            // Use 8th note grid for slower, more spacious feel
            this.chordSequence = new Tone.Sequence((time, index) => {
                // Change chord every 4 bars (32 eighth notes)
                const chordIndex = Math.floor(index / 32) % chordProgression.length;
                const chordName = chordProgression[chordIndex];
                const positionInCycle = index % 32;
                
                // Complex syncopated pattern with triplets (spread out more)
                // Pattern includes: syncopated hits, triplet groupings, and off-beat accents
                const syncopatedPattern = [
                    0,   // Beat 1
                    3,   // Syncopated (after beat 1)
                    6,   // Triplet position
                    8,   // Beat 2
                    11,  // Syncopated (after beat 2)
                    14,  // Triplet position
                    16,  // Beat 3
                    19,  // Syncopated (after beat 3)
                    22,  // Triplet position
                    24,  // Beat 4
                    27,  // Syncopated (after beat 4)
                    30   // Triplet position
                ];
                
                if (syncopatedPattern.includes(positionInCycle)) {
                    // Add micro-timing variations for more organic feel
                    let offset = 0;
                    if (positionInCycle % 3 === 0 && positionInCycle !== 0 && positionInCycle !== 16) {
                        // Triplet positions get slight push
                        offset = 0.1;
                    } else if (positionInCycle % 4 === 3 || positionInCycle % 4 === 1) {
                        // Syncopated positions
                        offset = positionInCycle % 2 === 1 ? 0.15 : -0.1;
                    }
                    
                    // Vary velocity slightly for dynamics
                    const velocity = 0.45 + (positionInCycle % 3) * 0.05;
                    // Longer sustained notes (quarter note duration)
                    this.chordSynth.triggerAttackRelease(extendedChords[chordName], "4n", time + offset, velocity);
                }
            }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], "8n");
        }
        
        if (this.chordSequence) {
            this.chordSequence.start(0);
        }
    }
    
    updateDrums(level) {
        this.drumLevel = level;
        
        // Check if samples are loaded
        if (!this.hasLoadedSamples()) {
            console.warn('[AudioManager] No drum samples loaded yet, skipping drum pattern');
            return;
        }
        
        // Stop and clear existing sequence
        if (this.drumSequence) {
            this.drumSequence.stop();
            Tone.Transport.clear(this.drumSequence);
            this.drumSequence = null;
        }
        
        if (level === 0) {
            // No drums / soft noise - just faint brushed noise or nothing
            // Do nothing
        } else if (level === 1) {
            // Basic pulse - kick on 1 & 3, snare on 2 & 4, simple closed hat on quarters
            this.drumSequence = new Tone.Sequence((time, index) => {
                if (index % 4 === 0 || index % 4 === 2) {
                    // Kick on 1 & 3
                    if (this.kickSamples.length > 0) {
                        const kick = this.kickSamples[Math.floor(Math.random() * this.kickSamples.length)];
                        if (kick.loaded && kick.buffer) {
                            kick.start(time);
                        }
                    }
                }
                if (index % 4 === 1 || index % 4 === 3) {
                    // Snare on 2 & 4
                    if (this.snareSamples.length > 0) {
                        const snare = this.snareSamples[Math.floor(Math.random() * this.snareSamples.length)];
                        if (snare.loaded && snare.buffer) {
                            snare.start(time);
                        }
                    }
                }
                // Closed hat on every beat
                if (this.closedHatSamples.length > 0) {
                    const hat = this.closedHatSamples[Math.floor(Math.random() * this.closedHatSamples.length)];
                    if (hat.loaded && hat.buffer) {
                        hat.start(time);
                    }
                }
            }, [0, 1, 2, 3], "4n");
        } else if (level === 2) {
            // Pop groove - 4-on-the-floor or simple backbeat with eighth hats
            this.drumSequence = new Tone.Sequence((time, index) => {
                // Kick on every beat (4-on-the-floor)
                if (index % 2 === 0 && this.kickSamples.length > 0) {
                    const kick = this.kickSamples[Math.floor(Math.random() * this.kickSamples.length)];
                    if (kick.loaded && kick.buffer) {
                        kick.start(time);
                    }
                }
                // Snare on 2 & 4
                if ((index % 4 === 1 || index % 4 === 3) && this.snareSamples.length > 0) {
                    const snare = this.snareSamples[Math.floor(Math.random() * this.snareSamples.length)];
                    if (snare.loaded && snare.buffer) {
                        snare.start(time);
                    }
                }
                // Eighth note hats
                if (this.closedHatSamples.length > 0) {
                    const hat = this.closedHatSamples[Math.floor(Math.random() * this.closedHatSamples.length)];
                    if (hat.loaded && hat.buffer) {
                        hat.start(time);
                    }
                }
            }, [0, 1, 2, 3, 4, 5, 6, 7], "8n");
        } else if (level === 3) {
            // Groovy - added off-beat hats, ghost notes, occasional tom fills
            this.drumSequence = new Tone.Sequence((time, index) => {
                // Kick on 1 & 3
                if ((index % 8 === 0 || index % 8 === 4) && this.kickSamples.length > 0) {
                    const kick = this.kickSamples[Math.floor(Math.random() * this.kickSamples.length)];
                    if (kick.loaded && kick.buffer) {
                        kick.start(time);
                    }
                }
                // Snare on 2 & 4
                if ((index % 8 === 2 || index % 8 === 6) && this.snareSamples.length > 0) {
                    const snare = this.snareSamples[Math.floor(Math.random() * this.snareSamples.length)];
                    if (snare.loaded && snare.buffer) {
                        snare.start(time);
                    }
                }
                // Off-beat hats
                if (this.closedHatSamples.length > 0) {
                    const hat = this.closedHatSamples[Math.floor(Math.random() * this.closedHatSamples.length)];
                    if (hat.loaded && hat.buffer) {
                        if (index % 2 === 1) {
                            hat.start(time, 0, "8n", 0, 0.5); // Quieter for ghost notes
                        } else {
                            hat.start(time);
                        }
                    }
                }
                // Occasional open hat
                if (index % 16 === 7 && this.openHatSamples.length > 0) {
                    const openHat = this.openHatSamples[Math.floor(Math.random() * this.openHatSamples.length)];
                    if (openHat.loaded && openHat.buffer) {
                        openHat.start(time);
                    }
                }
            }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], "8n");
        } else if (level === 4) {
            // Busy / polyrhythmic - denser hi-hat patterns, syncopation
            this.drumSequence = new Tone.Sequence((time, index) => {
                // Kick with syncopation
                if ((index % 16 === 0 || index % 16 === 6 || index % 16 === 10 || index % 16 === 14) && this.kickSamples.length > 0) {
                    const kick = this.kickSamples[Math.floor(Math.random() * this.kickSamples.length)];
                    if (kick.loaded && kick.buffer) {
                        kick.start(time);
                    }
                }
                // Snare with syncopation
                if ((index % 16 === 4 || index % 16 === 8 || index % 16 === 12) && this.snareSamples.length > 0) {
                    const snare = this.snareSamples[Math.floor(Math.random() * this.snareSamples.length)];
                    if (snare.loaded && snare.buffer) {
                        snare.start(time);
                    }
                }
                // Dense hi-hat pattern
                if (this.closedHatSamples.length > 0 && (index % 2 === 0 || index % 4 === 1)) {
                    const hat = this.closedHatSamples[Math.floor(Math.random() * this.closedHatSamples.length)];
                    if (hat.loaded && hat.buffer) {
                        hat.start(time, 0, "16n", 0, index % 4 === 1 ? 0.4 : 0.7);
                    }
                }
                // Open hat accents
                if ((index % 16 === 7 || index % 16 === 15) && this.openHatSamples.length > 0) {
                    const openHat = this.openHatSamples[Math.floor(Math.random() * this.openHatSamples.length)];
                    if (openHat.loaded && openHat.buffer) {
                        openHat.start(time);
                    }
                }
            }, Array.from({length: 16}, (_, i) => i), "16n");
        }
        
        if (this.drumSequence) {
            // Ensure Transport is running
            if (Tone.Transport.state !== 'started') {
                Tone.Transport.start();
            }
            
            // Start the sequence
            this.drumSequence.start(0);
        }
    }
    
    // Helper function to convert note to one octave lower for subbass
    getSubbassNote(note) {
        // Extract note name and octave
        const match = note.match(/([A-G]#?b?)(\d+)/);
        if (match) {
            const noteName = match[1];
            const octave = parseInt(match[2]);
            return noteName + (octave - 1);
        }
        return note; // Fallback if parsing fails
    }
    
    updateBass(level) {
        this.bassLevel = level;
        
        // Stop and clear existing sequence
        if (this.bassSequence) {
            this.bassSequence.stop();
            Tone.Transport.clear(this.bassSequence);
            this.bassSequence = null;
        }
        
        const rootNotes = ["C2", "F2", "G2", "C2"];
        const fifthNotes = ["G2", "C3", "D3", "G2"];
        
        if (level === 0) {
            // Silent - no sound at all
            this.bassSequence = null;
        } else if (level === 1) {
            // Drone / roots - sustained root notes on downbeats of each bar
            this.bassSequence = new Tone.Sequence((time, index) => {
                const note = rootNotes[index % rootNotes.length];
                const subbassNote = this.getSubbassNote(note);
                this.bassSynth.triggerAttackRelease(note, "2n", time, 0.4);
                this.subbassSynth.triggerAttackRelease(subbassNote, "2n", time, 0.3); // Slightly quieter subbass
            }, [0, 1, 2, 3], "4n");
        } else if (level === 2) {
            // Simple ostinato - repeating 1-2 bar pattern on roots & fifths
            this.bassSequence = new Tone.Sequence((time, index) => {
                const root = rootNotes[index % rootNotes.length];
                const fifth = fifthNotes[index % fifthNotes.length];
                const subbassRoot = this.getSubbassNote(root);
                const subbassFifth = this.getSubbassNote(fifth);
                this.bassSynth.triggerAttackRelease(root, "4n", time, 0.5);
                this.subbassSynth.triggerAttackRelease(subbassRoot, "4n", time, 0.35);
                this.bassSynth.triggerAttackRelease(fifth, "4n", time + 0.5, 0.5);
                this.subbassSynth.triggerAttackRelease(subbassFifth, "4n", time + 0.5, 0.35);
            }, [0, 1], "4n");
        } else if (level === 3) {
            // Walking / syncopated - more motion within scale, light syncopation (C major only)
            const walkingPattern = [
                ["C2", "D2", "E2", "F2"],
                ["G2", "A2", "B2", "C3"],
                ["F2", "G2", "A2", "B2"],
                ["C2", "E2", "G2", "C3"]
            ];
            this.bassSequence = new Tone.Sequence((time, index) => {
                const pattern = walkingPattern[index % walkingPattern.length];
                pattern.forEach((note, i) => {
                    const subbassNote = this.getSubbassNote(note);
                    this.bassSynth.triggerAttackRelease(note, "8n", time + i * 0.25, 0.6);
                    this.subbassSynth.triggerAttackRelease(subbassNote, "8n", time + i * 0.25, 0.4);
                });
            }, [0, 1, 2, 3], "4n");
        } else if (level === 4) {
            // Expressive bassline - passing tones, octave jumps, syncopation
            const expressivePattern = [
                ["C2", "E2", "G2", "C3", "E3"],
                ["G2", "B2", "D3", "G3"],
                ["F2", "A2", "C3", "F3", "A3"],
                ["C2", "G2", "C3", "E3", "G3"]
            ];
            this.bassSequence = new Tone.Sequence((time, index) => {
                const pattern = expressivePattern[index % expressivePattern.length];
                pattern.forEach((note, i) => {
                    const offset = i % 2 === 0 ? 0 : 0.125; // Syncopation
                    const subbassNote = this.getSubbassNote(note);
                    this.bassSynth.triggerAttackRelease(note, "16n", time + i * 0.25 + offset, 0.7);
                    this.subbassSynth.triggerAttackRelease(subbassNote, "16n", time + i * 0.25 + offset, 0.45);
                });
            }, [0, 1, 2, 3], "4n");
        }
        
        if (this.bassSequence) {
            this.bassSequence.start(0);
        }
    }
    
    updateComplexity(birdNumber, level) {
        // Bird 1 = melody, Bird 2 = chords, Bird 3 = drums, Bird 4 = bass
        if (birdNumber === 1) {
            this.updateMelody(level);
        } else if (birdNumber === 2) {
            this.updateChords(level);
        } else if (birdNumber === 3) {
            this.updateDrums(level);
        } else if (birdNumber === 4) {
            this.updateBass(level);
        }
    }
    
    dispose() {
        // Stop all sequences
        if (this.melodySequence) Tone.Transport.clear(this.melodySequence);
        if (this.chordSequence) Tone.Transport.clear(this.chordSequence);
        if (this.drumSequence) Tone.Transport.clear(this.drumSequence);
        if (this.bassSequence) Tone.Transport.clear(this.bassSequence);
        
        // Stop transport
        Tone.Transport.stop();
        Tone.Transport.cancel();
        
        // Dispose synths
        if (this.melodySynth) this.melodySynth.dispose();
        if (this.chordSynth) this.chordSynth.dispose();
        if (this.bassSynth) this.bassSynth.dispose();
        if (this.subbassSynth) this.subbassSynth.dispose();
        
        // Dispose drum samples
        this.kickSamples.forEach(sample => sample.dispose());
        this.snareSamples.forEach(sample => sample.dispose());
        this.closedHatSamples.forEach(sample => sample.dispose());
        this.openHatSamples.forEach(sample => sample.dispose());
        
        // Dispose compressors
        if (this.melodyCompressor) this.melodyCompressor.dispose();
        if (this.chordCompressor) this.chordCompressor.dispose();
        if (this.bassCompressor) this.bassCompressor.dispose();
        if (this.drumCompressor) this.drumCompressor.dispose();
        
        // Dispose filters
        if (this.chordFilter) this.chordFilter.dispose();
        
        // Dispose volume nodes
        if (this.melodyVolume) this.melodyVolume.dispose();
        if (this.chordVolume) this.chordVolume.dispose();
        if (this.bassVolume) this.bassVolume.dispose();
        if (this.drumVolume) this.drumVolume.dispose();
        
        // Dispose master volume
        if (this.masterVolume) this.masterVolume.dispose();
    }
}
