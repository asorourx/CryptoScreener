📊 Crypto Market Screener: Top 100 Pairs by 24H Volume


A highly responsive, ultra-reliable cryptocurrency trading viewer with real-time price updates, fear & greed index monitoring, and advanced visualization features.

## ✨ Features

- **Real-time Price Updates**: Stream live price data from Binance Futures
- **Fear & Greed Index**: Monitor market sentiment with color-coded classifications
- **Customizable Visual Feedback**: Adjust animation colors and durations
- **TradingView Integration**: Quick access to TradingView charts
- **Smart Highlighting**: Track price movements with timers and change indicators
- **Pinning System**: Pin important pairs for quick reference
- **Cross-Platform Links**: One-click access to Binance, Bybit, Gate.io and TradingView
- **Keyboard Shortcuts**: Full keyboard control for efficient navigation

## 🚀 Quick Start

1. Clone or download the repository
2. Open `index.html` in your browser
3. Use `?` key to toggle Fear & Greed Index popup
4. Use `Space` to pause/resume updates

## ⌨️ Keyboard Shortcuts

| Key       | Action                          |
|-----------|---------------------------------|
| `?`       | Toggle Fear & Greed Index       |
| `Space`   | Pause/Resume updates            |
| `M`       | Show more pairs                 |
| `L`       | Show fewer pairs                |
| `T`       | Toggle TradingView widget       |
| `/`       | Open search                     |
| `ESC`     | Close any open modal            |

## 🎨 Customization

Access visual settings via the gear icon (⚙️) to:
- Toggle price update animations
- Adjust animation duration (500-3000ms)
- Change up/down colors
- Configure display preferences

## 🌐 Fear & Greed Index Features

![Fear & Greed Popup](fear-greed-screenshot.png) <!-- Add screenshot if available -->

- Current index value with color-coded classification
- Historical comparisons (Today/Yesterday/Week/Month)
- Yearly high/low tracking
- Automatic updates every 5 minutes
- Color-coded status indicators:
  - Extreme Greed (40-100) - Green
  - Greed (25-39) - Light Green
  - Neutral (21-24) - White
  - Fear (10-20) - Yellow
  - Extreme Fear (0-9) - Red

## 🔍 Search Functionality

- Search any USDT pair (Spot or Futures)
- Quick platform links for each result
- Keyboard navigation (↑/↓ arrows, Enter to select)

## ⚡ Performance Optimizations

- WebSocket connection with automatic reconnection
- Smart data caching
- Efficient DOM updates
- Background data refresh for stale pairs
- Memory-efficient design

## 🛠️ Technical Stack

- Vanilla JavaScript (no frameworks)
- Chart.js for Fear & Greed visualization
- TradingView widget integration
- WebSocket API for real-time data
- LocalStorage for user preferences

## 📦 File Structure

