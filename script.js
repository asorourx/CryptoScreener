document.addEventListener('DOMContentLoaded', async () => {
    // API Endpoints
    const EXCHANGE_INFO = 'https://fapi.binance.com/fapi/v1/exchangeInfo';
    const TICKER_API = 'https://fapi.binance.com/fapi/v1/ticker/24hr';
    const WS_URL = 'wss://fstream.binance.com/ws/!ticker@arr';
    const SPOT_EXCHANGE_INFO = 'https://api.binance.com/api/v3/exchangeInfo';
    const SPOT_TICKER_API = 'https://api.binance.com/api/v3/ticker/24hr';
    const SPOT_WS_URL = 'wss://stream.binance.com:9443/ws/!ticker@arr';
    
    // Add to your DOM Elements section
    const tradingViewToggleButton = document.createElement('button');
    tradingViewToggleButton.id = 'tradingViewToggleButton';
    tradingViewToggleButton.className = 'tradingview-toggle-button header-button';
    tradingViewToggleButton.textContent = 'Show Ticker';
    const tradingViewWidgetContainer = document.getElementById('tradingview-widget-container');
    
    // Application State
    let socket;
    let marketData = [];
    let pricePrecision = {};
    let previousPrices = {};
    let selectedPairData = {};
    let selectedPairs = new Set();
    let isPaused = false;
    let pauseStartTime = 0;
    let pauseTimerInterval;
    let maxPauseDuration = 3 * 60 * 1000;
    let visibleRows = 15;
    const MAX_ROWS = 25;
    const INITIAL_ROWS = 15;
    const ROWS_INCREMENT = 5;
    
    // Search State
    let searchSymbols = [];
    let searchActive = false;
    let selectedResultIndex = -1;
    
    // DOM Elements
    const loadingEl = document.getElementById('loading');
    const dataEl = document.getElementById('data');
    const pauseButton = document.getElementById('pauseButton');
    const pauseTimerEl = document.getElementById('pauseTimer');
    const showAllButton = document.getElementById('showAllButton');
    const refreshButton = document.getElementById('refreshButton');
    const highlightIcon = document.getElementById('highlightIcon');
    const highlightDropdown = document.getElementById('highlightDropdown');
    const showMoreButton = document.getElementById('showMoreButton');
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    
    
// Add this function to initialize the TradingView widget
function initializeTradingViewWidget() {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
        "symbols": [
            {
                "proName": "FOREXCOM:SPXUSD",
                "title": "S&P 500 Index"
            },
            {
                "proName": "FOREXCOM:NSXUSD",
                "title": "US 100 Cash CFD"
            },
            {
                "proName": "FX_IDC:EURUSD",
                "title": "EUR to USD"
            },
            {
                "proName": "BITSTAMP:BTCUSD",
                "title": "Bitcoin"
            },
            {
                "proName": "BITSTAMP:ETHUSD",
                "title": "Ethereum"
            },
            {
                "description": "xauusd",
                "proName": "OANDA:XAUUSD"
            },
            {
                "description": "USD to JPY",
                "proName": "FX:USDJPY"
            },
            {
                "description": "GBP to USD",
                "proName": "FX:GBPUSD"
            },
            {
                "description": "NVIDIA",
                "proName": "NASDAQ:NVDA"
            },
            {
                "description": "TESLA",
                "proName": "NASDAQ:TSLA"
            },
            {
                "description": "AUD to USD",
                "proName": "FX:AUDUSD"
            }
        ],
        "showSymbolLogo": true,
        "isTransparent": true,
        "displayMode": "regular",
        "colorTheme": "dark",
        "locale": "en"
    });
    
    tradingViewWidgetContainer.appendChild(script);
}

// Add this function to toggle the widget
function toggleTradingViewWidget() {
    if (tradingViewWidgetContainer.style.display === 'none') {
        tradingViewWidgetContainer.style.display = 'block';
        tradingViewToggleButton.textContent = 'Hide Ticker';
        if (!tradingViewWidgetContainer.querySelector('script')) {
            initializeTradingViewWidget();
        }
    } else {
        tradingViewWidgetContainer.style.display = 'none';
        tradingViewToggleButton.textContent = 'Show Ticker';
    }
}

    initializeTradingViewWidget();


// Add the button to the header (in the initialization section)
document.querySelector('.header-buttons').insertBefore(tradingViewToggleButton, pauseButton.nextSibling);

// Add event listener
tradingViewToggleButton.addEventListener('click', toggleTradingViewWidget);
    
    
    
    // Platform URLs
    const platformUrls = {
        binance: (symbol) => `https://www.binance.com/en/futures/${symbol}_USDT`,
        bybit: (symbol) => `https://www.bybit.com/trade/usdt/${symbol}USDT`,
        gateio: (symbol) => `https://www.gate.io/futures_trade/${symbol}_USDT`,
        tradingview: (symbol) => `https://www.tradingview.com/chart/?symbol=BINANCE:${symbol}USDT.P`
    };
    
    // Formatting Functions
    const format = {
        price: (symbol, val) => '$' + formatNumber(val, 2, pricePrecision[symbol] || 4),
        volume: (val) => {
            val = parseFloat(val);
            if (val > 1e9) return '$' + formatNumber(val/1e9, 2, 2) + 'B';
            if (val > 1e6) return '$' + formatNumber(val/1e6, 2, 2) + 'M';
            if (val > 1e3) return '$' + formatNumber(val/1e3, 2, 2) + 'K';
            return '$' + formatNumber(val, 2, 2);
        },


    dollarChange: (val) => {
        val = parseFloat(val);
        if (Math.abs(val) < 0.0001) return '±$0.00';  // Removed parentheses
        const absVal = Math.abs(val);
        if (absVal < 0.000001) return '$0.00';       // Removed parentheses
        
        let decimals = absVal >= 0.01 ? 2 : 
                     absVal >= 0.0001 ? 4 : 8;
        return (val >= 0 ? '+$' : '-$') + formatNumber(Math.abs(val), decimals, decimals); // Removed outer parentheses
    },


        percentChange: (val) => (parseFloat(val) >= 0 ? '+' : '') + parseFloat(val).toFixed(2) + '%',
        time: (ms) => {
            const seconds = Math.floor((ms / 1000) % 60);
            const minutes = Math.floor((ms / (1000 * 60)) % 60);
            return `${minutes}m ${seconds}s`;
        },
        priceDifference: (val) => {
            val = parseFloat(val);
            if (Math.abs(val) < 0.0001) return '±$0.00';
            const absVal = Math.abs(val);
            if (absVal < 0.000001) return '$0.00';
            
            let decimals = absVal >= 0.01 ? 2 : 
                         absVal >= 0.0001 ? 4 : 8;
            return (val >= 0 ? '+$' : '-$') + formatNumber(Math.abs(val), decimals, decimals);
        }
    };
    
    // Utility Functions
    function formatNumber(num, minDecimals = 2, maxDecimals = 8) {
        num = parseFloat(num);
        let decimals = minDecimals;
        if (num < 1) {
            const log10 = Math.floor(Math.log10(num));
            decimals = Math.min(Math.max(Math.abs(log10) + 1, minDecimals), maxDecimals);
        }
        return num.toLocaleString('en-US', {
            minimumFractionDigits: minDecimals,
            maximumFractionDigits: decimals
        });
    }
    
    function formatDollarDifference(val) {
        val = parseFloat(val);
        if (isNaN(val)) return 'N/A';
        
        const absVal = Math.abs(val);
        if (absVal < 0.000001) return '$0.00';
        
        let decimals = 2;
        if (absVal > 0 && absVal < 0.01) decimals = 6;
        else if (absVal < 0.1) decimals = 4;
        else if (absVal < 1) decimals = 3;
        
        const sign = val >= 0 ? '+$' : '-$';
        const formatted = Math.abs(val).toFixed(decimals);
        
        return sign + formatted.replace(/\.?0+$/, '');
    }
    
    // Search Functions
    async function initializeSearch() {
        try {
            // Fetch both spot and futures symbols in parallel
            const [spotResponse, futuresResponse] = await Promise.all([
                fetch(SPOT_EXCHANGE_INFO),
                fetch(EXCHANGE_INFO)
            ]);
            
            const [spotData, futuresData] = await Promise.all([
                spotResponse.json(),
                futuresResponse.json()
            ]);
            
            // Process spot symbols
            const spotSymbols = spotData.symbols
                .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
                .map(s => ({
                    symbol: s.baseAsset,
                    type: 'spot'
                }));
            
            // Process futures symbols
            const futuresSymbols = futuresData.symbols
                .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
                .map(s => ({
                    symbol: s.baseAsset,
                    type: 'futures'
                }));
            
            // Combine and dedupe (prioritize futures when both exist)
            const symbolMap = new Map();
            spotSymbols.forEach(s => symbolMap.set(s.symbol, s));
            futuresSymbols.forEach(s => symbolMap.set(s.symbol, s));
            
            searchSymbols = Array.from(symbolMap.values());
        } catch (error) {
            console.error('Error initializing search:', error);
            searchSymbols = FALLBACK_SYMBOLS.map(s => ({ symbol: s, type: 'futures' }));
        }
    }
    
    function showSearch() {
        const searchContainer = document.querySelector('.search-container');
        searchContainer.style.display = 'block';
        searchInput.focus();
        searchActive = true;
    }
    
    function hideSearch() {
        const searchContainer = document.querySelector('.search-container');
        searchContainer.style.display = 'none';
        searchInput.value = '';
        searchResults.innerHTML = '';
        searchActive = false;
        selectedResultIndex = -1;
    }
    
function renderSearchResults(results) {
    if (results.length === 0) {
        searchResults.innerHTML = '<div class="coin-item">No pairs found</div>';
        searchResults.style.display = 'block';
        return;
    }

    searchResults.innerHTML = results.map((item, index) => `
        <div class="coin-item ${index === selectedResultIndex ? 'selected' : ''}" 
             data-symbol="${item.symbol}" 
             data-type="${item.type}">
            <div class="coin-content">
                <span class="pair-name">${item.symbol}/USDT</span>
                <div class="platform-icons-container">
                    <img src="icons/binance.svg" alt="Binance" title="Open in Binance">
                    <img src="icons/bybit.svg" alt="Bybit" title="Open in Bybit">
                    <img src="icons/gateio.svg" alt="Gate.io" title="Open in Gate.io">
                    <img src="icons/tradingview.svg" alt="TradingView" title="Open in TradingView">
                </div>
            </div>
            <span class="market-type ${item.type === 'spot' ? 'spot-type' : 'futures-type'}">
                ${item.type === 'spot' ? 'SPOT' : 'FUTURES'}
            </span>
        </div>
    `).join('');

    // Add click event listeners
    document.querySelectorAll('.platform-icons-container img').forEach(img => {
        const symbol = img.closest('.coin-item').getAttribute('data-symbol');
        const platform = img.getAttribute('alt').toLowerCase();
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = platformUrls[platform](symbol);
            window.open(url);
        });
    });

    document.querySelectorAll('.coin-item').forEach(item => {
        item.addEventListener('click', () => {
            const symbol = item.getAttribute('data-symbol');
            const type = item.getAttribute('data-type');
            displayPairInfo(symbol, type);
            hideSearch();
        });
    });

    searchResults.style.display = 'block';
}

    
    function handleSearchInput() {
        const query = this.value.trim().toUpperCase();
        if (!query) {
            searchResults.innerHTML = '';
            selectedResultIndex = -1;
            return;
        }
        
        const filtered = searchSymbols.filter(item => 
            item.symbol.includes(query)
        ).slice(0, 10);
        
        renderSearchResults(filtered);
    }
    
    function selectSearchResult(index) {
        const results = document.querySelectorAll('#searchResults .coin-item');
        if (results.length === 0) return;
        
        // Remove previous selection
        if (selectedResultIndex >= 0 && selectedResultIndex < results.length) {
            results[selectedResultIndex].classList.remove('selected');
        }
        
        // Handle wrapping around
        if (index >= results.length) index = 0;
        if (index < 0) index = results.length - 1;
        
        selectedResultIndex = index;
        results[selectedResultIndex].classList.add('selected');
        results[selectedResultIndex].scrollIntoView({ block: 'nearest' });
    }
    
function executeSearchSelection() {
    const results = document.querySelectorAll('#searchResults .coin-item');
    if (selectedResultIndex >= 0 && selectedResultIndex < results.length) {
        const selected = results[selectedResultIndex];
        const symbol = selected.getAttribute('data-symbol');
        const type = selected.getAttribute('data-type');
        
        // Display the pair information
        displayPairInfo(symbol, type);
        
        // Try to find and highlight the pair in the main table if it exists
        const pairElement = document.querySelector(`[data-pair="${symbol}USDT"]`);
        if (pairElement) {
            togglePairSelection(`${symbol}USDT`);
            pairElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        hideSearch();
    }
}
    
    // Main Application Functions
    async function getSymbolPrecision() {
        try {
            const response = await fetch(EXCHANGE_INFO);
            const data = await response.json();
            data.symbols.forEach(symbol => {
                if (symbol.symbol.endsWith('USDT')) {
                    const filter = symbol.filters.find(f => f.filterType === 'PRICE_FILTER');
                    if (filter) {
                        const precision = filter.tickSize.indexOf('1') - 1;
                        pricePrecision[symbol.symbol] = Math.max(0, precision);
                    }
                }
            });
        } catch (error) {
            console.error('Error fetching precision data:', error);
        }
    }
    
    async function getMarketData() {
        try {
            const response = await fetch(TICKER_API);
            const data = await response.json();
            return data
                .filter(d => d.symbol.endsWith('USDT'))
                .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
                .slice(0, MAX_ROWS);
        } catch (error) {
            console.error('Error fetching market data:', error);
            return [];
        }
    }
    
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            console.log('Copied to clipboard:', text);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
    
    function togglePairSelection(pair) {
        if (selectedPairs.has(pair)) {
            selectedPairs.delete(pair);
            delete selectedPairData[pair];
        } else {
            selectedPairs.add(pair);
            const priceCell = document.querySelector(`[data-pair="${pair}"]`)?.closest('tr')?.querySelector('td:nth-child(3)');
            if (priceCell) {
                const priceText = priceCell.textContent.replace('$', '').replace(/,/g, '');
                selectedPairData[pair] = {
                    price: parseFloat(priceText),
                    timestamp: Date.now()
                };
            }
        }
        
        const pairElements = document.querySelectorAll(`[data-pair="${pair}"]`);
        pairElements.forEach(el => {
            el.classList.toggle('selected-pair', selectedPairs.has(pair));
            const row = el.closest('tr');
            if (row) {
                const volumeCell = row.querySelector('td:nth-child(5)');
                if (volumeCell) {
                    volumeCell.classList.toggle('selected-volume', selectedPairs.has(pair));
                    if (!selectedPairs.has(pair)) {
                        const timer = volumeCell.querySelector('.timer-with-diff');
                        if (timer) timer.remove();
                    }
                }
            }
        });
        
        updateHighlightIcon();
        updateDropdown();
        updateTimers();
    }
    
    function removeHighlightedPair(pair, event) {
        if (event) event.stopPropagation();
        
        selectedPairs.delete(pair);
        delete selectedPairData[pair];
        
        const pairElements = document.querySelectorAll(`[data-pair="${pair}"]`);
        pairElements.forEach(el => {
            el.classList.remove('selected-pair');
            const volumeCell = el.closest('tr')?.querySelector('td:nth-child(5)');
            if (volumeCell) {
                volumeCell.classList.remove('selected-volume');
                const timer = volumeCell.querySelector('.timer-with-diff');
                if (timer) timer.remove();
            }
        });
        
        updateHighlightIcon();
        updateDropdown();
    }
    
    function updateHighlightIcon() {
        highlightIcon.textContent = selectedPairs.size;
        if (selectedPairs.size === 0) {
            highlightDropdown.classList.remove('show');
        }
    }
    
    function updateHighlightDifferences() {
        const currentPrices = {};
        document.querySelectorAll('tr').forEach(row => {
            const pair = row.querySelector('[data-pair]')?.getAttribute('data-pair');
            const priceText = row.querySelector('td:nth-child(3)')?.textContent;
            if (pair && priceText) {
                currentPrices[pair] = parseFloat(priceText.replace('$', '').replace(/,/g, ''));
            }
        });

        const items = highlightDropdown.querySelectorAll('.highlight-item');
        items.forEach(item => {
            const pair = item.getAttribute('data-pair');
            if (pair && selectedPairData[pair] && currentPrices[pair]) {
                const diff = currentPrices[pair] - selectedPairData[pair].price;
                const diffElement = item.querySelector('.dollar-difference');
                if (diffElement) {
                    diffElement.textContent = formatDollarDifference(diff);
                    diffElement.className = `dollar-difference ${diff >= 0 ? 'up' : 'down'}`;
                }
            }
        });
    }
    
    function updateDropdown() {
        const currentPrices = {};
        document.querySelectorAll('tr').forEach(row => {
            const pair = row.querySelector('[data-pair]')?.getAttribute('data-pair');
            const priceText = row.querySelector('td:nth-child(3)')?.textContent;
            if (pair && priceText) {
                currentPrices[pair] = parseFloat(priceText.replace('$', '').replace(/,/g, ''));
            }
        });

        const highlightedPairs = Array.from(selectedPairs).map(pair => {
            const selectionData = selectedPairData[pair];
            const currentPrice = currentPrices[pair] || 0;
            const selectedPrice = selectionData?.price || currentPrice;
            const dollarDiff = currentPrice - selectedPrice;
            
            return {
                pair,
                baseSymbol: pair.replace('USDT', ''),
                dollarDiff,
                selectionTime: selectionData?.timestamp || Date.now()
            };
        }).sort((a, b) => a.selectionTime - b.selectionTime);

        highlightDropdown.innerHTML = `
            <div class="highlight-header">
                <span>Highlighted Pairs (${highlightedPairs.length})</span>
            </div>
            ${highlightedPairs.map(item => `
                <div class="highlight-item" data-pair="${item.pair}">
                    <span class="highlight-pair">${item.baseSymbol}</span>
                    <span class="dollar-difference ${item.dollarDiff >= 0 ? 'up' : 'down'}">
                        ${formatDollarDifference(item.dollarDiff)}
                    </span>
                    <span class="remove-highlight" onclick="event.stopPropagation(); window.removeHighlightedPair('${item.pair}', event)">×</span>
                </div>
            `).join('')}
        `;
    }
    
function formatTimer(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    
    if (hours > 0) {
        return `${hours}h`;
    }
    if (minutes > 0) {
        return `${minutes}m${seconds > 0 ? ` ${seconds}s` : ''}`;
    }
    return `${seconds}s`;
}
    
    function updateTimers() {
        if (isPaused) return;
        
        const now = Date.now();
        document.querySelectorAll('.selected-volume').forEach(el => {
            const row = el.closest('tr');
            if (!row) return;
            
            const pair = row.querySelector('.selected-pair')?.getAttribute('data-pair');
            if (!pair || !selectedPairData[pair]) return;
            
            const elapsed = now - selectedPairData[pair].timestamp;
            const currentPriceText = row.querySelector('td:nth-child(3)')?.textContent;
            const currentPrice = currentPriceText ? parseFloat(currentPriceText.replace('$', '').replace(/,/g, '')) : 0;
            const selectedPrice = selectedPairData[pair].price;
            const dollarDiff = currentPrice - selectedPrice;
            const changeClass = dollarDiff >= 0 ? 'up' : 'down';
            
            const existingTimer = el.querySelector('.timer-with-diff');
            if (existingTimer) {
                existingTimer.innerHTML = `
                    <span class="timer timer-${changeClass}">${formatTimer(elapsed)}</span>
                    <span class="timer-separator">|</span>
                    <span class="dollar-diff ${changeClass}">
                        ${format.priceDifference(dollarDiff)}
                    </span>
                `;
            } else {
                const timerElement = document.createElement('span');
                timerElement.className = `timer-with-diff`;
                timerElement.innerHTML = `
                    <span class="timer timer-${changeClass}">${formatTimer(elapsed)}</span>
                    <span class="timer-separator">|</span>
                    <span class="dollar-diff ${changeClass}">
                        ${format.priceDifference(dollarDiff)}
                    </span>
                `;
                el.appendChild(timerElement);
            }
        });
    }
    
    function togglePause() {
        if (isPaused) {
            resumeUpdates();
        } else {
            pauseUpdates();
        }
    }
    
    function pauseUpdates() {
        isPaused = true;
        pauseButton.textContent = 'Resume';
        pauseStartTime = Date.now();
        pauseTimerEl.style.display = 'block';
        
        if (socket) {
            socket.close();
        }
        
        pauseTimerInterval = setInterval(updatePauseTimer, 1000);
        updatePauseTimer();
    }
    
    function resumeUpdates() {
        isPaused = false;
        pauseButton.textContent = 'Pause';
        pauseTimerEl.style.display = 'none';
        
        clearInterval(pauseTimerInterval);
        connectWebSocket();
        updateTimers();
    }
    
    function updatePauseTimer() {
        const elapsed = Date.now() - pauseStartTime;
        pauseTimerEl.textContent = format.time(elapsed);
        
        if (elapsed >= maxPauseDuration) {
            resumeUpdates();
        }
    }
    
    function toggleShowAll() {
        if (visibleRows === MAX_ROWS) {
            visibleRows = INITIAL_ROWS;
            showAllButton.textContent = 'Show All';
        } else {
            visibleRows = MAX_ROWS;
            showAllButton.textContent = 'Collapse';
        }
        updateRowVisibility();
    }
    
function getPlatformIcons(symbol) {
    const baseSymbol = symbol.replace('USDT', '');
    return `
        <span class="platform-icons">
            <a href="${platformUrls.binance(baseSymbol)}" target="_blank" class="platform-icon" title="Open in Binance" onclick="event.stopPropagation(); copyToClipboard('${baseSymbol}')">
                <img src="icons/binance.svg" alt="Binance" class="platform-svg">
            </a>
            <a href="${platformUrls.bybit(baseSymbol)}" target="_blank" class="platform-icon" title="Open in Bybit" onclick="event.stopPropagation(); copyToClipboard('${baseSymbol}')">
                <img src="icons/bybit.svg" alt="Bybit" class="platform-svg">
            </a>
            <a href="${platformUrls.gateio(baseSymbol)}" target="_blank" class="platform-icon" title="Open in Gate.io" onclick="event.stopPropagation(); copyToClipboard('${baseSymbol}')">
                <img src="icons/gateio.svg" alt="Gate.io" class="platform-svg">
            </a>
            <a href="${platformUrls.tradingview(baseSymbol)}" target="_blank" class="platform-icon" title="Open in TradingView" onclick="event.stopPropagation(); copyToClipboard('${baseSymbol}')">
                <img src="icons/tradingview.svg" alt="TradingView" class="platform-svg">
            </a>
        </span>
    `;
}
    
    function updateShowMoreButton() {
        if (visibleRows >= MAX_ROWS) {
            showMoreButton.textContent = 'Show Less';
        } else {
            showMoreButton.textContent = 'Show More';
        }
    }
    
function toggleShowMore() {
    if (visibleRows >= MAX_ROWS) {
        visibleRows = 15; // Changed from INITIAL_ROWS to 15 for consistency
    } else {
        visibleRows = Math.min(visibleRows + ROWS_INCREMENT, MAX_ROWS);
    }
    updateRowVisibility();
    updateShowMoreButton();
}
    
    function updateRowVisibility() {
        const rows = dataEl.querySelectorAll('tr');
        rows.forEach((row, index) => {
            row.classList.toggle('hidden-row', index >= visibleRows);
        });
    }
    
    function renderData(data) {
        if (!data.length) return;
        loadingEl.style.display = 'none';
        
        const rows = data.map((item, index) => {
            const symbol = item.symbol;
            const currentPrice = parseFloat(item.lastPrice);
            const previousPrice = previousPrices[symbol];
            
            let changeHighlightClass = '';
            if (previousPrice !== undefined) {
                changeHighlightClass = currentPrice > previousPrice ? 'winning-change' : 'losing-change';
            }
            
            previousPrices[symbol] = currentPrice;
            
            const changeClass = parseFloat(item.priceChangePercent) >= 0 ? 'up' : 'down';
            const isSelected = selectedPairs.has(symbol);
            const isHidden = index >= visibleRows;
            
            return {
                ...item,
                changeHighlightClass,
                changeClass,
                position: index + 1,
                isSelected,
                isHidden
            };
        });
        
        dataEl.innerHTML = rows.map(item => {
            const baseSymbol = item.symbol.replace('USDT', '');
            let timerContent = '';
            
            if (item.isSelected && selectedPairData[item.symbol]) {
                const elapsed = Date.now() - selectedPairData[item.symbol].timestamp;
                const currentPrice = parseFloat(item.lastPrice);
                const selectedPrice = selectedPairData[item.symbol].price;
                const dollarDiff = currentPrice - selectedPrice;
                
                timerContent = `
                    <span class="timer-with-diff">
                        <span class="timer timer-${dollarDiff >= 0 ? 'up' : 'down'}">${formatTimer(elapsed)}</span>
                        <span class="timer-separator">|</span>
                        <span class="dollar-diff ${dollarDiff >= 0 ? 'up' : 'down'}">
                            ${format.priceDifference(dollarDiff)}
                        </span>
                    </span>
                `;
            }
            
            return `
                <tr class="${item.isHidden ? 'hidden-row' : ''}">
                    <td class="pair-number">${item.position}</td>
                    <td class="copyable ${item.isSelected ? 'selected-pair' : ''}" 
                         data-pair="${item.symbol}"
                         data-change="${item.changeClass}"
                         onclick="window.togglePairSelection('${item.symbol}'); copyToClipboard('${baseSymbol}')">
                        ${getPlatformIcons(item.symbol)}${baseSymbol}/USDT
                    </td>
                    <td class="copyable" onclick="copyToClipboard('${item.lastPrice}')">
                        ${format.price(item.symbol, item.lastPrice)}
                    </td>
                    <td class="${item.changeClass} ${item.changeHighlightClass} copyable" 
                        onclick="copyToClipboard('${item.priceChangePercent >= 0 ? '+' : ''}${item.priceChangePercent}%')">
                        <div class="change-container">
                            <span>${format.percentChange(item.priceChangePercent)}</span>
                            <span class="dollar-change">${format.dollarChange(item.priceChange)}</span>
                        </div>
                    </td>
                    <td class="copyable ${item.isSelected ? 'selected-volume' : ''}" onclick="copyToClipboard('${item.quoteVolume}')">
                        ${format.volume(item.quoteVolume)}${item.isSelected ? timerContent : ''}
                    </td>
                </tr>
            `;
        }).join('');
        
        updateShowMoreButton();
        updateHighlightDifferences();
    }
    
    function connectWebSocket() {
        if (isPaused) return;
        
        if (socket) {
            socket.close();
        }
        
        socket = new WebSocket(WS_URL);
        socket.onmessage = (event) => {
            if (isPaused) return;
            
            try {
                const newData = JSON.parse(event.data)
                    .filter(d => d.s.endsWith('USDT'))
                    .sort((a, b) => parseFloat(b.q) - parseFloat(a.q))
                    .slice(0, MAX_ROWS)
                    .map(item => ({
                        symbol: item.s,
                        lastPrice: item.c,
                        priceChangePercent: item.P,
                        priceChange: item.p,
                        quoteVolume: item.q
                    }));
                
                renderData(newData);
            } catch (error) {
                console.error('Error processing WebSocket data:', error);
            }
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            setTimeout(connectWebSocket, 5000);
        };
        
        socket.onclose = () => {
            if (!isPaused) {
                setTimeout(connectWebSocket, 5000);
            }
        };
    }
    
    function manualRefresh() {
        loadingEl.style.display = '';
        getMarketData().then(data => {
            renderData(data);
            if (!isPaused) {
                connectWebSocket();
            }
        }).catch(error => {
            console.error('Error during manual refresh:', error);
            loadingEl.style.display = 'none';
        });
    }
    
    // Event Listeners
    pauseButton.addEventListener('click', togglePause);
    showAllButton.addEventListener('click', toggleShowAll);
    refreshButton.addEventListener('click', manualRefresh);
    highlightIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        highlightDropdown.classList.toggle('show');
    });
    showMoreButton.addEventListener('click', toggleShowMore);
    searchInput.addEventListener('input', handleSearchInput);
    
    // Global Event Listeners
    document.addEventListener('click', (e) => {
        if (!highlightDropdown.contains(e.target) && e.target !== highlightIcon) {
            highlightDropdown.classList.remove('show');
        }
        
        if (!searchResults.contains(e.target) && e.target !== searchInput && searchActive) {
            hideSearch();
        }
    });
    

function displayPairInfo(symbol, type) {
    // Create or show the info container
    let infoContainer = document.getElementById('pairInfoContainer');
    if (!infoContainer) {
        infoContainer = document.createElement('div');
        infoContainer.id = 'pairInfoContainer';
        infoContainer.className = 'pair-info-container';
        document.getElementById('app').appendChild(infoContainer);
    }

    // Fetch and display data based on type (spot or futures)
    const apiUrl = type === 'spot' 
        ? `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`
        : `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}USDT`;



    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            const changeClass = parseFloat(data.priceChangePercent) >= 0 ? 'up' : 'down';
            
            // Create platform links
            const platformLinks = `
                <div class="platform-links">
                    <a href="https://www.binance.com/en/futures/${symbol}_USDT" target="_blank" class="platform-link" title="Open in Binance" onclick="event.stopPropagation(); copyToClipboard('${symbol}')">
                        <img src="icons/binance.svg" alt="Binance" class="platform-icon">
                        <span>Binance</span>
                    </a>
                    <a href="https://www.bybit.com/trade/usdt/${symbol}USDT" target="_blank" class="platform-link" title="Open in Bybit" onclick="event.stopPropagation(); copyToClipboard('${symbol}')">
                        <img src="icons/bybit.svg" alt="Bybit" class="platform-icon">
                        <span>Bybit</span>
                    </a>
                    <a href="https://www.gate.io/futures_trade/${symbol}_USDT" target="_blank" class="platform-link" title="Open in Gate.io" onclick="event.stopPropagation(); copyToClipboard('${symbol}')">
                        <img src="icons/gateio.svg" alt="Gate.io" class="platform-icon">
                        <span>Gate.io</span>
                    </a>
                    <a href="https://www.tradingview.com/chart/?symbol=BINANCE:${symbol}USDT.P" target="_blank" class="platform-link" title="Open in TradingView" onclick="event.stopPropagation(); copyToClipboard('${symbol}')">
                        <img src="icons/tradingview.svg" alt="TradingView" class="platform-icon">
                        <span>TradingView</span>
                    </a>
                </div>
            `;
            
            // Updated display with fixed formatting
            infoContainer.innerHTML = `
                <div class="pair-info-header">
                    <h3>${symbol}/USDT <span class="market-type ${type}-type">${type.toUpperCase()}</span></h3>
                    <button class="close-info" onclick="document.getElementById('pairInfoContainer').remove()">×</button>
                </div>
                <div class="pair-info-details">
                    <div class="detail-item">
                        <span class="detail-label">Price:</span>
                        <span class="detail-value">${format.price(symbol + 'USDT', data.lastPrice)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">24h Change:</span>
                        <span class="detail-value ${changeClass}">
                            ${format.percentChange(data.priceChangePercent)} ${format.dollarChange(data.priceChange)}
                        </span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">24h High:</span>
                        <span class="detail-value">${format.price(symbol + 'USDT', data.highPrice)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">24h Low:</span>
                        <span class="detail-value">${format.price(symbol + 'USDT', data.lowPrice)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">24h Volume:</span>
                        <span class="detail-value">${format.volume(data.quoteVolume)}</span>
                    </div>
                    <div class="platform-links-container">
                        <span class="detail-label">Platform Links:</span>
                        ${platformLinks}
                    </div>
                </div>
            `;
        })
        .catch(error => {
            console.error('Error fetching pair data:', error);
            infoContainer.innerHTML = `<div class="error">Failed to load data for ${symbol}</div>`;
        });
}



    document.addEventListener('keydown', (e) => {
        // Search activation
        if (e.key === '/' && !searchActive && e.target.tagName !== 'INPUT') {
            e.preventDefault();
            showSearch();
        }
        
        // Search navigation
        if (searchActive) {
            if (e.key === 'Escape') {
                e.preventDefault();
                hideSearch();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectSearchResult(selectedResultIndex + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectSearchResult(selectedResultIndex - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                executeSearchSelection();
            }
        }
    });
    
    // Expose functions to global scope for inline event handlers
    window.copyToClipboard = copyToClipboard;
    window.togglePairSelection = togglePairSelection;
    window.removeHighlightedPair = removeHighlightedPair;
    
    // Initialize
    try {
        await getSymbolPrecision();
        await initializeSearch();
        marketData = await getMarketData();
        renderData(marketData);
        connectWebSocket();
        
        setInterval(() => {
            updateTimers();
            updateHighlightDifferences();
        }, 1000);
    } catch (error) {
        console.error('Initialization error:', error);
        loadingEl.textContent = 'Error loading data. Please refresh.';
    }
});



// Expose functions to global scope for inline event handlers
window.copyToClipboard = copyToClipboard;
window.togglePairSelection = togglePairSelection;
window.removeHighlightedPair = removeHighlightedPair;
window.displayPairInfo = displayPairInfo; // Add this line
