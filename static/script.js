// NammaTraffic Javascript Logic - Dynamic charts, dynamic dropdowns, predictive form & comparative simulation

let charts = {};
let mapInstance = null;
let mapMarker = null;
let tileLayerInstance = null;

const ROAD_COORDINATES = {
    'Silk Board Junction': [12.9176, 77.6244],
    'Hosur Road': [12.9118, 77.6291],
    'Hebbal Flyover': [13.0358, 77.5979],
    'Ballari Road': [13.0185, 77.5896],
    '100 Feet Road': [12.9719, 77.6412],
    'CMH Road': [12.9784, 77.6384],
    'Jayanagar 4th Block': [12.9284, 77.5831],
    'South End Circle': [12.9377, 77.5807],
    'Sony World Junction': [12.9372, 77.6269],
    'Sarjapur Road': [12.9213, 77.6521],
    'Trinity Circle': [12.9729, 77.6166],
    'Anil Kumble Circle': [12.9757, 77.5978],
    'Marathahalli Bridge': [12.9562, 77.7011],
    'ITPL Main Road': [12.9866, 77.7314],
    'Yeshwanthpur Circle': [13.0232, 77.5583],
    'Tumkur Road': [13.0324, 77.5401]
};

document.addEventListener('DOMContentLoaded', () => {
    // 0. Load saved theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const body = document.body;
    const icon = document.getElementById('theme-icon');
    
    if (savedTheme === 'light') {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        if (icon) icon.className = "fa-solid fa-moon";
    } else {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
        if (icon) icon.className = "fa-solid fa-sun";
    }

    // 1. Initialize dropdown lists
    initializeFormDropdowns();
    
    // 2. Render all charts if data is available
    if (dataSummary) {
        initOverviewCharts();
    }
    if (featureImportances) {
        initPerformanceCharts();
    }
    
    // 3. Set default date to today
    const dateInput = document.getElementById('pred-date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
    
    // 4. Hook up Predictor Form
    const predForm = document.getElementById('predictor-form');
    if (predForm) {
        predForm.addEventListener('submit', handlePredictSubmit);
    }
    
    // 5. Roadwork toggle label updating
    const roadworkToggle = document.getElementById('pred-roadwork');
    if (roadworkToggle) {
        roadworkToggle.addEventListener('change', (e) => {
            const label = document.getElementById('pred-roadwork-label');
            if (e.target.checked) {
                label.innerText = "Active Construction / Roadworks";
                label.classList.remove('text-muted');
                label.classList.add('text-warning', 'font-semibold');
            } else {
                label.innerText = "No Active Roadworks";
                label.classList.add('text-muted');
                label.classList.remove('text-warning', 'font-semibold');
            }
        });
    }
});

// Switch Dashboard Tabs
function switchTab(tabId, element) {
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');
    
    // Update active tab panel
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active-panel');
    });
    
    const targetPanel = document.getElementById(`tab-${tabId}`);
    if (targetPanel) {
        targetPanel.classList.add('active-panel');
    }
    
    // Update page title/subtitle
    const heading = document.getElementById('page-heading');
    const subheading = document.getElementById('page-subheading');
    
    if (tabId === 'overview') {
        heading.innerText = "Traffic Insights Overview";
        subheading.innerText = "Comprehensive exploratory analysis and real-time statistics for metropolitan Bangalore.";
    } else if (tabId === 'predictor') {
        heading.innerText = "Live Congestion Predictor";
        subheading.innerText = "Evaluate congestion risks and travel speeds using our trained Machine Learning models.";
    } else if (tabId === 'simulator') {
        heading.innerText = "What-If Scenario Simulator";
        subheading.innerText = "Compare different traffic setups side-by-side to analyze the impact of rain, accidents, or construction.";
    } else if (tabId === 'performance') {
        heading.innerText = "Model Performance & Drivers";
        subheading.innerText = "Review model validation metrics, error margins, and the underlying mathematical feature weights.";
    }
}

// Populate Road Dropdowns and Area Dropdowns
function initializeFormDropdowns() {
    if (!dataSummary || !dataSummary.metadata) return;
    
    // Populate Simulator Area Dropdowns
    const simAreaA = document.getElementById('sim-area-a');
    const simAreaB = document.getElementById('sim-area-b');
    
    if (simAreaA && simAreaB) {
        // Clear options first
        simAreaA.innerHTML = '<option value="" disabled selected>Select Area</option>';
        simAreaB.innerHTML = '<option value="" disabled selected>Select Area</option>';
        
        dataSummary.metadata.areas.forEach(area => {
            const optA = new Option(area, area);
            const optB = new Option(area, area);
            simAreaA.add(optA);
            simAreaB.add(optB);
        });
    }
}

// Update Road dropdown dynamically based on Area Selection
function updateRoadDropdown(selectedArea, roadDropdownId) {
    const roadSelect = document.getElementById(roadDropdownId);
    if (!roadSelect || !dataSummary || !dataSummary.metadata) return;
    
    // Clear existing options
    roadSelect.innerHTML = '';
    
    const roads = dataSummary.metadata.area_road_map[selectedArea];
    if (roads && roads.length > 0) {
        roads.forEach(road => {
            const opt = new Option(road, road);
            roadSelect.add(opt);
        });
        roadSelect.disabled = false;
    } else {
        roadSelect.innerHTML = '<option value="" disabled selected>No roads found for this area</option>';
        roadSelect.disabled = true;
    }
}

// Handle Single Prediction Submission
function handlePredictSubmit(e) {
    e.preventDefault();
    
    const btnPredict = document.getElementById('btn-predict');
    const predictPlaceholder = document.getElementById('predict-placeholder');
    const predictResults = document.getElementById('predict-results');
    
    // Show Loading state
    btnPredict.disabled = true;
    btnPredict.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin me-2"></i>Evaluating Traffic...';
    
    // Collect features
    const payload = {
        date: document.getElementById('pred-date').value,
        area: document.getElementById('pred-area').value,
        road: document.getElementById('pred-road').value,
        weather: document.getElementById('pred-weather').value,
        roadwork: document.getElementById('pred-roadwork').checked ? 'Yes' : 'No',
        volume: parseInt(document.getElementById('pred-volume').value),
        incidents: parseInt(document.getElementById('pred-incidents').value),
        pedestrians: parseInt(document.getElementById('pred-pedestrians').value)
    };
    
    fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        btnPredict.disabled = false;
        btnPredict.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles me-2"></i>Evaluate Congestion Risk';
        
        if (data.success) {
            predictPlaceholder.classList.add('d-none');
            predictResults.classList.remove('d-none');
            
            updatePredictionResults(data.predictions);
            
            // Trigger Hourly Congestion Profile calculations
            initOrUpdateHourlyChart(
                payload.volume,
                payload.area,
                payload.road,
                payload.weather,
                payload.roadwork,
                payload.incidents,
                payload.pedestrians
            );
        } else {
            alert("Prediction Error: " + data.error);
        }
    })
    .catch(error => {
        btnPredict.disabled = false;
        btnPredict.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles me-2"></i>Evaluate Congestion Risk';
        console.error("Fetch error:", error);
        alert("An error occurred connecting to the ML engine.");
    });
}

// Update Single Prediction Result Elements
function updatePredictionResults(preds) {
    const congestion = preds['Congestion Level'];
    const speed = preds['Average Speed'];
    const tti = preds['Travel Time Index'];
    const utilization = preds['Road Capacity Utilization'];
    
    // 1. Update text values
    document.getElementById('res-congestion').innerText = `${congestion.toFixed(1)}%`;
    document.getElementById('res-speed').innerText = speed.toFixed(1);
    document.getElementById('res-tti').innerText = tti.toFixed(2);
    document.getElementById('res-utilization').innerText = `${utilization.toFixed(1)}%`;
    
    // 2. Animate Circular Progress Gauge
    const gaugeFill = document.getElementById('gauge-congestion-fill');
    // Radius of circular gauge is 50, circumference is 2 * PI * 50 = 314.16
    const circumference = 314.16;
    const offset = circumference - (congestion / 100) * circumference;
    gaugeFill.style.strokeDashoffset = offset;
    
    // Choose colors dynamically based on severity
    let statusText = "Smooth Flow";
    let alertColor = "var(--neon-green)";
    let alertBg = "rgba(16, 185, 129, 0.08)";
    let alertBorder = "rgba(16, 185, 129, 0.25)";
    let advisoryIcon = '<i class="fa-solid fa-circle-check"></i>';
    let advisoryTitle = "Optimal Commute Conditions";
    let advisoryDesc = "Road capacity is highly available, with speeds close to free flow. Travel times are optimal.";
    
    if (congestion >= 75) {
        statusText = "Severe Gridlock";
        alertColor = "var(--neon-red)";
        alertBg = "rgba(244, 63, 94, 0.08)";
        alertBorder = "rgba(244, 63, 94, 0.25)";
        advisoryIcon = '<i class="fa-solid fa-circle-xmark"></i>';
        advisoryTitle = "High Congestion Warning";
        advisoryDesc = "Major delays expected. Expect a trip duration extension of " + ((tti - 1) * 100).toFixed(0) + "%. Consider taking public transport or shifting your schedule.";
    } else if (congestion >= 40) {
        statusText = "Moderate Congestion";
        alertColor = "var(--neon-amber)";
        alertBg = "rgba(245, 158, 11, 0.08)";
        alertBorder = "rgba(245, 158, 11, 0.25)";
        advisoryIcon = '<i class="fa-solid fa-circle-exclamation"></i>';
        advisoryTitle = "Moderate Congestion Notice";
        advisoryDesc = "Traffic is slowing down. Minor delays of " + ((tti - 1) * 100).toFixed(0) + "% over typical free-flow times. Watch for choke points.";
    }
    
    // Apply styles to elements
    gaugeFill.style.stroke = alertColor;
    document.getElementById('res-congestion-status').innerText = statusText;
    document.getElementById('res-congestion-status').style.color = alertColor;
    
    // 3. Update Capacity Utilization bar
    const utilBar = document.getElementById('res-utilization-bar');
    utilBar.style.width = `${utilization}%`;
    utilBar.className = "progress-bar progress-bar-striped progress-bar-animated";
    if (utilization >= 95) {
        utilBar.classList.add('bg-danger');
    } else if (utilization >= 75) {
        utilBar.classList.add('bg-warning');
    } else {
        utilBar.classList.add('bg-success');
    }
    
    // 4. Update advisory panel
    const advisory = document.getElementById('res-advisory');
    advisory.style.backgroundColor = alertBg;
    advisory.style.borderColor = alertBorder;
    
    document.getElementById('res-advisory-icon').innerHTML = advisoryIcon;
    document.getElementById('res-advisory-icon').style.color = alertColor;
    document.getElementById('res-advisory-title').innerText = advisoryTitle;
    document.getElementById('res-advisory-desc').innerText = advisoryDesc;
    
    // Show PDF export button
    const btnExport = document.getElementById('btn-export-report');
    if (btnExport) btnExport.classList.remove('d-none');
    
    // 5. Update Spatial Map Location
    const roadName = document.getElementById('pred-road').value;
    const coords = ROAD_COORDINATES[roadName];
    if (coords) {
        initOrUpdateMap(coords[0], coords[1], statusText, alertColor, roadName);
    }
}

// Run What-If Comparison Simulation
function runComparison() {
    const areaA = document.getElementById('sim-area-a').value;
    const roadA = document.getElementById('sim-road-a').value;
    const areaB = document.getElementById('sim-area-b').value;
    const roadB = document.getElementById('sim-road-b').value;
    
    if (!areaA || !roadA || !areaB || !roadB) {
        alert("Please select both Area and Road for Scenario A and Scenario B.");
        return;
    }
    
    // Form payloads
    const payloadA = {
        area: areaA,
        road: roadA,
        weather: document.getElementById('sim-weather-a').value,
        roadwork: document.getElementById('sim-roadwork-a').value,
        volume: parseInt(document.getElementById('sim-volume-a').value),
        incidents: parseInt(document.getElementById('sim-incidents-a').value),
        pedestrians: parseInt(document.getElementById('sim-pedestrians-a').value),
        date: new Date().toISOString().split('T')[0]
    };
    
    const payloadB = {
        area: areaB,
        road: roadB,
        weather: document.getElementById('sim-weather-b').value,
        roadwork: document.getElementById('sim-roadwork-b').value,
        volume: parseInt(document.getElementById('sim-volume-b').value),
        incidents: parseInt(document.getElementById('sim-incidents-b').value),
        pedestrians: parseInt(document.getElementById('sim-pedestrians-b').value),
        date: new Date().toISOString().split('T')[0]
    };
    
    // Show results loading
    const resultsContainer = document.getElementById('sim-results-container');
    resultsContainer.classList.remove('d-none');
    
    // Call endpoints concurrently
    Promise.all([
        fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadA)
        }).then(r => r.json()),
        fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadB)
        }).then(r => r.json())
    ])
    .then(([resA, resB]) => {
        if (resA.success && resB.success) {
            updateSimulatorResults(resA.predictions, resB.predictions);
        } else {
            alert("Error running comparison. Please verify model training.");
        }
    })
    .catch(error => {
        console.error("Simulation error:", error);
        alert("An error occurred during multi-scenario simulation.");
    });
}

// Update Simulator Comparative Panels
function updateSimulatorResults(predsA, predsB) {
    // Metric values A
    const congA = predsA['Congestion Level'];
    const speedA = predsA['Average Speed'];
    const ttiA = predsA['Travel Time Index'];
    const utilA = predsA['Road Capacity Utilization'];
    
    // Metric values B
    const congB = predsB['Congestion Level'];
    const speedB = predsB['Average Speed'];
    const ttiB = predsB['Travel Time Index'];
    const utilB = predsB['Road Capacity Utilization'];
    
    // 1. Update text displays
    document.getElementById('sim-res-cong-a').innerText = `${congA.toFixed(1)}%`;
    document.getElementById('sim-res-cong-b').innerText = `${congB.toFixed(1)}%`;
    
    document.getElementById('sim-res-speed-a').innerText = speedA.toFixed(1);
    document.getElementById('sim-res-speed-b').innerText = speedB.toFixed(1);
    
    document.getElementById('sim-res-tti-a').innerText = `${ttiA.toFixed(2)}x`;
    document.getElementById('sim-res-tti-b').innerText = `${ttiB.toFixed(2)}x`;
    
    document.getElementById('sim-res-util-a').innerText = `${utilA.toFixed(1)}%`;
    document.getElementById('sim-res-util-b').innerText = `${utilB.toFixed(1)}%`;
    
    // 2. Compute Deltas & Update badges
    // Congestion Delta (higher congestion is bad -> positive delta is red/warning, negative delta is green/good)
    const deltaCong = congB - congA;
    updateDeltaBadge('sim-delta-cong', deltaCong, '%', true);
    
    // Speed Delta (higher speed is good -> positive delta is green/good, negative is red/bad)
    const deltaSpeed = speedB - speedA;
    updateDeltaBadge('sim-delta-speed', deltaSpeed, ' km/h', false);
    
    // Travel Time Index Delta (higher TTI is bad -> positive delta is red, negative is green)
    const deltaTti = ttiB - ttiA;
    updateDeltaBadge('sim-delta-tti', deltaTti, 'x', true);
    
    // Utilization Delta (higher utilization is bad/closer to capacity -> positive delta is red, negative is green)
    const deltaUtil = utilB - utilA;
    updateDeltaBadge('sim-delta-util', deltaUtil, '%', true);
}

// Utility to style delta indicators
function updateDeltaBadge(elementId, delta, unit, isIncreaseBad) {
    const badge = document.getElementById(elementId);
    if (!badge) return;
    
    badge.className = "badge px-3 py-2 rounded-pill font-medium";
    
    const absDelta = Math.abs(delta);
    const sign = delta > 0 ? '+' : (delta < 0 ? '-' : '');
    badge.innerText = `${sign}${absDelta.toFixed(1)}${unit}`;
    
    if (absDelta < 0.05) {
        badge.innerText = "No Change";
        badge.classList.add('bg-delta-neutral');
        return;
    }
    
    const isWorse = (delta > 0 && isIncreaseBad) || (delta < 0 && !isIncreaseBad);
    if (isWorse) {
        badge.classList.add('bg-delta-positive'); // Red
    } else {
        badge.classList.add('bg-delta-negative'); // Green
    }
}

// Reload Models (Call Server Reset Endpoint)
function reloadModels() {
    fetch('/api/reload', {
        method: 'POST'
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            window.location.reload();
        } else {
            alert("Reload failed.");
        }
    })
    .catch(err => {
        console.error(err);
        alert("Failed to contact ML reload endpoint.");
    });
}

// Initialize Overview charts
function initOverviewCharts() {
    if (!dataSummary || !dataSummary.charts) return;
    
    const cData = dataSummary.charts;
    const isDark = document.body.classList.contains('dark-theme');
    
    // 1. Chart: Average Speed by Area
    const areas = Object.keys(cData.speed_by_area);
    const speeds = Object.values(cData.speed_by_area);
    
    charts.speedArea = new Chart(document.getElementById('speedAreaChart'), {
        type: 'bar',
        data: {
            labels: areas,
            datasets: [{
                label: 'Average Speed (km/h)',
                data: speeds,
                backgroundColor: 'rgba(16, 185, 129, 0.45)',
                borderColor: 'rgba(16, 185, 129, 0.85)',
                borderWidth: 1.5,
                borderRadius: 6
            }]
        },
        options: getChartOptions('Average Speed (km/h)', 'Area Zone')
    });
    
    // 2. Chart: Weather vs Congestion & Speed
    const weatherConditions = Object.keys(cData.congestion_by_weather);
    const weatherCongestion = Object.values(cData.congestion_by_weather);
    const weatherSpeed = weatherConditions.map(w => cData.speed_by_weather[w]);
    
    charts.weatherCongestion = new Chart(document.getElementById('weatherCongestionChart'), {
        type: 'bar',
        data: {
            labels: weatherConditions,
            datasets: [
                {
                    label: 'Congestion Level (%)',
                    data: weatherCongestion,
                    backgroundColor: 'rgba(244, 63, 94, 0.45)',
                    borderColor: 'rgba(244, 63, 94, 0.85)',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: 'Average Speed (km/h)',
                    data: weatherSpeed,
                    type: 'line',
                    borderColor: '#10b981',
                    borderWidth: 3,
                    pointBackgroundColor: '#10b981',
                    fill: false,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: isDark ? '#94a3b8' : '#334155', font: { family: 'Plus Jakarta Sans', size: 11, weight: '505' } } }
            },
            scales: {
                x: {
                    grid: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.06)' },
                    ticks: { color: isDark ? '#94a3b8' : '#334155', font: { family: 'Plus Jakarta Sans' } }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.06)' },
                    ticks: { color: isDark ? '#94a3b8' : '#334155', font: { family: 'Plus Jakarta Sans' }, callback: v => v + '%' },
                    min: 0,
                    max: 100
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false }, // avoid grid overlapping
                    ticks: { color: isDark ? '#94a3b8' : '#334155', font: { family: 'Plus Jakarta Sans' }, callback: v => v + ' km/h' },
                    min: 0,
                    max: 100
                }
            }
        }
    });
    
    // 3. Chart: Congestion by Day of Week
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayCongestions = days.map(d => cData.congestion_by_day[d] || 0);
    
    charts.dayCongestion = new Chart(document.getElementById('dayCongestionChart'), {
        type: 'line',
        data: {
            labels: days,
            datasets: [{
                label: 'Average Congestion Level (%)',
                data: dayCongestions,
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                fill: true,
                tension: 0.35,
                borderWidth: 3,
                pointBackgroundColor: '#f59e0b',
                pointRadius: 4
            }]
        },
        options: getChartOptions('Congestion Level (%)', 'Day of the Week')
    });
    
    // 4. Chart: Traffic Volume vs Congestion Level
    const volIntervals = Object.keys(cData.congestion_by_volume);
    const volCongestions = Object.values(cData.congestion_by_volume);
    
    charts.volumeCongestion = new Chart(document.getElementById('volumeCongestionChart'), {
        type: 'line',
        data: {
            labels: volIntervals,
            datasets: [{
                label: 'Mean Congestion Level (%)',
                data: volCongestions,
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                fill: true,
                tension: 0.2,
                borderWidth: 3,
                pointBackgroundColor: '#38bdf8',
                pointRadius: 4
            }]
        },
        options: getChartOptions('Congestion Level (%)', 'Traffic Volume range (vehicles/hr)')
    });
}

// Initialize Feature Importance Charts
function initPerformanceCharts() {
    if (!featureImportances) return;
    
    // 1. Chart: Feature Importance for Congestion
    const congImportance = featureImportances['Congestion Level'];
    const congFeatures = Object.keys(congImportance).sort((a, b) => congImportance[b] - congImportance[a]);
    const congImportanceValues = congFeatures.map(f => congImportance[f]);
    
    charts.importanceCongestion = new Chart(document.getElementById('importanceCongestionChart'), {
        type: 'bar',
        data: {
            labels: congFeatures,
            datasets: [{
                label: 'Driver Weight (%)',
                data: congImportanceValues,
                backgroundColor: 'rgba(244, 63, 94, 0.45)',
                borderColor: 'rgba(244, 63, 94, 0.85)',
                borderWidth: 1.5,
                borderRadius: 5
            }]
        },
        options: getChartOptions('Relative Weight (%)', 'Input Feature', true)
    });
    
    // 2. Chart: Feature Importance for Average Speed
    const speedImportance = featureImportances['Average Speed'];
    const speedFeatures = Object.keys(speedImportance).sort((a, b) => speedImportance[b] - speedImportance[a]);
    const speedImportanceValues = speedFeatures.map(f => speedImportance[f]);
    
    charts.importanceSpeed = new Chart(document.getElementById('importanceSpeedChart'), {
        type: 'bar',
        data: {
            labels: speedFeatures,
            datasets: [{
                label: 'Driver Weight (%)',
                data: speedImportanceValues,
                backgroundColor: 'rgba(16, 185, 129, 0.45)',
                borderColor: 'rgba(16, 185, 129, 0.85)',
                borderWidth: 1.5,
                borderRadius: 5
            }]
        },
        options: getChartOptions('Relative Weight (%)', 'Input Feature', true)
    });
}

// Chart.js Default Option Helper
function getChartOptions(yLabel, xLabel, horizontal = false) {
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#94a3b8' : '#334155';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.06)';
    const indexAxis = horizontal ? 'y' : 'x';
    return {
        indexAxis: indexAxis,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11, weight: '500' } }
            }
        },
        scales: {
            x: {
                grid: { color: gridColor },
                ticks: { color: textColor, font: { family: 'Plus Jakarta Sans' } }
            },
            y: {
                grid: { color: gridColor },
                ticks: { color: textColor, font: { family: 'Plus Jakarta Sans' } }
            }
        }
    };
}

// Theme Toggle Functionality
function toggleTheme() {
    const body = document.body;
    const icon = document.getElementById('theme-icon');
    
    if (body.classList.contains('dark-theme')) {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        if (icon) icon.className = "fa-solid fa-moon";
        localStorage.setItem('theme', 'light');
        updateChartsTheme('light');
    } else {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
        if (icon) icon.className = "fa-solid fa-sun";
        localStorage.setItem('theme', 'dark');
        updateChartsTheme('dark');
    }
}

// Update Chart colors on theme change
function updateChartsTheme(theme) {
    const textColor = theme === 'dark' ? '#94a3b8' : '#334155';
    const gridColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.06)';
    
    for (let key in charts) {
        const chart = charts[key];
        if (!chart) continue;
        
        if (chart.options.scales) {
            if (chart.options.scales.x) {
                chart.options.scales.x.grid.color = gridColor;
                chart.options.scales.x.ticks.color = textColor;
                if (chart.options.scales.x.ticks.font) {
                    chart.options.scales.x.ticks.font.family = 'Plus Jakarta Sans';
                }
            }
            if (chart.options.scales.y) {
                chart.options.scales.y.grid.color = gridColor;
                chart.options.scales.y.ticks.color = textColor;
                if (chart.options.scales.y.ticks.font) {
                    chart.options.scales.y.ticks.font.family = 'Plus Jakarta Sans';
                }
            }
            if (chart.options.scales.y1) {
                chart.options.scales.y1.ticks.color = textColor;
                if (chart.options.scales.y1.ticks.font) {
                    chart.options.scales.y1.ticks.font.family = 'Plus Jakarta Sans';
                }
            }
        }
        if (chart.options.plugins && chart.options.plugins.legend) {
            chart.options.plugins.legend.labels.color = textColor;
            if (chart.options.plugins.legend.labels.font) {
                chart.options.plugins.legend.labels.font.family = 'Plus Jakarta Sans';
            }
        }
        chart.update();
    }
    
    // Update Leaflet Map Tile Layer if it exists
    if (mapInstance && tileLayerInstance) {
        const tileUrl = theme === 'dark' 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        tileLayerInstance.setUrl(tileUrl);
    }
}

// Initialize or Update Leaflet Map
function initOrUpdateMap(lat, lng, statusText, color, roadName) {
    const isDark = document.body.classList.contains('dark-theme');
    
    // Choose tile layer URL based on active theme
    const tileUrl = isDark 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        
    if (!mapInstance) {
        // Create map instance
        mapInstance = L.map('map-container').setView([lat, lng], 14);
        
        // Add Tile Layer
        tileLayerInstance = L.tileLayer(tileUrl, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(mapInstance);
    } else {
        // Map already exists, pan and zoom to new location
        mapInstance.setView([lat, lng], 14);
    }
    
    // Create custom pulsing marker icon
    const customIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `<div class="marker-dot" style="background-color: ${color}; --pulse-color: ${color}4d;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    
    // Add or move marker
    if (mapMarker) {
        mapMarker.setLatLng([lat, lng]);
        mapMarker.setIcon(customIcon);
    } else {
        mapMarker = L.marker([lat, lng], { icon: customIcon }).addTo(mapInstance);
    }
    
    // Open Popup
    mapMarker.bindPopup(`
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px;">
            <b style="font-size: 14px; color: var(--text-primary);">${roadName}</b><br>
            <span style="color: var(--text-secondary);">Flow Status:</span> 
            <span style="color: ${color}; font-weight: 700;">${statusText}</span>
        </div>
    `, { closeButton: false }).openPopup();
    
    // Recalculate sizes in case container was hidden/resized
    setTimeout(() => {
        if (mapInstance) {
            mapInstance.invalidateSize();
        }
    }, 150);
}

// Apply quick presets for traffic simulation
function applyPreset(presetName) {
    const area = document.getElementById('pred-area').value;
    if (!area) {
        alert("Please select an Area Zone first to activate presets.");
        return;
    }
    
    const weather = document.getElementById('pred-weather');
    const roadwork = document.getElementById('pred-roadwork');
    const volume = document.getElementById('pred-volume');
    const incidents = document.getElementById('pred-incidents');
    const pedestrians = document.getElementById('pred-pedestrians');
    
    if (presetName === 'normal') {
        weather.value = 'Clear';
        roadwork.checked = false;
        volume.value = 25000;
        incidents.value = 0;
        pedestrians.value = 100;
    } else if (presetName === 'waterlogging') {
        weather.value = 'Rain';
        roadwork.checked = true;
        volume.value = Math.max(volume.value, 35000);
        incidents.value = Math.max(incidents.value, 3);
        pedestrians.value = Math.max(pedestrians.value, 120);
    } else if (presetName === 'metro') {
        weather.value = 'Clear';
        roadwork.checked = true;
        volume.value = Math.max(volume.value, 40000);
        incidents.value = Math.max(incidents.value, 2);
        pedestrians.value = Math.max(pedestrians.value, 150);
    } else if (presetName === 'protest') {
        weather.value = 'Clear';
        roadwork.checked = false;
        volume.value = Math.max(volume.value, 48000);
        incidents.value = Math.max(incidents.value, 5);
        pedestrians.value = Math.max(pedestrians.value, 180);
    }
    
    // Trigger change events to update slide value labels
    document.getElementById('val-volume').innerText = parseInt(volume.value).toLocaleString();
    document.getElementById('val-incidents').innerText = incidents.value;
    document.getElementById('val-pedestrians').innerText = pedestrians.value;
    
    // Dispatch roadwork toggle event to update label text
    roadwork.dispatchEvent(new Event('change'));
    
    // Programmatically click predict to execute instantly
    document.getElementById('btn-predict').click();
}

// Calculate hourly traffic predictions across the day (Batch Predictions)
function initOrUpdateHourlyChart(volume, area, road, weather, roadwork, incidents, pedestrians) {
    const hours = ['12 AM', '3 AM', '6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'];
    const multipliers = [0.15, 0.05, 0.30, 1.0, 0.65, 0.55, 1.15, 0.80];
    
    const promises = multipliers.map(mult => {
        const hourlyVol = Math.round(volume * mult);
        return fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                area,
                road,
                weather,
                roadwork,
                volume: hourlyVol,
                incidents,
                pedestrians,
                date: document.getElementById('pred-date').value
            })
        }).then(r => r.json());
    });
    
    Promise.all(promises)
    .then(results => {
        const congestions = results.map(res => res.success ? res.predictions['Congestion Level'] : 0);
        
        // Show hourly card container
        document.getElementById('hourly-profile-card').classList.remove('d-none');
        
        // Render Chart.js line graph
        renderHourlyChart(hours, congestions);
        
        // Determine Best Off-Peak Commute Hour (between 7 AM and 10 PM)
        // Indices map: 9 AM (3), 12 PM (4), 3 PM (5), 9 PM (7). Skip 6 PM evening rush (6) and night slots.
        const offPeakIndices = [3, 4, 5, 7];
        let minCong = 100;
        let bestIdx = 5; // default 3 PM
        
        offPeakIndices.forEach(idx => {
            if (congestions[idx] < minCong) {
                minCong = congestions[idx];
                bestIdx = idx;
            }
        });
        
        const bestTimeStr = hours[bestIdx];
        const bestVal = congestions[bestIdx].toFixed(0);
        document.getElementById('best-travel-window').innerText = `Best Commute: ${bestTimeStr} (${bestVal}% Congest.)`;
    })
    .catch(err => {
        console.error("Hourly profile calculation failed:", err);
    });
}

// Render hourly Chart.js line graph
function renderHourlyChart(labels, data) {
    const ctx = document.getElementById('hourlyCongestionChart').getContext('2d');
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#94a3b8' : '#334155';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.06)';
    
    if (charts.hourlyProfile) {
        charts.hourlyProfile.data.labels = labels;
        charts.hourlyProfile.data.datasets[0].data = data;
        charts.hourlyProfile.options.scales.x.ticks.color = textColor;
        charts.hourlyProfile.options.scales.x.grid.color = gridColor;
        charts.hourlyProfile.options.scales.y.ticks.color = textColor;
        charts.hourlyProfile.options.scales.y.grid.color = gridColor;
        charts.hourlyProfile.update();
    } else {
        charts.hourlyProfile = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Congestion Level (%)',
                    data: data,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2,
                    pointBackgroundColor: '#10b981',
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 9 } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 9 }, callback: v => v + '%' },
                        min: 0,
                        max: 100
                    }
                }
            }
        });
    }
}

// Print / Export PDF Analysis Report
function exportPDFReport() {
    window.print();
}
