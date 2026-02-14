#!/usr/bin/env python3
"""
Replace console.log/warn/error/info with logger utility in server-side code.
Keep only essential error logs in production code.
"""
import re
import os
import glob

# Files to process (server-side TypeScript only)
server_files = [
    'src/api/*.ts',
    'src/helpers/*.ts',
    'src/middleware/*.ts',
    'src/routes/*.tsx',
]

def process_file(filepath):
    """Replace console statements with logger calls"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Check if file already imports logger
    has_logger_import = 'from \'../helpers/logger\'' in content or 'from \'./logger\'' in content
    
    # Add logger import if needed and file has console statements
    if not has_logger_import and re.search(r'console\.(log|warn|error|info)', content):
        # Find the position after the last import
        import_match = list(re.finditer(r'^import .* from .*$', content, re.MULTILINE))
        if import_match:
            last_import_end = import_match[-1].end()
            
            # Determine relative path based on file location
            if '/api/' in filepath:
                logger_path = '../helpers/logger'
            elif '/helpers/' in filepath:
                logger_path = './logger'
            elif '/middleware/' in filepath:
                logger_path = '../helpers/logger'
            elif '/routes/' in filepath:
                logger_path = '../helpers/logger'
            else:
                logger_path = './helpers/logger'
            
            content = (
                content[:last_import_end] + 
                f"\nimport {{ logger }} from '{logger_path}'" +
                content[last_import_end:]
            )
    
    # Replace console statements
    replacements = [
        # Debug logs (verbose operational logs)
        (r"console\.log\((['\"])🎯([^'\"]*)\1,\s*(.+?)\)", r"logger.debug('\2', \3)"),
        (r"console\.log\((['\"])🔄([^'\"]*)\1,\s*(.+?)\)", r"logger.debug('\2', \3)"),
        (r"console\.log\((['\"])📌([^'\"]*)\1,\s*(.+?)\)", r"logger.debug('\2', \3)"),
        (r"console\.log\((['\"])📸([^'\"]*)\1,\s*(.+?)\)", r"logger.debug('\2', \3)"),
        (r"console\.log\((['\"])✅([^'\"]*)\1,\s*(.+?)\)", r"logger.debug('\2', \3)"),
        (r"console\.log\((['\"])🚀([^'\"]*)\1,\s*(.+?)\)", r"logger.debug('\2', \3)"),
        
        # Info logs (general information)
        (r"console\.info\(", r"logger.info("),
        (r"console\.log\((['\"])ℹ️([^'\"]*)\1", r"logger.info('\2'"),
        
        # Warning logs
        (r"console\.warn\(", r"logger.warn("),
        (r"console\.log\((['\"])⚠️([^'\"]*)\1", r"logger.warn('\2'"),
        
        # Error logs
        (r"console\.error\((['\"])❌([^'\"]*)\1,\s*(.+?)\)", r"logger.error('\2', \3)"),
        (r"console\.error\((['\"])Error:([^'\"]*)\1,\s*(.+?)\)", r"logger.error('\2', \3)"),
        (r"console\.error\(", r"logger.error("),
        
        # Remaining console.log → logger.debug
        (r"console\.log\(", r"logger.debug("),
    ]
    
    for pattern, replacement in replacements:
        content = re.sub(pattern, replacement, content)
    
    # Write back if changed
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    modified_files = []
    
    for pattern in server_files:
        for filepath in glob.glob(pattern, recursive=True):
            if os.path.isfile(filepath):
                if process_file(filepath):
                    modified_files.append(filepath)
                    print(f"✅ Modified: {filepath}")
    
    print(f"\n📊 Total files modified: {len(modified_files)}")
    
    # Show remaining console statements
    remaining_count = 0
    for pattern in server_files:
        for filepath in glob.glob(pattern, recursive=True):
            if os.path.isfile(filepath):
                with open(filepath, 'r') as f:
                    content = f.read()
                    count = len(re.findall(r'console\.(log|warn|error|info)', content))
                    if count > 0:
                        remaining_count += count
                        print(f"⚠️  {filepath}: {count} console statements remaining")
    
    print(f"\n📉 Remaining console statements in server code: {remaining_count}")

if __name__ == '__main__':
    main()
