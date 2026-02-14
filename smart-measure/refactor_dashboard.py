#!/usr/bin/env python3
"""
Replace all dangerouslySetInnerHTML blocks in dashboard.tsx with external script references.
"""
import re

# Read the file
with open('src/routes/dashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Define replacements: (pattern to match, replacement text)
replacements = [
    # 1. Background Removal Script (already has dashboard-bg-removal.js)
    (
        r'      \{/\* Background Removal Script \*/\}\n      <script dangerouslySetInnerHTML=\{\{__html: `[\s\S]*?\n      `\}\} />',
        '      {/* Background Removal Scripts */}\n      <script src="/static/dashboard-bg-removal.js"></script>'
    ),
    # 2. Auto-Measurement Script (already has dashboard-auto-measure.js)
    (
        r'      \{/\* Auto-Measurement Script \*/\}\n      <script dangerouslySetInnerHTML=\{\{__html: `[\s\S]*?\n      `\}\} />',
        '      {/* Auto-Measurement Scripts */}\n      <script src="/static/dashboard-auto-measure.js"></script>'
    ),
    # 3. Mobile App Sync Script (created dashboard-mobile-sync.js)
    (
        r'      \{/\* Mobile App Sync Script \*/\}\n      <script dangerouslySetInnerHTML=\{\{__html: `[\s\S]*?\n      `\}\} />',
        '      {/* Mobile App Sync Scripts */}\n      <script src="/static/dashboard-mobile-sync.js"></script>'
    ),
    # 4. Filter Bar Init (created dashboard-filter-init.js)
    (
        r'        <script dangerouslySetInnerHTML=\{\{__html: `\n            document.addEventListener\(\'DOMContentLoaded\', function\(\) \{[\s\S]*?\n        `\}\} />',
        '        <script src="/static/dashboard-filter-init.js"></script>'
    ),
    # 5. Single Image Background Removal (created dashboard-single-bg-removal.js)
    (
        r'      \{/\* Single Image Background Removal \*/\}\n      <script dangerouslySetInnerHTML=\{\{__html: `[\s\S]*?\n      `\}\} />',
        '      {/* Single Image Background Removal */}\n      <script src="/static/dashboard-single-bg-removal.js"></script>'
    ),
    # 6. Upload Script (created dashboard-upload.js)
    (
        r'      \{/\* Upload Script \*/\}\n      <script dangerouslySetInnerHTML=\{\{__html: `[\s\S]*?\n      `\}\} />',
        '      {/* Upload Script */}\n      <script src="/static/dashboard-upload.js"></script>'
    ),
    # 7. Sortable init (created dashboard-sortable.js)
    (
        r'      \{/\* Initialize Sortable for each image grid \*/\}\n      <script dangerouslySetInnerHTML=\{\{__html: `[\s\S]*?\n      `\}\} />',
        '      {/* Initialize Sortable for each image grid */}\n      <script src="/static/dashboard-sortable.js"></script>'
    ),
    # 8. CSS for Sortable animations (created dashboard-sortable.css)
    (
        r'      \{/\* CSS for Sortable animations \*/\}\n      <style dangerouslySetInnerHTML=\{\{__html: `[\s\S]*?\n      `\}\} />',
        '      {/* CSS for Sortable animations */}\n      <link rel="stylesheet" href="/static/dashboard-sortable.css" />'
    ),
]

# Apply replacements
for pattern, replacement in replacements:
    content = re.sub(pattern, replacement, content)

# Write back
with open('src/routes/dashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ All dangerouslySetInnerHTML blocks replaced with external files")
print("📊 Total replacements:", len(replacements))
