import { ui, showToast, updateKeySelectLabels, updateRelKeyButton } from './ui.js';
import { arranger, playback } from './state.js';
import { initAudio } from './engine.js';
import { generateId, normalizeKey, escapeHTML, formatUnicodeSymbols } from './utils.js';
import { refreshArrangerUI } from './arranger-controller.js';
import { ModalManager } from './ui-modal-controller.js';
import { pushHistory } from './history.js';

/**
 * Initializes event handlers for the Audio Analyzer and Live Listen features.
 */
export function setupAnalyzerHandlers() {
    if (!ui.analyzeAudioBtn) {
        console.warn("[Analyzer] analyzeAudioBtn not found in UI registry.");
        return;
    }

    // --- Mode Toggle Logic ---
    const updateModeUI = () => {
        document.querySelectorAll('.mode-option').forEach(l => {
            const input = l.querySelector('input');
            if (input.checked) {
                l.style.background = 'var(--accent-color)';
                l.style.color = 'white';
                l.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            } else {
                l.style.background = 'transparent';
                l.style.color = 'var(--text-secondary)';
                l.style.boxShadow = 'none';
            }
        });
        
        const mode = document.querySelector('input[name="analyzerMode"]:checked').value;
        const liveTitle = document.querySelector('#liveListenView h4');
        if (liveTitle) liveTitle.textContent = mode === 'melody' ? 'Listening for Melody...' : 'Listening for Chords...';
        
        // Update Title
        const modalTitle = document.querySelector('.analyzer-body h3');
        if (modalTitle) modalTitle.textContent = mode === 'melody' ? 'Melody Harmonizer' : 'Audio Chord Analyzer';
    };
    
    document.querySelectorAll('input[name="analyzerMode"]').forEach(radio => {
        radio.addEventListener('change', updateModeUI);
    });
    // Init state
    updateModeUI();

    ui.analyzerOverlay.addEventListener('modal-closed', () => {
        stopLiveListen();
    });

    let detectedChords = [];
    let currentAudioBuffer = null;
    let currentFileName = "";

    const resetAnalyzer = () => {
        ui.analyzerDropZone.style.display = 'block';
        if (ui.liveListenContainer) ui.liveListenContainer.style.display = 'flex';
        ui.analyzerTrimView.style.display = 'none';
        ui.analyzerProcessing.style.display = 'none';
        ui.analyzerResults.style.display = 'none';
        ui.analyzerProgressBar.style.width = '0%';
        ui.analyzerFileInput.value = '';
        currentAudioBuffer = null;
        detectedChords = [];

        if (ui.liveKeyLabel) ui.liveKeyLabel.textContent = "Key: --";
        if (ui.liveForceKeyCheck) ui.liveForceKeyCheck.checked = false;
        if (ui.analyzerCurrentKeyLabel) ui.analyzerCurrentKeyLabel.textContent = formatUnicodeSymbols(arranger.key || 'C');
        if (ui.analyzerForceKeyCheck) ui.analyzerForceKeyCheck.checked = false;
    };
    window.resetAnalyzer = resetAnalyzer;

    const drawWaveform = (buffer) => {
        const canvas = ui.analyzerWaveformCanvas;
        const canvasCtx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            console.warn("[Analyzer] Canvas dimensions are zero, skipping draw.");
            return;
        }

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        const width = canvas.width;
        const height = canvas.height;
        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        canvasCtx.fillStyle = 'rgba(59, 130, 246, 0.5)';
        canvasCtx.clearRect(0, 0, width, height);
        
        // Draw baseline
        canvasCtx.strokeStyle = 'rgba(255,255,255,0.1)';
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, amp);
        canvasCtx.lineTo(width, amp);
        canvasCtx.stroke();

        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            canvasCtx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
        }
        
        drawSelectionOverlay();
    };

    const drawSelectionOverlay = () => {
        // Placeholder for future overlay drawing logic
    };

    const updateSelectionUI = () => {
        if (!currentAudioBuffer) return;
        const duration = currentAudioBuffer.duration;
        const start = parseFloat(ui.analyzerStartInput.value) || 0;
        const end = parseFloat(ui.analyzerEndInput.value) || duration;
        
        const leftPct = (start / duration) * 100;
        const widthPct = ((end - start) / duration) * 100;
        
        ui.analyzerSelectionOverlay.style.left = `${leftPct}%`;
        ui.analyzerSelectionOverlay.style.width = `${widthPct}%`;
    };

    const handleFile = async (file) => {
        ui.analyzerDropZone.style.display = 'none';
        if (ui.liveListenContainer) ui.liveListenContainer.style.display = 'none';
        ui.analyzerProcessing.style.display = 'block'; 
        currentFileName = file.name;
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            if (!playback.audio) {
                initAudio();
            }

            currentAudioBuffer = await playback.audio.decodeAudioData(arrayBuffer);
            
            ui.analyzerProcessing.style.display = 'none';
            ui.analyzerTrimView.style.display = 'block';
            
            ui.analyzerStartInput.value = 0;
            ui.analyzerEndInput.value = Math.floor(currentAudioBuffer.duration);
            ui.analyzerDurationLabel.textContent = `Total Duration: ${currentAudioBuffer.duration.toFixed(1)}s`;
            
            drawWaveform(currentAudioBuffer);
            updateSelectionUI();
            
        } catch (err) {
            console.error("[Analyzer] Loading Error:", err);
            showToast("Loading failed: " + err.message);
            resetAnalyzer();
        }
    };

    const performAnalysis = async (customBpm = 0) => {
        if (!currentAudioBuffer) return;
        
        const mode = document.querySelector('input[name="analyzerMode"]:checked').value;
        const targetBpm = typeof customBpm === 'number' ? customBpm : 0;

        ui.analyzerTrimView.style.display = 'none';
        ui.analyzerProcessing.style.display = 'block';
        ui.analyzerResults.style.display = 'none';
        ui.analyzerProgressBar.style.width = '0%';

        try {
            const { ChordAnalyzerLite } = await import('./audio-analyzer-lite.js');
            const { extractForm, extractMelodyForm } = await import('./form-extractor.js');
            const analyzer = new ChordAnalyzerLite();

            const startTime = parseFloat(ui.analyzerStartInput.value) || 0;
            const endTime = parseFloat(ui.analyzerEndInput.value) || currentAudioBuffer.duration;
            
            const pulse = await analyzer.identifyPulse(currentAudioBuffer, {
                startTime, endTime, bpm: targetBpm, 
                onProgress: (pct) => ui.analyzerProgressBar.style.width = `${pct * 0.4}%` 
            });

            const bpm = pulse.bpm;
            
            if (mode === 'melody') {
                const { Harmonizer } = await import('./melody-harmonizer.js');
                const { HarmonizerTrainer } = await import('./harmonizer-trainer.js');
                
                const signal = currentAudioBuffer.getChannelData(0);
                const globalChroma = analyzer.calculateChromagram(signal, currentAudioBuffer.sampleRate, {
                        minMidi: 48, maxMidi: 84, skipSharpening: true, step: Math.max(4, Math.floor(signal.length / 500000))
                });
                const detectedKeyObj = analyzer.identifyGlobalKey(globalChroma);
                const rootName = analyzer.notes[detectedKeyObj.root];
                const key = rootName + (detectedKeyObj.type === 'minor' ? 'm' : '');

                if (ui.analyzerForceKeyCheck && !ui.analyzerForceKeyCheck.checked) {
                    if (ui.keySelect && key !== arranger.key) {
                        ui.keySelect.value = normalizeKey(key);
                        arranger.key = key;
                        updateKeySelectLabels();
                        updateRelKeyButton();
                    }
                }

                const harmonizer = new Harmonizer();
                const kb = await HarmonizerTrainer.train();
                harmonizer.setKnowledgeBase(kb);
                
                let melodyLine = await analyzer.extractMelody(currentAudioBuffer, pulse, {
                    keyBias: detectedKeyObj
                });

                const beatsPerMeasure = pulse.beatsPerMeasure || 4;
                melodyLine = extractMelodyForm(melodyLine, beatsPerMeasure);

                ui.analyzerProgressBar.style.width = '80%';

                const options = harmonizer.generateOptions(melodyLine, key);
                
                ui.analyzerProgressBar.style.width = '100%';
                ui.analyzerProcessing.style.display = 'none';
                ui.analyzerResults.style.display = 'block';

                const container = ui.suggestedSectionsContainer;
                container.innerHTML = '<h4>Harmonization Options</h4>';

                const renderOptionContent = (opt, targetContainer) => {
                    targetContainer.innerHTML = '';

                    const desc = document.createElement('p');
                    desc.className = 'harmony-desc';
                    desc.textContent = opt.description;
                    targetContainer.appendChild(desc);

                    const grid = document.createElement('div');
                    grid.className = 'harmony-grid';

                    const detailsPanel = document.createElement('div');
                    detailsPanel.className = 'harmony-details-panel';
                    detailsPanel.innerHTML = '<span class="text-muted">Tap a chord to see why it was chosen.</span>';

                    opt.chords.forEach((c, i) => {
                        const cell = document.createElement('button');
                        cell.className = 'harmony-cell';
                        cell.setAttribute('aria-label', `Measure ${i+1}: ${c.roman} ${c.quality}`);

                        const romanDiv = document.createElement('div');
                        romanDiv.className = 'hc-roman';
                        romanDiv.textContent = formatUnicodeSymbols(c.roman);
                        cell.appendChild(romanDiv);

                        const qualityDiv = document.createElement('div');
                        qualityDiv.className = 'hc-quality';
                        qualityDiv.textContent = c.quality;
                        cell.appendChild(qualityDiv);

                        cell.onclick = () => {
                            targetContainer.querySelectorAll('.harmony-cell').forEach(el => el.classList.remove('selected'));
                            cell.classList.add('selected');

                            if (c.reasons && c.reasons.length > 0) {
                                detailsPanel.textContent = '';
                                const strong = document.createElement('strong');
                                strong.textContent = `Measure ${i+1}: ${formatUnicodeSymbols(c.roman)}`;
                                detailsPanel.appendChild(strong);

                                const ul = document.createElement('ul');
                                ul.className = 'reason-list';
                                c.reasons.forEach(r => {
                                    const li = document.createElement('li');
                                    li.textContent = r;
                                    ul.appendChild(li);
                                });
                                detailsPanel.appendChild(ul);
                            } else {
                                detailsPanel.innerHTML = `<strong>Measure ${i+1}:</strong> <span class="text-muted">No specific notes.</span>`;
                            }
                        };

                        grid.appendChild(cell);
                    });

                    targetContainer.appendChild(grid);
                    targetContainer.appendChild(detailsPanel);
                };

                const setActiveOption = (opt) => {
                    detectedChords = [{
                         label: `Harmonized Melody (${opt.type})`,
                         value: opt.progression,
                         repeat: 1,
                         startBeat: 0,
                         endBeat: melodyLine.length,
                         isLoop: false
                    }];
                };

                const tabContainer = document.createElement('div');
                tabContainer.className = 'harmony-tabs';

                const contentContainer = document.createElement('div');
                contentContainer.className = 'harmony-content';

                options.forEach((opt, idx) => {
                    const tab = document.createElement('button');
                    tab.className = `harmony-tab-btn ${idx === 0 ? 'active' : ''}`;
                    tab.textContent = opt.type;

                    tab.onclick = () => {
                        document.querySelectorAll('.harmony-tab-btn').forEach(b => b.classList.remove('active'));
                        tab.classList.add('active');
                        renderOptionContent(opt, contentContainer);
                        setActiveOption(opt);
                    };
                    tabContainer.appendChild(tab);
                });

                container.appendChild(tabContainer);
                container.appendChild(contentContainer);

                if (options.length > 0) {
                    renderOptionContent(options[0], contentContainer);
                    setActiveOption(options[0]);
                }

            } else {
                // Chord Mode
                const analysis = await analyzer.analyze(currentAudioBuffer, { 
                    bpm: bpm, 
                    startTime,
                    endTime,
                    onProgress: (pct) => {
                        ui.analyzerProgressBar.style.width = `${pct}%`;
                    }
                });
                detectedChords = extractForm(analysis.results, analysis.beatsPerMeasure);

                ui.analyzerProgressBar.style.width = '100%';
                ui.analyzerProcessing.style.display = 'none';
                ui.analyzerResults.style.display = 'block';

                const container = ui.suggestedSectionsContainer;
                container.innerHTML = '<h4>Suggested Structure</h4>';

                detectedChords.forEach(s => {
                    const item = document.createElement('div');
                    item.className = 'suggested-section-item';
                    if (s.isLoop) item.classList.add('is-loop');

                    const loopBadge = s.isLoop ? '<span class="loop-badge" title="Good Loop Candidate">∞</span>' : '';

                    item.innerHTML = `
                        <div class="ss-header">
                            <strong>${escapeHTML(s.label)}</strong>
                            <span class="ss-repeat">x${escapeHTML(String(s.repeat))}</span>
                            ${loopBadge}
                        </div>
                        <div class="ss-value">${escapeHTML(formatUnicodeSymbols(s.value))}</div>
                    `;

                    item.onclick = () => {
                        const secondsPerBeat = 60 / bpm;
                        const startT = (s.startBeat || 0) * secondsPerBeat;
                        const endT = (s.endBeat || (currentAudioBuffer.duration / secondsPerBeat)) * secondsPerBeat;

                        ui.analyzerStartInput.value = startT.toFixed(3);
                        ui.analyzerEndInput.value = endT.toFixed(3);

                        const event = new Event('input');
                        ui.analyzerStartInput.dispatchEvent(event);
                        ui.analyzerEndInput.dispatchEvent(event);

                        document.querySelectorAll('.suggested-section-item').forEach(el => el.classList.remove('selected'));
                        item.classList.add('selected');
                    };

                    container.appendChild(item);
                });
            }
            
            if (ui.bpmChips && pulse.candidates) {
                ui.bpmChips.innerHTML = '';
                pulse.candidates.forEach(c => {
                    const chip = document.createElement('div');
                    chip.className = `preset-chip ${c.bpm === bpm ? 'active' : ''}`;
                    chip.textContent = `${c.bpm} BPM`;
                    chip.onclick = () => performAnalysis(c.bpm);
                    ui.bpmChips.appendChild(chip);
                });
            }

            ui.analyzerSummary.textContent = mode === 'melody' 
                ? `Harmonized melody in ${arranger.key} at ${bpm} BPM.`
                : `Analyzed "${currentFileName}" at ${bpm} BPM. Detected ${detectedChords.length} sections.`;
            
            ui.detectedBpmLabel.textContent = bpm;
            ui.analyzerSyncBpmCheck.checked = true; 
            
        } catch (err) {
            console.error("[Analyzer] Analysis Error:", err);
            showToast("Analysis failed: " + err.message);
            ui.analyzerTrimView.style.display = 'block';
            ui.analyzerProcessing.style.display = 'none';
        }
    };

    // --- Live Listen Logic ---
    let liveAudioCtx = null;
    let liveStream = null;
    let liveAnalyzer = null;

    let stagedChords = [];
    let currentStableChord = null;
    let lastDetectedChord = null;
    let stabilityCounter = 0;
    let autoAddTimer = null;
    const STABILITY_THRESHOLD = 3; 
    const AUTO_ADD_DELAY = 2000; 

    const renderStagedChords = () => {
        const el = document.getElementById('liveStagedDisplay');
        const btn = document.getElementById('captureLiveHistoryBtn');
        if (!el) return;

        if (stagedChords.length === 0) {
            el.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">Start playing to build a sequence...</span>';
            if (btn) {
                btn.style.opacity = '0.5';
                btn.style.pointerEvents = 'none';
                btn.textContent = 'Import Sequence';
            }
        } else {
            el.textContent = stagedChords.join('');
            if (btn) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
                btn.textContent = `Import Sequence (${stagedChords.length} chords)`;
            }
        }
        el.scrollLeft = el.scrollWidth;
    };

    const addCurrentChord = () => {
        if (!currentStableChord || currentStableChord === 'Rest') return;
        stagedChords.push(`${formatUnicodeSymbols(currentStableChord)} | `);
        renderStagedChords();

        const btn = document.getElementById('liveAddBtn');
        if (btn) {
            const originalBg = btn.style.background;
            btn.style.background = 'var(--accent-color)';
            setTimeout(() => btn.style.background = originalBg, 200);
        }
    };

    const captureLiveHistory = () => {
        if (stagedChords.length === 0) return;
        
        pushHistory();
        
        const progressionStr = stagedChords.join('').trim();
        const cleanProgression = progressionStr.endsWith('|') ? progressionStr.slice(0, -1).trim() : progressionStr;

        const newSection = {
            id: generateId(),
            label: 'Live Input',
            value: cleanProgression,
            repeat: 1,
            key: '',
            timeSignature: '',
            seamless: false
        };

        const replaceAll = document.getElementById('analyzerReplaceCheck').checked;

        if (replaceAll) {
            arranger.sections = [newSection];
        } else {
            arranger.sections.push(newSection);
        }

        arranger.isDirty = true;
        refreshArrangerUI();
        ModalManager.close(ui.analyzerOverlay);
        showToast(`Imported sequence.`);
    };

    const startLiveListen = async () => {
        if (liveStream) stopLiveListen();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast("Live Listen requires a Secure Context (HTTPS or localhost).");
            return;
        }
        
        const mode = document.querySelector('input[name="analyzerMode"]:checked').value;

        stagedChords = [];
        currentStableChord = null;
        lastDetectedChord = null;
        renderStagedChords();

        const addBtn = document.getElementById('liveAddBtn');
        const undoBtn = document.getElementById('liveUndoBtn');
        const clearBtn = document.getElementById('liveClearBtn');
        const autoCheck = document.getElementById('liveAutoAddCheck');

        if (addBtn) addBtn.onclick = addCurrentChord;
        if (undoBtn) undoBtn.onclick = () => {
            stagedChords.pop();
            renderStagedChords();
        };
        if (clearBtn) clearBtn.onclick = () => {
            stagedChords = [];
            renderStagedChords();
        };

        const keyHandler = (e) => {
            if (e.code === 'Space' && ui.analyzerOverlay.classList.contains('active')) {
                e.preventDefault();
                addCurrentChord();
            }
        };
        window.addEventListener('keydown', keyHandler);
        ui.analyzerOverlay._liveKeyHandler = keyHandler;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: true
            }});

            liveStream = stream;
            liveAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = liveAudioCtx.createMediaStreamSource(stream);
            
            const { ChordAnalyzerLite } = await import('./audio-analyzer-lite.js');
            liveAnalyzer = new ChordAnalyzerLite();
            
            let harmonizer = null;
            if (mode === 'melody') {
                const { Harmonizer } = await import('./melody-harmonizer.js');
                harmonizer = new Harmonizer();
            }

            ui.analyzerDropZone.style.display = 'none';
            ui.liveListenBtn.parentElement.style.display = 'none';
            ui.liveListenView.style.display = 'block';
            
            const chordEl = ui.liveChordDisplay;
            const statusEl = document.getElementById('liveStatusLabel');
            if (statusEl) statusEl.textContent = "Play a chord...";

            const processor = liveAudioCtx.createScriptProcessor(4096, 1, 1);
            source.connect(processor);
            processor.connect(liveAudioCtx.destination);

            let chunks = [];
            let totalChunkLen = 0;
            const targetSamples = Math.floor(liveAudioCtx.sampleRate * 0.5); 

            const step = 8;
            const numSteps = Math.ceil(targetSamples / step);
            const reusableBuffers = {
                chroma: new Float32Array(12),
                pitchEnergy: new Float32Array(128),
                windowValues: new Float32Array(numSteps)
            };

            for (let i = 0, idx = 0; i < targetSamples; i += step, idx++) {
                reusableBuffers.windowValues[idx] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (targetSamples - 1)));
            }

            const keyHistory = [];

            processor.onaudioprocess = (e) => {
                const input = e.inputBuffer.getChannelData(0);
                const chunk = new Float32Array(input);
                chunks.push(chunk);
                totalChunkLen += chunk.length;

                if (totalChunkLen >= targetSamples) {
                    const fullBuffer = new Float32Array(totalChunkLen);
                    let offset = 0;
                    for (const c of chunks) {
                        fullBuffer.set(c, offset);
                        offset += c.length;
                    }

                    const analysisBuffer = fullBuffer.slice(-targetSamples);
                    const overlapBuffer = fullBuffer.slice(-Math.floor(targetSamples / 2));
                    chunks = [overlapBuffer];
                    totalChunkLen = overlapBuffer.length;

                    let detected = null;

                    if (mode === 'melody') {
                         const rms = Math.sqrt(analysisBuffer.reduce((s, x) => s + x * x, 0) / analysisBuffer.length);
                         if (rms > 0.02) {
                             const chroma = liveAnalyzer.calculateChromagram(analysisBuffer, liveAudioCtx.sampleRate, {
                                 step, buffers: reusableBuffers, minMidi: 48, maxMidi: 84
                             });
                             const keyRes = liveAnalyzer.identifySimpleKey(chroma);
                             const keyStr = liveAnalyzer.notes[keyRes.root] + (keyRes.type === 'minor' ? 'm' : '');
                             keyHistory.push(keyStr);
                             if (keyHistory.length > 30) keyHistory.shift();
                             
                             const counts = {};
                             let consensusKey = keyStr;
                             let maxCount = 0;
                             keyHistory.forEach(k => { counts[k] = (counts[k] || 0) + 1; if (counts[k] > maxCount) { maxCount = counts[k]; consensusKey = k; } });
                             if (maxCount > keyHistory.length * 0.5) {
                                if (ui.liveKeyLabel) ui.liveKeyLabel.textContent = `Key: ${formatUnicodeSymbols(consensusKey)}`;
                                if (ui.liveForceKeyCheck && !ui.liveForceKeyCheck.checked && consensusKey !== arranger.key) arranger.key = consensusKey;
                             }
                             
                             let maxE = 0;
                             let bestMidi = -1;
                             for(let m = 48; m <= 84; m++) {
                                 const e = reusableBuffers.pitchEnergy[m];
                                 if (e > maxE) { maxE = e; bestMidi = m; }
                             }
                             if (bestMidi > 0) {
                                 const melodyBit = [{beat: 0, midi: bestMidi, energy: 1.0}];
                                 detected = harmonizer.generateProgression(melodyBit, arranger.key || 'C', 0.5);
                             }
                        }
                    } else {
                        const chroma = liveAnalyzer.calculateChromagram(analysisBuffer, liveAudioCtx.sampleRate, {
                            step: 8, minMidi: 32, maxMidi: 80
                        });
                        detected = liveAnalyzer.identifyChord(chroma);
                    }

                    if (detected && detected !== 'Rest') {
                        if (detected === lastDetectedChord) {
                            stabilityCounter++;
                        } else {
                            stabilityCounter = 0;
                            lastDetectedChord = detected;
                        }

                        if (stabilityCounter >= STABILITY_THRESHOLD) {
                             if (currentStableChord !== detected) {
                                 currentStableChord = detected;
                                 chordEl.textContent = formatUnicodeSymbols(detected);
                                 chordEl.style.color = 'var(--accent-color)';

                                 if (autoAddTimer) clearTimeout(autoAddTimer);
                                 if (autoCheck && autoCheck.checked) {
                                     autoAddTimer = setTimeout(() => {
                                         addCurrentChord();
                                         chordEl.style.transform = 'scale(1.2)';
                                         setTimeout(() => chordEl.style.transform = 'scale(1)', 200);
                                     }, AUTO_ADD_DELAY);
                                 }
                             }
                        }
                    } else {
                        stabilityCounter = 0;
                        lastDetectedChord = null;
                        if (autoAddTimer) {
                            clearTimeout(autoAddTimer);
                            autoAddTimer = null;
                        }
                    }
                }
            };

        } catch (err) {
            console.error("[LiveListen] Error:", err);
            showToast("Microphone access denied or error: " + err.message);
        }
    };

    const stopLiveListen = () => {
        if (liveStream) {
            liveStream.getTracks().forEach(t => t.stop());
            liveStream = null;
        }
        if (liveAudioCtx) {
            liveAudioCtx.close();
            liveAudioCtx = null;
        }
        if (liveAnalyzer) {
            liveAnalyzer.dispose();
            liveAnalyzer = null;
        }
        if (autoAddTimer) clearTimeout(autoAddTimer);

        if (ui.analyzerOverlay._liveKeyHandler) {
            window.removeEventListener('keydown', ui.analyzerOverlay._liveKeyHandler);
            delete ui.analyzerOverlay._liveKeyHandler;
        }

        ui.analyzerDropZone.style.display = 'block';
        ui.liveListenBtn.parentElement.style.display = 'flex';
        ui.liveListenView.style.display = 'none';
    };

    ui.liveListenBtn.addEventListener('click', startLiveListen);
    ui.stopLiveListenBtn.addEventListener('click', stopLiveListen);
    ui.captureLiveHistoryBtn.addEventListener('click', captureLiveHistory);

    ui.analyzerStartInput.addEventListener('input', updateSelectionUI);
    ui.analyzerEndInput.addEventListener('input', updateSelectionUI);
    ui.startAnalysisBtn.addEventListener('click', () => performAnalysis());

    ui.analyzerFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    ui.analyzerDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.analyzerDropZone.classList.add('drag-over');
    });

    ui.analyzerDropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.analyzerDropZone.classList.remove('drag-over');
    });

    ui.analyzerDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.analyzerDropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    ui.applyAnalysisBtn.addEventListener('click', () => {
        if (detectedChords.length === 0) return;
        
        pushHistory();
        
        const newSections = detectedChords.map(s => ({
            id: generateId(),
            label: s.label,
            value: s.value,
            repeat: s.repeat,
            key: '',
            timeSignature: '',
            seamless: false
        }));

        const replaceAll = document.getElementById('analyzerReplaceCheck').checked;

        if (replaceAll) {
            arranger.sections = newSections;
        } else {
            arranger.sections.push(...newSections);
        }

        if (ui.analyzerSyncBpmCheck && ui.analyzerSyncBpmCheck.checked) {
            const detectedBpm = parseInt(ui.detectedBpmLabel.textContent);
            if (detectedBpm && detectedBpm !== playback.bpm) {
                // setBpm is in app-controller
                import('./app-controller.js').then(({ setBpm }) => {
                    setBpm(detectedBpm, playback.viz);
                });
            }
        }

        arranger.isDirty = true;
        refreshArrangerUI();
        ModalManager.close(ui.analyzerOverlay);
        showToast(`Imported ${newSections.length} sections.`);
    });
}
