import { h } from 'preact';
import { useEnsembleState } from '../ui-bridge.js';
import { skipWaiting } from '../pwa.js';

export function PWAUpdateBanner() {
    const updateAvailable = useEnsembleState(s => s.playback.updateAvailable);

    if (!updateAvailable) return null;

    return (
        <div id="updateBanner" class="update-banner show">
            <span>A new version is available.</span>
            <button id="updateRefreshBtn" onClick={skipWaiting}>Refresh</button>
        </div>
    );
}
