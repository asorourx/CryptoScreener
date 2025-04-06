// ULTRA-RELIABLE TRADING VIEWER SCRIPT
document.addEventListener('DOMContentLoaded', function() {
// ===== CONFIGURATION ===== 
const CONFIG = {
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
        sortDirection: 'volume-desc',
        visibleCount: CONFIG.defaults.visiblePairs,
        pauseStartTime: null,  // Add this line
        pauseTimer: null,      // Add this line
  connection: {                // Modified connection state
    status: 'disconnected',    // Same status indicators
    retryCount: 0,
    lastUpdate: null,
    lastPing: null,
    pingInterval: null,
    // Removed backupIndex
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
    },  // <-- Add comma here
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
const connectionManager = {
    connect: () => {
        // Clear any existing connection
        if (state.socket) {
            state.socket.onopen = null;
            state.socket.onclose = null;
            state.socket.onerror = null;
            state.socket.close();
        }

        state.connection.status = 'connecting';
        ui.updateConnectionStatus();

        console.log(`Connecting to ${state.currentWsUrl} (attempt ${state.connection.retryCount + 1})`);

        state.socket = new WebSocket(state.currentWsUrl);

        state.socket.onopen = () => {
            console.log('WebSocket connected successfully');
            state.connection.status = 'connected';
            state.connection.retryCount = 0;
            state.connection.lastUpdate = Date.now();
            ui.updateConnectionStatus();
            connectionManager.startHeartbeat();
            dataManager.loadInitialData();
            
            // Start stale pair checker (only if not already running)
            if (!state.stalePairInterval) {
                state.stalePairInterval = setInterval(
                    () => connectionManager.checkStalePairs(),
                    900000 // 15 minutes
                );
            }
        };

        state.socket.onmessage = (e) => {
            state.connection.lastUpdate = Date.now();
            if (!state.isPaused) {
                dataManager.processMarketData(JSON.parse(e.data));
            }
        };

        state.socket.onclose = (e) => {
            console.log(`Connection closed: ${e.code} ${e.reason}`);
            connectionManager.handleDisconnection();
        };

        state.socket.onerror = (e) => {
            console.error('WebSocket error:', e);
            connectionManager.handleDisconnection();
        };
    },

    handleDisconnection: () => {
        if (state.isPaused) return;

        state.connection.status = 'disconnected';
        ui.updateConnectionStatus();
        connectionManager.stopHeartbeat();
        connectionManager.scheduleReconnection();
    },

    scheduleReconnection: () => {
        state.connection.retryCount++;
        
        const delay = Math.min(
            CONFIG.connection.baseDelay * Math.pow(2, state.connection.retryCount),
            CONFIG.connection.maxDelay
        );

        console.log(`Retrying in ${delay}ms (attempt ${state.connection.retryCount + 1})`); 
        state.connection.status = 'reconnecting';
        ui.updateConnectionStatus();

        setTimeout(() => {
            if (!state.isPaused) connectionManager.connect();
        }, delay);
    },

    startHeartbeat: () => {
        connectionManager.stopHeartbeat();
        // Ping-Pong disabled for Binance
    },

    stopHeartbeat: () => {
        if (state.connection.pingInterval) {
            clearInterval(state.connection.pingInterval);
            state.connection.pingInterval = null;
        }
        if (state.pauseTimer) {
            clearInterval(state.pauseTimer);
            state.pauseTimer = null;
        }
    },

    // NEW METHOD: Stale Pair Checker
    checkStalePairs: () => {
        const STALE_THRESHOLD = 3600000; // 1 hour
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

    // NEW METHOD: Cleanup
    cleanup: () => {
        if (state.stalePairInterval) {
            clearInterval(state.stalePairInterval);
            state.stalePairInterval = null;
        }
    }
};
    // ===== DATA MANAGER =====
    const dataManager = {
        loadInitialData: async () => {
            try {
                //ui.showLoading('Loading market data...');
                const response = await fetch(`${CONFIG.api.futures}/ticker/24hr`);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const marketData = await response.json();
                state.data = marketData
                    .filter(item => item.symbol.endsWith('USDT'))
                    .sort((a, b) => b.quoteVolume - a.quoteVolume)
                    .slice(0, CONFIG.defaults.totalPairs)
                    .map(item => ({
                        ...item,
                        hadUpdate: false,
                        updateDirection: null
                    }));

                ui.renderTable();
            } catch (error) {
                console.error('Initial data load failed:', error);
                ui.showLoading('Data load failed - retrying...');
                setTimeout(dataManager.loadInitialData, 5000);
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
        if (state.sortDirection === 'volume-asc') {
            sortedData.sort((a, b) => a.quoteVolume - b.quoteVolume);
        }

        // Apply pinning
        const pinned = sortedData.filter(item => state.pinnedPairs.includes(item.symbol));
        const unpinned = sortedData.filter(item => !state.pinnedPairs.includes(item.symbol));
        const displayData = [...pinned, ...unpinned].slice(0, state.visibleCount);
        
        // Generate table rows
elements.tableBody.innerHTML = displayData.map((item, index) => {
    const isHighlighted = state.highlightedPairs[item.symbol];
    const updateClass = item.hadUpdate ? `update-${item.updateDirection}` : '';
    const changeClass = item.priceChangePercent >= 0 ? 'up' : 'down';
    
    return `
    <tr data-symbol="${item.symbol}" class="${updateClass}">
        <td class="${isHighlighted ? 'highlighted' : ''}">
            ${index + 1}
        </td>
        <td>
            <span class="pin-icon" data-symbol="${item.symbol}">
                ${state.pinnedPairs.includes(item.symbol) ? '📌' : '🔅'}
            </span>
            ${item.symbol.replace('USDT', '')}/USDT
        </td>
        <td>${formatter.price(item.lastPrice, item.symbol)}</td>
        <td class="${changeClass}">
            ${formatter.change(item.priceChangePercent)}
        </td>
        <td>${formatter.volume(item.quoteVolume)}</td>
    </tr>
    `;
}).join('');

        elements.loadingIndicator.textContent = '';
        ui.attachRowEvents();
        
            // Update highlight timers for all highlighted pairs
    Object.keys(state.highlightedPairs).forEach(symbol => {
        if (state.highlightedPairs[symbol]?.isHighlighted) {
            ui.updateHighlightTimer(symbol);
        }
    });
    
    // Execute callback after render is complete
    if (callback && typeof callback === 'function') {
        setTimeout(callback, 0);
    }
        
        // Execute callback after render is complete
        if (callback && typeof callback === 'function') {
            setTimeout(callback, 0);
        }
    },

attachRowEvents: () => {
    document.querySelectorAll('#data tr').forEach(row => {
        row.addEventListener('click', (e) => {
            const symbol = row.getAttribute('data-symbol');
            
            if (e.target.classList.contains('pin-icon')) {
                ui.togglePin(symbol);
            } else if (e.target.closest('td:nth-child(3)')) {
                // Clicked on price cell
                ui.toggleHighlight(symbol, true);
            } else {
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

updateHighlightTimer: (symbol) => {
    const row = document.querySelector(`tr[data-symbol="${symbol}"]`);
    if (!row) return;
    
    const highlightData = state.highlightedPairs[symbol];
    if (!highlightData) return;
    
    const currentItem = state.data.find(item => item.symbol === symbol);
    if (!currentItem) return;
    
    const currentPrice = parseFloat(currentItem.lastPrice);
    const secondsElapsed = Math.floor((Date.now() - highlightData.highlightTime) / 1000);
    const dollarChange = formatter.dollarChange(currentPrice, highlightData.highlightPrice, symbol); // Added symbol parameter
    const timerText = formatter.timer(secondsElapsed);
    
    // Update the volume cell
    const volumeCell = row.querySelector('td:nth-child(5)');
    if (volumeCell) {
        const originalVolume = formatter.volume(currentItem.quoteVolume);
        volumeCell.innerHTML = `
            <span class="volume-container">
                <span class="volume-value">${originalVolume}</span>
                <span class="highlight-container">
                    [<span class="${dollarChange.colorClass}">${dollarChange.text}</span> 
                    <span class="highlight-separator">|</span> 
                    <span class="highlight-timer">${timerText}</span>]
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
        'paused': ['⏸️', 'Paused']
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
                    ui.showTempMessage(`Showing ${state.visibleCount} pairs`);
                });
            }
        };

        // Button event listeners
        elements.pauseButton.addEventListener('click', function() {
    state.isPaused = !state.isPaused;
    this.textContent = state.isPaused ? 'Resume' : 'Pause';
            
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
            if (!state.isPaused) {
                dataManager.loadInitialData();
                connectionManager.connect();
            }
            ui.updateConnectionStatus();
        });

        elements.showMoreButton.addEventListener('click', showMorePairs);

        // Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ignore spacebar if typing in inputs
    if (e.target.tagName === 'INPUT' || document.querySelector('.search-container.active')) {
        return;
    }
    
    if (e.code === 'Space') {
        e.preventDefault();
        // Directly toggle pause state instead of simulating click
        state.isPaused = !state.isPaused;
        elements.pauseButton.textContent = state.isPaused ? 'Resume' : 'Pause';
        
        if (state.isPaused) {
            state.pauseStartTime = Date.now(); // Add this line
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

        // Sort control
        elements.sortHeader.addEventListener('click', () => {
            state.sortDirection = state.sortDirection === 'volume-desc' 
                ? 'volume-asc' 
                : 'volume-desc';
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
    // Set initial title (using default loading state)
    document.title = "🟡 • Loading...";
    ui.setupControls();
    connectionManager.connect();
};

    init();
});