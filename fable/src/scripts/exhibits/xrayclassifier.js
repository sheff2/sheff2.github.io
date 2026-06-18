import { gsap } from 'gsap';
import { fetchJSON, setupCanvas, heat, COLORS, MONO, reducedMotion } from './util.js';

export default async function init(root) {
  const data = await fetchJSON(root.dataset.src);
  if (!data) return;

  // State management
  let currentSample = data.samples[0];
  let currentThreshold = 0.5;
  let showHeatmap = false;

  // UI elements
  const samplesContainer = root.querySelector('[data-samples]');
  const xrayImage = root.querySelector('[data-xray-image]');
  const heatmapCanvas = root.querySelector('[data-heatmap]');
  const heatmapToggle = root.querySelector('[data-toggle-heatmap]');
  const predictionsContainer = root.querySelector('[data-predictions]');
  const thresholdSlider = root.querySelector('[data-threshold]');
  const thresholdValue = root.querySelector('[data-threshold-value]');
  const confidenceSpan = root.querySelector('[data-confidence]');
  const currentPredictionSpan = root.querySelector('[data-current-prediction]');

  const heatmapCtx = setupCanvas(heatmapCanvas);

  // Create sample selector buttons
  function createSampleButtons() {
    samplesContainer.innerHTML = '';

    data.samples.forEach((sample, index) => {
      const button = document.createElement('button');
      button.className = 'btn btn--small';
      button.type = 'button';
      button.textContent = sample.label;
      button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
      button.dataset.sampleId = sample.id;

      button.addEventListener('click', () => {
        currentSample = sample;
        updateDisplay();

        // Update button states
        samplesContainer.querySelectorAll('button').forEach(btn => {
          btn.setAttribute('aria-pressed', 'false');
        });
        button.setAttribute('aria-pressed', 'true');
      });

      samplesContainer.appendChild(button);
    });
  }

  // Generate synthetic X-ray SVG
  function generateXraySVG(sample) {
    const diseases = Object.keys(sample.groundTruth).filter(d => sample.groundTruth[d]);
    const hasFindings = diseases.length > 0;

    let svgContent = `
      <svg viewBox="0 0 200 240" class="xray-placeholder">
        <defs>
          <radialGradient id="lungGrad-${sample.id}" cx="50%" cy="45%" r="60%">
            <stop offset="0%" style="stop-color:#2a2c30;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#1a1c20;stop-opacity:1" />
          </radialGradient>
          <filter id="noise-${sample.id}">
            <feTurbulence baseFrequency="0.9" numOctaves="1" />
            <feComposite in2="SourceGraphic" operator="multiply" />
          </filter>
        </defs>

        <!-- Background -->
        <rect width="200" height="240" fill="#0f1012" />

        <!-- Rib cage structure -->
        ${Array.from({length: 8}, (_, i) => `
          <ellipse cx="100" cy="${60 + i * 12}" rx="${65 + i * 2}" ry="1.5"
                   fill="none" stroke="#3a3c40" stroke-width="0.8" opacity="0.6" />
        `).join('')}

        <!-- Lung fields -->
        <ellipse cx="70" cy="120" rx="45" ry="70" fill="url(#lungGrad-${sample.id})" opacity="0.8" />
        <ellipse cx="130" cy="120" rx="45" ry="70" fill="url(#lungGrad-${sample.id})" opacity="0.8" />

        <!-- Heart silhouette -->
        <path d="M 85 90 Q 100 85 115 90 Q 125 100 115 130 Q 100 140 85 130 Q 75 100 85 90 Z"
              fill="#2a2c30" opacity="0.9" />
    `;

    // Add pathology based on ground truth
    if (diseases.includes('cardiomegaly')) {
      svgContent += `
        <path d="M 80 85 Q 100 78 120 85 Q 135 105 120 140 Q 100 155 80 140 Q 65 105 80 85 Z"
              fill="#353740" opacity="0.8" />
      `;
    }

    if (diseases.includes('effusion')) {
      svgContent += `
        <path d="M 40 180 Q 60 175 80 180 L 80 220 L 40 220 Z" fill="#404248" opacity="0.7" />
        <path d="M 120 180 Q 140 175 160 180 L 160 220 L 120 220 Z" fill="#404248" opacity="0.7" />
      `;
    }

    if (diseases.includes('pneumothorax')) {
      svgContent += `
        <line x1="45" y1="80" x2="45" y2="180" stroke="#484a50" stroke-width="1.5" opacity="0.8" />
        <rect x="20" y="80" width="25" height="100" fill="#1a1c20" opacity="0.6" />
      `;
    }

    if (diseases.includes('mass') || diseases.includes('nodule')) {
      const size = diseases.includes('mass') ? '12' : '6';
      svgContent += `
        <circle cx="85" cy="100" r="${size}" fill="#505258" opacity="0.9" />
      `;
    }

    if (diseases.includes('pneumonia') || diseases.includes('consolidation') || diseases.includes('infiltration')) {
      svgContent += `
        <g opacity="0.7">
          <circle cx="90" cy="140" r="8" fill="#404248" />
          <circle cx="110" cy="135" r="6" fill="#404248" />
          <circle cx="105" cy="155" r="7" fill="#404248" />
        </g>
      `;
    }

    svgContent += `
        <!-- Noise overlay -->
        <rect width="200" height="240" fill="white" opacity="0.02" filter="url(#noise-${sample.id})" />

        <!-- Patient info overlay -->
        <text x="10" y="15" fill="#666" font-family="monospace" font-size="8">${sample.id.toUpperCase()}</text>
        <text x="10" y="230" fill="#666" font-family="monospace" font-size="7">${sample.classification}</text>
      </svg>
    `;

    return svgContent;
  }

  // Generate heatmap visualization
  function generateHeatmap(sample) {
    const ctx = heatmapCtx;
    const { width, height } = ctx.canvas;

    ctx.clearRect(0, 0, width, height);

    // Create activation heatmap based on predictions
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Find regions of interest based on disease predictions
    const hotspots = [];

    if (sample.predictions.cardiomegaly > 0.3) {
      hotspots.push({ x: width * 0.5, y: height * 0.45, intensity: sample.predictions.cardiomegaly, radius: 40 });
    }

    if (sample.predictions.mass > 0.3) {
      hotspots.push({ x: width * 0.4, y: height * 0.4, intensity: sample.predictions.mass, radius: 25 });
    }

    if (sample.predictions.pneumonia > 0.3 || sample.predictions.infiltration > 0.3 || sample.predictions.consolidation > 0.3) {
      hotspots.push({ x: width * 0.45, y: height * 0.6, intensity: Math.max(sample.predictions.pneumonia, sample.predictions.infiltration, sample.predictions.consolidation), radius: 35 });
      hotspots.push({ x: width * 0.55, y: height * 0.55, intensity: Math.max(sample.predictions.pneumonia, sample.predictions.infiltration, sample.predictions.consolidation) * 0.8, radius: 30 });
    }

    if (sample.predictions.effusion > 0.3) {
      hotspots.push({ x: width * 0.25, y: height * 0.8, intensity: sample.predictions.effusion, radius: 30 });
      hotspots.push({ x: width * 0.75, y: height * 0.8, intensity: sample.predictions.effusion * 0.9, radius: 30 });
    }

    if (sample.predictions.pneumothorax > 0.3) {
      hotspots.push({ x: width * 0.2, y: height * 0.5, intensity: sample.predictions.pneumothorax, radius: 40 });
    }

    // Generate heatmap
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let totalIntensity = 0;

        hotspots.forEach(hotspot => {
          const distance = Math.sqrt((x - hotspot.x) ** 2 + (y - hotspot.y) ** 2);
          if (distance < hotspot.radius) {
            const influence = Math.exp(-(distance * distance) / (2 * (hotspot.radius / 3) ** 2));
            totalIntensity += hotspot.intensity * influence;
          }
        });

        totalIntensity = Math.min(totalIntensity, 1);

        const index = (y * width + x) * 4;

        if (totalIntensity > 0.1) {
          // Red-yellow heatmap
          const r = Math.floor(255 * totalIntensity);
          const g = Math.floor(255 * totalIntensity * 0.6);
          const b = 0;
          const a = Math.floor(180 * totalIntensity);

          data[index] = r;
          data[index + 1] = g;
          data[index + 2] = b;
          data[index + 3] = a;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // Create disease prediction bars
  function createPredictionBars() {
    predictionsContainer.innerHTML = '';

    // Sort diseases by prediction probability
    const sortedDiseases = [...data.diseases].sort((a, b) =>
      (currentSample.predictions[b.id] || 0) - (currentSample.predictions[a.id] || 0)
    );

    sortedDiseases.forEach(disease => {
      const probability = currentSample.predictions[disease.id] || 0;
      const isAboveThreshold = probability >= currentThreshold;
      const isGroundTruth = currentSample.groundTruth[disease.id] || false;

      const item = document.createElement('div');
      item.className = `disease-item ${isAboveThreshold ? 'positive' : ''}`;

      item.innerHTML = `
        <div class="disease-info">
          <span class="disease-name">
            ${disease.name}
            <span class="disease-abbrev">(${disease.abbreviation})</span>
            ${isGroundTruth ? ' ✓' : ''}
          </span>
        </div>
        <div class="probability-bar">
          <div class="probability-fill ${isAboveThreshold ? 'above-threshold' : ''}"
               style="width: ${probability * 100}%"></div>
        </div>
        <span class="probability-value">${(probability * 100).toFixed(1)}%</span>
      `;

      predictionsContainer.appendChild(item);
    });
  }

  // Update the entire display
  function updateDisplay() {
    // Update X-ray image
    xrayImage.innerHTML = generateXraySVG(currentSample);

    // Update heatmap
    if (showHeatmap) {
      generateHeatmap(currentSample);
    }

    // Update predictions
    createPredictionBars();

    // Update confidence display
    confidenceSpan.textContent = `${(currentSample.confidence * 100).toFixed(1)}%`;

    // Update current prediction text
    const positivePredictions = Object.keys(currentSample.predictions)
      .filter(disease => currentSample.predictions[disease] >= currentThreshold)
      .map(disease => data.diseases.find(d => d.id === disease)?.abbreviation || disease)
      .slice(0, 3);

    currentPredictionSpan.textContent = positivePredictions.length > 0 ?
      positivePredictions.join(', ') : 'No significant findings';

    // Animate changes
    if (!reducedMotion()) {
      gsap.fromTo(predictionsContainer.children,
        { opacity: 0, x: 10 },
        { opacity: 1, x: 0, duration: 0.3, stagger: 0.05 }
      );
    }
  }

  // Event handlers
  heatmapToggle.addEventListener('click', () => {
    showHeatmap = !showHeatmap;

    if (showHeatmap) {
      generateHeatmap(currentSample);
      heatmapCanvas.style.display = 'block';
      heatmapToggle.textContent = 'Hide Activation Heatmap';
    } else {
      heatmapCanvas.style.display = 'none';
      heatmapToggle.textContent = 'Show Activation Heatmap';
    }
  });

  thresholdSlider.addEventListener('input', () => {
    currentThreshold = parseFloat(thresholdSlider.value);
    thresholdValue.textContent = currentThreshold.toFixed(2);
    updateDisplay();
  });

  // Initialize
  createSampleButtons();
  updateDisplay();

  // Animation reveal
  if (!reducedMotion()) {
    gsap.fromTo(root.querySelector('.xray-display'),
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, delay: 0.2 }
    );

    gsap.fromTo(root.querySelector('.model-stats'),
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, delay: 0.4 }
    );
  }
}