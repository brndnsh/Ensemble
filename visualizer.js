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

        // Track Glow Filter
        const glowFilter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
        glowFilter.setAttribute("id", "track-glow");
        glowFilter.setAttribute("x", "-20%"); glowFilter.setAttribute("y", "-20%");
        glowFilter.setAttribute("width", "140%"); glowFilter.setAttribute("height", "140%");
        const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
        blur.setAttribute("stdDeviation", "0.8");
        blur.setAttribute("result", "coloredBlur");
        const merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
        const m1 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
        m1.setAttribute("in", "coloredBlur");
        const m2 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
        m2.setAttribute("in", "SourceGraphic");
        merge.appendChild(m1); merge.appendChild(m2);
        glowFilter.appendChild(blur); glowFilter.appendChild(merge);
        this.defs.appendChild(glowFilter);

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
        group.setAttribute("filter", "url(#track-glow)");
        
        const strokePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        strokePath.setAttribute("fill", "none");
        strokePath.setAttribute("stroke", `url(#${trackGradId})`);
        strokePath.setAttribute("stroke-width", name === 'soloist' ? "1.8" : "2.5");
        strokePath.setAttribute("stroke-linecap", "round");
        strokePath.setAttribute("stroke-linejoin", "round");
        group.appendChild(strokePath);
        
        const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        head.setAttribute("r", "3");
        head.setAttribute("fill", "#fff");
        head.setAttribute("stroke", color);
        head.setAttribute("stroke-width", "1.5");
        head.style.opacity = "0";
        head.style.filter = "drop-shadow(0 0 3px #fff)";
        group.appendChild(head);

        const label = document.createElement('div');
        label.style.color = color;
        label.style.fontWeight = "bold";
        label.style.fontSize = "1.2rem";
        label.style.textShadow = `0 0 8px ${color}, 0 0 2px #000`;
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
        const height = 100;

        // Helper: Wrap MIDI into visual range harmonically
        const getWrappedY = (midi, register) => {
            let m = midi;
            const halfRange = this.visualRange / 2;
            // Find nearest octave equivalent to register
            while (m > register + halfRange) m -= 12;
            while (m < register - halfRange) m += 12;
            
            const diff = m - register;
            const y = 50 - (diff / this.visualRange) * 100;
            return { y, isWrapped: m !== midi };
        };

        // 0. Render Rhythmic Grid
        this.gridGroup.innerHTML = '';
        if (bpm && this.beatReferenceTime !== null) {
            const beatLen = 60 / bpm;
            const measureLen = beatLen * 4;
            
            // Start from reference, find first beat in window
            let t = this.beatReferenceTime;
            // Rewind to before window
            while (t > minTime) t -= measureLen;
            // Advance to start of window
            while (t < minTime) t += beatLen;

            while (t < currentTime) {
                const x = ((t - minTime) / this.windowSize) * width;
                const timeFromRef = Math.round((t - this.beatReferenceTime) * 1000) / 1000;
                const isMeasure = Math.abs(timeFromRef % measureLen) < 0.01;
                
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", x.toString()); line.setAttribute("x2", x.toString());
                line.setAttribute("y1", "0"); line.setAttribute("y2", "100");
                line.setAttribute("stroke", "white");
                line.setAttribute("stroke-opacity", isMeasure ? "0.15" : "0.05");
                line.setAttribute("stroke-width", isMeasure ? "0.4" : "0.2");
                this.gridGroup.appendChild(line);
                t += beatLen;
            }
        }

        // 1. Render Chords
        this.chordGroup.innerHTML = '';
        const chordReg = this.registers['chords'] || 60;
        this.chordEvents = this.chordEvents.filter(e => e.time + (e.duration || 0) >= minTime);
        
        this.chordEvents.forEach(ev => {
            const chordEnd = ev.time + (ev.duration || 2.0);
            const start = Math.max(ev.time, minTime);
            const end = Math.min(chordEnd, currentTime);
            
            if (end > start) {
                const x = ((start - minTime) / this.windowSize) * width;
                const w = ((end - start) / this.windowSize) * width;
                const rootPC = ev.rootMidi % 12;

                if (ev.intervals) {
                    ev.intervals.forEach(interval => {
                        const pc = (rootPC + interval) % 12;
                        let color = "rgba(255,255,255,0.05)";
                        if (interval === 0) color = "rgba(59, 130, 246, 0.2)";
                        else if (interval === 3 || interval === 4) color = "rgba(16, 185, 129, 0.15)";
                        else if (interval === 7) color = "rgba(249, 115, 22, 0.15)";
                        else if (interval >= 9) color = "rgba(168, 85, 247, 0.15)";

                        for (let oct = -2; oct <= 2; oct++) {
                            const m = pc + (Math.floor(chordReg / 12) + oct) * 12;
                            const { y } = getWrappedY(m, chordReg);
                            if (y >= -5 && y <= 105) {
                                const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                                rect.setAttribute("x", x.toString()); rect.setAttribute("y", (y-1).toString());
                                rect.setAttribute("width", w.toString()); rect.setAttribute("height", "2");
                                rect.setAttribute("fill", color); rect.setAttribute("rx", "1");
                                this.chordGroup.appendChild(rect);
                            }
                        }
                    });
                }

                if (ev.notes) {
                    ev.notes.forEach(midi => {
                        const { y } = getWrappedY(midi, chordReg);
                        const interval = (midi % 12 - rootPC + 12) % 12;
                        let color = "rgba(255,255,255,0.8)";
                        if (interval === 0) color = "rgba(59, 130, 246, 0.9)";
                        else if (interval === 3 || interval === 4) color = "rgba(16, 185, 129, 0.9)";
                        else if (interval === 7) color = "rgba(249, 115, 22, 0.9)";
                        else if (interval >= 9) color = "rgba(168, 85, 247, 0.9)";

                        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                        rect.setAttribute("x", x.toString()); rect.setAttribute("y", (y-1.1).toString());
                        rect.setAttribute("width", w.toString()); rect.setAttribute("height", "2.2");
                        rect.setAttribute("fill", color); rect.setAttribute("rx", "1");
                        rect.style.filter = `drop-shadow(0 0 1.5px ${color})`;
                        this.chordGroup.appendChild(rect);
                    });
                }
            }
        });

        // 2. Render Tracks
        Object.entries(this.tracks).forEach(([name, track]) => {
            let d = "";
            let headX = -10, headY = -10;
            let active = false;
            const reg = this.registers[name] || 60;

            track.history = track.history.filter(e => e.time + (e.duration || 0) >= minTime);
            track.history.sort((a,b) => a.time - b.time);

            for (let i = 0; i < track.history.length; i++) {
                const ev = track.history[i];
                const nextEv = track.history[i+1];
                const noteEnd = ev.time + (ev.duration || 0.25);

                if (ev.time > currentTime) break;

                const startT = Math.max(ev.time, minTime);
                const endT = Math.min(noteEnd, currentTime);

                if (endT > startT) {
                    const x1 = ((startT - minTime) / this.windowSize) * width;
                    const x2 = ((endT - minTime) / this.windowSize) * width;
                    const { y, isWrapped } = getWrappedY(ev.midi, reg);

                    // Note body
                    if (d === "") d = `M ${x1},${y} L ${x2},${y}`;
                    else d += ` M ${x1},${y} L ${x2},${y}`;

                    // Rounded Legato Connection
                    if (nextEv && nextEv.time <= noteEnd + 0.05 && nextEv.time <= currentTime) {
                         const { y: nextY } = getWrappedY(nextEv.midi, reg);
                         const nextX = ((Math.max(nextEv.time, minTime) - minTime) / this.windowSize) * width;
                         // Draw a curve instead of a sharp angle
                         d += ` Q ${nextX},${y} ${nextX},${nextY}`;
                    }

                    if (ev.time <= currentTime && noteEnd >= currentTime) {
                        headX = x2; headY = y; active = true;
                    } else if (i === track.history.length - 1 && currentTime - noteEnd < 0.1) {
                        headX = x2; headY = y; active = true;
                    }
                }
            }

            track.elements.strokePath.setAttribute("d", d);
            if (active) {
                track.elements.head.setAttribute("cx", headX);
                track.elements.head.setAttribute("cy", headY);
                track.elements.head.style.opacity = "1";
            } else {
                track.elements.head.style.opacity = "0";
            }
        });
    }

    clear() {
        Object.values(this.tracks).forEach(t => {
            t.history = [];
            t.elements.label.textContent = "";
            t.elements.strokePath.setAttribute("d", "");
            t.elements.head.style.opacity = "0";
        });
        this.chordEvents = [];
        this.chordGroup.innerHTML = '';
        this.beatReferenceTime = null;
    }
}
