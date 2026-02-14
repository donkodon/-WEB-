#!/usr/bin/env python3
from huggingface_hub import HfApi
import os

# Initialize API
api = HfApi()

# Set token from environment variable
token = os.environ.get("HUGGINGFACE_TOKEN", "YOUR_TOKEN_HERE")

# Upload files
repo_id = "jinkedon/withoutbg-api"
repo_type = "space"
folder_path = "/home/user/huggingface-space-docker"

files_to_upload = [
    "Dockerfile",
    "app.py",
    "requirements.txt",
    "README.md",
    ".gitignore"
]

print("🚀 Uploading files to Hugging Face Space...")

for file_name in files_to_upload:
    file_path = os.path.join(folder_path, file_name)
    if os.path.exists(file_path):
        print(f"📤 Uploading {file_name}...")
        try:
            api.upload_file(
                path_or_fileobj=file_path,
                path_in_repo=file_name,
                repo_id=repo_id,
                repo_type=repo_type,
                token=token
            )
            print(f"✅ {file_name} uploaded successfully")
        except Exception as e:
            print(f"❌ Failed to upload {file_name}: {str(e)}")
    else:
        print(f"⚠️ {file_name} not found")

print("\n🎉 Upload complete!")
