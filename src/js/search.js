// search-module.js
class SearchManager {
  constructor(config) {
    this.searchSymbols = [];
    this.searchActive = false;
    this.selectedResultIndex = -1;
    this.config = {
      apiEndpoints: {
        spotExchangeInfo: 'https://api.binance.com/api/v3/exchangeInfo',
        futuresExchangeInfo: 'https://fapi.binance.com/fapi/v1/exchangeInfo'
      },
      ...config
    };

    this.init();
  }

  async init() {
    await this.initializeSearch();
    this.setupEventListeners();
  }

  async initializeSearch() {
    try {
      const [spotResponse, futuresResponse] = await Promise.all([
        fetch(this.config.apiEndpoints.spotExchangeInfo),
        fetch(this.config.apiEndpoints.futuresExchangeInfo)
      ]);

      const [spotData, futuresData] = await Promise.all([
        spotResponse.json(),
        futuresResponse.json()
      ]);

      const spotSymbols = spotData.symbols
        .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
        .map(s => ({ symbol: s.baseAsset, type: 'spot' }));

      const futuresSymbols = futuresData.symbols
        .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
        .map(s => ({ symbol: s.baseAsset, type: 'futures' }));

      const symbolMap = new Map();
      spotSymbols.forEach(s => symbolMap.set(s.symbol, s));
      futuresSymbols.forEach(s => symbolMap.set(s.symbol, s));
      
      this.searchSymbols = Array.from(symbolMap.values());
    } catch (error) {
      console.error('Search initialization failed:', error);
      this.searchSymbols = [];
    }
  }

  setupEventListeners() {
    this.config.searchInput.addEventListener('input', this.handleSearchInput.bind(this));
    
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !this.searchActive && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        this.showSearch();
      }

      if (this.searchActive) {
        switch (e.key) {
          case 'Escape':
            this.hideSearch();
            break;
          case 'ArrowDown':
            this.selectSearchResult(this.selectedResultIndex + 1);
            break;
          case 'ArrowUp':
            this.selectSearchResult(this.selectedResultIndex - 1);
            break;
          case 'Enter':
            this.executeSearchSelection();
            break;
        }
      }
    });
  }

// Remove close button related code, keep only:
showSearch() {
    this.config.searchContainer.style.display = 'block';
    this.config.searchInput.focus();
    this.searchActive = true;
}

hideSearch() {
    if (typeof closeSearch === 'function') {
        closeSearch();
    } else {
        this.config.searchContainer.style.display = 'none';
        this.config.searchInput.value = '';
        this.config.searchResults.innerHTML = '';
    }
    this.searchActive = false;
    this.selectedResultIndex = -1;
}

  handleSearchInput(e) {
    const query = e.target.value.trim().toUpperCase();
    if (!query) {
      this.config.searchResults.innerHTML = '';
      this.selectedResultIndex = -1;
      return;
    }

    const filtered = this.searchSymbols.filter(item => 
      item.symbol.includes(query)
    ).slice(0, 10);

    this.renderSearchResults(filtered);
  }

  renderSearchResults(results) {
    this.config.searchResults.innerHTML = results.map((item, index) => `
      <div class="coin-item ${index === this.selectedResultIndex ? 'selected' : ''}" 
           data-symbol="${item.symbol}" 
           data-type="${item.type}">
        <div class="coin-content">
          <span class="pair-name">${item.symbol}/USDT</span>
          <div class="platform-icons-container">
            ${this.config.getPlatformIcons(item.symbol)}
          </div>
        </div>
        <span class="market-type ${item.type === 'spot' ? 'spot-type' : 'futures-type'}">
          ${item.type === 'spot' ? 'SPOT' : 'FUTURES'}
        </span>
      </div>
    `).join('');

    this.addSearchResultListeners();
  }

  addSearchResultListeners() {
    document.querySelectorAll('.platform-icons-container img').forEach(img => {
      const symbol = img.closest('.coin-item').getAttribute('data-symbol');
      const platform = img.getAttribute('alt').toLowerCase();
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = this.config.platformUrls[platform](symbol);
        window.open(url);
      });
    });

    document.querySelectorAll('.coin-item').forEach(item => {
      item.addEventListener('click', () => {
        const symbol = item.getAttribute('data-symbol');
        const type = item.getAttribute('data-type');
        this.config.onPairSelect(symbol, type);
        this.hideSearch();
      });
    });
  }

  selectSearchResult(index) {
    const results = document.querySelectorAll('#searchResults .coin-item');
    if (results.length === 0) return;

    if (this.selectedResultIndex >= 0 && this.selectedResultIndex < results.length) {
      results[this.selectedResultIndex].classList.remove('selected');
    }

    if (index >= results.length) index = 0;
    if (index < 0) index = results.length - 1;

    this.selectedResultIndex = index;
    results[this.selectedResultIndex].classList.add('selected');
    results[this.selectedResultIndex].scrollIntoView({ block: 'nearest' });
  }

  executeSearchSelection() {
    const results = document.querySelectorAll('#searchResults .coin-item');
    if (this.selectedResultIndex >= 0 && this.selectedResultIndex < results.length) {
      const selected = results[this.selectedResultIndex];
      const symbol = selected.getAttribute('data-symbol');
      const type = selected.getAttribute('data-type');
      
      this.config.onPairSelect(symbol, type);
      this.hideSearch();
    }
  }
}

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SearchManager;
} else {
  window.SearchManager = SearchManager;
}