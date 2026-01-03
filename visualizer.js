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
        this.gridLinePool = new SVGPool(() => {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("y1", "0"); line.setAttribute("y2", "100");
            return line;
        }, this.gridGroup);

        this.chordRectPool = new SVGPool(() => {
             const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
             rect.setAttribute("rx", "1");
             return rect;
        }, this.chordGroup);
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

        this.chordGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.chordGroup.setAttribute("opacity", "0.15");
        this.svg.appendChild(this.chordGroup);

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
        strokePath.setAttribute("stroke-width", name === 'soloist' ? "2.5" : "3.5"); // Thicker lines to compensate for no glow
        strokePath.setAttribute("stroke-linecap", "round");
        strokePath.setAttribute("stroke-linejoin", "round");
        group.appendChild(strokePath);
        
        const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        head.setAttribute("r", "4"); // Slightly larger head
        head.setAttribute("fill", "#fff");
        head.setAttribute("stroke", color);
        head.setAttribute("stroke-width", "2");
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
        this.chordEvents.push(event);
    }

    render(currentTime, bpm) {
        const minTime = currentTime - this.windowSize;
        const width = 100;

        // Linear Y calculation for better melodic contour visibility
        const getY = (midi, register) => {
            const diff = midi - register;
            const y = 50 - (diff / this.visualRange) * 100;
            return y;
        };

        // 0. Render Rhythmic Grid
        this.gridLinePool.reset();
        
        if (bpm && this.beatReferenceTime !== null) {
            const beatLen = 60 / bpm;
            const measureLen = beatLen * 4;
            
            let t = this.beatReferenceTime;
            const beatsToRewind = Math.ceil((t - minTime) / beatLen);
            t -= beatsToRewind * beatLen;
            
            while (t > minTime) t -= beatLen; 
            while (t < minTime) t += beatLen; 

            while (t < currentTime) {
                const x = ((t - minTime) / this.windowSize) * width;
                if (x >= -1 && x <= 101) {
                    const timeFromRef = Math.round((t - this.beatReferenceTime) * 1000) / 1000;
                    const rem = Math.abs(timeFromRef % measureLen);
                    const isMeasure = rem < 0.01 || Math.abs(rem - measureLen) < 0.01;
                    
                    const line = this.gridLinePool.get();
                    line.setAttribute("x1", x.toFixed(2)); 
                    line.setAttribute("x2", x.toFixed(2));
                    line.setAttribute("stroke", "white");
                    line.setAttribute("stroke-opacity", isMeasure ? "0.15" : "0.05");
                    line.setAttribute("stroke-width", isMeasure ? "0.4" : "0.2");
                }
                t += beatLen;
            }
        }
        this.gridLinePool.hideRest();

        // 1. Render Chords
        this.chordRectPool.reset();
        const chordReg = this.registers['chords'] || 60;
        
        this.chordEvents = this.chordEvents.filter(e => e.time + (e.duration || 0) >= minTime);
        
        for (const ev of this.chordEvents) {
            const chordEnd = ev.time + (ev.duration || 2.0);
            const start = Math.max(ev.time, minTime);
            const end = Math.min(chordEnd, currentTime);
            
            if (end > start) {
                const x = ((start - minTime) / this.windowSize) * width;
                const w = ((end - start) / this.windowSize) * width;
                const rootPC = ev.rootMidi % 12;

                if (ev.intervals) {
                    for (const interval of ev.intervals) {
                        const pc = (rootPC + interval) % 12;
                        
                        // Determine base color based on interval function
                        let baseColor = "255, 255, 255";
                        let baseOpacity = 0.08; 
                        
                        if (interval === 0) { baseColor = "59, 130, 246"; baseOpacity = 0.25; } // Root (Blue)
                        else if (interval === 3 || interval === 4) { baseColor = "16, 185, 129"; baseOpacity = 0.2; } // 3rd (Green)
                        else if (interval === 7) { baseColor = "249, 115, 22"; baseOpacity = 0.2; } // 5th (Orange)
                        else if (interval >= 9) { baseColor = "168, 85, 247"; baseOpacity = 0.2; } // 7th+ (Purple)

                        // Render copies in multiple octaves with fading
                        // We iterate relative octaves around the register
                        for (let oct = -2; oct <= 2; oct++) {
                            const m = pc + (Math.floor(chordReg / 12) + oct) * 12;
                            const y = getY(m, chordReg);
                            
                            if (y >= -10 && y <= 110) {
                                const rect = this.chordRectPool.get();
                                rect.setAttribute("x", x.toFixed(2)); 
                                rect.setAttribute("y", (y-1).toFixed(2));
                                rect.setAttribute("width", w.toFixed(2)); 
                                rect.setAttribute("height", "2");
                                
                                // Fade out chords further from the center register
                                const dist = Math.abs(oct); // 0, 1, 2
                                const fade = Math.max(0.3, 1 - (dist * 0.3)); // 1.0, 0.7, 0.4
                                const finalOpacity = baseOpacity * fade;
                                
                                rect.setAttribute("fill", `rgba(${baseColor}, ${finalOpacity.toFixed(3)})`); 
                                rect.style.filter = ''; 
                            }
                        }
                    }
                }

                if (ev.notes) {
                    for (const midi of ev.notes) {
                        const y = getY(midi, chordReg);
                        const interval = (midi % 12 - rootPC + 12) % 12;
                        let color = "rgba(255,255,255,0.8)";
                        if (interval === 0) color = "rgba(59, 130, 246, 0.9)";
                        else if (interval === 3 || interval === 4) color = "rgba(16, 185, 129, 0.9)";
                        else if (interval === 7) color = "rgba(249, 115, 22, 0.9)";
                        else if (interval >= 9) color = "rgba(168, 85, 247, 0.9)";

                        if (y >= -5 && y <= 105) {
                            const rect = this.chordRectPool.get();
                            rect.setAttribute("x", x.toFixed(2)); 
                            rect.setAttribute("y", (y-1.1).toFixed(2));
                            rect.setAttribute("width", w.toFixed(2)); 
                            rect.setAttribute("height", "2.2");
                            rect.setAttribute("fill", color);
                            rect.style.filter = ''; 
                        }
                    }
                }
            }
        }
        this.chordRectPool.hideRest();

        // 2. Render Tracks
        const trackNames = Object.keys(this.tracks);
        for (const name of trackNames) {
            const track = this.tracks[name];
            const pathCmds = []; 
            let headX = -10, headY = -10;
            let active = false;
            const reg = this.registers[name] || 60;

            // Clean history
            track.history = track.history.filter(e => e.time + (e.duration || 0) >= minTime);
            
            const len = track.history.length;
            for (let i = 0; i < len; i++) {
                const ev = track.history[i];
                if (ev.time > currentTime) break;

                const nextEv = track.history[i+1];
                const noteEnd = ev.time + (ev.duration || 0.25);
                const startT = Math.max(ev.time, minTime);
                const endT = Math.min(noteEnd, currentTime);

                if (endT > startT) {
                    const x1 = ((startT - minTime) / this.windowSize) * width;
                    const x2 = ((endT - minTime) / this.windowSize) * width;
                    const y = getY(ev.midi, reg);

                    if (y >= -10 && y <= 110) {
                        if (pathCmds.length === 0) pathCmds.push(`M ${x1.toFixed(2)},${y.toFixed(2)} L ${x2.toFixed(2)},${y.toFixed(2)}`);
                        else pathCmds.push(`M ${x1.toFixed(2)},${y.toFixed(2)} L ${x2.toFixed(2)},${y.toFixed(2)}`);

                        if (ev.time <= currentTime && noteEnd >= currentTime) {
                            headX = x2; headY = y; active = true;
                        } else if (i === len - 1 && currentTime - noteEnd < 0.1) {
                            headX = x2; headY = y; active = true;
                        }
                    }
                }
            }

            track.elements.strokePath.setAttribute("d", pathCmds.join(" "));
            if (active) {
                track.elements.head.setAttribute("cx", headX.toFixed(2));
                track.elements.head.setAttribute("cy", headY.toFixed(2));
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
        this.gridLinePool.reset();
        this.gridLinePool.hideRest();
        this.chordRectPool.reset();
        this.chordRectPool.hideRest();
        this.beatReferenceTime = null;
    }
}
