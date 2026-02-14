// Image Upload Handler
async function uploadImage(productId, input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    const formData = new FormData();
    formData.append('image', file);
    formData.append('productId', productId);

    // Show loading state (simple UI feedback)
    const parent = input.parentElement;
    const originalContent = parent.innerHTML;
    parent.innerHTML = '<div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>';
    parent.classList.remove('cursor-pointer', 'hover:border-blue-500');

    try {
        const res = await fetch('/api/upload-image', {
            method: 'POST',
            body: formData
        });
        if (res.ok) {
            // Reload to show new image
            window.location.reload();
        } else {
            alert('アップロードに失敗しました');
            parent.innerHTML = originalContent; // Revert on error
        }
    } catch (e) {
        window.logger.error(e);
        alert('通信エラーが発生しました');
        parent.innerHTML = originalContent;
    }
}
