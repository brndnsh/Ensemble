import { h, Fragment } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEnsembleState } from '../ui-bridge.js';

// Lazy load heavy components to reduce initial bundle size
const Settings = lazy(() => import('./Settings.jsx').then(m => ({ default: m.Settings })));
const EditorModal = lazy(() => import('./EditorModal.jsx').then(m => ({ default: m.EditorModal })));
const GenerateSongModal = lazy(() => import('./GenerateSongModal.jsx').then(m => ({ default: m.GenerateSongModal })));
const ExportModal = lazy(() => import('./ExportModal.jsx').then(m => ({ default: m.ExportModal })));
const TemplatesModal = lazy(() => import('./TemplatesModal.jsx').then(m => ({ default: m.TemplatesModal })));
const AnalyzerModal = lazy(() => import('./AnalyzerModal.jsx').then(m => ({ default: m.AnalyzerModal })));

export function Modals() {
    // Get modal visibility state from global store
    const {
        settingsOpen,
        editorOpen,
        generateSongOpen,
        exportOpen,
        templatesOpen,
        analyzerOpen
    } = useEnsembleState(s => ({
        settingsOpen: s.playback.modals.settings,
        editorOpen: s.playback.modals.editor,
        generateSongOpen: s.playback.modals.generateSong,
        exportOpen: s.playback.modals.export,
        templatesOpen: s.playback.modals.templates,
        analyzerOpen: s.playback.modals.analyzer
    }));

    return (
        <Fragment>
            <Suspense fallback={null}>
                {settingsOpen && <Settings />}
                {editorOpen && <EditorModal />}
                {generateSongOpen && <GenerateSongModal />}
                {exportOpen && <ExportModal />}
                {templatesOpen && <TemplatesModal />}
                {analyzerOpen && <AnalyzerModal />}
            </Suspense>
        </Fragment>
    );
}