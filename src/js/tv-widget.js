document.addEventListener('DOMContentLoaded', function() {
    const tvButton = document.getElementById('TVScreen');
    const tvContainer = document.getElementById('tradingview-widget-container');
    const tvWidget = document.querySelector('.tradingview-widget-container__widget');

    // Load saved state
    if (localStorage.getItem('tvWidgetVisible') === 'true') {
        tvContainer.style.display = 'block';
        loadTradingViewWidget();
    }

    // Toggle visibility
    tvButton.addEventListener('click', function() {
        if (tvContainer.style.display === 'none') {
            tvContainer.style.display = 'block';
            localStorage.setItem('tvWidgetVisible', 'true');
            loadTradingViewWidget();
        } else {
            tvContainer.style.display = 'none';
            localStorage.setItem('tvWidgetVisible', 'false');
        }
    });

    // Keyboard shortcut (T key)
    document.addEventListener('keydown', function(e) {
        if ((e.key === 't' || e.key === 'T') && !e.target.matches('input, textarea')) {
            e.preventDefault();
            tvButton.click();
        }
    });

    // Load TradingView widget
    function loadTradingViewWidget() {
        if (!window.tvScriptLoaded && tvWidget) {
            const script = document.createElement('script');
            script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
            script.async = true;
            script.innerHTML = JSON.stringify({
                "symbols": [
                    { "proName": "FOREXCOM:SPXUSD", "title": "S&P 500" },
                    { "proName": "FOREXCOM:NSXUSD", "title": "Nasdaq 100" },
                    { "proName": "FX_IDC:EURUSD", "title": "EUR/USD" },
                    { "proName": "FX:AUDUSD", "title": "AUD/USD" },
                    { "proName": "FX:USDJPY", "title": "USD/JPY" },
                    { "proName": "FX:GBPUSD", "title": "GBP/USD" },
                    { "proName": "BITSTAMP:BTCUSD", "title": "Bitcoin" },
                    { "proName": "BITSTAMP:ETHUSD", "title": "Ethereum" },
                    { "proName": "OANDA:XAUUSD", "title": "Gold" },
                    { "proName": "NASDAQ:NVDA", "title": "NVIDIA" },
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
});