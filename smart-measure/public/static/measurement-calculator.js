/**
 * MeasurementCalculator - Calculate measurements from landmarks
 * Phase 1: Basic calculation and display
 */

class MeasurementCalculator {
  constructor(pixelPerCm) {
    this.pixelPerCm = pixelPerCm;
  }
  
  /**
   * Calculate pixel distance between two points
   * @param {Object} point1 - {x, y}
   * @param {Object} point2 - {x, y}
   * @returns {number} - Distance in pixels
   */
  calculatePixelDistance(point1, point2) {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Convert pixel distance to cm
   * @param {number} pixelDistance - Distance in pixels
   * @returns {number} - Distance in cm
   */
  pixelToCm(pixelDistance) {
    return pixelDistance / this.pixelPerCm;
  }
  
  /**
   * Calculate measurement between two landmarks
   * @param {Object} point1 - {x, y, conf}
   * @param {Object} point2 - {x, y, conf}
   * @returns {number} - Distance in cm
   */
  calculateMeasurement(point1, point2) {
    const pixelDistance = this.calculatePixelDistance(point1, point2);
    return this.pixelToCm(pixelDistance);
  }
}

/**
 * Measurement definitions for garment measurements
 * Maps measurement names to landmark pairs
 */
const MEASUREMENT_DEFINITIONS = {
  shoulder_width: {
    label: '肩幅',
    label_en: 'Shoulder Width',
    points: [7, 33],  // shoulder_left_top → shoulder_right_top
    description: 'Distance between left and right shoulder points',
    color: '#3b82f6'  // blue-500
  },
  body_width: {
    label: '身幅',
    label_en: 'Body Width',
    points: [16, 24],  // armpit_left → armpit_right
    description: 'Distance between left and right armpit points',
    color: '#10b981'  // green-500
  },
  body_length: {
    label: '着丈',
    label_en: 'Body Length',
    points: [3, 20],  // neck_center_forward → hem_center
    description: 'Distance from neck center to hem center',
    color: '#f59e0b'  // amber-500
  },
  sleeve_length: {
    label: '袖丈（左）',
    label_en: 'Sleeve Length (Left)',
    points: [7, 11],  // shoulder_left_top → cuff_left_outer
    description: 'Distance from left shoulder to left cuff',
    color: '#8b5cf6'  // violet-500
  },
  sleeve_length_right: {
    label: '袖丈（右）',
    label_en: 'Sleeve Length (Right)',
    points: [33, 29],  // shoulder_right_top → cuff_right_outer
    description: 'Distance from right shoulder to right cuff',
    color: '#ec4899'  // pink-500
  },
  neck_width: {
    label: '首幅',
    label_en: 'Neck Width',
    points: [2, 4],  // neck_left_outer → neck_right_outer
    description: 'Distance between left and right neck points',
    color: '#06b6d4'  // cyan-500
  }
};

/**
 * Landmark names mapping (ID to name)
 */
const LANDMARK_NAMES = {
  1: 'neck_left_forward',
  2: 'neck_left_outer',
  3: 'neck_center_forward',
  4: 'neck_right_outer',
  5: 'neck_right_forward',
  6: 'shoulder_right_inner',
  7: 'shoulder_left_top',
  8: 'sleeve_outer_left_upper',
  9: 'sleeve_inner_left_upper',
  10: 'cuff_left_inner',
  11: 'cuff_left_outer',
  12: 'sleeve_inner_left_lower',
  13: 'sleeve_outer_left_lower',
  14: 'armpit_left_inner',
  15: 'waist_left',
  16: 'armpit_left',
  17: 'body_left_lower',
  18: 'hem_left_outer',
  19: 'hem_left',
  20: 'hem_center',
  21: 'hem_right',
  22: 'hem_right_outer',
  23: 'body_right_lower',
  24: 'armpit_right',
  25: 'waist_right',
  26: 'armpit_right_inner',
  27: 'sleeve_outer_right_lower',
  28: 'sleeve_inner_right_lower',
  29: 'cuff_right_outer',
  30: 'cuff_right_inner',
  31: 'sleeve_inner_right_upper',
  32: 'sleeve_outer_right_upper',
  33: 'shoulder_right_top'
};
