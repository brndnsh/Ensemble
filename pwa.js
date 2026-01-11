import { showToast } from './ui.js';

let deferredPrompt;

export function initPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI notify the user they can add to home screen
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) {
            installBtn.style.display = 'flex';
        }
    });

    window.addEventListener('appinstalled', () => {
        // Clear the deferredPrompt so it can be garbage collected
        deferredPrompt = null;
        // Hide the install button
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) {
            installBtn.style.display = 'none';
        }
        showToast('App installed successfully!');
    });

    if ('serviceWorker' in navigator) {
        let newWorker;
        const updateBanner = document.getElementById('updateBanner');
        const refreshBtn = document.getElementById('updateRefreshBtn');

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (newWorker) {
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
            });
        }

        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('SW registered');
            
            // Check for updates every hour
            setInterval(() => {
                reg.update();
            }, 60 * 60 * 1000);
            
            reg.addEventListener('updatefound', () => {
                newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New update available
                        if (updateBanner) updateBanner.classList.add('show');
                    }
                });
            });
        }).catch(err => console.log('SW failed', err));

        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            window.location.reload();
            refreshing = true;
        });
    }
}

export async function triggerInstall() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        return outcome === 'accepted';
    }
    return false;
}
