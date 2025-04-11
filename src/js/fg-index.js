// fear-greed.js
class FearGreedIndex {
    constructor() {
        this.popup = null;
        this.overlay = null;
        this.chart = null;
        this.chartInitialized = false;
        this.lastUpdateTime = null;
        this.nextUpdateTime = null;
        this.updateInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
        this.updateTimer = null;
        this.currentClassification = '';
        this.init();
    }

    async init() {
        this.createPopup();
        await this.loadChartJS();
        this.initializeChart();
        await this.fetchData()  ;
        this.setupKeyboardShortcut();
        this.createGaugeElement(); // Add gauge to DOM
    }

    createPopup() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'fear-greed-popup-overlay';
        this.overlay.addEventListener('click', () => this.hide());
        
        // Create popup
        this.popup = document.createElement('div');
        this.popup.className = 'fear-greed-popup';
        this.popup.innerHTML = `
            <div class="fear-greed-popup-header">
                <h3>CMC Crypto Fear & Greed Index</h3>
                <button class="fear-greed-popup-close">&times;</button>
            </div>
            <div class="fear-greed-popup-value">
                <span id="fearGreedValue">--</span>
                <span id="fearGreedLabel">Loading...</span>
                <div class="update-info">
                    <span id="lastUpdateTime" class="status-colored">Last updated: --</span>
                    <span id="nextUpdateTime">Next update: --</span>
                </div>
            </div>
            <div class="fear-greed-popup-chart">
                <canvas id="fearGreedChart"></canvas>
            </div>
            <div class="fear-greed-popup-stats">
                <div class="fear-greed-popup-stat-item">
                    <span class="fear-greed-popup-stat-label">Today:</span>
                    <span id="todayValue" class="fear-greed-popup-stat-value status-colored">--</span>
                </div>
                <div class="fear-greed-popup-stat-item">
                    <span class="fear-greed-popup-stat-label">Yesterday:</span>
                    <span id="yesterdayValue" class="fear-greed-popup-stat-value status-colored">--</span>
                </div>
                <div class="fear-greed-popup-stat-item">
                    <span class="fear-greed-popup-stat-label">Last Week:</span>
                    <span id="lastWeekValue" class="fear-greed-popup-stat-value status-colored">--</span>
                </div>
                <div class="fear-greed-popup-stat-item">
                    <span class="fear-greed-popup-stat-label">Last Month:</span>
                    <span id="lastMonthValue" class="fear-greed-popup-stat-value status-colored">--</span>
                </div>
                <div class="fear-greed-popup-stat-item">
                    <span class="fear-greed-popup-stat-label">Year High:</span>
                    <span id="yearHighValue" class="fear-greed-popup-stat-value status-colored">--</span>
                </div>
                <div class="fear-greed-popup-stat-item">
                    <span class="fear-greed-popup-stat-label">Year Low:</span>
                    <span id="yearLowValue" class="fear-greed-popup-stat-value status-colored">--</span>
                </div>
            </div>
        `;
        
        // Add close button event
        this.popup.querySelector('.fear-greed-popup-close').addEventListener('click', () => this.hide());
        
        // Append to body
        document.body.appendChild(this.overlay);
        document.body.appendChild(this.popup);
        
        // Cache elements
        this.valueElement = document.getElementById('fearGreedValue');
        this.labelElement = document.getElementById('fearGreedLabel');
        this.lastUpdateElement = document.getElementById('lastUpdateTime');
        this.nextUpdateElement = document.getElementById('nextUpdateTime');
        this.todayValue = document.getElementById('todayValue');
        this.yesterdayValue = document.getElementById('yesterdayValue');
        this.lastWeekValue = document.getElementById('lastWeekValue');
        this.lastMonthValue = document.getElementById('lastMonthValue');
        this.yearHighValue = document.getElementById('yearHighValue');
        this.yearLowValue = document.getElementById('yearLowValue');
    }

    createGaugeElement() {
        // Create gauge container
        const gaugeContainer = document.createElement('div');
        gaugeContainer.className = 'fear-greed-gauge';
        gaugeContainer.innerHTML = `
            <div class="gauge-value">
                <span class="gauge-label"></span>
            </div>
        `;
        document.body.appendChild(gaugeContainer);
        
        // Make gauge draggable
        this.makeDraggable(gaugeContainer);
    }

    makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        element.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    async loadChartJS() {
        if (typeof Chart === 'undefined') {
            return new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
                script.onload = resolve;
                document.head.appendChild(script);
            });
        }
        return Promise.resolve();
    }

    initializeChart() {
        if (this.chartInitialized) return;
        
        const ctx = document.getElementById('fearGreedChart')?.getContext('2d');
        if (!ctx) return;
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Fear & Greed Index',
                    data: [],
                    borderColor: '#f0b90b',
                    backgroundColor: 'rgba(240, 185, 11, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Value: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        min: 0,
                        max: 100,
                        ticks: {
                            stepSize: 20
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
        this.chartInitialized = true;
    }

    async fetchData() {
        try {
            const response = await fetch('https://api.alternative.me/fng/?limit=30&timestamp=' + Date.now());
            const data = await response.json();
            
            if (data && data.data && data.data.length > 0) {
                // Clear any pending update
                if (this.updateTimer) {
                    clearTimeout(this.updateTimer);
                    this.updateTimer = null;
                }
                
                // Record update times
                this.lastUpdateTime = new Date();
                this.nextUpdateTime = new Date(this.lastUpdateTime.getTime() + this.updateInterval);
                this.updateTimeDisplay();
                
                // Process the data
                this.updateUI(data.data);
                
                // Schedule next update aligned with the 5-minute interval
                const now = new Date();
                const timeUntilNextUpdate = this.nextUpdateTime - now;
                
                if (timeUntilNextUpdate > 0) {
                    this.updateTimer = setTimeout(() => this.fetchData(), timeUntilNextUpdate);
                } else {
                    // If we're already past the scheduled time, fetch immediately
                    this.fetchData();
                }
            }
        } catch (error) {
            console.error('Error fetching Fear & Greed data:', error);
            // Retry sooner if there's an error
            this.updateTimer = setTimeout(() => this.fetchData(), 30000); // Retry in 30 seconds
        }
    }

    updateTimeDisplay() {
        if (this.lastUpdateTime) {
            const options = { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: true 
            };
            this.lastUpdateElement.textContent = `Last updated: ${this.lastUpdateTime.toLocaleTimeString([], options)}`;
            // Apply color based on current classification
            this.lastUpdateElement.className = `status-colored ${this.currentClassification.toLowerCase().replace(' ', '-')}`;
        }
        if (this.nextUpdateTime) {
            const options = { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            };
            this.nextUpdateElement.textContent = `Next update: ~${this.nextUpdateTime.toLocaleTimeString([], options)}`;
            // Ensure next update is white
            this.nextUpdateElement.className = '';
        }
    }

    updateUI(data) {
        // Current value
        const current = data[0];
        this.updateGauge(current.value); // Update the gauge
        this.valueElement.textContent = current.value;
        this.labelElement.textContent = current.value_classification;
        this.currentClassification = current.value_classification;
        
        // Set color based on classification
        const classificationClass = current.value_classification.toLowerCase().replace(' ', '-');
        this.valueElement.className = classificationClass;
        this.labelElement.className = classificationClass;
        
        // Historical values with color coding
        this.updateStatElement(this.todayValue, data[0].value, data[0].value_classification);
        this.updateStatElement(this.yesterdayValue, data[1].value, data[1].value_classification);
        this.updateStatElement(this.lastWeekValue, data[6].value, data[6].value_classification);
        this.updateStatElement(this.lastMonthValue, data[29].value, data[29].value_classification);
        
        // Year high and low
        const values = data.map(d => parseInt(d.value));
        const yearHigh = Math.max(...values);
        const yearLow = Math.min(...values);
        const yearHighItem = data.find(d => parseInt(d.value) === yearHigh);
        const yearLowItem = data.find(d => parseInt(d.value) === yearLow);
        
        this.updateStatElement(this.yearHighValue, yearHigh, yearHighItem.value_classification);
        this.updateStatElement(this.yearLowValue, yearLow, yearLowItem.value_classification);
        
        // Update time display with current classification color
        this.updateTimeDisplay();
        
        // Update chart
        if (this.chart) {
            this.chart.data.labels = data.map(d => {
                const date = new Date(d.timestamp * 1000);
                return `${date.getMonth()+1}/${date.getDate()}`;
            }).reverse();
            this.chart.data.datasets[0].data = data.map(d => d.value).reverse();
            this.chart.update();
        }
    }

    updateStatElement(element, value, classification) {
        const classificationClass = classification.toLowerCase().replace(' ', '-');
        element.textContent = `${value} (${classification})`;
        element.className = `fear-greed-popup-stat-value status-colored ${classificationClass}`;
    }

updateGauge(value) {
    // First try to get the gauge element if we don't have it
    if (!this.gaugeElement) {
        this.gaugeElement = document.getElementById('fearGreedGauge');
        if (!this.gaugeElement) return;
    }

    // Get or create the value text element
    let valueText = this.gaugeElement.querySelector('#valueText');
    if (!valueText) {
        // Create the text element if it doesn't exist
        valueText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        valueText.setAttribute('id', 'valueText');
        valueText.setAttribute('x', '50');
        valueText.setAttribute('y', '40');
        valueText.setAttribute('class', 'value-text');
        valueText.setAttribute('text-anchor', 'middle');
        this.gaugeElement.querySelector('svg').appendChild(valueText);
    }

    const clamped = Math.max(0, Math.min(100, value));
    
    // Update needle position
    const needle = this.gaugeElement.querySelector('#needle');
    if (needle) {
        const angle = (clamped / 100) * 180 - 90;
        const radians = angle * (Math.PI / 180);
        const length = 30;
        const x2 = 50 + Math.cos(radians) * length;
        const y2 = 50 + Math.sin(radians) * length;
        needle.setAttribute('x2', x2);
        needle.setAttribute('y2', y2);
    }
    
    // Update value display
    valueText.textContent = clamped;
    
    // Update color - first remove all color classes
    valueText.classList.remove('glow-low', 'glow-medium', 'glow-high');
    
    // Then add the appropriate one
    if (clamped < 25) {
        valueText.classList.add('glow-low');
    } else if (clamped <= 75) {
        valueText.classList.add('glow-medium');
    } else {
        valueText.classList.add('glow-high');
    }
}
    

    show() {
        this.overlay.classList.add('show');
        this.popup.classList.add('show');
        if (!this.chartInitialized) {
            this.initializeChart();
        }
        this.fetchData();
    }

    hide() {
        this.overlay.classList.remove('show');
        this.popup.classList.remove('show');
        // Clear any pending updates when hidden
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
    }

    toggle() {
        if (this.popup.classList.contains('show')) {
            this.hide();
        } else {
            this.show();
        }
    }

    setupKeyboardShortcut() {
        document.addEventListener('keydown', (e) => {
            // Toggle with '?' key
            if (e.key === '?' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                this.toggle();
            }
            // Close with ESC key when popup is visible
            else if (e.key === 'Escape' && this.popup.classList.contains('show')) {
                e.preventDefault();
                this.hide();
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => { window.fearGreedIndex = new FearGreedIndex(); });
document.getElementById('fearGreedGauge').addEventListener('click', function() { window.fearGreedIndex?.toggle(); // Safely call toggle if it exists
});