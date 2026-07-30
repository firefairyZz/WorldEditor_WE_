import zipfile
import os
import shutil
import glob
from datetime import datetime

def load_wep(wep_path):
    if not os.path.exists(wep_path):
        return {}
    with zipfile.ZipFile(wep_path, 'r') as zf:
        return {name: zf.read(name).decode('utf-8') for name in zf.namelist()}

def save_wep(wep_path, file_dict):
    with zipfile.ZipFile(wep_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for fname, content in file_dict.items():
            zf.writestr(fname, content)

def backup_project(project_folder, project_name):
    """在项目文件夹下的 Backups 中创建 .bwep 备份"""
    backup_dir = os.path.join(project_folder, "Backups")
    os.makedirs(backup_dir, exist_ok=True)
    wep_path = os.path.join(project_folder, "project.wep")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"{project_name}_{timestamp}.bwep"
    backup_path = os.path.join(backup_dir, backup_name)
    if os.path.exists(wep_path):
        shutil.copy2(wep_path, backup_path)
    return backup_path

def restore_latest_backup(project_folder):
    """从备份目录中还原最新的 .bwep 为 project.wep，返回是否成功"""
    backup_dir = os.path.join(project_folder, "Backups")
    if not os.path.isdir(backup_dir):
        return False
    backups = glob.glob(os.path.join(backup_dir, "*.bwep"))
    if not backups:
        return False
    latest = max(backups, key=os.path.getmtime)
    dest = os.path.join(project_folder, "project.wep")
    shutil.copy2(latest, dest)
    return True