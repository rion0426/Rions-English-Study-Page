import os
import random
from flask import Flask, render_template, abort

app = Flask(__name__)

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
TEXTS_BASE_DIR = os.path.join(APP_ROOT, 'texts')

def get_directory_contents(subdirectory=''):
    base_path = os.path.abspath(TEXTS_BASE_DIR)
    requested_path = os.path.abspath(os.path.join(base_path, subdirectory))
    if not requested_path.startswith(base_path): abort(404, "Invalid path")
    if not os.path.isdir(requested_path): abort(404, "Directory not found")
    items = []
    for name in sorted(os.listdir(requested_path)):
        full_path = os.path.join(requested_path, name)
        relative_path = os.path.join(subdirectory, name)
        if os.path.isdir(full_path):
            items.append({'name': name, 'type': 'folder', 'path': relative_path})
        elif name.endswith('.txt'):
            title = os.path.splitext(name)[0]
            items.append({'name': title, 'type': 'file', 'path': relative_path})
    return items

def get_breadcrumbs(subdirectory=''):
    parts = subdirectory.split(os.sep) if subdirectory else []
    breadcrumbs = []
    for i in range(len(parts)):
        path = os.path.join(*parts[:i+1])
        breadcrumbs.append({'name': parts[i], 'path': path})
    parent_path = os.path.dirname(subdirectory) if subdirectory else None
    if parent_path == '': parent_path = '/'
    return breadcrumbs, parent_path

def get_random_image():
    """랜덤 이미지 파일명을 반환하는 함수 (중복 제거)"""
    random_image = None
    image_folder = os.path.join(app.static_folder, 'img')
    if os.path.exists(image_folder):
        image_files = [f for f in os.listdir(image_folder) if os.path.isfile(os.path.join(image_folder, f))]
        if image_files:
            random_image = random.choice(image_files)
    return random_image

@app.route('/')
def index():
    return select()

@app.route('/select/')
@app.route('/select/<path:subdirectory>')
def select(subdirectory=''):
    contents = get_directory_contents(subdirectory)
    breadcrumbs, parent_path = get_breadcrumbs(subdirectory)
    
    # --- select 페이지에도 랜덤 이미지 전달 ---
    random_image = get_random_image()

    return render_template(
        'select.html',
        contents=contents,
        current_path=subdirectory,
        parent_path=parent_path,
        breadcrumbs=breadcrumbs,
        random_image=random_image  # 이미지 파일명 전달
    )

@app.route('/practice/<path:text_path>')
def practice(text_path):
    base_path = os.path.abspath(TEXTS_BASE_DIR)
    file_path = os.path.abspath(os.path.join(base_path, text_path))
    if not file_path.startswith(base_path) or not os.path.isfile(file_path):
        abort(404, "File not found")

    # --- Start: Find previous/next text logic ---
    next_text_path = None
    previous_text_path = None
    try:
        dir_path = os.path.dirname(file_path)
        relative_dir_path = os.path.dirname(text_path)
        
        all_files = sorted([f for f in os.listdir(dir_path) if f.endswith('.txt')])
        
        current_filename = os.path.basename(file_path)
        current_index = all_files.index(current_filename)
        
        # Get next text path
        if current_index < len(all_files) - 1:
            next_filename = all_files[current_index + 1]
            next_text_path = os.path.join(relative_dir_path, next_filename) if relative_dir_path else next_filename
        
        # Get previous text path
        if current_index > 0:
            previous_filename = all_files[current_index - 1]
            previous_text_path = os.path.join(relative_dir_path, previous_filename) if relative_dir_path else previous_filename

    except (OSError, ValueError):
        # If directory listing or index finding fails, paths remain None
        pass
    # --- End: Find previous/next text logic ---

    # --- Get parent directory path for "Back to List" link ---
    parent_dir_path = os.path.dirname(text_path)

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            full_content = f.read().strip()
    except Exception as e:
        abort(500, f"Error reading file: {e}")

    english_content = full_content
    korean_content = ""
    if '--korean--' in full_content:
        parts = full_content.split('--korean--', 1)
        english_content = parts[0].strip()
        korean_content = parts[1].strip()

    title = os.path.splitext(os.path.basename(text_path))[0]
    
    random_image = get_random_image()
            
    return render_template(
        'practice.html', 
        title=title, 
        english_content=english_content,
        korean_content=korean_content,
        random_image=random_image,
        next_text_path=next_text_path,
        previous_text_path=previous_text_path,
        parent_dir_path=parent_dir_path
    )

@app.route('/fill/<path:text_path>')
def fill(text_path):
    base_path = os.path.abspath(TEXTS_BASE_DIR)
    file_path = os.path.abspath(os.path.join(base_path, text_path))
    if not file_path.startswith(base_path) or not os.path.isfile(file_path):
        abort(404, "File not found")

    # --- Start: Find previous/next text logic --
    next_text_path = None
    previous_text_path = None
    try:
        dir_path = os.path.dirname(file_path)
        relative_dir_path = os.path.dirname(text_path)
        
        all_files = sorted([f for f in os.listdir(dir_path) if f.endswith('.txt')])
        
        current_filename = os.path.basename(file_path)
        current_index = all_files.index(current_filename)
        
        # Get next text path
        if current_index < len(all_files) - 1:
            next_filename = all_files[current_index + 1]
            next_text_path = os.path.join(relative_dir_path, next_filename) if relative_dir_path else next_filename
        
        # Get previous text path
        if current_index > 0:
            previous_filename = all_files[current_index - 1]
            previous_text_path = os.path.join(relative_dir_path, previous_filename) if relative_dir_path else previous_filename

    except (OSError, ValueError):
        # If directory listing or index finding fails, paths remain None
        pass
    # --- End: Find previous/next text logic ---

    # --- Get parent directory path for "Back to List" link ---
    parent_dir_path = os.path.dirname(text_path)

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
        content = content.split('--korean--')[0].strip()
    except Exception as e:
        abort(500, f"Error reading file: {e}")
    title = os.path.splitext(os.path.basename(text_path))[0]
    
    random_image = get_random_image()
            
    return render_template(
        'fill.html', 
        title=title, 
        text_content=content,
        random_image=random_image,
        next_text_path=next_text_path,
        previous_text_path=previous_text_path,
        parent_dir_path=parent_dir_path
    )

if __name__ == '__main__':
    app.run(host="0.0.0.0",port=5000,debug=True)