// Note: Keep CACHE_NAME version in sync with APP_VERSION in config.js
const CACHE_NAME = 'ensemble-v2.28';
const ASSETS = [
    './',
    './index.html',
    './manual.html',
    './main.js',
    './app-controller.js',
    './arranger-controller.js',
    './instrument-controller.js',
    './ui-controller.js',
    './ui-store.js',
    './pwa.js',
    './conductor.js',
    './persistence.js',
    './history.js',
    './sharing.js',
    './engine.js',
    './state.js',
    './ui.js',
    './config.js',
    './presets.js',
    './utils.js',
    './chords.js',
    './bass.js',
    './soloist.js',
    './accompaniment.js',
    './midi-export.js',
    './midi-controller.js',
    './visualizer.js',
    './logic-worker.js',
    './worker-client.js',
    './fills.js',
    './form-analysis.js',
    './animation-loop.js',
    './groove-engine.js',
    './scheduler-core.js',
    './resolution.js',
    './state-hydration.js',
    './synth-drums.js',
    './synth-bass.js',
    './synth-soloist.js',
    './synth-chords.js',
    './styles.css',
    './manifest.json',
    './icon.svg',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            }));
        })
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
