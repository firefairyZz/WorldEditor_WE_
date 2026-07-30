import json
import os
from .config import RECENT_FILES_PATH
from .project_io import load_wep, save_wep, backup_project, restore_latest_backup

open_projects = {}

def load_recent():
    if not os.path.exists(RECENT_FILES_PATH):
        return []
    with open(RECENT_FILES_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_recent(paths):
    os.makedirs(os.path.dirname(RECENT_FILES_PATH), exist_ok=True)
    with open(RECENT_FILES_PATH, 'w', encoding='utf-8') as f:
        json.dump(paths, f, indent=2)

def add_to_recent(project_folder):
    recent = load_recent()
    if project_folder in recent:
        recent.remove(project_folder)
    recent.insert(0, project_folder)
    save_recent(recent[:10])

def create_project(name, folder_path):
    os.makedirs(folder_path, exist_ok=True)
    files = {"README.txt": f"# {name}\n\n欢迎创建世界观"}
    save_wep(os.path.join(folder_path, "project.wep"), files)
    add_to_recent(folder_path)

def open_project(folder_path):
    if folder_path in open_projects:
        return open_projects[folder_path]
    wep_path = os.path.join(folder_path, "project.wep")
    if not os.path.exists(wep_path):
        if not restore_latest_backup(folder_path):
            raise FileNotFoundError(f"项目文件丢失：{wep_path}")
    files = load_wep(wep_path)
    project_name = os.path.basename(folder_path)
    open_projects[folder_path] = {
        "name": project_name,
        "files": files,
        "current_file": next(iter(files), None),
        "dirty": False
    }
    add_to_recent(folder_path)
    return open_projects[folder_path]

def close_project(folder_path):
    open_projects.pop(folder_path, None)

def get_project_list():
    return [{"path": p, "name": i["name"]} for p, i in open_projects.items()]

def get_file_list(folder_path):
    return list(open_projects[folder_path]["files"].keys())

def open_file_in_project(folder_path, filename):
    proj = open_projects[folder_path]
    proj["current_file"] = filename
    return proj["files"].get(filename, "")

def save_file_in_project(folder_path, filename, content):
    proj = open_projects[folder_path]
    proj["files"][filename] = content
    proj["dirty"] = True

def save_project(folder_path):
    proj = open_projects[folder_path]
    wep_path = os.path.join(folder_path, "project.wep")
    save_wep(wep_path, proj["files"])
    proj["dirty"] = False

def auto_backup():
    for path, proj in open_projects.items():
        if proj["dirty"]:
            backup_project(path, proj["name"])

def add_file_to_project(folder_path, filename):
    proj = open_projects.get(folder_path)
    if proj:
        proj["files"][filename] = ""
        proj["dirty"] = True
        return True
    return False

def check_recent_integrity():
    recent = load_recent()
    valid = []
    messages = []
    for folder in recent:
        if not os.path.isdir(folder):
            messages.append(f"项目文件夹 {folder} 已不存在，已移除。")
            continue
        wep_path = os.path.join(folder, "project.wep")
        if not os.path.exists(wep_path):
            if restore_latest_backup(folder):
                messages.append(f"项目 {os.path.basename(folder)} 的 .wep 已从备份恢复。")
                valid.append(folder)
            else:
                messages.append(f"项目 {os.path.basename(folder)} 无可用备份，已移除。")
        else:
            valid.append(folder)
    save_recent(valid)
    return messages