import zipfile
import os

def zip_folder(folder_path, output_path):
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(folder_path):
            # 排除 build 脚本自身和 git 相关文件
            if 'build_pack.py' in files:
                files.remove('build_pack.py')
            if '.git' in dirs:
                dirs.remove('.git')
            
            for file in files:
                # 排除系统文件和不必要的文件
                if file.startswith('.') or file.endswith('.zip'):
                    continue
                    
                file_path = os.path.join(root, file)
                # 计算在 zip 中的相对路径
                arcname = os.path.relpath(file_path, folder_path)
                zipf.write(file_path, arcname)
                print(f"Adding {arcname}")

if __name__ == '__main__':
    # 获取当前脚本所在目录
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_zip = os.path.join(current_dir, 'gaoding-layer-counter_v1.45.zip')
    
    print(f"Start packing to {output_zip}...")
    zip_folder(current_dir, output_zip)
    print("Done! ✅")
