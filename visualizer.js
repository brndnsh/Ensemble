class SVGPool {
    constructor(createFn, parent) {
        this.createFn = createFn;
        this.parent = parent;
        this.pool = [];
        this.activeCount = 0;
    }

    reset() {
        this.activeCount = 0;
    }

    get() {
        if (this.activeCount >= this.pool.length) {
            const el = this.createFn();
            this.parent.appendChild(el);
            this.pool.push(el);
        }
        const el = this.pool[this.activeCount];
        el.style.display = 'block'; 
        this.activeCount++;
        return el;
    }

    hideRest() {
        for (let i = this.activeCount; i < this.pool.length; i++) {
            this.pool[i].style.display = 'none';
        }
    }
}

export class UnifiedVisualizer {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.tracks = {}; // { name: { color, history: [] } }
        this.chordEvents = []; // { time, notes: [], duration }
        this.windowSize = 4.0; // Seconds to show
        this.visualRange = 36; // Semitones visual height (3 octaves)
        this.registers = { chords: 60 }; // Default center notes for superimposition
        this.beatReferenceTime = null;
        
        this.initDOM();
        
        // Initialize pools
        // Pool only used for track heads (circles) and labels now
    }

    initDOM() {
        this.container.innerHTML = '';
        
        // Info Overlay
        this.infoLayer = document.createElement('div');
        this.infoLayer.style.cssText = `
            position: absolute; top: 10px; left: 10px; right: 10px;
            display: flex; justify-content: space-between;
            pointer-events: none; z-index: 10;
        `;
        this.container.appendChild(this.infoLayer);

        // SVG Container
        const svgContainer = document.createElement('div');
        svgContainer.style.cssText = `
            position: absolute; inset: 0; z-index: 1;
        `;

        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.setAttribute("viewBox", "0 0 100 100");
        this.svg.setAttribute("preserveAspectRatio", "none");
        this.svg.style.cssText = "display: block; width: 100%; height: 100%; overflow: hidden;";
        
        this.defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        this.svg.appendChild(this.defs);

        // Layering
        this.gridGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.svg.appendChild(this.gridGroup);

        this.beatPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.beatPath.setAttribute("fill", "none");
        this.beatPath.setAttribute("stroke", "white");
        this.beatPath.setAttribute("stroke-opacity", "0.2");
        this.beatPath.setAttribute("stroke-width", "0.5");
        this.gridGroup.appendChild(this.beatPath);

        this.measurePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.measurePath.setAttribute("fill", "none");
        this.measurePath.setAttribute("stroke", "#38bdf8");
        this.measurePath.setAttribute("stroke-opacity", "0.7");
        this.measurePath.setAttribute("stroke-width", "1.0");
        this.gridGroup.appendChild(this.measurePath);

        this.chordGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.chordGroup.setAttribute("opacity", "1.0");
        this.svg.appendChild(this.chordGroup);

        // Path-based chord rendering for stability and performance
        this.chordPaths = {
            root_hl: this.createChordPath("rgba(37, 99, 235, 1)", 0.9),   // Vibrant Blue
            third_hl: this.createChordPath("rgba(16, 185, 129, 1)", 0.9), // Emerald Green
            fifth_hl: this.createChordPath("rgba(245, 158, 11, 1)", 0.9), // Amber/Gold
            ext_hl: this.createChordPath("rgba(217, 70, 239, 1)", 0.8),   // Fuchsia/Purple
            
            root_bg: this.createChordPath("rgba(37, 99, 235, 1)", 0.15),  // Faded Blue
            third_bg: this.createChordPath("rgba(16, 185, 129, 1)", 0.12), // Faded Green
            fifth_bg: this.createChordPath("rgba(245, 158, 11, 1)", 0.12), // Faded Gold
            ext_bg: this.createChordPath("rgba(217, 70, 239, 1)", 0.1)    // Faded Purple
        };

        this.tracksGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.svg.appendChild(this.tracksGroup);

        // Playhead
        this.playhead = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        this.playhead.setAttribute("x", "99.5"); this.playhead.setAttribute("y", "0");
        this.playhead.setAttribute("width", "0.5"); this.playhead.setAttribute("height", "100");
        this.playhead.setAttribute("fill", "white"); this.playhead.setAttribute("opacity", "0.2");
        this.svg.appendChild(this.playhead);

        svgContainer.appendChild(this.svg);
        this.container.appendChild(svgContainer);
    }

    createChordPath(color, opacity = 0.3) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill", color);
        path.setAttribute("fill-opacity", opacity.toString());
        this.chordGroup.appendChild(path);
        return path;
    }

    addTrack(name, color) {
        const trackGradId = `grad-stroke-${name}`;
        const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        grad.setAttribute("id", trackGradId);
        grad.setAttribute("x1", "0"); grad.setAttribute("x2", "1");
        const st1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        st1.setAttribute("offset", "0%"); st1.setAttribute("stop-color", color); st1.setAttribute("stop-opacity", "0");
        const st2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        st2.setAttribute("offset", "100%"); st2.setAttribute("stop-color", color); st2.setAttribute("stop-opacity", "1");
        grad.appendChild(st1); grad.appendChild(st2);
        this.defs.appendChild(grad);

        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        // Removed filter="url(#track-glow)" for mobile performance
        
        const strokePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        strokePath.setAttribute("fill", "none");
        strokePath.setAttribute("stroke", `url(#${trackGradId})`);
        strokePath.setAttribute("stroke-width", name === 'soloist' ? "3.5" : "4.5"); // Thicker lines for better visibility
        strokePath.setAttribute("stroke-linecap", "round");
        strokePath.setAttribute("stroke-linejoin", "round");
        group.appendChild(strokePath);
        
        const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        head.setAttribute("r", "5"); // Larger head
        head.setAttribute("fill", "#fff");
        head.setAttribute("stroke", color);
        head.setAttribute("stroke-width", "2.5");
        head.style.opacity = "0";
        // Removed drop-shadow filter
        group.appendChild(head);

        const label = document.createElement('div');
        label.style.color = color;
        label.style.fontWeight = "bold";
        label.style.fontSize = "1.2rem";
        // Simplified text shadow
        label.style.textShadow = `0 0 2px #000`;
        label.textContent = "";
        this.infoLayer.appendChild(label);

        this.tracksGroup.appendChild(group);

        this.tracks[name] = {
            color,
            history: [],
            elements: { group, strokePath, head, label }
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
            this.tracks[name].elements.label.textContent = `${event.noteName}${event.octave}`;
        }
    }

    pushChord(event) {
        // Explicitly clone arrays to prevent shared reference mutations from changing history colors
        this.chordEvents.push({
            ...event,
            notes: event.notes ? [...event.notes] : [],
            intervals: event.intervals ? [...event.intervals] : []
        });
    }

    render(currentTime, bpm) {
        const minTime = currentTime - this.windowSize;
        const width = 100;
        const windowInverse = 1 / this.windowSize;
        const yScale = 100 / this.visualRange;

        // Linear Y calculation for better melodic contour visibility
        const getY = (midi, register) => {
            return 50 - (midi - register) * yScale;
        };

        // 0. Render Rhythmic Grid
        let beatPathParts = [];
        let measurePathParts = [];
        
        if (bpm && this.beatReferenceTime !== null) {
            const beatLen = 60 / bpm;
            const startBeat = Math.floor((minTime - this.beatReferenceTime) / beatLen);
            let i = startBeat;

            while (true) {
                const t = this.beatReferenceTime + i * beatLen;
                if (t > currentTime + beatLen) break;

                const x = (t - minTime) * windowInverse * width;
                if (x >= -1 && x <= 101) {
                    const xStr = Math.round(x * 100) / 100;
                    const lineCmd = `M ${xStr},0 L ${xStr},100 `;
                    if (i % 4 === 0) measurePathParts.push(lineCmd);
                    else beatPathParts.push(lineCmd);
                }
                i++;
            }
        }
        this.beatPath.setAttribute("d", beatPathParts.join(''));
        this.measurePath.setAttribute("d", measurePathParts.join(''));

        // 1. Render Chords
        const chordReg = this.registers['chords'] || 60;
        
        // More efficient filtering: only filter if list is getting long
        if (this.chordEvents.length > 50) {
            this.chordEvents = this.chordEvents.filter(e => e.time + (e.duration || 2) >= minTime);
        }
        
        const pathParts = { 
            root_hl: [], third_hl: [], fifth_hl: [], ext_hl: [],
            root_bg: [], third_bg: [], fifth_bg: [], ext_bg: [] 
        };

        const getCategory = (interval) => {
            if (interval === 0) return "root";
            if (interval === 3 || interval === 4) return "third";
            if (interval === 7) return "fifth";
            return "ext";
        };

        for (let i = 0; i < this.chordEvents.length; i++) {
            const ev = this.chordEvents[i];
            const chordEnd = ev.time + (ev.duration || 2.0);
            if (chordEnd < minTime) continue;
            
            const start = ev.time < minTime ? minTime : ev.time;
            const end = chordEnd > currentTime ? currentTime : chordEnd;
            
            if (end > start) {
                const x = (start - minTime) * windowInverse * width;
                const w = (end - start) * windowInverse * width;
                const rootPC = ev.rootMidi % 12;

                const xStr = Math.round(x * 100) / 100;
                const wStr = Math.round(w * 100) / 100;

                // Render Background Tones (Octave shifted)
                if (ev.intervals) {
                    for (let j = 0; j < ev.intervals.length; j++) {
                        const interval = ev.intervals[j];
                        const pc = (rootPC + interval) % 12;
                        const cat = getCategory(interval);
                        const partsArray = pathParts[`${cat}_bg`];
                        const baseOctave = Math.floor(chordReg / 12);

                        for (let oct = -2; oct <= 2; oct++) {
                            const m = pc + (baseOctave + oct) * 12;
                            const y = getY(m, chordReg);
                            if (y >= -10 && y <= 110) {
                                const yStr = Math.round(y * 100) / 100;
                                partsArray.push(`M ${xStr},${(yStr-1)} h ${wStr} v 2 h -${wStr} z `);
                            }
                        }
                    }
                }

                // Render Played Notes (Highlighted)
                if (ev.notes) {
                    for (let j = 0; j < ev.notes.length; j++) {
                        const midi = ev.notes[j];
                        const y = getY(midi, chordReg);
                        if (y >= -5 && y <= 105) {
                            const interval = (midi % 12 - rootPC + 12) % 12;
                            const cat = getCategory(interval);
                            const partsArray = pathParts[`${cat}_hl`];
                            const yStr = Math.round(y * 100) / 100;
                            partsArray.push(`M ${xStr},${(yStr-1.1)} h ${wStr} v 2.2 h -${wStr} z `);
                        }
                    }
                }
            }
        }

        for (const key in this.chordPaths) {
            this.chordPaths[key].setAttribute("d", pathParts[key].join(''));
        }

        // 2. Render Tracks
        const trackNames = Object.keys(this.tracks);
        for (let t = 0; t < trackNames.length; t++) {
            const name = trackNames[t];
            const track = this.tracks[name];
            const pathCmds = []; 
            let headX = -10, headY = -10;
            let active = false;
            const reg = this.registers[name] || 60;

            if (track.history.length > 100) {
                track.history = track.history.filter(e => e.time + (e.duration || 0.25) >= minTime);
            }
            
            for (let i = 0; i < track.history.length; i++) {
                const ev = track.history[i];
                if (ev.time > currentTime) break;

                const noteEnd = ev.time + (ev.duration || 0.25);
                if (noteEnd < minTime) continue;

                const startT = ev.time < minTime ? minTime : ev.time;
                const endT = noteEnd > currentTime ? currentTime : noteEnd;

                if (endT > startT) {
                    const x1 = (startT - minTime) * windowInverse * width;
                    const x2 = (endT - minTime) * windowInverse * width;
                    const y = getY(ev.midi, reg);

                    if (y >= -10 && y <= 110) {
                        const x1s = Math.round(x1 * 100) / 100;
                        const x2s = Math.round(x2 * 100) / 100;
                        const ys = Math.round(y * 100) / 100;
                        pathCmds.push(`M ${x1s},${ys} L ${x2s},${ys}`);

                        if (ev.time <= currentTime && noteEnd >= currentTime) {
                            headX = x2s; headY = ys; active = true;
                        } else if (i === track.history.length - 1 && currentTime - noteEnd < 0.1) {
                            headX = x2s; headY = ys; active = true;
                        }
                    }
                }
            }

            track.elements.strokePath.setAttribute("d", pathCmds.join(" "));
            if (active) {
                track.elements.head.setAttribute("cx", headX);
                track.elements.head.setAttribute("cy", headY);
                track.elements.head.style.opacity = "1";
            } else {
                track.elements.head.style.opacity = "0";
            }
        }
    }

    clear() {
        Object.values(this.tracks).forEach(t => {
            t.history = [];
            t.elements.label.textContent = "";
            t.elements.strokePath.setAttribute("d", "");
            t.elements.head.style.opacity = "0";
        });
        this.chordEvents = [];
        this.beatPath.setAttribute("d", "");
        this.measurePath.setAttribute("d", "");
        for (const key in this.chordPaths) {
            this.chordPaths[key].setAttribute("d", "");
        }
        this.beatReferenceTime = null;
    }
}
