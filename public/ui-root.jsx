import { h, render, Component } from 'preact';
import { App } from './App.jsx';

class ErrorBoundary extends Component {
    constructor() {
        super();
        this.state = { errored: false };
    }
    componentDidCatch(error) {
        this.setState({ errored: true });
        console.error("[UI-Root] Component Crash:", error);
    }
    render(props, state) {
        if (state.errored) {
            return (
                <div style="padding: 2rem; text-align: center; background: #1e293b; color: white; height: 100vh;">
                    <h2>Something went wrong in the UI.</h2>
                    <p>The audio engine may still be running. Try refreshing.</p>
                    <button onClick={() => window.location.reload()} class="primary-btn">Refresh App</button>
                </div>
            );
        }
        return props.children;
    }
}

export function mountComponents() {
    console.log("[UI-Root] Mounting Preact Root...");
    
    const root = document.body;
    // We clear the body's existing structural placeholders that were previously injected
    // but we keep flashOverlay and toast since they are managed by legacy logic or global CSS
    const mainLayout = document.getElementById('dashboardGrid');
    if (mainLayout) mainLayout.remove();
    
    const header = document.querySelector('header');
    if (header) header.remove();

    const sidebar = document.getElementById('col-sidebar');
    if (sidebar) sidebar.remove();

    render(
        <ErrorBoundary>
            <App />
        </ErrorBoundary>, 
        root
    );
}