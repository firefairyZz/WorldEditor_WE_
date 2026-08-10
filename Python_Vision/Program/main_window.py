from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QLabel, QPushButton,
    QSizePolicy, QTabWidget, QTabBar, QMenu, QFileDialog, QHBoxLayout,
    QSplitter, QFrame
)
from PySide6.QtGui import QAction
from PySide6.QtCore import Qt, QPoint, QEvent
from .title_bar import TitleBar
from .file_tree import FileTree
from .text_editor import TextEditor
import os

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setMinimumSize(800, 500)
        # 无边框窗口：用自定义标题栏
        self.setWindowFlags(Qt.FramelessWindowHint)
        self.setAttribute(Qt.WA_TranslucentBackground, False)
        self.setStyleSheet("background-color: #1e1e1e;")

        self.current_project = None  # 当前打开的项目路径
        self.current_file = None     # 当前编辑的文件名

        central = QWidget()
        self.setCentralWidget(central)
        layout = QVBoxLayout(central)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # 自定义标题栏（JS 版风格：36px, #252526, border-bottom）
        self.title_bar = TitleBar(self, "WE - World Editor")
        self.title_bar.minimize_clicked.connect(self.showMinimized)
        self.title_bar.maximize_clicked.connect(self.toggle_maximize)
        self.title_bar.close_clicked.connect(self.close)
        self.title_bar.settings_clicked.connect(self.open_settings)
        layout.addWidget(self.title_bar)

        # 标签栏（JS 版风格：32px, #2a2a2a, 紧凑标签）
        self.tab_widget = QTabWidget()
        self.tab_widget.setTabsClosable(True)
        self.tab_widget.tabCloseRequested.connect(self.close_tab)
        self.tab_widget.setMovable(True)
        self.tab_widget.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tab_widget.customContextMenuRequested.connect(self.show_tab_context_menu)
        # 隐藏默认关闭按钮，用自定义样式
        self.tab_widget.setStyleSheet("""
            QTabWidget::pane {
                background: #1e1e1e; border: none;
                position: absolute; top: -1px;
            }
            QTabBar {
                background: #2a2a2a;
                border-bottom: 1px solid #3c3c3c;
                min-height: 32px;
                padding: 0 8px;
            }
            QTabBar::tab {
                background: transparent; color: #999999;
                padding: 2px 8px; border: 1px solid transparent;
                border-radius: 6px; margin: 2px 2px;
                font-size: 13px; min-height: 24px;
            }
            QTabBar::tab:hover { background: rgba(255,255,255,0.07); color: #cccccc; }
            QTabBar::tab:selected {
                background: #1e1e1e; color: #cccccc;
                font-weight: 500; border-color: #3c3c3c;
            }
            QTabBar::close-button {
                image: none;
                width: 16px; height: 16px;
                border: none; border-radius: 8px;
                background: transparent;
                margin: 0 0 0 4px;
            }
            QTabBar::close-button:hover {
                background: rgba(128,128,128,0.3);
            }
        """)
        layout.addWidget(self.tab_widget)

        # 状态栏（JS 版风格：#007acc 蓝色底）
        self.status_label = QLabel("就绪")
        self.status_label.setStyleSheet("background-color: #007acc; color: white; padding: 4px 12px; font-size: 12px;")
        self.status_label.setFixedHeight(24)
        layout.addWidget(self.status_label)

        # 欢迎页
        self.add_tab("欢迎", self.create_welcome_tab(), closable=False)
        self.resize(1000, 700)

    def toggle_maximize(self):
        if self.isMaximized():
            self.showNormal()
        else:
            self.showMaximized()

    def changeEvent(self, event):
        if event.type() == QEvent.WindowStateChange:
            # 最大化时更新最大化按钮图标
            if self.isMaximized():
                self.title_bar.btn_max.setText("❐")
            else:
                self.title_bar.btn_max.setText("□")
        super().changeEvent(event)

    def create_welcome_tab(self):
        w = QWidget()
        w.setStyleSheet("background-color: #1e1e1e;")
        lay = QVBoxLayout(w)
        lay.setAlignment(Qt.AlignCenter)
        lay.setSpacing(8)

        # 标题（JS 版风格：24px, #cccccc, 500 weight）
        title = QLabel("WE - World Editor")
        title.setStyleSheet("font-size: 24px; font-weight: 500; color: #cccccc; margin-bottom: 16px; border: none;")
        lay.addWidget(title, alignment=Qt.AlignCenter)

        # 操作按钮（JS 版 action-btn 风格：hover #094771）
        btn_new = QPushButton("  新建项目")
        btn_open = QPushButton("  打开项目")
        btn_settings = QPushButton("  设置")
        for btn in (btn_new, btn_open, btn_settings):
            btn.setFixedSize(280, 40)
            btn.setStyleSheet("""
                QPushButton {
                    background: rgba(255,255,255,0.07); border: none;
                    color: #cccccc; padding: 9px 14px; border-radius: 6px;
                    font-size: 14px; text-align: left;
                }
                QPushButton:hover { background: #094771; color: #ffffff; }
            """)
            lay.addWidget(btn, alignment=Qt.AlignCenter)

        btn_new.clicked.connect(self.create_new_project)
        btn_open.clicked.connect(self.open_existing_project)
        btn_settings.clicked.connect(self.open_settings)
        return w

    def create_new_project(self):
        from .new_project_dialog import NewProjectDialog
        dialog = NewProjectDialog(self)
        if dialog.exec():
            name = dialog.project_name
            folder = os.path.join("User", name)
            from .project_manager import create_project as pm_create
            pm_create(name, folder)
            self.open_project_folder(folder)

    def open_existing_project(self):
        folder = QFileDialog.getExistingDirectory(self, "选择项目文件夹", "User")
        if folder:
            self.open_project_folder(folder)

    def open_project_folder(self, folder):
        try:
            from .project_manager import open_project as pm_open, open_projects
            proj = pm_open(folder)
            if not proj:
                return
            self.current_project = folder

            # 创建项目布局：侧边栏 + 编辑器
            project_widget = QWidget()
            project_widget.setStyleSheet("background: #1e1e1e;")
            project_layout = QHBoxLayout(project_widget)
            project_layout.setContentsMargins(0, 0, 0, 0)
            project_layout.setSpacing(0)

            # 分割器（JS 版风格：可拖拽调整侧栏宽度）
            splitter = QSplitter(Qt.Horizontal)
            splitter.setHandleWidth(1)
            splitter.setStyleSheet("""
                QSplitter::handle {
                    background: #3c3c3c;
                }
                QSplitter::handle:hover {
                    background: #0078d4;
                }
            """)

            # 左侧：文件树（JS 版风格：bg-sidebar）
            sidebar = QWidget()
            sidebar.setStyleSheet("background: #252526; border-right: 1px solid #3c3c3c;")
            sidebar_layout = QVBoxLayout(sidebar)
            sidebar_layout.setContentsMargins(0, 0, 0, 0)
            sidebar_layout.setSpacing(0)

            self.file_tree = FileTree(folder, proj["files"])
            self.file_tree.file_selected.connect(self._on_file_selected)
            sidebar_layout.addWidget(self.file_tree)

            splitter.addWidget(sidebar)

            # 右侧：编辑器（JS 版风格：bg-main）
            self.editor = TextEditor()
            self.editor.content_changed.connect(self._on_content_changed)
            splitter.addWidget(self.editor)

            # 设置侧栏宽度比例（JS 版：左 33%）
            splitter.setSizes([int(self.width() * 0.33), int(self.width() * 0.67)])
            splitter.setStretchFactor(0, 0)
            splitter.setStretchFactor(1, 1)

            project_layout.addWidget(splitter)

            # 替换当前标签内容
            idx = self.tab_widget.currentIndex()
            if idx >= 0:
                old = self.tab_widget.widget(idx)
                self.tab_widget.removeTab(idx)
                old.deleteLater()
            self.add_tab(os.path.basename(folder), project_widget)
            self.tab_widget.setCurrentIndex(self.tab_widget.count() - 1)

            self.status_label.setText(f"已打开项目: {os.path.basename(folder)}")

        except Exception as e:
            self.status_label.setText(f"打开项目失败: {e}")
            print(f"打开项目失败: {e}")

    def _on_file_selected(self, fname):
        """文件树点击 → 打开文件到编辑器"""
        if not self.current_project:
            return
        from .project_manager import open_file_in_project
        content = open_file_in_project(self.current_project, fname)
        self.current_file = fname
        self.editor.open_file(fname, content)
        self.status_label.setText(f"编辑: {fname}")

    def _on_content_changed(self, fname, content):
        """编辑器内容变化 → 保存到内存"""
        if not self.current_project:
            return
        from .project_manager import save_file_in_project
        save_file_in_project(self.current_project, fname, content)
        self.status_label.setText(f"已保存: {fname}")

    def add_tab(self, title, widget, closable=True):
        idx = self.tab_widget.addTab(widget, title)
        if not closable:
            tb = self.tab_widget.tabBar()
            tb.setTabButton(idx, QTabBar.ButtonPosition.RightSide, None)
            tb.setTabButton(idx, QTabBar.ButtonPosition.LeftSide, None)

    def close_tab(self, index):
        if index == 0:
            return
        widget = self.tab_widget.widget(index)
        self.tab_widget.removeTab(index)
        widget.deleteLater()

    def show_tab_context_menu(self, pos: QPoint):
        index = self.tab_widget.tabBar().tabAt(pos)
        if index < 0:
            return
        menu = QMenu()
        menu.setStyleSheet("""
            QMenu {
                background: #252526; border: 1px solid #3c3c3c;
                color: #cccccc; padding: 4px;
            }
            QMenu::item {
                padding: 6px 24px; border-radius: 4px;
            }
            QMenu::item:selected { background: #094771; color: white; }
        """)
        if index != 0:
            action_close = QAction("关闭", self)
            action_close.triggered.connect(lambda: self.close_tab(index))
            menu.addAction(action_close)
            action_detach = QAction("在新窗口中打开", self)
            action_detach.triggered.connect(lambda: self.detach_tab(index))
            menu.addAction(action_detach)
        menu.exec(self.tab_widget.mapToGlobal(pos))

    def detach_tab(self, index):
        widget = self.tab_widget.widget(index)
        title = self.tab_widget.tabText(index)
        self.tab_widget.removeTab(index)
        child_win = QMainWindow(self)
        child_win.setWindowFlags(Qt.Window)
        child_win.setWindowTitle(title)
        child_win.resize(600, 400)
        child_win.setCentralWidget(widget)
        child_win.show()

    def open_settings(self):
        from .settings_dialog import SettingsDialog
        dialog = SettingsDialog(self)
        dialog.exec()