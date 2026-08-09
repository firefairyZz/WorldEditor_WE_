import os

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USER_DIR = os.path.join(ROOT_DIR, "User")
RESOURCES_DIR = os.path.join(ROOT_DIR, "resources")
WEB_DIR = os.path.join(os.path.dirname(__file__), "web")

BACKUP_INTERVAL_MINUTES = 5
RECENT_FILES_PATH = os.path.join(RESOURCES_DIR, "recent.json")

WINDOW_SIZE = (1000, 700)

LANG_DIR = os.path.join(USER_DIR, "lang")
DEFAULT_LANG = "zh_CN"
APP_VERSION = "0.2.0"