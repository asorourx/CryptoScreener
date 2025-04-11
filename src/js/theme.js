// theme.js
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const icon = themeToggle.querySelector('i');
    
    // Rest of your existing theme toggle functionality
    function applyTheme(isLight) {
        if (isLight) {
            document.body.classList.add('light-theme');
            document.body.classList.remove('dark-theme');
            icon.classList.replace('fa-moon', 'fa-sun');
        } else {
            document.body.classList.add('dark-theme');
            document.body.classList.remove('light-theme');
            icon.classList.replace('fa-sun', 'fa-moon');
        }
    }
    
    function updateIcon(isLight) {
        icon.classList.toggle('fa-sun', isLight);
        icon.classList.toggle('fa-moon', !isLight);
    }
    
    function getSystemPreference() {
        return window.matchMedia('(prefers-color-scheme: light)').matches;
    }
    
    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersLight = getSystemPreference();
        
        if (savedTheme) {
            applyTheme(savedTheme === 'light');
        } else {
            applyTheme(systemPrefersLight);
        }
    }
    
    function setupSystemPreferenceListener() {
        const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: light)');
        colorSchemeQuery.addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                applyTheme(e.matches);
            }
        });
    }
    
    function setupToggleButton() {
        themeToggle.addEventListener('click', () => {
            const isLight = !document.body.classList.contains('light-theme');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            applyTheme(isLight);
        });
    }
    
    initTheme();
    setupSystemPreferenceListener();
    setupToggleButton();
}

document.addEventListener('DOMContentLoaded', initThemeToggle);