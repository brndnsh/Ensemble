const CACHE_NAME = 'ensemble-v1.20';
const ASSETS = [
    './',
    './index.html',
    './manual.html',
    './main.js',
    './engine.js',
    './state.js',
    './ui.js',
    './config.js',
    './utils.js',
    './chords.js',
    './bass.js',
    './soloist.js',
    './accompaniment.js',
    './midi-export.js',
    './visualizer.js',
    './logic-worker.js',
    './worker-client.js',
    './styles.css',
    './manifest.json',
    './icon.svg',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
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