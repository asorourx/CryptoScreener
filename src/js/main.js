// ULTRA-RELIABLE TRADING VIEWER SCRIPT
document.addEventListener('DOMContentLoaded', function() {
// ===== CONFIGURATION ===== 
const CONFIG = {
  isLoading: false,
  api: {
    spot: 'https://api.binance.com/api/v3',
    futures: 'https://fapi.binance.com/fapi/v1',
    ws: 'wss://fstream.binance.com/ws/!ticker@arr'
    // Removed backupWs array
  },
  connection: {
    maxRetries: Infinity,       // Keep infinite retries
    baseDelay: 1000,           // Faster 1s initial retry (V3 advantage)
    maxDelay: 10000,           // Capped at 10s (better than V2's 60s)
    pingInterval: 0,           // Keep disabled (Binance doesn't need it)
    staleTimeout: 0            // Keep disabled
  },
  defaults: {
    visiblePairs: 20,
    totalPairs: 100,
    highlightStorageKey: 'highlightedPairsData', // Key for localStorage
    highlightTimerInterval: 1000, // Update timer every second
    pricePrecision: {          // Keep your original precision rules
      'BTC': 2, 'ETH': 2, 'BNB': 2, 'SOL': 2,
      'XRP': 4, 'ADA': 4, 'DOGE': 4,
      '_default': 4
    }
  }
};


    // ===== STATE MANAGEMENT =====
const state = {
    data: [],
    socket: null,
    currentWsUrl: CONFIG.api.ws,
    isPaused: false,
    pinnedPairs: JSON.parse(localStorage.getItem('pinnedPairs')) || [],
    highlightedPairs: JSON.parse(localStorage.getItem(CONFIG.defaults.highlightStorageKey)) || {},
    highlightTimers: {},
    sortDirection: {  // MOVED OUT OF CONNECTION OBJECT
        volume: 'desc',
        change: null
    },
    visibleCount: CONFIG.defaults.visiblePairs,
    pauseStartTime: null,
    pauseTimer: null,
    connection: {
        status: 'disconnected',
        retryCount: 0,
        lastUpdate: null,
        lastPing: null,
        pingInterval: null
    }
};

    // ===== DOM ELEMENTS =====
    const elements = {
        tableBody: document.getElementById('data'),
        loadingIndicator: document.getElementById('loading'),
        pauseButton: document.getElementById('pauseButton'),
        refreshButton: document.getElementById('refreshButton'),
        showMoreButton: document.getElementById('showMoreButton'),
        connectionStatus: document.getElementById('connectionIndicator'),
        sortHeader: document.getElementById('sortHeader'),
        pairDetailModal: document.getElementById('pair-detail-modal'),
        pairTitle: document.getElementById('pair-title'),
        pairPrice: document.getElementById('pair-price'),
        pairHigh: document.getElementById('pair-high'),
        pairLow: document.getElementById('pair-low'),
        pairVolume: document.getElementById('pair-volume'),
        pair24hChange: document.getElementById('pair-24h-change'),
        pair12hChange: document.getElementById('pair-12h-change'),
        searchInput: document.getElementById('searchInput'),
        searchContainer: document.querySelector('.search-container'),
        searchResults: document.getElementById('searchResults'),
    };

// ===== FORMATTER =====
const formatter = {
    price: (value, symbol) => {
        const numValue = parseFloat(value);
        const base = symbol.replace('USDT', '');
        
        // Dynamic precision with existing rules as fallback
        let precision;
        if (numValue >= 1000) precision = 2;
        else if (numValue >= 1) precision = 4;
        else if (numValue >= 0.1) precision = 5;
        else if (numValue >= 0.01) precision = 6;
        else precision = 8;
        
        // Apply your existing precision rules where they exist
        if (CONFIG.defaults.pricePrecision[base]) {
            precision = Math.min(precision, CONFIG.defaults.pricePrecision[base]);
        }
        
        // Clean formatting
        let formatted = numValue.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: precision
        }).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.$/, '');
        
        return `$${formatted}`;
    },
    
    volume: (value) => {
        const num = parseFloat(value);
        if (num >= 1000000000) return `$${(num/1000000000).toFixed(1)}B`;
        if (num >= 1000000) return `$${(num/1000000).toFixed(1)}M`;
        if (num >= 1000) return `$${(num/1000).toFixed(1)}K`;
        return `$${num.toFixed(2)}`;
    },
    change: (value) => {
        return `${parseFloat(value) >= 0 ? '+' : ''}${parseFloat(value).toFixed(2)}%`;
    },
    timer: (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        let timeParts = [];
        if (hours > 0) timeParts.push(hours.toString().padStart(2, '0'));
        if (minutes > 0 || hours > 0) timeParts.push(minutes.toString().padStart(2, '0'));
        timeParts.push(secs.toString().padStart(2, '0'));
        
        return timeParts.join(':');
    },
    
    
dollarChange: (currentPrice, highlightPrice, symbol) => {
    const change = currentPrice - highlightPrice;
    const absChange = Math.abs(change);
    
    // Handle zero-change case
    if (absChange < 0.00000001) { // Near-zero threshold
        return {
            text: `$0.0`,
            colorClass: ''
        };
    }

    // Dynamic precision logic (keep your existing rules)
    const base = symbol.replace('USDT', '');
    let precision;
    if (absChange >= 1000) precision = 2;
    else if (absChange >= 1) precision = 4;
    else if (absChange >= 0.1) precision = 5;
    else if (absChange >= 0.01) precision = 6;
    else precision = 8;
    
    if (CONFIG.defaults.pricePrecision[base]) {
        precision = Math.min(precision, CONFIG.defaults.pricePrecision[base]);
    }
    
    // Format with trailing zero removal
    let formatted = absChange.toFixed(precision)
        .replace(/(\.\d*?[1-9])0+$/, '$1')
        .replace(/\.$/, '');
    
    return {
        text: `${change > 0 ? '+' : '-'}$${formatted}`,
        colorClass: change > 0 ? 'up' : 'down'
    };
}
};

// ===== CONNECTION MANAGER =====
    // ===== CONNECTION MANAGER =====
    const connectionManager = {
        connect: function() {
            // Clear any existing connection
            if (state.socket) {
                state.socket.onopen = null;
                state.socket.onclose = null;
                state.socket.onerror = null;
                state.socket.close();
            }

            // Use AbortController for better cleanup
            const abortController = new AbortController();
            state.abortController = abortController;

            state.connection.status = 'connecting';
            ui.updateConnectionStatus();

            state.socket = new WebSocket(state.currentWsUrl);
            state.socket.binaryType = 'arraybuffer';

            state.socket.onopen = () => {
                if (abortController.signal.aborted) return;
                state.connection.status = 'connected';
                state.connection.retryCount = 0;
                state.connection.lastUpdate = Date.now();
                ui.updateConnectionStatus();
                dataManager.loadInitialData();
            };

            state.socket.onmessage = (e) => {
                if (abortController.signal.aborted) return;
                try {
                    const data = JSON.parse(e.data);
                    state.connection.lastUpdate = Date.now();
                    if (!state.isPaused) {
                        dataManager.processMarketData(data);
                    }
                } catch (err) {
                    console.error('Error parsing WebSocket message:', err);
                }
            };

            state.socket.onclose = (e) => {
                if (abortController.signal.aborted) return;
                this.handleDisconnection();
            };

            state.socket.onerror = (e) => {
                if (abortController.signal.aborted) return;
                this.handleDisconnection();
            };
        },

        handleDisconnection: function() {
            if (state.isPaused) return;
            state.connection.status = 'disconnected';
            ui.updateConnectionStatus();
            this.stopHeartbeat();
            this.scheduleReconnection();
        },

        scheduleReconnection: function() {
            state.connection.retryCount++;
            const delay = Math.min(
                CONFIG.connection.baseDelay * Math.pow(2, state.connection.retryCount),
                CONFIG.connection.maxDelay
            );

            state.connection.status = 'reconnecting';
            ui.updateConnectionStatus();

            setTimeout(() => {
                if (!state.isPaused) this.connect();
            }, delay);
        },

        startHeartbeat: function() {
            this.stopHeartbeat();
        },

        stopHeartbeat: function() {
            if (state.connection.pingInterval) {
                clearInterval(state.connection.pingInterval);
                state.connection.pingInterval = null;
            }
            if (state.pauseTimer) {
                clearInterval(state.pauseTimer);
                state.pauseTimer = null;
            }
        },

        checkStalePairs: function() {
            const STALE_THRESHOLD = 3600000;
            const now = Date.now();
            
            state.data.forEach(pair => {
                if (!pair.lastUpdated || (now - pair.lastUpdated > STALE_THRESHOLD)) {
                    fetch(`${CONFIG.api.futures}/ticker/24hr?symbol=${pair.symbol}`)
                        .then(res => {
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            return res.json();
                        })
                        .then(freshData => {
                            if (freshData?.E && (!pair.lastUpdated || freshData.E > pair.lastUpdated)) {
                                Object.assign(pair, {
                                    lastPrice: freshData.lastPrice,
                                    priceChangePercent: freshData.priceChangePercent,
                                    quoteVolume: freshData.quoteVolume,
                                    lastUpdated: freshData.E,
                                    hadUpdate: true
                                });
                                ui.renderTable();
                            }
                        })
                        .catch(err => console.warn(`Stale refresh failed for ${pair.symbol}:`, err));
                }
            });
        },

        cleanup: function() {
            if (state.stalePairInterval) {
                clearInterval(state.stalePairInterval);
                state.stalePairInterval = null;
            }
        }
    };
    // ===== DATA MANAGER =====
    const dataManager = {
loadInitialData: async () => {
    if (state.isLoading) return;
    state.isLoading = true;
    
    try {
    //  ui.showLoading('Loading market data...');
        const response = await fetch(`${CONFIG.api.futures}/ticker/24hr`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const marketData = await response.json();
        state.data = marketData
            .filter(item => item.symbol.endsWith('USDT'))
            .map(item => ({
                ...item,
                hadUpdate: false,
                updateDirection: null
            }));
            
        // Apply initial sort
        state.data.sort((a, b) => b.quoteVolume - a.quoteVolume);
        state.data = state.data.slice(0, CONFIG.defaults.totalPairs);
        
        ui.renderTable();
    } catch (error) {
        console.error('Initial data load failed:', error);
        // Geo issues; VPN Required! 
        ui.showLoading('Connect to VPN - retrying...');
        setTimeout(dataManager.loadInitialData, 5000);
    } finally {
        state.isLoading = false;
    }
},

processMarketData: (marketData) => {
    if (!Array.isArray(marketData)) return;

    const now = Date.now();
    const STALE_THRESHOLD = 300000; // 5 minutes
    const updates = new Map();

    // Single loop through market data
    marketData.forEach(item => {
        // Validate item
        if (!item.s || !item.c || !item.E) return;
        
        // Check freshness
        const lastUpdateAge = now - item.E;
        if (lastUpdateAge > STALE_THRESHOLD) {
            console.warn(`Stale data for ${item.s}: ${lastUpdateAge}ms old`);
            return;
        }

        // Store valid updates
        updates.set(item.s, {
            price: item.c,
            change: item.P,
            volume: item.q,
            timestamp: item.E // Using the exchange's timestamp
        });
    });

    // Update state
    state.data = state.data.map(item => {
        const update = updates.get(item.symbol);
        if (!update) return item;
        
        return {
            ...item,
            lastPrice: update.price,
            priceChangePercent: update.change,
            quoteVolume: update.volume,
            lastUpdated: update.timestamp,
            hadUpdate: true,
            updateDirection: parseFloat(update.price) > parseFloat(item.lastPrice || 0) ? 'up' : 'down'
        };
    });

    ui.renderTable();
}
};
    
    
// ===== DEBOUNCE HELPER =====
function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ===== SEARCH MANAGER =====
const searchManager = {
    init: function () {
        // Keyboard shortcut to open search
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                this.showSearch();
            } else if (e.key === 'Escape' && elements.searchContainer.style.display === 'block') {
                e.preventDefault();
                this.hideSearch();
            }
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!elements.searchContainer.contains(e.target) &&
                elements.searchContainer.style.display === 'block') {
                this.hideSearch();
            }
        });

        // Debounced search input
        elements.searchInput.addEventListener('input', debounce((e) => {
            const query = e.target.value.trim().toUpperCase();
            if (!query) {
                elements.searchResults.innerHTML = '';
                return;
            }

            const filtered = state.data.filter(item =>
                item.symbol.includes(query) ||
                item.symbol.replace('USDT', '').includes(query)
            ).slice(0, 10);

            this.renderResults(filtered);
        }, 300));
    },

    showSearch: function () {
        elements.searchContainer.style.display = 'block';
        elements.searchInput.focus();
        elements.searchInput.value = '';
        elements.searchResults.innerHTML = '';
    },

    hideSearch: function () {
        elements.searchContainer.style.display = 'none';
        elements.searchInput.value = '';
        elements.searchResults.innerHTML = '';
    },

    renderResults: function (results) {
        if (results.length === 0) {
            elements.searchResults.innerHTML = '<div class="no-results">No matching pairs found</div>';
            elements.searchResults.style.display = 'block';
            return;
        }

        elements.searchResults.innerHTML = results.map(item => `
            <div class="coin-item" data-symbol="${item.symbol}">
                <div class="coin-content">
                    <span class="pair-name">${item.symbol.replace('USDT', '')}/USDT</span>
                    ${getPlatformIcons(item.symbol)}
                </div>
                <span class="price">${formatter.price(item.lastPrice, item.symbol)}</span>
            </div>
        `).join('');

        elements.searchResults.style.display = 'block';

        document.querySelectorAll('.coin-item').forEach(item => {
            item.addEventListener('click', () => {
                const symbol = item.getAttribute('data-symbol');
                searchManager.handleSelect(symbol);
                this.hideSearch();
            });
        });
    },

    handleSelect: function (symbol) {
        const isHighlighted = state.highlightedPairs[symbol]?.isHighlighted;
        const row = document.querySelector(`tr[data-symbol="${symbol}"]`);

        if (isHighlighted) {
            // Scroll to the highlighted pair
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            // Not highlighted
            if (!state.pinnedPairs.includes(symbol)) {
                state.pinnedPairs.push(symbol);
                localStorage.setItem('pinnedPairs', JSON.stringify(state.pinnedPairs));
            }

            ui.toggleHighlight(symbol); // This both highlights and copies price
            ui.renderTable(() => {
                const pinnedRow = document.querySelector(`tr[data-symbol="${symbol}"]`);
                if (pinnedRow) {
                    pinnedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
    }
};

        
// ===== UI MANAGER =====
const ui = {
    // ===== LOADING INDICATOR =====
    showLoading: (message) => {
        elements.loadingIndicator.textContent = message;
    },

    // ===== TABLE RENDERING =====
    renderTable: (callback) => {    
        // Sort data
const sortedData = [...state.data];
    if (state.sortDirection.volume === 'asc') {
        sortedData.sort((a, b) => a.quoteVolume - b.quoteVolume);
    } else if (state.sortDirection.volume === 'desc') {
        sortedData.sort((a, b) => b.quoteVolume - a.quoteVolume);
    } else if (state.sortDirection.change === 'asc') {
        sortedData.sort((a, b) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent));
    } else if (state.sortDirection.change === 'desc') {
        sortedData.sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent));
}

        // Apply pinning
        const pinned = sortedData.filter(item => state.pinnedPairs.includes(item.symbol));
        const unpinned = sortedData.filter(item => !state.pinnedPairs.includes(item.symbol));
        const displayData = [...pinned, ...unpinned].slice(0, state.visibleCount);
        
        // Generate table rows
elements.tableBody.innerHTML = displayData.map((item, index) => {
    const isPinned = state.pinnedPairs.includes(item.symbol);
    const isHighlighted = state.highlightedPairs[item.symbol];
    const updateClass = item.hadUpdate ? `update-${item.updateDirection}` : '';
    const changeClass = item.priceChangePercent >= 0 ? 'up' : 'down';
    
    return `
    <tr data-symbol="${item.symbol}" class="${updateClass} ${isPinned ? 'pinned-row' : ''}">
        <td>
            ${index + 1}
        </td>
        <td>
            <span class="pin-icon" data-symbol="${item.symbol}">
                ${isPinned ? '📌' : '🔅'}
            </span>
            ${item.symbol.replace('USDT', '')}
        </td>
        <td class="${isHighlighted ? 'highlighted' : ''}">
            ${formatter.price(item.lastPrice, item.symbol)}
        </td>
        <td class="${changeClass}">
            ${formatter.change(item.priceChangePercent)}
        </td>
        <td>${formatter.volume(item.quoteVolume)}</td>
    </tr>
    `;
}).join('');

        elements.loadingIndicator.textContent = '';
        ui.attachRowEvents();
        
// ===== NEW SORT INDICATORS CODE =====
const volumeHeader = document.getElementById('sortHeader');
const changeHeader = document.getElementById('changeHeader');

// Clear all active states
volumeHeader.classList.remove('sort-active');
changeHeader.classList.remove('sort-active');

if (state.sortDirection.volume) {
    volumeHeader.classList.add('sort-active');
    volumeHeader.querySelector('.sort-indicator').textContent = 
        state.sortDirection.volume === 'desc' ? '↓' : '↑';
    changeHeader.querySelector('.sort-indicator').textContent = '';
} 
else if (state.sortDirection.change) {
    changeHeader.classList.add('sort-active');
    changeHeader.querySelector('.sort-indicator').textContent = 
        state.sortDirection.change === 'desc' ? '↓' : '↑';
    volumeHeader.querySelector('.sort-indicator').textContent = '';
}
else {
    volumeHeader.querySelector('.sort-indicator').textContent = '';
    changeHeader.querySelector('.sort-indicator').textContent = '';
}
        //==Update highlight timers for all highlighted pairs==
        Object.keys(state.highlightedPairs).forEach(symbol => {
        if (state.highlightedPairs[symbol]?.isHighlighted) {
            ui.updateHighlightTimer(symbol);
        }
    });        
        // Execute callback after render is complete
        if (callback && typeof callback === 'function') {
            setTimeout(callback, 0);
        }
    },

attachRowEvents: () => {
    document.querySelectorAll('#data tr').forEach(row => {
        row.addEventListener('click', (e) => {
            const symbol = row.getAttribute('data-symbol');
            const target = e.target;
            
            // Click on pin icon - toggle pin
            if (target.classList.contains('pin-icon')) {
                ui.togglePin(symbol);
            } 
            // Click on price cell (3rd column) - highlight and copy
            else if (target.closest('td:nth-child(3)')) {
                ui.toggleHighlight(symbol, true);
            }
            // Click on pair name cell (2nd column) - toggle pin
            else if (target.closest('td:nth-child(2)')) {
                ui.togglePin(symbol);
            }
            // Click on # column (1st column) - toggle pin
            else if (target.closest('td:nth-child(1)')) {
                ui.togglePin(symbol);
            }
            // Explicitly ignore clicks on 4th and 5th columns
            else if (!target.closest('td:nth-child(4)') && !target.closest('td:nth-child(5)')) {
                // Only highlight if clicking row background (not any specific cell)
                ui.toggleHighlight(symbol);
            }
        });
    });
},

    // ===== PIN/HIGHLIGHT MANAGEMENT =====
    togglePin: (symbol) => {
        const index = state.pinnedPairs.indexOf(symbol);
        if (index === -1) {
            state.pinnedPairs.push(symbol);
        } else {
            state.pinnedPairs.splice(index, 1);
        }
        localStorage.setItem('pinnedPairs', JSON.stringify(state.pinnedPairs));
        ui.renderTable();
    },

toggleHighlight: (symbol, fromPriceClick = false) => {
    const row = document.querySelector(`tr[data-symbol="${symbol}"]`);
    if (!row) return;

    const isHighlighted = !state.highlightedPairs[symbol]?.isHighlighted;
    
    // Initialize or update highlight data
    if (isHighlighted) {
        const currentPrice = parseFloat(state.data.find(item => item.symbol === symbol)?.lastPrice);
        state.highlightedPairs[symbol] = {
            isHighlighted: true,
            highlightTime: Date.now(),
            highlightPrice: currentPrice
        };
        
        // Start timer for this pair
        state.highlightTimers[symbol] = setInterval(() => {
            ui.updateHighlightTimer(symbol);
        }, CONFIG.defaults.highlightTimerInterval);
        
        // Copy price if clicked from price cell
        if (fromPriceClick) {
            const priceCell = row.querySelector('td:nth-child(3)');
            if (priceCell) {
                const priceText = priceCell.textContent.trim();
                navigator.clipboard.writeText(priceText.replace(/[^\d.]/g, ''));
                ui.showTempMessage(`Copied: ${priceText}`);
            }
        }
    } else {
        // Clear highlight and timer
        clearInterval(state.highlightTimers[symbol]);
        delete state.highlightTimers[symbol];
        delete state.highlightedPairs[symbol];
    }
    
    // Save to localStorage
    localStorage.setItem(CONFIG.defaults.highlightStorageKey, JSON.stringify(state.highlightedPairs));
    
    // Update the display
    ui.renderTable();
},

    // 24H Volume [$DollarChange | Timer]
updateHighlightTimer: (symbol) => {
    const row = document.querySelector(`tr[data-symbol="${symbol}"]`);
    if (!row) return;

    const highlightData = state.highlightedPairs[symbol];
    if (!highlightData) return;

    const currentItem = state.data.find(item => item.symbol === symbol);
    if (!currentItem) return;

    const currentPrice = parseFloat(currentItem.lastPrice);
    const secondsElapsed = Math.floor((Date.now() - highlightData.highlightTime) / 1000);
    const dollarChange = formatter.dollarChange(currentPrice, highlightData.highlightPrice, symbol);
    const fullTimerText = new Date(secondsElapsed * 1000).toISOString().substr(11, 8);

    // Pad both values for alignment (same logic, no inline style)
    const paddedChange = dollarChange.text.padEnd(11, ' ');
    const paddedTimer = fullTimerText.padStart(9, ' ');

    const volumeCell = row.querySelector('td:nth-child(5)');
    if (volumeCell) {
        const originalVolume = formatter.volume(currentItem.quoteVolume);
        volumeCell.innerHTML = `
            <span class="volume-container monospace">
                <span class="volume-value">${originalVolume}</span>
                <span class="highlight-container">
                    [<span class="dollar-change ${dollarChange.colorClass}">${paddedChange}</span>
                    <span class="highlight-separator">|</span>
                    <span class="highlight-timer">${paddedTimer}</span> ]
                </span>
            </span>
        `;
    }
},


    // ===== NOTIFICATION SYSTEM =====
    showTempMessage: function(message, duration = 2000) {
        // Remove any existing temp message
        const existingMsg = document.querySelector('.temp-message');
        if (existingMsg) existingMsg.remove();
        
        // Create and show new message
        const msgElement = document.createElement('div');
        msgElement.className = 'temp-message';
        msgElement.textContent = message;
        document.body.appendChild(msgElement);
        
        // Auto-remove after duration
        setTimeout(() => {
            msgElement.classList.add('fade-out');
            setTimeout(() => msgElement.remove(), 300);
        }, duration);
    },

    // ===== CONNECTION STATUS =====
updateConnectionStatus: () => {
    const statusMap = {
        'connected': ['🟢', 'connected'],
        'disconnected': ['🔴', 'disconnected'],
        'connecting': ['🟡', 'connecting...'],
        'reconnecting': ['🟠', `Retrying (${state.connection.retryCount + 1})`],
        'error': ['⚠️', 'Error'],
        'paused': ['⏸️', 'P']
    };

    const status = state.isPaused ? 'paused' : state.connection.status;
    let [emoji, statusText] = statusMap[status] || ['❓', 'Unknown'];

    // Special handling for paused state with timer
    if (state.isPaused) {
        const pausedSeconds = Math.floor((Date.now() - state.pauseStartTime) / 1000);
        const minutes = Math.floor(pausedSeconds / 60).toString().padStart(2, '0');
        const seconds = (pausedSeconds % 60).toString().padStart(2, '0');
        //Pause Message Orignaally         statusText = `Paused: ${minutes}:${seconds}`;
        statusText = `${minutes}:${seconds}`;
    }

    // Update connection status element
    elements.connectionStatus.innerHTML = `
        <span class="connection-status ${status}">
            ${emoji}
            <span class="tooltip">${statusText}</span>
        </span>
    `;

    // Update title with simplified paused format
        document.title = state.isPaused ?
        `${statusText}` :
        `${statusText}`;
    
    // Update favicon
    ui.updateFavicon(status);
},

updateFavicon: (status) => {
    const iconMap = {
        'connected': '🟢',
        'disconnected': '🔴',
        'connecting': '🟡',
        'reconnecting': '🟠',
        'error': '⚠️',
        'paused': '⏸️'
    };
    
    const emoji = iconMap[status] || '❓';
    
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '48px emoji, serif';
    ctx.fillText(emoji, 8, 52);
    
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
    }
    favicon.href = canvas.toDataURL('image/png');
},

    // ===== CONTROLS SETUP =====
    setupControls: () => {
        // Set default visible pairs
        state.visibleCount = 20;
        // Pair visibility controls
        const showMorePairs = () => {
            const previousCount = state.visibleCount;
            state.visibleCount = Math.min(state.visibleCount + 5, CONFIG.defaults.totalPairs);
            
            if (state.visibleCount !== previousCount) {
                ui.renderTable(() => {
                    const rows = document.querySelectorAll('#data tr');
                    if (rows.length > 0) {
                        rows[rows.length - 1].scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest'
                        });
                    }
                    ui.showTempMessage(`Showing ${state.visibleCount} pairs`);
                });
            }
        };

        const showLessPairs = () => {
            const previousCount = state.visibleCount;
            state.visibleCount = Math.max(state.visibleCount - 5, 5);
            
            if (state.visibleCount !== previousCount) {
                const lastVisibleRow = document.querySelector(`#data tr:nth-child(${state.visibleCount})`);
                const lastRowPosition = lastVisibleRow ? lastVisibleRow.getBoundingClientRect().top : 0;
                
                ui.renderTable(() => {
                    if (state.visibleCount > 5) {
                        const newLastRow = document.querySelector(`#data tr:nth-child(${state.visibleCount})`);
                        if (newLastRow) {
                            const currentPosition = newLastRow.getBoundingClientRect().top;
                            window.scrollBy({
                                top: currentPosition - lastRowPosition,
                                behavior: 'smooth'
                            });
                        }
                    } else {
                        window.scrollTo({
                            top: 0,
                            behavior: 'smooth'
                        });
                    }
                    // ui.showTempMessage(`Showing ${state.visibleCount} pairs`); // Just message "Showing 5 pairs"
                });
            }
        };

        // Button event listeners
        elements.pauseButton.addEventListener('click', function() {
            state.isPaused = !state.isPaused;
            
            this.textContent = state.isPaused ? 'R' : 'P'; // PAUSE, PAUSED, RESUME, RESUME
            if (state.isPaused) {
                state.pauseStartTime = Date.now();
                state.connection.status = 'paused';
                connectionManager.stopHeartbeat();
                
                state.pauseTimer = setInterval(() => {
                    ui.updateConnectionStatus();
                }, 1000);
            } else {
                if (state.pauseTimer) {
                    clearInterval(state.pauseTimer);
                    state.pauseTimer = null;
                }
                connectionManager.connect();
            }
            ui.updateConnectionStatus();
        });

elements.refreshButton.addEventListener('click', () => {
    if (!state.isPaused && !state.isLoading) {
        dataManager.loadInitialData();
        state.connection.status = 'connected';
        ui.updateConnectionStatus();
    }
});

        elements.showMoreButton.addEventListener('click', showMorePairs);

        // Keyboard shortcuts
// Keyboard shortcuts (keep this as is)
document.addEventListener('keydown', (e) => {
    // Ignore spacebar if typing in inputs
    if (e.target.tagName === 'INPUT' || document.querySelector('.search-container.active')) {
        return;
    }
    
    if (e.code === 'Space') {
        e.preventDefault();
        // Directly toggle pause state instead of simulating click
        state.isPaused = !state.isPaused;
        elements.pauseButton.textContent = state.isPaused ? 'R' : 'P'; // PAUSE, PAUSED, RESUME, RESUME
        
        if (state.isPaused) {
            state.pauseStartTime = Date.now();
            connectionManager.stopHeartbeat();
            
            // Start the pause timer
            state.pauseTimer = setInterval(() => {
                ui.updateConnectionStatus();
            }, 1000);
        } else {
            if (state.pauseTimer) {
                clearInterval(state.pauseTimer);
                state.pauseTimer = null;
            }
            connectionManager.connect();
        }
        
        ui.updateConnectionStatus();
        return;
    }
    
    if (e.key === 'm' || e.key === 'M') showMorePairs();
    else if (e.key === 'l' || e.key === 'L') showLessPairs();
});


const upControl = document.querySelector('.mobile-control.up');
const downControl = document.querySelector('.mobile-control.down');

if (upControl && downControl) {
    upControl.addEventListener('click', showLessPairs);
    downControl.addEventListener('click', showMorePairs);
} 
        

    // Volume sort control
elements.sortHeader.addEventListener('click', function(e) {
    // Only trigger sort if clicking on the volume text (not buttons)
    if (e.target.closest('.volume-text') || 
        (!e.target.closest('.header-buttons') && !e.target.closest('button'))) {
        
        // Original sort logic
        if (!state.sortDirection.volume) {
            state.sortDirection = { volume: 'desc', change: null };
        } else {
            state.sortDirection.volume = state.sortDirection.volume === 'desc' ? 'asc' : null;
        }
        ui.renderTable();
    }
});

    // 24H % Change sort control - NEW CODE
    document.getElementById('changeHeader').addEventListener('click', () => {
        // Toggle change sorting (desc → asc → none → desc...)
        if (!state.sortDirection.change) {
            state.sortDirection = { volume: null, change: 'desc' };
        } else {
            state.sortDirection.change = state.sortDirection.change === 'desc' ? 'asc' : null;
        }
        ui.renderTable();
        });
    }
};

//Make sure to clear the timer when the page is unloading.
window.addEventListener('beforeunload', () => {
    connectionManager.cleanup();
    if (state.pauseTimer) {
        clearInterval(state.pauseTimer);
    }
    if (state.connection.pingInterval) {
        clearInterval(state.connection.pingInterval);
    }
});


// ===== INITIALIZATION =====
    const init = () => {
        document.title = "🟡 • Loading...";
        ui.setupControls();
        connectionManager.connect();
        searchManager.init();
    };
    // Cleanup
    window.addEventListener('beforeunload', () => {
        // Clear highlight timers
        Object.keys(state.highlightTimers).forEach(symbol => {
            clearInterval(state.highlightTimers[symbol]);
        });
        state.highlightTimers = {};

        // Cleanup connection
        connectionManager.cleanup();
        if (state.abortController) {
            state.abortController.abort();
        }
        if (state.pauseTimer) {
            clearInterval(state.pauseTimer);
        }
    });

    init();
});