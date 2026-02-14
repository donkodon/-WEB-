import gradio as gr
import requests
from PIL import Image
import io
import base64
import numpy as np

# withoutBG 公式ライブラリを使用
# https://withoutbg.com/
# pip install withoutbg

def remove_background(image, model_type="focus"):
    """
    画像の背景を削除する（withoutBG公式ライブラリ使用）
    
    Args:
        image: PIL Image
        model_type: "focus" (高精度) or "snap" (高速)
    
    Returns:
        PIL Image (背景削除済み、白背景)
    """
    try:
        from withoutbg import remove
        
        # 画像をバイト配列に変換
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='PNG')
        img_byte_arr = img_byte_arr.getvalue()
        
        # withoutBGで背景削除
        # model_type: "focus" (高精度) or "snap" (高速)
        output = remove(
            img_byte_arr,
            model=model_type,
            bgcolor=(255, 255, 255, 255)  # 白背景
        )
        
        # PIL Imageに変換
        result_image = Image.open(io.BytesIO(output))
        
        # RGBAの場合、白背景に変換
        if result_image.mode == 'RGBA':
            white_bg = Image.new('RGB', result_image.size, (255, 255, 255))
            white_bg.paste(result_image, mask=result_image.split()[3])
            result_image = white_bg
        
        return result_image
        
    except Exception as e:
        print(f"Error in remove_background: {str(e)}")
        raise e

def process_image_url(image_url, model_type="focus"):
    """
    URLから画像を取得して背景削除
    """
    try:
        from withoutbg import remove
        
        # URLから画像をダウンロード
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
        
        # withoutBGで直接処理
        output = remove(
            response.content,
            model=model_type,
            bgcolor=(255, 255, 255, 255)
        )
        
        # PIL Imageに変換
        result_image = Image.open(io.BytesIO(output))
        
        # RGBAの場合、白背景に変換
        if result_image.mode == 'RGBA':
            white_bg = Image.new('RGB', result_image.size, (255, 255, 255))
            white_bg.paste(result_image, mask=result_image.split()[3])
            result_image = white_bg
        
        return result_image
        
    except Exception as e:
        print(f"Error processing image URL: {str(e)}")
        raise e

def process_image_base64(image_base64, model_type="focus"):
    """
    Base64エンコードされた画像を処理
    """
    try:
        from withoutbg import remove
        
        # Base64デコード
        if image_base64.startswith('data:'):
            # data:image/jpeg;base64,... の形式
            image_base64 = image_base64.split(',', 1)[1]
        
        image_data = base64.b64decode(image_base64)
        
        # withoutBGで処理
        output = remove(
            image_data,
            model=model_type,
            bgcolor=(255, 255, 255, 255)
        )
        
        # PIL Imageに変換
        result_image = Image.open(io.BytesIO(output))
        
        # RGBAの場合、白背景に変換
        if result_image.mode == 'RGBA':
            white_bg = Image.new('RGB', result_image.size, (255, 255, 255))
            white_bg.paste(result_image, mask=result_image.split()[3])
            result_image = white_bg
        
        return result_image
        
    except Exception as e:
        print(f"Error processing base64 image: {str(e)}")
        raise e

# Gradio インターフェース
with gr.Blocks(title="Background Removal API") as demo:
    gr.Markdown("# 🎨 Background Removal API")
    gr.Markdown("**withoutBG Focus モデル使用** - 高精度な背景削除（Apache 2.0 License）")
    
    with gr.Tab("画像アップロード"):
        with gr.Row():
            input_image = gr.Image(type="pil", label="元画像")
            output_image = gr.Image(type="pil", label="背景削除済み")
        
        process_btn = gr.Button("背景削除", variant="primary")
        
        # Focusモデル固定
        process_btn.click(
            fn=lambda img: remove_background(img, "focus"),
            inputs=[input_image],
            outputs=output_image
        )
    
    with gr.Tab("URL指定"):
        with gr.Row():
            url_input = gr.Textbox(label="画像URL", placeholder="https://example.com/image.jpg")
            url_output = gr.Image(type="pil", label="背景削除済み")
        
        url_btn = gr.Button("URL処理", variant="primary")
        
        # Focusモデル固定
        url_btn.click(
            fn=lambda url: process_image_url(url, "focus"),
            inputs=[url_input],
            outputs=url_output
        )
    
    with gr.Tab("API情報"):
        gr.Markdown("""
        ## API エンドポイント
        
        ### POST /api/predict
        
        **リクエスト例（URL指定）:**
        ```json
        {
          "data": ["https://example.com/image.jpg"]
        }
        ```
        
        **リクエスト例（Base64）:**
        ```json
        {
          "data": ["data:image/jpeg;base64,/9j/4AAQ..."]
        }
        ```
        
        **レスポンス例:**
        ```json
        {
          "data": ["data:image/png;base64,iVBORw0KG..."]
        }
        ```
        
        **注意**: withoutBG Focusモデル（高精度）固定です。
        """)

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
