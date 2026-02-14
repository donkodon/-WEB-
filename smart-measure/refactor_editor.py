#!/usr/bin/env python3
"""
Replace dangerouslySetInnerHTML blocks in editor.tsx with data attributes and external scripts.
"""
import re

# Read the file
with open('src/routes/editor.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Step 1: Add data container div before the first inline script
# Find the position to insert (before "Tab Switching Logic" comment)
insert_pattern = r'(\s+)\{/\* Tab Switching Logic \*/\}'
data_container = r'''\1{/* Editor Data Container */}
\1<div id="editor-data"
\1     data-is-measurement={String(isMeasurement)}
\1     data-has-mask={String(hasMask)}
\1     data-mask-image-url={maskImageUrl || ''}
\1     data-product-sku={productSku}
\1     data-image-id={id}
\1     data-image-src={imageSrc}
\1     data-original-src={originalSrc}
\1     data-is-processed={String(isProcessed)}
\1     style="display: none;">
\1</div>
\1
\1{/* Tab Switching Logic */}'''

content = re.sub(insert_pattern, data_container, content)

# Step 2: Replace first inline script (Tab Switching Logic - lines 489-593)
tab_switching_pattern = r'\s+\{/\* Tab Switching Logic \*/\}\s+<script dangerouslySetInnerHTML=\{\{__html: `[\s\S]*?document\.addEventListener\(\'DOMContentLoaded\', function\(\) \{[\s\S]*?\}\);[\s\S]*?`\}\} />'
tab_switching_replacement = '\n        <script src="/static/editor-tab-switching.js"></script>'

content = re.sub(tab_switching_pattern, tab_switching_replacement, content)

# Step 3: Replace second inline script (Image Processing Logic - lines 596+)
image_processing_pattern = r'\s+\{/\* --- IMAGE PROCESSING LOGIC --- \*/\}\s+<script dangerouslySetInnerHTML=\{\{__html: `[\s\S]*?document\.addEventListener\(\'DOMContentLoaded\', \(\) => \{[\s\S]*?ctx\.drawImage\(img, 0, 0\);[\s\S]*?\}\);[\s\S]*?`\}\} />'
image_processing_replacement = '\n        {/* --- IMAGE PROCESSING LOGIC --- */}\n        <script src="/static/editor-image-processing.js"></script>'

content = re.sub(image_processing_pattern, image_processing_replacement, content)

# Write back
with open('src/routes/editor.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ editor.tsx refactored successfully")
