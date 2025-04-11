document.addEventListener('DOMContentLoaded', function() {
    const tvButton = document.getElementById('TVScreen');
    const tvContainer = document.getElementById('tradingview-widget-container');
    const tvWidget = document.querySelector('.tradingview-widget-container__widget');

    // Initialize widget state
    function initWidgetState() {
        const isVisible = localStorage.getItem('tvWidgetVisible') === 'true';
        tvContainer.style.display = isVisible ? 'block' : 'none';
        if (isVisible) loadTradingViewWidget();
    }

    // Toggle visibility
    function toggleTradingView() {
        const isVisible = tvContainer.style.display === 'none';
        tvContainer.style.display = isVisible ? 'block' : 'none';
        localStorage.setItem('tvWidgetVisible', isVisible);
        
        if (isVisible && !window.tvScriptLoaded) {
            loadTradingViewWidget();
        }
    }

    // Load TradingView widget
    function loadTradingViewWidget() {
        if (!window.tvScriptLoaded && tvWidget) {
            const script = document.createElement('script');
            script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
            script.async = true;
            script.innerHTML = JSON.stringify({
                "symbols": [
                    { "proName": "TVC:DXY", "title": "USD Index" },
                    { "proName": "FOREXCOM:SPXUSD", "title": "S&P 500" },
                    { "proName": "FX_IDC:EURUSD", "title": "EUR/USD" },
                    { "proName": "FX:AUDUSD", "title": "AUD/USD" },
                    { "proName": "FX:USDJPY", "title": "USD/JPY" },
                    { "proName": "FX:GBPUSD", "title": "GBP/USD" },
                    { "proName": "BITSTAMP:BTCUSD", "title": "Bitcoin" },
                    { "proName": "BITSTAMP:ETHUSD", "title": "Ethereum" },
                    { "proName": "OANDA:XAUUSD", "title": "Gold" },
                    { "proName": "NASDAQ:TSLA", "title": "Tesla" },
                ],
                "showSymbolLogo": true,
                "isTransparent": true,
                "displayMode": "compact",
                "colorTheme": "dark",
                "locale": "en"
            });
            tvWidget.appendChild(script);
            window.tvScriptLoaded = true;
        }
    }

    // Button click handler
    tvButton.addEventListener('click', toggleTradingView);

    // Single keyboard shortcut handler
    document.addEventListener('keydown', function(e) {
        if (e.key.toLowerCase() === 't' && !e.target.matches('input, textarea, [contenteditable]')) {
            e.preventDefault();
            toggleTradingView();
            
            // Visual feedback
            tvButton.classList.add('active');
            setTimeout(() => tvButton.classList.remove('active'), 200);
        }
    });

    // Initialize
    initWidgetState();
});