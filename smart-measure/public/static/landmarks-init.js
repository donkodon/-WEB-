// Initialize Interactive Landmark Editor
let editor = null;

(async function() {
  try {
    // Read SKU from data attribute
    const appContainer = document.getElementById('landmarks-app');
    if (!appContainer) {
      throw new Error('App container not found');
    }
    
    const sku = appContainer.dataset.sku;
    window.logger.debug('🚀 Loading measurement data for SKU:', sku);
    
    const response = await fetch('/api/measurements/' + sku);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to load measurement data');
    }
    
    window.logger.debug('✅ Loaded measurement data:', result.measurement);
    
    // Initialize editor when DOM is ready
    const imageElement = document.getElementById('landmark-image');
    if (!imageElement) {
      throw new Error('Image element not found');
    }
    
    // Wait for image to load before initializing editor
    if (imageElement.complete) {
      initializeEditor();
    } else {
      imageElement.addEventListener('load', initializeEditor);
    }
    
    function initializeEditor() {
      editor = new InteractiveLandmarkEditor({
        imageElement: imageElement,
        landmarks: result.measurement.landmarks || [],
        onSave: async (landmarks) => {
          try {
            window.logger.debug('💾 Saving landmarks:', landmarks);
            
            const saveResponse = await fetch('/api/measurements/' + sku + '/landmarks', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ landmarks }),
            });
            
            const saveResult = await saveResponse.json();
            
            if (!saveResult.success) {
              throw new Error(saveResult.error || 'Failed to save landmarks');
            }
            
            window.logger.debug('✅ Landmarks saved successfully');
            alert('ランドマークを保存しました');
          } catch (error) {
            window.logger.error('❌ Error saving landmarks:', error);
            alert('保存に失敗しました: ' + error.message);
          }
        }
      });
      
      window.logger.debug('✅ Interactive Landmark Editor initialized');
    }
  } catch (error) {
    window.logger.error('❌ Error initializing editor:', error);
    alert('エラーが発生しました: ' + error.message);
  }
})();
