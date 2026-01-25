(function() {
    console.log('📋 CSV Import Script Loaded');
    
    // Restore last import log from localStorage
    try {
        const lastLog = localStorage.getItem('lastCsvImport');
        if (lastLog) {
            const log = JSON.parse(lastLog);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📜 Previous CSV Import Log (from localStorage):');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('Timestamp:', log.timestamp);
            console.log('Status:', log.status);
            console.log('Success:', log.success);
            console.log('Count:', log.count);
            console.log('Encoding:', log.encoding);
            console.log('Problem Count:', log.problemCount);
            console.log('Full Data:', log.fullData);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('💡 To see all logs: JSON.parse(localStorage.getItem("csvImportLogs"))');
            console.log('💡 To clear logs: localStorage.removeItem("csvImportLogs")');
        }
    } catch (e) {
        console.log('No previous import log found');
    }
    
    const fileInput = document.getElementById('csv-input');
    const fileNameDisplay = document.getElementById('file-name');
    const importBtn = document.getElementById('btn-import');
    const dropZone = document.getElementById('drop-zone');
    
    console.log('📋 Elements found:', {
        fileInput: !!fileInput,
        fileNameDisplay: !!fileNameDisplay,
        importBtn: !!importBtn,
        dropZone: !!dropZone
    });
    
    if (!fileInput) {
        console.error('❌ File input element not found!');
        return;
    }
    
    if (!fileNameDisplay) {
        console.error('❌ File name display element not found!');
        return;
    }
    
    if (!importBtn) {
        console.error('❌ Import button element not found!');
        return;
    }
    
    if (!dropZone) {
        console.error('❌ Drop zone element not found!');
        return;
    }

    // Handle file selection
    const handleFileSelect = (file) => {
        if (!file) {
            console.warn('⚠️ No file provided');
            return;
        }
        
        const fileName = file.name;
        const fileSize = file.size;
        const fileType = file.type;
        
        console.log('✅ File name:', fileName);
        console.log('✅ File size:', fileSize, 'bytes');
        console.log('✅ File type:', fileType);
        
        fileNameDisplay.innerText = fileName;
        fileNameDisplay.classList.add('text-green-600');
        
        // Show success message
        alert('ファイル選択完了: ' + fileName + ' (' + Math.round(fileSize/1024) + ' KB)');
    };
    
    // Click on drop zone to open file picker
    dropZone.addEventListener('click', (e) => {
        console.log('🖱️ Drop zone clicked');
        fileInput.click();
    });
    
    // File input change event
    fileInput.addEventListener('change', (e) => {
        console.log('📁 File change event triggered');
        console.log('📁 File selected:', e.target.files);
        console.log('📁 Files length:', e.target.files.length);
        
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        } else {
            console.warn('⚠️ No files selected');
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
        console.log('📦 Drag over');
        dropZone.classList.add('bg-blue-100', 'border-blue-300');
    });
    
    // Drag enter event
    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('📦 Drag enter');
        dropZone.classList.add('bg-blue-100', 'border-blue-300');
    });
    
    // Drag leave event
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('📦 Drag leave');
        dropZone.classList.remove('bg-blue-100', 'border-blue-300');
    });
    
    // Drop event - on dropZone
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('📦 File dropped on dropZone');
        dropZone.classList.remove('bg-blue-100', 'border-blue-300');
        
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            console.log('✅ Dropped file:', file.name);
            
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
        console.log('📦 File dropped on fileInput');
        dropZone.classList.remove('bg-blue-100', 'border-blue-300');
        
        // The native input handles the file, we just need to trigger our callback
        setTimeout(() => {
            if (fileInput.files && fileInput.files.length > 0) {
                handleFileSelect(fileInput.files[0]);
            }
        }, 100);
    });

    importBtn.addEventListener('click', async () => {
        console.log('🖱️ Import button clicked');
        console.log('📁 Files available:', fileInput.files.length);
        
        if (!fileInput.files.length) {
            alert('CSVファイルを選択してください。');
            return;
        }

        const formData = new FormData();
        formData.append('csv', fileInput.files[0]);
        
        console.log('📤 Sending CSV file:', fileInput.files[0].name, 'Size:', fileInput.files[0].size, 'bytes');

        importBtn.disabled = true;
        importBtn.innerText = 'インポート中...';
        importBtn.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            console.log('🔄 Fetching /api/import-csv...');
            const res = await fetch('/api/import-csv', {
                method: 'POST',
                body: formData
            });
            
            console.log('📨 Response received:', res.status, res.statusText);
            const data = await res.json();
            console.log('📊 Response data:', data);
            
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
                console.log('💾 Import log saved to localStorage');
            } catch (e) {
                console.error('Failed to save to localStorage:', e);
            }
            
            if (res.ok && data.success) {
                // ALWAYS log full response to console (won't disappear)
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('✅ CSV Import SUCCESS');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('📊 Full Response:', JSON.stringify(data, null, 2));
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('💡 Tip: Run "localStorage.getItem(\'lastCsvImport\')" in console to see this log again');
                
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
                    console.log('✨ All data imported successfully!');
                    console.log('🔄 Page will reload in 3 seconds...');
                    console.log('💾 Log is saved in localStorage. Access with: localStorage.getItem("lastCsvImport")');
                    setTimeout(() => {
                        console.log('🔄 Reloading now...');
                        window.location.reload();
                    }, 3000); // 3 seconds delay to see logs
                } else {
                    console.warn('⚠️ Some problems detected (' + data.debug.problemCount + ' issues). NOT reloading page.');
                    console.warn('💡 Fix the issues and try again, or check the logs above.');
                }
            } else {
                console.error('❌ Import failed:', data);
                alert('エラー: ' + (data.error || JSON.stringify(data)));
            }
        } catch (e) {
            console.error('❌ Network/Parse error:', e);
            alert('通信エラーが発生しました: ' + e);
        } finally {
            importBtn.disabled = false;
            importBtn.innerText = 'インポート実行';
            importBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
})(); // End of IIFE
