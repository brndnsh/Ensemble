export const ui = {
    playBtn: document.getElementById('playBtn'),
    bpmInput: document.getElementById('bpmInput'),
    tapBtn: document.getElementById('tapBtn'),
    keySelect: document.getElementById('keySelect'),
    transUpBtn: document.getElementById('transUpBtn'),
    transDownBtn: document.getElementById('transDownBtn'),
    maximizeChordBtn: document.getElementById('maximizeChordBtn'),
    chordPowerBtn: document.getElementById('chordPowerBtn'),
    groovePowerBtn: document.getElementById('groovePowerBtn'),
    bassPowerBtn: document.getElementById('bassPowerBtn'),
    progInput: document.getElementById('progressionInput'),
    saveBtn: document.getElementById('saveBtn'),
    shareBtn: document.getElementById('shareBtn'),
    chordVisualizer: document.getElementById('chordVisualizer'),
    chordPresets: document.getElementById('chordPresets'),
    userPresetsContainer: document.getElementById('userPresetsContainer'),
    chordStylePresets: document.getElementById('chordStylePresets'),
    bassStylePresets: document.getElementById('bassStylePresets'),
    chordVol: document.getElementById('chordVolume'),
    bassVol: document.getElementById('bassVolume'),
    drumBarsSelect: document.getElementById('drumBarsSelect'),
    drumPresets: document.getElementById('drumPresets'),
    userDrumPresetsContainer: document.getElementById('userDrumPresetsContainer'),
    sequencerGrid: document.getElementById('sequencerGrid'),
    clearDrums: document.getElementById('clearDrumsBtn'),
    saveDrumBtn: document.getElementById('saveDrumBtn'),
    drumVol: document.getElementById('drumVolume'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    settingsBtn: document.getElementById('settingsBtn'),
    closeSettings: document.getElementById('closeSettingsBtn'),
    masterVol: document.getElementById('masterVolume'),
    octave: document.getElementById('octaveSlider'),
    octaveLabel: document.getElementById('octaveLabel'),
    bassOctave: document.getElementById('bassOctaveSlider'),
    bassOctaveLabel: document.getElementById('bassOctaveLabel'),
    bassHeaderReg: document.getElementById('bassHeaderReg'),
    bassNoteName: document.getElementById('bassNoteName'),
    bassNoteOctave: document.getElementById('bassNoteOctave'),
    bassPolyline: document.getElementById('bassPolyline'),
    bassChordTones: document.getElementById('bassChordTones'),
    notationSelect: document.getElementById('notationSelect'),
    countIn: document.getElementById('countInCheck'),
    swingSlider: document.getElementById('swingSlider'),
    swingBase: document.getElementById('swingBaseSelect'),
    visualFlash: document.getElementById('visualFlashCheck'),
    haptic: document.getElementById('hapticCheck'),
    flashOverlay: document.getElementById('flashOverlay'),
    resetSettingsBtn: document.getElementById('resetSettingsBtn')
};

export function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    toast.style.opacity = "1";
    toast.style.bottom = "50px";
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.bottom = "30px";
        toast.classList.remove('show');
    }, 2000);
}

export function triggerFlash(intensity = 0.2) {
    if (ui.visualFlash.checked) {
        ui.flashOverlay.style.opacity = intensity;
        setTimeout(() => { ui.flashOverlay.style.opacity = 0; }, 50);
    }
    if (ui.haptic.checked && navigator.vibrate) {
        navigator.vibrate(intensity > 0.15 ? 20 : 10);
    }
}

export function updateOctaveLabel(midi) {
    const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const noteName = notes[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    ui.octaveLabel.textContent = `${noteName}${octave}`;
}

export function updateBassOctaveLabel(midi) {
    const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const noteName = notes[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    const label = `${noteName}${octave}`;
    ui.bassOctaveLabel.textContent = label;
    if (ui.bassHeaderReg) ui.bassHeaderReg.textContent = label;
}
