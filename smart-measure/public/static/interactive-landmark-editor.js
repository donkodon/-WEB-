/**
 * InteractiveLandmarkEditor - Interactive landmark editing with drag & drop
 * Phase 2: Edit landmarks, real-time measurement updates, save/reset
 */

class InteractiveLandmarkEditor {
  constructor(canvasId, data) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element with id "${canvasId}" not found`);
    }
    
    this.ctx = this.canvas.getContext('2d');
    this.data = data;
    
    // Deep copy landmarks for editing
    this.landmarks = JSON.parse(JSON.stringify(data.landmarks));
    this.originalLandmarks = JSON.parse(JSON.stringify(data.landmarks));
    
    this.pixelPerCm = data.pixel_per_cm;
    this.calculator = new MeasurementCalculator(this.pixelPerCm);
    
    // UI state
    this.selectedLandmark = null;
    this.hoveredLandmark = null;
    this.isDragging = false;
    this.landmarkRadius = 8;
    this.image = null;
    
    // History for undo/redo
    this.history = [];
    this.historyIndex = -1;
    this.maxHistorySize = 50;
    
    // Save initial state to history
    this.saveToHistory();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Load image
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
      this.updateHistoryButtons();
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
   * Setup mouse and touch event listeners
   */
  setupEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
    
    // Touch events for mobile
    this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
    this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
    this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
  }
  
  /**
   * Get mouse position relative to canvas
   */
  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }
  
  /**
   * Get touch position relative to canvas
   */
  getTouchPos(e) {
    if (e.touches.length === 0) return null;
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY
    };
  }
  
  /**
   * Find landmark at position
   */
  findLandmarkAtPosition(x, y) {
    for (const [id, landmark] of Object.entries(this.landmarks)) {
      const distance = Math.sqrt(
        Math.pow(landmark.x - x, 2) + Math.pow(landmark.y - y, 2)
      );
      if (distance <= this.landmarkRadius * 2) {
        return id;
      }
    }
    return null;
  }
  
  /**
   * Mouse down event handler
   */
  onMouseDown(e) {
    const pos = this.getMousePos(e);
    const landmarkId = this.findLandmarkAtPosition(pos.x, pos.y);
    
    if (landmarkId) {
      this.selectedLandmark = landmarkId;
      this.isDragging = true;
      this.canvas.style.cursor = 'grabbing';
      
      window.logger.debug(`🖱️ Selected landmark ${landmarkId}`);
    }
  }
  
  /**
   * Mouse move event handler
   */
  onMouseMove(e) {
    const pos = this.getMousePos(e);
    
    if (this.isDragging && this.selectedLandmark) {
      // Update landmark position
      this.landmarks[this.selectedLandmark].x = pos.x;
      this.landmarks[this.selectedLandmark].y = pos.y;
      
      // Re-render
      this.render();
      this.updateMeasurementsPanel();
    } else {
      // Hover detection
      const hoveredId = this.findLandmarkAtPosition(pos.x, pos.y);
      
      if (hoveredId !== this.hoveredLandmark) {
        this.hoveredLandmark = hoveredId;
        this.render();
      }
      
      this.canvas.style.cursor = hoveredId ? 'grab' : 'default';
    }
  }
  
  /**
   * Mouse up event handler
   */
  onMouseUp(e) {
    if (this.isDragging && this.selectedLandmark) {
      window.logger.debug(`✅ Released landmark ${this.selectedLandmark}`);
      
      // Save to history
      this.saveToHistory();
      
      this.isDragging = false;
      this.selectedLandmark = null;
      this.canvas.style.cursor = 'default';
    }
  }
  
  /**
   * Mouse leave event handler
   */
  onMouseLeave(e) {
    if (this.isDragging) {
      this.onMouseUp(e);
    }
    this.hoveredLandmark = null;
    this.render();
  }
  
  /**
   * Touch start event handler
   */
  onTouchStart(e) {
    e.preventDefault();
    const pos = this.getTouchPos(e);
    if (!pos) return;
    
    const landmarkId = this.findLandmarkAtPosition(pos.x, pos.y);
    
    if (landmarkId) {
      this.selectedLandmark = landmarkId;
      this.isDragging = true;
    }
  }
  
  /**
   * Touch move event handler
   */
  onTouchMove(e) {
    e.preventDefault();
    if (!this.isDragging || !this.selectedLandmark) return;
    
    const pos = this.getTouchPos(e);
    if (!pos) return;
    
    this.landmarks[this.selectedLandmark].x = pos.x;
    this.landmarks[this.selectedLandmark].y = pos.y;
    
    this.render();
    this.updateMeasurementsPanel();
  }
  
  /**
   * Touch end event handler
   */
  onTouchEnd(e) {
    e.preventDefault();
    if (this.isDragging && this.selectedLandmark) {
      this.saveToHistory();
      this.isDragging = false;
      this.selectedLandmark = null;
    }
  }
  
  /**
   * Keyboard event handler
   */
  onKeyDown(e) {
    // Ctrl+Z / Cmd+Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    }
    
    // Ctrl+Shift+Z / Cmd+Shift+Z: Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      this.redo();
    }
    
    // Ctrl+Y / Cmd+Y: Redo (alternative)
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      this.redo();
    }
  }
  
  /**
   * Save current state to history
   */
  saveToHistory() {
    // Remove future states if we're in the middle of history
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    // Add current state
    this.history.push(JSON.parse(JSON.stringify(this.landmarks)));
    
    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
    
    this.updateHistoryButtons();
    
    window.logger.debug(`💾 Saved to history (${this.historyIndex + 1}/${this.history.length})`);
  }
  
  /**
   * Undo last change
   */
  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.landmarks = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
      this.render();
      this.updateMeasurementsPanel();
      this.updateHistoryButtons();
      
      window.logger.debug(`↩️ Undo (${this.historyIndex + 1}/${this.history.length})`);
    }
  }
  
  /**
   * Redo last undone change
   */
  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.landmarks = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
      this.render();
      this.updateMeasurementsPanel();
      this.updateHistoryButtons();
      
      window.logger.debug(`↪️ Redo (${this.historyIndex + 1}/${this.history.length})`);
    }
  }
  
  /**
   * Reset landmarks to original state
   */
  reset() {
    this.landmarks = JSON.parse(JSON.stringify(this.originalLandmarks));
    this.history = [JSON.parse(JSON.stringify(this.originalLandmarks))];
    this.historyIndex = 0;
    this.render();
    this.updateMeasurementsPanel();
    this.updateHistoryButtons();
    
    window.logger.debug('🔄 Reset to original landmarks');
  }
  
  /**
   * Update undo/redo button states
   */
  updateHistoryButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    
    if (undoBtn) {
      undoBtn.disabled = this.historyIndex <= 0;
      undoBtn.classList.toggle('opacity-50', this.historyIndex <= 0);
      undoBtn.classList.toggle('cursor-not-allowed', this.historyIndex <= 0);
    }
    
    if (redoBtn) {
      redoBtn.disabled = this.historyIndex >= this.history.length - 1;
      redoBtn.classList.toggle('opacity-50', this.historyIndex >= this.history.length - 1);
      redoBtn.classList.toggle('cursor-not-allowed', this.historyIndex >= this.history.length - 1);
    }
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
      
      if (!point1 || !point2) return;
      
      // Draw line with shadow for better visibility
      this.ctx.save();
      
      // Shadow for depth
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetX = 2;
      this.ctx.shadowOffsetY = 2;
      
      // Draw thicker line
      this.ctx.strokeStyle = def.color;
      this.ctx.lineWidth = 4;  // Increased from 2 to 4
      this.ctx.setLineDash([8, 6]);  // Longer dashes for better visibility
      this.ctx.beginPath();
      this.ctx.moveTo(point1.x, point1.y);
      this.ctx.lineTo(point2.x, point2.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      
      this.ctx.restore();
      
      // Calculate measurement
      const distance = this.calculator.calculateMeasurement(point1, point2);
      
      // Draw measurement label at midpoint
      const midX = (point1.x + point2.x) / 2;
      const midY = (point1.y + point2.y) / 2;
      
      // Draw background box with border
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
      this.ctx.strokeStyle = def.color;
      this.ctx.lineWidth = 3;  // Thicker border
      
      const text = `${distance.toFixed(1)} cm`;
      this.ctx.font = 'bold 16px Arial';  // Larger font
      const metrics = this.ctx.measureText(text);
      const padding = 8;  // More padding
      
      const boxX = midX - metrics.width / 2 - padding;
      const boxY = midY - 22;
      const boxWidth = metrics.width + padding * 2;
      const boxHeight = 32;
      
      // Draw box with rounded corners
      this.ctx.beginPath();
      const radius = 6;
      this.ctx.moveTo(boxX + radius, boxY);
      this.ctx.lineTo(boxX + boxWidth - radius, boxY);
      this.ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
      this.ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
      this.ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
      this.ctx.lineTo(boxX + radius, boxY + boxHeight);
      this.ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
      this.ctx.lineTo(boxX, boxY + radius);
      this.ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
      
      // Draw text
      this.ctx.fillStyle = def.color;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(text, midX, midY - 6);
      
      // Draw line label with background
      this.ctx.font = 'bold 13px Arial';  // Larger and bold
      this.ctx.fillStyle = '#374151';  // Darker color
      this.ctx.textBaseline = 'bottom';
      this.ctx.fillText(def.label, midX, midY - 28);
    });
  }
  
  /**
   * Draw landmarks with hover and selection states
   */
  drawLandmarks() {
    Object.entries(this.landmarks).forEach(([id, landmark]) => {
      const { x, y, conf } = landmark;
      
      // Check if this is hovered or selected
      const isHovered = this.hoveredLandmark === id;
      const isSelected = this.selectedLandmark === id;
      
      // Confidence-based color
      let color = '#10b981'; // green-500
      if (conf < 0.6) {
        color = '#ef4444'; // red-500
      } else if (conf < 0.8) {
        color = '#f59e0b'; // amber-500
      }
      
      // Draw hover/selection highlight with glow
      if (isHovered || isSelected) {
        this.ctx.save();
        this.ctx.shadowColor = isSelected ? 'rgba(59, 130, 246, 0.5)' : 'rgba(156, 163, 175, 0.5)';
        this.ctx.shadowBlur = 15;
        this.ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(156, 163, 175, 0.25)';
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.landmarkRadius * 3, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.restore();
      }
      
      // Draw landmark point with shadow
      this.ctx.save();
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      this.ctx.shadowBlur = 5;
      this.ctx.shadowOffsetX = 2;
      this.ctx.shadowOffsetY = 2;
      
      const radius = (isHovered || isSelected) ? this.landmarkRadius * 1.5 : this.landmarkRadius * 1.2;
      this.ctx.fillStyle = color;
      this.ctx.strokeStyle = isSelected ? '#3b82f6' : '#ffffff';
      this.ctx.lineWidth = isSelected ? 4 : 3;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
      this.ctx.fill();
      this.ctx.stroke();
      
      this.ctx.restore();
      
      // Draw landmark ID with better contrast
      this.ctx.fillStyle = '#ffffff';
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 4;
      this.ctx.font = 'bold 11px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.strokeText(id, x, y);
      this.ctx.fillText(id, x, y);
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
    html += '測定値（リアルタイム更新）</h3>';
    html += '<div class="space-y-3">';
    
    Object.entries(MEASUREMENT_DEFINITIONS).forEach(([key, def]) => {
      const point1 = this.landmarks[def.points[0]];
      const point2 = this.landmarks[def.points[1]];
      
      if (point1 && point2) {
        const distance = this.calculator.calculateMeasurement(point1, point2);
        const originalValue = this.data.measurements[key];
        
        let diffHtml = '';
        let statusIcon = '';
        
        if (originalValue !== undefined) {
          const diff = distance - originalValue;
          const diffText = diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
          const diffColor = Math.abs(diff) < 0.5 ? '#10b981' : Math.abs(diff) < 2.0 ? '#f59e0b' : '#ef4444';
          
          if (Math.abs(diff) < 0.1) {
            statusIcon = '<i class="fas fa-check-circle text-green-500 ml-2"></i>';
          } else if (Math.abs(diff) < 2.0) {
            statusIcon = '<i class="fas fa-exclamation-triangle text-amber-500 ml-2"></i>';
          } else {
            statusIcon = '<i class="fas fa-exclamation-circle text-red-500 ml-2"></i>';
          }
          
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
          <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <div class="w-3 h-3 rounded-full mr-2" style="background-color: ${def.color};"></div>
                <span class="font-medium text-gray-700">${def.label}</span>
                ${statusIcon}
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
          <span>編集中:</span>
          <span class="text-blue-600 font-bold">Phase 2</span>
        </div>
      </div>
    `;
    
    panel.innerHTML = html;
  }
  
  /**
   * Get current measurements
   */
  getCurrentMeasurements() {
    const measurements = {};
    Object.entries(MEASUREMENT_DEFINITIONS).forEach(([key, def]) => {
      const point1 = this.landmarks[def.points[0]];
      const point2 = this.landmarks[def.points[1]];
      if (point1 && point2) {
        measurements[key] = this.calculator.calculateMeasurement(point1, point2);
      }
    });
    return measurements;
  }
  
  /**
   * Save landmarks to server
   */
  async save() {
    try {
      const saveBtn = document.getElementById('btn-save');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>保存中...';
      }
      
      const response = await fetch(`/api/measurements/${this.data.sku}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manual_landmarks: this.landmarks,
          measurements: this.getCurrentMeasurements()
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        window.logger.debug('✅ Landmarks saved successfully');
        
        // Show success message
        this.showToast('保存しました！', 'success');
        
        // Update original landmarks
        this.originalLandmarks = JSON.parse(JSON.stringify(this.landmarks));
      } else {
        throw new Error(result.error || '保存に失敗しました');
      }
      
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>保存';
      }
    } catch (error) {
      window.logger.error('❌ Save error:', error);
      this.showToast('保存に失敗しました: ' + error.message, 'error');
      
      const saveBtn = document.getElementById('btn-save');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>保存';
      }
    }
  }
  
  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    
    toast.className = `fixed bottom-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center animate-fade-in`;
    toast.innerHTML = `<i class="fas ${icon} mr-2"></i>${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'fade-out 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}
