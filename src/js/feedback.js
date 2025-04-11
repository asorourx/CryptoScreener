// visual-feedback.js
document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    const elements = {
        settingsButton: document.getElementById('settingsButton'),
        settingsPanel: document.getElementById('visualSettingsPanel'),
        settingsOverlay: document.createElement('div'),
        closeSettings: document.querySelector('.close-settings'),
        animationDuration: document.getElementById('animationDuration'),
        durationValue: document.getElementById('durationValue'),
        toggleFeedback: document.getElementById('toggleVisualFeedback'),
        upColorPicker: document.getElementById('upColorPicker'),
        downColorPicker: document.getElementById('downColorPicker')
    };
    
    // Create overlay if it doesn't exist
    elements.settingsOverlay.className = 'settings-overlay';
    document.body.appendChild(elements.settingsOverlay);
    
    // Visual feedback state with default duration of 1500ms (changed from 3500ms to match your default)
    const state = {
        visualFeedback: {
            enabled: localStorage.getItem('visualFeedbackEnabled') !== 'false',
            duration: parseInt(localStorage.getItem('animationDuration')) || 1500,
            upColor: localStorage.getItem('upColor') || '#0ecb81',
            downColor: localStorage.getItem('downColor') || '#f6465d'
        }
    };
    
    // Helper function to convert hex to rgba
    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    // Update animation duration CSS variable
    function updateAnimationDuration() {
        document.documentElement.style.setProperty(
            '--animation-duration', 
            `${state.visualFeedback.duration}ms`
        );
    }
    
    // Update animation colors
    function updateAnimationColors() {
        if (state.visualFeedback.enabled) {
            document.documentElement.style.setProperty(
                '--up-color', 
                hexToRgba(state.visualFeedback.upColor, 0.2)
            );
            document.documentElement.style.setProperty(
                '--down-color', 
                hexToRgba(state.visualFeedback.downColor, 0.2)
            );
        }
    }
    
    // ESC key handler
    function handleKeyDown(e) {
        if (e.key === 'Escape' && elements.settingsPanel.style.display === 'block') {
            closeSettings();
        }
    }
    
    // Close settings function
    function closeSettings() {
        elements.settingsPanel.style.display = 'none';
        elements.settingsOverlay.style.display = 'none';
        elements.settingsPanel.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', handleKeyDown);
    }
    
    // Open settings function
    function openSettings() {
        elements.settingsPanel.style.display = 'block';
        elements.settingsOverlay.style.display = 'block';
        elements.settingsPanel.setAttribute('aria-hidden', 'false');
        document.addEventListener('keydown', handleKeyDown);
    }
    
    // Initialize settings panel
    function initSettings() {
        // Set initial values
        elements.toggleFeedback.checked = state.visualFeedback.enabled;
        elements.animationDuration.value = state.visualFeedback.duration;
        elements.durationValue.textContent = `${state.visualFeedback.duration}ms`;
        elements.upColorPicker.value = state.visualFeedback.upColor;
        elements.downColorPicker.value = state.visualFeedback.downColor;
        
        // Set up event listeners
        elements.settingsButton.addEventListener('click', openSettings);
        elements.closeSettings.addEventListener('click', closeSettings);
        elements.settingsOverlay.addEventListener('click', closeSettings);
        
        elements.animationDuration.addEventListener('input', (e) => {
            const duration = parseInt(e.target.value);
            state.visualFeedback.duration = duration;
            localStorage.setItem('animationDuration', duration);
            elements.durationValue.textContent = `${duration}ms`;
            updateAnimationDuration();
        });
        
        elements.toggleFeedback.addEventListener('change', (e) => {
            state.visualFeedback.enabled = e.target.checked;
            localStorage.setItem('visualFeedbackEnabled', e.target.checked);
            if (state.visualFeedback.enabled) {
                updateAnimationColors();
            } else {
                document.documentElement.style.setProperty('--up-color', 'transparent');
                document.documentElement.style.setProperty('--down-color', 'transparent');
            }
        });
        
        elements.upColorPicker.addEventListener('input', (e) => {
            state.visualFeedback.upColor = e.target.value;
            localStorage.setItem('upColor', e.target.value);
            updateAnimationColors();
        });
        
        elements.downColorPicker.addEventListener('input', (e) => {
            state.visualFeedback.downColor = e.target.value;
            localStorage.setItem('downColor', e.target.value);
            updateAnimationColors();
        });
        
        // Initialize CSS variables
        updateAnimationDuration();
        updateAnimationColors();
        
        // Check for theme toggle in settings panel
        setTimeout(() => {
            const themeToggle = document.getElementById('themeToggle');
            if (themeToggle) {
                console.log('Theme toggle integrated with settings panel');
            }
        }, 100);
    }
    
    // Clean up old storage format if it exists
    function cleanupOldStorage() {
        if (localStorage.getItem('visualSettings')) {
            localStorage.removeItem('visualSettings');
        }
        
        // Ensure all required keys exist with proper values
        if (!localStorage.getItem('animationDuration')) {
            localStorage.setItem('animationDuration', '1500');
        }
        if (!localStorage.getItem('visualFeedbackEnabled')) {
            localStorage.setItem('visualFeedbackEnabled', 'true');
        }
        if (!localStorage.getItem('upColor')) {
            localStorage.setItem('upColor', '#0ecb81');
        }
        if (!localStorage.getItem('downColor')) {
            localStorage.setItem('downColor', '#f6465d');
        }
    }
    
    // Initialize the settings
    cleanupOldStorage();
    initSettings();
});