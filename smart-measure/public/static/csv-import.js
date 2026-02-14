(function() {
    window.logger.debug('📋 CSV Import Script Loaded');
    
    // Restore last import log from localStorage
    try {
        const lastLog = localStorage.getItem('lastCsvImport');
        if (lastLog) {
            const log = JSON.parse(lastLog);
            window.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            window.logger.debug('📜 Previous CSV Import Log (from localStorage):');
            window.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            window.logger.debug('Timestamp:', log.timestamp);
            window.logger.debug('Status:', log.status);
            window.logger.debug('Success:', log.success);
            window.logger.debug('Count:', log.count);
            window.logger.debug('Encoding:', log.encoding);
            window.logger.debug('Problem Count:', log.problemCount);
            window.logger.debug('Full Data:', log.fullData);
            window.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            window.logger.debug('💡 To see all logs: JSON.parse(localStorage.getItem("csvImportLogs"))');
            window.logger.debug('💡 To clear logs: localStorage.removeItem("csvImportLogs")');
        }
    } catch (e) {
        window.logger.debug('No previous import log found');
    }
    
    const fileInput = document.getElementById('csv-input');
    const fileNameDisplay = document.getElementById('file-name');
    const importBtn = document.getElementById('btn-import');
    const dropZone = document.getElementById('drop-zone');
    
    window.logger.debug('📋 Elements found:', {
        fileInput: !!fileInput,
        fileNameDisplay: !!fileNameDisplay,
        importBtn: !!importBtn,
        dropZone: !!dropZone
    });
    
    if (!fileInput) {
        window.logger.error('❌ File input element not found!');
        return;
    }
    
    if (!fileNameDisplay) {
        window.logger.error('❌ File name display element not found!');
        return;
    }
    
    if (!importBtn) {
        window.logger.error('❌ Import button element not found!');
        return;
    }
    
    if (!dropZone) {
        window.logger.error('❌ Drop zone element not found!');
        return;
    }

    // Handle file selection
    const handleFileSelect = (file) => {
        if (!file) {
            window.logger.warn('⚠️ No file provided');
            return;
        }
        
        const fileName = file.name;
        const fileSize = file.size;
        const fileType = file.type;
        
        window.logger.debug('✅ File name:', fileName);
        window.logger.debug('✅ File size:', fileSize, 'bytes');
        window.logger.debug('✅ File type:', fileType);
        
        fileNameDisplay.innerText = fileName;
        fileNameDisplay.classList.add('text-green-600');
        
        // Show success message
        alert('ファイル選択完了: ' + fileName + ' (' + Math.round(fileSize/1024) + ' KB)');
    };
    
    // Click on drop zone to open file picker
    dropZone.addEventListener('click', (e) => {
        window.logger.debug('🖱️ Drop zone clicked');
        fileInput.click();
    });
    
    // File input change event
    fileInput.addEventListener('change', (e) => {
        window.logger.debug('📁 File change event triggered');
        window.logger.debug('📁 File selected:', e.target.files);
        window.logger.debug('📁 Files length:', e.target.files.length);
        
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        } else {
            window.logger.warn('⚠️ No files selected');
        }
    });
    
    // Prevent default drag behaviors on document (allow propagation for dropZone)
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, (e) => {
            e.preventDefault();
            // stopPropagation removed to allow dropZone events to fire
        }, false);
    });
    
    // Drag over event
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.logger.debug('📦 Drag over');
        dropZone.classList.add('bg-blue-100', 'border-blue-300');
    });
    
    // Drag enter event
    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.logger.debug('📦 Drag enter');
        dropZone.classList.add('bg-blue-100', 'border-blue-300');
    });
    
    // Drag leave event
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.logger.debug('📦 Drag leave');
        dropZone.classList.remove('bg-blue-100', 'border-blue-300');
    });
    
    // Drop event - on dropZone
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.logger.debug('📦 File dropped on dropZone');
        dropZone.classList.remove('bg-blue-100', 'border-blue-300');
        
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            window.logger.debug('✅ Dropped file:', file.name);
            
            // Set the file to the input element
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            handleFileSelect(file);
        }
    });
    
    // Also handle drop directly on the file input (since it's now visible as overlay)
    fileInput.addEventListener('drop', (e) => {
        // Let the native file input handle it, but also update UI
        window.logger.debug('📦 File dropped on fileInput');
        dropZone.classList.remove('bg-blue-100', 'border-blue-300');
        
        // The native input handles the file, we just need to trigger our callback
        setTimeout(() => {
            if (fileInput.files && fileInput.files.length > 0) {
                handleFileSelect(fileInput.files[0]);
            }
        }, 100);
    });

    importBtn.addEventListener('click', async () => {
        window.logger.debug('🖱️ Import button clicked');
        window.logger.debug('📁 Files available:', fileInput.files.length);
        
        if (!fileInput.files.length) {
            alert('CSVファイルを選択してください。');
            return;
        }

        const formData = new FormData();
        formData.append('csv', fileInput.files[0]);
        
        window.logger.debug('📤 Sending CSV file:', fileInput.files[0].name, 'Size:', fileInput.files[0].size, 'bytes');

        importBtn.disabled = true;
        importBtn.innerText = 'インポート中...';
        importBtn.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            window.logger.debug('🔄 Fetching /api/import-csv...');
            const res = await fetch('/api/import-csv', {
                method: 'POST',
                body: formData
            });
            
            window.logger.debug('📨 Response received:', res.status, res.statusText);
            const data = await res.json();
            window.logger.debug('📊 Response data:', data);
            
            // Save to localStorage IMMEDIATELY (before any alerts or reloads)
            const importLog = {
                timestamp: new Date().toISOString(),
                status: res.status,
                success: data.success,
                count: data.count,
                encoding: data.debug?.encoding,
                problemCount: data.debug?.problemCount,
                fullData: data
            };
            
            // Store in localStorage
            try {
                const logs = JSON.parse(localStorage.getItem('csvImportLogs') || '[]');
                logs.unshift(importLog); // Add to beginning
                if (logs.length > 10) logs.pop(); // Keep only last 10
                localStorage.setItem('csvImportLogs', JSON.stringify(logs));
                localStorage.setItem('lastCsvImport', JSON.stringify(importLog));
                window.logger.debug('💾 Import log saved to localStorage');
            } catch (e) {
                window.logger.error('Failed to save to localStorage:', e);
            }
            
            if (res.ok && data.success) {
                // ALWAYS log full response to console (won't disappear)
                window.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                window.logger.debug('✅ CSV Import SUCCESS');
                window.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                window.logger.debug('📊 Full Response:', JSON.stringify(data, null, 2));
                window.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                window.logger.debug('💡 Tip: Run "localStorage.getItem(\'lastCsvImport\')" in console to see this log again');
                
                // Build detailed result message
                let msg = '✅ インポート完了\n';
                msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
                msg += '📊 結果サマリー:\n';
                msg += '  • インポート成功: ' + data.count + ' 件\n';
                
                if (data.debug) {
                    const d = data.debug;
                    
                    // Show encoding info
                    if (d.encoding) {
                        msg += '  • 文字エンコーディング: ' + d.encoding + '\n';
                    }
                    
                    msg += '  • 総行数: ' + d.totalLines + ' 行\n';
                    msg += '  • ヘッダー数: ' + d.headerCount + ' 列\n';
                    msg += '  • スキップ: ' + d.skippedCount + ' 件\n';
                    msg += '  • 問題あり(不明な製品): ' + d.problemCount + ' 件\n';
                    
                    if (d.problemCount > 0) {
                        msg += '\n⚠️ 「不明な製品」になった行:\n';
                        d.problemRows.forEach((p, i) => {
                            if (i < 5) { // Only show first 5
                                msg += '  [行' + p.row + '] SKU: ' + p.sku + '\n';
                                msg += '    原因: ' + p.reason + '\n';
                                msg += '    データ: ' + p.rawData.slice(0, 5).join(' | ') + '...\n';
                            }
                        });
                        if (d.problemCount > 5) {
                            msg += '  ... 他 ' + (d.problemCount - 5) + ' 件\n';
                        }
                    }
                    
                    msg += '\n📋 カラムマッピング:\n';
                    msg += '  • SKU (idx=' + d.indexMapping.sku + ')\n';
                    msg += '  • 商品名 (idx=' + d.indexMapping.name + ')\n';
                    msg += '  • ブランド (idx=' + d.indexMapping.brand + ')\n';
                    msg += '  • サイズ (idx=' + d.indexMapping.size + ')\n';
                    msg += '  • カラー (idx=' + d.indexMapping.color + ')\n';
                    
                    msg += '\n📄 検出されたヘッダー (最初の10列):\n';
                    d.headers.slice(0, 10).forEach((h, i) => {
                        msg += '  [' + i + '] ' + h + '\n';
                    });
                    
                    msg += '\n💡 詳細はブラウザのコンソールを確認してください';
                }
                
                alert(msg);
                
                // Reload only if successful (problemCount === 0)
                if (data.debug && data.debug.problemCount === 0) {
                    window.logger.debug('✨ All data imported successfully!');
                    window.logger.debug('🔄 Page will reload in 3 seconds...');
                    window.logger.debug('💾 Log is saved in localStorage. Access with: localStorage.getItem("lastCsvImport")');
                    setTimeout(() => {
                        window.logger.debug('🔄 Reloading now...');
                        window.location.reload();
                    }, 3000); // 3 seconds delay to see logs
                } else {
                    window.logger.warn('⚠️ Some problems detected (' + data.debug.problemCount + ' issues). NOT reloading page.');
                    window.logger.warn('💡 Fix the issues and try again, or check the logs above.');
                }
            } else {
                window.logger.error('❌ Import failed:', data);
                alert('エラー: ' + (data.error || JSON.stringify(data)));
            }
        } catch (e) {
            window.logger.error('❌ Network/Parse error:', e);
            alert('通信エラーが発生しました: ' + e);
        } finally {
            importBtn.disabled = false;
            importBtn.innerText = 'インポート実行';
            importBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
})(); // End of IIFE
