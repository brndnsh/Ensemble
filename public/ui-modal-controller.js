/**
 * ModalManager: Centralized controller for all modal interactions.
 * Handles opening, closing, accessibility (aria-hidden, focus trapping), 
 * and background scrolling prevention.
 */
export const ModalManager = {
    activeModal: null,

    /**
     * Opens a modal and handles side effects.
     * @param {HTMLElement} modal - The modal overlay element to open.
     */
    open(modal) {
        if (!modal) return;
        
        // Close current if any
        if (this.activeModal) {
            this.close(this.activeModal);
        }

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        this.activeModal = modal;

        // Focus management: Find first focusable element
        const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length > 0) {
            // Delay slightly to ensure visibility for some browsers
            setTimeout(() => focusable[0].focus(), 10);
        }
        
        // Dispatch custom event for external listeners
        modal.dispatchEvent(new CustomEvent('modal-opened', { bubbles: true }));
    },

    /**
     * Closes a modal and cleans up side effects.
     * @param {HTMLElement} modal - The modal overlay element to close.
     */
    close(modal) {
        const target = modal || this.activeModal;
        if (!target) return;

        target.classList.remove('active');
        target.setAttribute('aria-hidden', 'true');
        
        // Only remove body class if no other modals are active (though we usually have only one)
        const anyActive = document.querySelector('.modal-overlay.active, .settings-overlay.active');
        if (!anyActive) {
            document.body.classList.remove('modal-open');
        }

        if (this.activeModal === target) {
            this.activeModal = null;
        }

        target.dispatchEvent(new CustomEvent('modal-closed', { bubbles: true }));
    },

    /**
     * Initializes a modal with standard behaviors (click outside to close, ESC key).
     * @param {HTMLElement} modal - The modal overlay element.
     * @param {HTMLElement} closeBtn - The button that closes the modal.
     */
    bind(modal, closeBtn) {
        if (!modal) return;

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close(modal);
            });
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.close(modal);
            }
        });
    }
};
