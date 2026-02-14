/**
 * Client-side logger with environment detection
 * Automatically disables logs in production
 */
(function() {
  'use strict';
  
  // Check if we're in development mode
  const isDevelopment = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' ||
                        window.location.search.includes('debug=true');
  
  // Create logger object
  window.logger = {
    debug: function(message, ...args) {
      if (isDevelopment) {
        console.log('[DEBUG] ' + message, ...args);
      }
    },
    
    info: function(message, ...args) {
      if (isDevelopment) {
        console.info('[INFO] ' + message, ...args);
      }
    },
    
    warn: function(message, ...args) {
      // Always show warnings (even in production)
      console.warn('[WARN] ' + message, ...args);
    },
    
    error: function(message, error, ...args) {
      // Always show errors (even in production)
      if (error instanceof Error) {
        console.error('[ERROR] ' + message, {
          message: error.message,
          stack: error.stack
        }, ...args);
      } else {
        console.error('[ERROR] ' + message, error, ...args);
      }
    }
  };
  
  // Provide a way to enable debug mode
  window.enableDebugLogs = function() {
    console.log('✅ Debug logs enabled for this session');
    window.location.search = window.location.search ? 
      window.location.search + '&debug=true' : 
      '?debug=true';
  };
})();
