#!/usr/bin/env python3
"""
Replace console.log/warn/error/info with logger calls in client-side JavaScript.
"""
import re
import os
import glob

# Files to process (client-side JavaScript only)
client_files = [
    'public/static/*.js',
]

# Files that should keep their console logs (utilities)
skip_files = ['public/static/client-logger.js']

def process_file(filepath):
    """Replace console statements with logger calls"""
    
    # Skip certain files
    if any(skip in filepath for skip in skip_files):
        print(f"⏭️  Skipping: {filepath}")
        return False
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Count console statements before
    before_count = len(re.findall(r'console\.(log|warn|error|info)', content))
    
    if before_count == 0:
        return False
    
    # Replace console statements with window.logger
    # Note: We use simpler patterns for client-side code
    
    # Replace console.log with logger.debug
    content = re.sub(r'\bconsole\.log\b', 'window.logger.debug', content)
    
    # Replace console.info with logger.info
    content = re.sub(r'\bconsole\.info\b', 'window.logger.info', content)
    
    # Replace console.warn with logger.warn
    content = re.sub(r'\bconsole\.warn\b', 'window.logger.warn', content)
    
    # Replace console.error with logger.error
    content = re.sub(r'\bconsole\.error\b', 'window.logger.error', content)
    
    # Count console statements after
    after_count = len(re.findall(r'console\.(log|warn|error|info)', content))
    
    # Write back if changed
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✅ Modified: {filepath} ({before_count} → {after_count} console statements)")
        return True
    return False

def main():
    modified_files = []
    
    for pattern in client_files:
        for filepath in glob.glob(pattern, recursive=True):
            if os.path.isfile(filepath):
                if process_file(filepath):
                    modified_files.append(filepath)
    
    print(f"\n📊 Total client files modified: {len(modified_files)}")
    
    # Show remaining console statements
    remaining_count = 0
    for pattern in client_files:
        for filepath in glob.glob(pattern, recursive=True):
            if os.path.isfile(filepath) and not any(skip in filepath for skip in skip_files):
                with open(filepath, 'r') as f:
                    content = f.read()
                    count = len(re.findall(r'console\.(log|warn|error|info)', content))
                    if count > 0:
                        remaining_count += count
                        print(f"⚠️  {filepath}: {count} console statements remaining")
    
    print(f"\n📉 Remaining console statements in client code: {remaining_count}")

if __name__ == '__main__':
    main()
