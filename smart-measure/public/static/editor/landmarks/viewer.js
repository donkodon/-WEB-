/**
 * LandmarkViewer - Display landmarks and measurements on canvas
 * Phase 1: Static display with measurements
 */

class LandmarkViewer {
  constructor(canvasId, data) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element with id "${canvasId}" not found`);
    }
    
    this.ctx = this.canvas.getContext('2d');
    this.data = data;
    this.landmarks = data.landmarks;
    this.pixelPerCm = data.pixel_per_cm;
    this.calculator = new MeasurementCalculator(this.pixelPerCm);
    
    this.landmarkRadius = 6;
    this.image = null;
    
    this.loadImage();
  }
  
  /**
   * Load image and render when ready
   */
  loadImage() {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = this.data.image_url;
    
    img.onload = () => {
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.image = img;
      this.render();
      this.updateMeasurementsPanel();
    };
    
    img.onerror = () => {
      window.logger.error('Failed to load image:', this.data.image_url);
      this.showError('画像の読み込みに失敗しました');
    };
  }
  
  /**
   * Show error message on canvas
   */
  showError(message) {
    this.ctx.fillStyle = '#fee2e2';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#991b1b';
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
  }
  
  /**
   * Main render function
   */
  render() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw image
    if (this.image) {
      this.ctx.drawImage(this.image, 0, 0);
    }
    
    // Draw measurement lines
    this.drawMeasurementLines();
    
    // Draw landmarks
    this.drawLandmarks();
  }
  
  /**
   * Draw measurement lines with labels
   */
  drawMeasurementLines() {
    Object.entries(MEASUREMENT_DEFINITIONS).forEach(([key, def]) => {
      const point1 = this.landmarks[def.points[0]];
      const point2 = this.landmarks[def.points[1]];
      
      if (!point1 || !point2) {
        window.logger.warn(`Landmark not found for ${key}: ${def.points[0]}, ${def.points[1]}`);
        return;
      }
      
      // Draw line
      this.ctx.strokeStyle = def.color;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 5]);
      this.ctx.beginPath();
      this.ctx.moveTo(point1.x, point1.y);
      this.ctx.lineTo(point2.x, point2.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      
      // Calculate measurement
      const distance = this.calculator.calculateMeasurement(point1, point2);
      
      // Draw measurement label at midpoint
      const midX = (point1.x + point2.x) / 2;
      const midY = (point1.y + point2.y) / 2;
      
      // Background for text
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      this.ctx.strokeStyle = def.color;
      this.ctx.lineWidth = 2;
      
      const text = `${distance.toFixed(1)} cm`;
      this.ctx.font = 'bold 14px Arial';
      const metrics = this.ctx.measureText(text);
      const padding = 6;
      
      this.ctx.fillRect(
        midX - metrics.width / 2 - padding,
        midY - 18,
        metrics.width + padding * 2,
        26
      );
      
      // Draw text
      this.ctx.fillStyle = def.color;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(text, midX, midY);
      
      // Draw line label (measurement name)
      this.ctx.font = '11px Arial';
      this.ctx.fillStyle = '#6b7280';
      this.ctx.fillText(def.label, midX, midY - 22);
    });
  }
  
  /**
   * Draw landmarks with confidence-based colors
   */
  drawLandmarks() {
    Object.entries(this.landmarks).forEach(([id, landmark]) => {
      const { x, y, conf } = landmark;
      
      // Confidence-based color
      let color = '#10b981'; // green-500 (high confidence)
      if (conf < 0.6) {
        color = '#ef4444'; // red-500 (low confidence)
      } else if (conf < 0.8) {
        color = '#f59e0b'; // amber-500 (medium confidence)
      }
      
      // Draw landmark point
      this.ctx.fillStyle = color;
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(x, y, this.landmarkRadius, 0, 2 * Math.PI);
      this.ctx.fill();
      this.ctx.stroke();
      
      // Draw landmark ID
      this.ctx.fillStyle = '#ffffff';
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 3;
      this.ctx.font = 'bold 10px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.strokeText(id, x, y + 4);
      this.ctx.fillText(id, x, y + 4);
    });
  }
  
  /**
   * Update measurements panel with current values
   */
  updateMeasurementsPanel() {
    const panel = document.getElementById('measurements-panel');
    if (!panel) return;
    
    let html = '<h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">';
    html += '<i class="fas fa-ruler-combined mr-2 text-blue-600"></i>';
    html += '測定値</h3>';
    html += '<div class="space-y-3">';
    
    Object.entries(MEASUREMENT_DEFINITIONS).forEach(([key, def]) => {
      const point1 = this.landmarks[def.points[0]];
      const point2 = this.landmarks[def.points[1]];
      
      if (point1 && point2) {
        const distance = this.calculator.calculateMeasurement(point1, point2);
        const originalValue = this.data.measurements[key];
        
        let diffHtml = '';
        if (originalValue !== undefined) {
          const diff = distance - originalValue;
          const diffText = diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
          const diffColor = Math.abs(diff) < 0.5 ? '#10b981' : '#f59e0b';
          
          diffHtml = `
            <div class="text-xs text-gray-500 mt-1">
              元: ${originalValue.toFixed(2)} cm 
              <span style="color: ${diffColor}; font-weight: bold;">
                (差: ${diffText} cm)
              </span>
            </div>
          `;
        }
        
        html += `
          <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <div class="w-3 h-3 rounded-full mr-2" style="background-color: ${def.color};"></div>
                <span class="font-medium text-gray-700">${def.label}</span>
              </div>
              <span class="text-lg font-bold" style="color: ${def.color};">
                ${distance.toFixed(1)} <span class="text-sm text-gray-500">cm</span>
              </span>
            </div>
            ${diffHtml}
          </div>
        `;
      }
    });
    
    html += '</div>';
    
    // Add legend
    html += `
      <div class="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <h4 class="text-sm font-bold text-blue-900 mb-2">
          <i class="fas fa-info-circle mr-1"></i>凡例
        </h4>
        <div class="space-y-1 text-xs">
          <div class="flex items-center">
            <div class="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
            <span class="text-gray-700">高精度 (信頼度 > 0.8)</span>
          </div>
          <div class="flex items-center">
            <div class="w-3 h-3 rounded-full bg-amber-500 mr-2"></div>
            <span class="text-gray-700">中精度 (信頼度 0.6-0.8)</span>
          </div>
          <div class="flex items-center">
            <div class="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
            <span class="text-gray-700">低精度 (信頼度 < 0.6)</span>
          </div>
        </div>
      </div>
    `;
    
    // Add metadata
    html += `
      <div class="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
        <div class="flex items-center justify-between mb-1">
          <span>基準:</span>
          <span class="font-mono">${this.pixelPerCm.toFixed(2)} px/cm</span>
        </div>
        <div class="flex items-center justify-between mb-1">
          <span>SKU:</span>
          <span class="font-mono font-bold">${this.data.sku}</span>
        </div>
        <div class="flex items-center justify-between">
          <span>測定日時:</span>
          <span>${new Date(this.data.measured_at).toLocaleString('ja-JP')}</span>
        </div>
      </div>
    `;
    
    panel.innerHTML = html;
  }
}
