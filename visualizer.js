export class UnifiedVisualizer {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false }); // Optimization: no transparency
        this.container.appendChild(this.canvas);
        
        this.tracks = {}; // { name: { color, history: [] } }
        this.chordEvents = []; // { time, notes: [], duration, rootMidi, intervals }
        this.windowSize = 4.0; // Seconds to show
        this.visualRange = 36; // Semitones visual height (3 octaves)
        this.registers = { chords: 60 };
        this.beatReferenceTime = null;
        
        this.initDOM();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    initDOM() {
        this.container.style.position = 'relative';
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';

        // Info Overlay Layer (stays HTML for sharp text)
        this.infoLayer = document.createElement('div');
        this.infoLayer.style.cssText = `
            position: absolute; top: 10px; left: 10px; right: 10px;
            display: flex; justify-content: space-between;
            pointer-events: none; z-index: 10;
        `;
        this.container.appendChild(this.infoLayer);
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.container.getBoundingClientRect();
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
        const minTime = currentTime - this.windowSize;
        const yScale = h / this.visualRange;

        // Resolve theme-aware colors
        const style = getComputedStyle(document.documentElement);
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || 
                      (document.documentElement.getAttribute('data-theme') === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        const bgColor = isDark ? '#0f172a' : '#f8fafc';
        const gridColorMeasure = isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(2, 132, 199, 0.3)';
        const gridColorBeat = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        const playheadColor = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)';
        const outlineColor = isDark ? '#000' : '#fff';

        const getY = (midi, register) => {
            return (h / 2) - (midi - register) * yScale;
        };

        const getX = (t) => {
            return ((t - minTime) / this.windowSize) * w;
        };

        // 0. Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        // 1. Rhythmic Grid
        if (bpm && this.beatReferenceTime !== null) {
            const beatLen = 60 / bpm;
            const startBeat = Math.floor((minTime - this.beatReferenceTime) / beatLen);
            
            ctx.lineWidth = 1;
            for (let i = startBeat; ; i++) {
                const t = this.beatReferenceTime + i * beatLen;
                if (t > currentTime + 0.1) break;
                
                const x = getX(t);
                if (x < 0) continue;
                
                const isMeasure = i % 4 === 0;
                ctx.strokeStyle = isMeasure ? gridColorMeasure : gridColorBeat;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
        }

        // 2. Chords
        const chordReg = this.registers['chords'] || 60;
        const colors = {
            root: "37, 99, 235",
            third: "16, 185, 129",
            fifth: "245, 158, 11",
            ext: "217, 70, 239"
        };

        const getCategory = (interval) => {
            if (interval === 0) return "root";
            if (interval === 3 || interval === 4) return "third";
            if (interval === 7) return "fifth";
            return "ext";
        };

        for (const ev of this.chordEvents) {
            const chordEnd = ev.time + (ev.duration || 2.0);
            if (chordEnd < minTime) continue;
            if (ev.time > currentTime) break;

            const start = Math.max(minTime, ev.time);
            const end = Math.min(currentTime, chordEnd);
            const x = getX(start);
            const cw = getX(end) - x;
            const rootPC = ev.rootMidi % 12;

            // Render background guide tones
            if (ev.intervals) {
                for (const interval of ev.intervals) {
                    const pc = (rootPC + interval) % 12;
                    const cat = getCategory(interval);
                    ctx.fillStyle = `rgba(${colors[cat]}, 0.1)`;
                    const baseOctave = Math.floor(chordReg / 12);
                    for (let oct = -1; oct <= 1; oct++) {
                        const m = pc + (baseOctave + oct) * 12;
                        const y = Math.round(getY(m, chordReg));
                        if (y >= -10 && y <= h + 10) {
                            ctx.fillRect(x, y - 1, cw, 2);
                        }
                    }
                }
            }

            // Render specifically played notes (highlighted)
            if (ev.notes) {
                for (const midi of ev.notes) {
                    const y = Math.round(getY(midi, chordReg));
                    const interval = (midi % 12 - rootPC + 12) % 12;
                    const cat = getCategory(interval);
                    ctx.fillStyle = `rgba(${colors[cat]}, 0.5)`;
                    if (y >= -10 && y <= h + 10) {
                        ctx.fillRect(x, y - 1.5, cw, 3);
                    }
                }
            }
        }

        // 3. Melodic Tracks
        for (const name in this.tracks) {
            const track = this.tracks[name];
            const reg = this.registers[name] || 60;
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
                const y = Math.round(getY(ev.midi, reg));

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
                const y = Math.round(getY(ev.midi, reg));

                if (y >= -10 && y <= h + 10) {
                    ctx.moveTo(x1, y);
                    ctx.lineTo(x2, y);
                    
                    if (ev.time <= currentTime && noteEnd >= currentTime) {
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
        ctx.moveTo(w - 1, 0);
        ctx.lineTo(w - 1, h);
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