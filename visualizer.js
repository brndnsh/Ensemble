export class UnifiedVisualizer {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false }); // Optimization: no transparency
        this.container.appendChild(this.canvas);
        
        this.tracks = {}; // { name: { color, history: [] } }
        this.chordEvents = []; // { time, notes: [], duration, rootMidi, intervals }
        this.windowSize = 4.0; // Seconds to show
        this.visualRange = 60; // Semitones visual height (5 octaves) for absolute pitch
        this.centerMidi = 60; // Middle C is center
        this.pianoRollWidth = 50;
        this.registers = { chords: 60 };
        this.beatReferenceTime = null;
        
        this.initDOM();
        
        // Robust resizing with ResizeObserver
        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                this.resize(entry.contentRect);
            }
        });
        this.resizeObserver.observe(this.container);
    }

    initDOM() {
        this.container.style.position = 'relative';
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';

        // Info Overlay Layer (stays HTML for sharp text)
        this.infoLayer = document.createElement('div');
        this.infoLayer.style.cssText = `
            position: absolute; top: 10px; left: ${this.pianoRollWidth + 10}px; right: 10px;
            display: flex; justify-content: space-between;
            pointer-events: none; z-index: 10;
        `;
        this.container.appendChild(this.infoLayer);
    }

    resize(contentRect) {
        const dpr = window.devicePixelRatio || 1;
        // Use provided rect or fallback to getBoundingClientRect
        const rect = contentRect || this.container.getBoundingClientRect();
        
        // Ensure we have non-zero dimensions to avoid canvas errors
        if (rect.width === 0 || rect.height === 0) return;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.width = rect.width;
        this.height = rect.height;
        this.ctx.scale(dpr, dpr);
    }

    addTrack(name, color) {
        const label = document.createElement('div');
        label.style.color = color;
        label.style.fontWeight = "bold";
        label.style.fontSize = "1.2rem";
        label.style.textShadow = `0 0 2px #000`;
        label.textContent = "";
        this.infoLayer.appendChild(label);

        this.tracks[name] = {
            color,
            history: [],
            label
        };
        if (!this.registers[name]) this.registers[name] = 60;
    }

    setRegister(name, midi) {
        this.registers[name] = midi;
    }

    setBeatReference(time) {
        this.beatReferenceTime = time;
    }

    pushNote(name, event) {
        if (!this.tracks[name]) return;
        this.tracks[name].history.push(event);
        if (event.noteName && event.octave) {
            this.tracks[name].label.textContent = `${event.noteName}${event.octave}`;
        }
        if (this.tracks[name].history.length > 150) {
            this.tracks[name].history = this.tracks[name].history.slice(-100);
        }
    }

    pushChord(event) {
        this.chordEvents.push({
            ...event,
            notes: event.notes ? [...event.notes] : [],
            intervals: event.intervals ? [...event.intervals] : []
        });
        if (this.chordEvents.length > 60) {
            this.chordEvents = this.chordEvents.slice(-40);
        }
    }

    render(currentTime, bpm) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const graphW = w - this.pianoRollWidth;
        const minTime = currentTime - this.windowSize;
        const yScale = h / this.visualRange;

        // Resolve theme-aware colors
        const style = getComputedStyle(document.documentElement);
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || 
                      (document.documentElement.getAttribute('data-theme') === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        const bgColor = isDark ? '#0f172a' : '#f8fafc';
        const keyWhite = isDark ? '#cbd5e1' : '#ffffff';
        const keyBlack = isDark ? '#1e293b' : '#1e293b';
        const keySeparator = isDark ? '#334155' : '#e2e8f0';
        const gridColorMeasure = isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(2, 132, 199, 0.3)';
        const gridColorBeat = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        const playheadColor = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)';
        const outlineColor = isDark ? '#000' : '#fff';

        const chordColors = {
            root: style.getPropertyValue('--blue').trim() || '#2563eb',
            third: style.getPropertyValue('--green').trim() || '#10b981',
            fifth: style.getPropertyValue('--orange').trim() || '#f59e0b',
            seventh: style.getPropertyValue('--violet').trim() || '#d946ef'
        };

        const getCategory = (interval) => {
            if (interval === 0) return "root";
            if (interval === 3 || interval === 4) return "third";
            if (interval === 7) return "fifth";
            return "seventh";
        };

        const getY = (midi) => {
            return (h / 2) - (midi - this.centerMidi) * yScale;
        };

        const getX = (t) => {
            return this.pianoRollWidth + ((currentTime - t) / this.windowSize) * graphW;
        };

        // 0. Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        // --- Collect Active Notes for Piano Roll Highlight ---
        const activeNotes = new Map(); // MIDI -> Color

        // Active Chords
        for (const ev of this.chordEvents) {
            if (ev.time <= currentTime && ev.time + (ev.duration || 2.0) >= currentTime) {
                if (ev.notes) {
                    const rootPC = ev.rootMidi % 12;
                    for (const m of ev.notes) {
                         const interval = (m % 12 - rootPC + 12) % 12;
                         const cat = getCategory(interval);
                         activeNotes.set(m, chordColors[cat]);
                    }
                }
            }
        }

        // Active Tracks
        for (const name in this.tracks) {
            const track = this.tracks[name];
            let color = track.color;
            if (color.startsWith('var(')) {
                const varName = color.slice(4, -1);
                color = style.getPropertyValue(varName).trim() || '#3b82f6';
            }
            for (const ev of track.history) {
                 if (ev.time <= currentTime && ev.time + (ev.duration || 0.25) >= currentTime) {
                     activeNotes.set(ev.midi, color);
                 }
            }
        }

        // --- Piano Roll Layer ---
        const topMidi = this.centerMidi + (this.visualRange / 2);
        const bottomMidi = this.centerMidi - (this.visualRange / 2);
        const startMidi = Math.floor(bottomMidi);
        const endMidi = Math.ceil(topMidi);

        ctx.lineWidth = 1;

        // Draw Keys
        for (let m = startMidi; m <= endMidi; m++) {
            const y = getY(m);
            const noteInOctave = m % 12;
            const isBlack = [1, 3, 6, 8, 10].includes(noteInOctave); // C# D# F# G# A#
            
            // Draw Key Background
            if (activeNotes.has(m)) {
                ctx.fillStyle = activeNotes.get(m);
            } else {
                ctx.fillStyle = isBlack ? keyBlack : keyWhite;
            }
            
            ctx.fillRect(0, y - yScale/2, this.pianoRollWidth, yScale);

            // Draw Separator
            ctx.strokeStyle = keySeparator;
            ctx.beginPath();
            ctx.moveTo(0, y + yScale/2);
            ctx.lineTo(this.pianoRollWidth, y + yScale/2);
            ctx.stroke();

            // Draw Label for C
            if (noteInOctave === 0) {
                ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
                if (activeNotes.has(m)) ctx.fillStyle = '#fff'; // Contrast for active
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                const octave = (m / 12) - 1;
                ctx.fillText(`C${octave}`, this.pianoRollWidth - 4, y);
            }

            // Draw horizontal pitch guide lines across the graph
            ctx.strokeStyle = isBlack ? (isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)') : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)');
            ctx.beginPath();
            ctx.moveTo(this.pianoRollWidth, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Separator line between keys and graph
        ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.pianoRollWidth, 0);
        ctx.lineTo(this.pianoRollWidth, h);
        ctx.stroke();

        // 1. Rhythmic Grid
        if (bpm && this.beatReferenceTime !== null) {
            const beatLen = 60 / bpm;
            const startBeat = Math.floor((minTime - this.beatReferenceTime) / beatLen);
            
            ctx.lineWidth = 1;
            for (let i = startBeat; ; i++) {
                const t = this.beatReferenceTime + i * beatLen;
                if (t > currentTime + 0.1) break;
                
                const x = getX(t);
                if (x < this.pianoRollWidth) continue; // Should not happen with reversed logic as t increases, x decreases? 
                // Wait. t increases (future). currentTime - t decreases. x decreases.
                // startBeat is minTime. currentTime - minTime = windowSize. x = width.
                // t = currentTime. currentTime - t = 0. x = pianoRollWidth.
                // So as i increases, x decreases.
                
                const isMeasure = i % 4 === 0;
                ctx.strokeStyle = isMeasure ? gridColorMeasure : gridColorBeat;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
        }

        // 2. Chords
        for (const ev of this.chordEvents) {
            const chordEnd = ev.time + (ev.duration || 2.0);
            if (chordEnd < minTime) continue;
            if (ev.time > currentTime) break;

            const start = Math.max(minTime, ev.time);
            const end = Math.min(currentTime, chordEnd);
            
            // Reversed: start (earlier) is further Right. end (later) is further Left.
            const xStart = getX(start);
            const xEnd = getX(end);
            
            const x = xEnd; 
            const cw = xStart - xEnd;
            const rootPC = ev.rootMidi % 12;

            // Render background guide tones
            if (ev.intervals) {
                for (const interval of ev.intervals) {
                    const pc = (rootPC + interval) % 12;
                    const cat = getCategory(interval);
                    ctx.fillStyle = chordColors[cat];
                    ctx.globalAlpha = 0.1;
                    
                    // Render in visible octaves
                    const minOct = Math.floor(startMidi / 12);
                    const maxOct = Math.ceil(endMidi / 12);

                    for (let oct = minOct; oct <= maxOct; oct++) {
                        const m = pc + oct * 12;
                        const y = Math.round(getY(m));
                        if (y >= -10 && y <= h + 10) {
                            ctx.fillRect(x, y - yScale/2, cw, yScale);
                        }
                    }
                    ctx.globalAlpha = 1.0;
                }
            }

            // Render specifically played notes (highlighted)
            if (ev.notes) {
                for (const midi of ev.notes) {
                    const y = Math.round(getY(midi));
                    const interval = (midi % 12 - rootPC + 12) % 12;
                    const cat = getCategory(interval);
                    ctx.fillStyle = chordColors[cat];
                    ctx.globalAlpha = 0.5;
                    if (y >= -10 && y <= h + 10) {
                        ctx.fillRect(x, y - yScale/2 + 2, cw, yScale - 4);
                    }
                    ctx.globalAlpha = 1.0;
                }
            }
        }

        // 3. Melodic Tracks
        for (const name in this.tracks) {
            const track = this.tracks[name];
            // No longer using track-specific register for Y pos, only for metadata if needed
            const baseWidth = name === 'soloist' ? 4 : 5;
            
            // Resolve track color if it's a CSS variable
            let color = track.color;
            if (color.startsWith('var(')) {
                const varName = color.slice(4, -1);
                color = style.getPropertyValue(varName).trim() || '#3b82f6';
            }

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            let activeX = -10, activeY = -10, isActive = false;

            // First pass: Glow/outline for distinctness
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = baseWidth + 2;
            ctx.beginPath();
            for (const ev of track.history) {
                const noteEnd = ev.time + (ev.duration || 0.25);
                if (noteEnd < minTime) continue;
                if (ev.time > currentTime) break;

                const startT = Math.max(minTime, ev.time);
                const endT = Math.min(currentTime, noteEnd);
                const x1 = getX(startT);
                const x2 = getX(endT);
                const y = Math.round(getY(ev.midi)); // Absolute Y

                if (y >= -10 && y <= h + 10) {
                    ctx.moveTo(x1, y);
                    ctx.lineTo(x2, y);
                }
            }
            ctx.stroke();

            // Second pass: Colored line
            ctx.strokeStyle = color;
            ctx.lineWidth = baseWidth;
            ctx.beginPath();
            for (const ev of track.history) {
                const noteEnd = ev.time + (ev.duration || 0.25);
                if (noteEnd < minTime) continue;
                if (ev.time > currentTime) break;

                const startT = Math.max(minTime, ev.time);
                const endT = Math.min(currentTime, noteEnd);
                const x1 = getX(startT);
                const x2 = getX(endT);
                const y = Math.round(getY(ev.midi));

                if (y >= -10 && y <= h + 10) {
                    ctx.moveTo(x1, y);
                    ctx.lineTo(x2, y);
                    
                    if (ev.time <= currentTime && noteEnd >= currentTime) {
                        // In reversed mode, 'endT' (closer to now) is at x2 (closer to piano roll)
                        // So the active head is x2
                        activeX = x2; activeY = y; isActive = true;
                    }
                }
            }
            ctx.stroke();

            if (isActive) {
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = outlineColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(activeX, activeY, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }

        // 4. Playhead
        ctx.strokeStyle = playheadColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Playhead is now at the piano roll edge (Time = Current)
        ctx.moveTo(this.pianoRollWidth, 0);
        ctx.lineTo(this.pianoRollWidth, h);
        ctx.stroke();
    }

    clear() {
        for (const name in this.tracks) {
            this.tracks[name].history = [];
            this.tracks[name].label.textContent = "";
        }
        this.chordEvents = [];
        this.ctx.clearRect(0, 0, this.width, this.height);
    }
}