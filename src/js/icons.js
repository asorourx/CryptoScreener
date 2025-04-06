// platform-icons.js
const platformUrls = {
    binance: (symbol) => `https://www.binance.com/en/futures/${symbol}_USDT`,
    bybit: (symbol) => `https://www.bybit.com/trade/usdt/${symbol}USDT`,
    gateio: (symbol) => `https://www.gate.io/futures_trade/${symbol}_USDT`,
    tradingview: (symbol) => `https://www.tradingview.com/chart/?symbol=BINANCE:${symbol}USDT.P`
};

function getPlatformIcons(symbol) {
    const baseSymbol = symbol.replace('USDT', '');
    return `
        <span class="platform-icons">
            <a href="${platformUrls.binance(baseSymbol)}" target="_blank" class="platform-icon binance-icon" 
               onclick="event.stopPropagation(); copyToClipboard('${baseSymbol}')">
                <img src="icons/binance.png" alt="Binance" class="platform-img">
            </a>
            <a href="${platformUrls.bybit(baseSymbol)}" target="_blank" class="platform-icon bybit-icon"
               onclick="event.stopPropagation(); copyToClipboard('${baseSymbol}')">
                <img src="icons/bybit.png" alt="Bybit" class="platform-img">
            </a>
            <a href="${platformUrls.gateio(baseSymbol)}" target="_blank" class="platform-icon gateio-icon"
               onclick="event.stopPropagation(); copyToClipboard('${baseSymbol}')">
                <img src="icons/gateio.png" alt="Gate.io" class="platform-img">
            </a>
            <a href="${platformUrls.tradingview(baseSymbol)}" target="_blank" class="platform-icon tradingview-icon"
               onclick="event.stopPropagation(); copyToClipboard('${baseSymbol}')">
                <img src="icons/tradingview.png" alt="TradingView" class="platform-img">
            </a>
        </span>
    `;
}

// Export functions if using modules, otherwise attach to window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getPlatformIcons, platformUrls };
} else {
    window.getPlatformIcons = getPlatformIcons;
    window.platformUrls = platformUrls;
}