import { h, Fragment } from 'preact';
import React from 'preact/compat';
import { Settings } from './Settings.jsx';
import { EditorModal } from './EditorModal.jsx';
import { GenerateSongModal } from './GenerateSongModal.jsx';
import { ExportModal } from './ExportModal.jsx';
import { TemplatesModal } from './TemplatesModal.jsx';
import { AnalyzerModal } from './AnalyzerModal.jsx';

export function Modals() {
    return (
        <Fragment>
            <Settings />
            <EditorModal />
            <GenerateSongModal />
            <ExportModal />
            <TemplatesModal />
            <AnalyzerModal />
        </Fragment>
    );
}
