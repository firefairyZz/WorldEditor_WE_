import os
from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QLabel, QPushButton,
    QToolBar, QSizePolicy, QTabWidget, QTabBar, QMenu, QFileDialog,
    QSplitter, QMessageBox
)
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtCore import Qt, QPoint, QEvent
from .title_bar import TitleBar
from .file_tree_widget import FileTreeWidget
from .text_editor_widget import TextEditorWidget

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setMinimumSize(800, 500)
        self.setStyleSheet("background-color: #1e1e1e;")

        central = QWidget()
        self.setCentralWidget(central)
        layout = QVBoxLayout(central)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # 自定义标题栏
        self.title_bar = TitleBar(self, "WE - World Editor")
        self.title_bar.minimize_clicked.connect(self.showMinimized)
        self.title_bar.maximize_clicked.connect(self.toggle_maximize)
        self.title_bar.close_clicked.connect(self.close)
        layout.addWidget(self.title_bar)

        # 工具栏
        toolbar = QToolBar()
        toolbar.setMovable(False)
        toolbar.setStyleSheet("""
            QToolBar { background: #252526; border-bottom: 1px solid #3c3c3c; spacing: 4px; padding: 2px 8px; }
            QToolButton { color: #ccc; background: transparent; border: none; padding: 4px; }
            QToolButton:hover { background: #3c3c3c; border-radius: 4px; }
        """)
        spacer = QWidget()
        spacer.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        toolbar.addWidget(spacer)

        settings_btn = QPushButton("⚙")
        settings_btn.setFixedSize(30, 30)
        settings_btn.setStyleSheet("""
            QPushButton { color: #ccc; background: transparent; border: none; font-size: 16px; }
            QPushButton:hover { background: #3c3c3c; border-radius: 4px; }
        """)
        settings_btn.clicked.connect(self.open_settings)
        toolbar.addWidget(settings_btn)
        layout.addWidget(toolbar)

        # 标签页
        self.tab_widget = QTabWidget()
        self.tab_widget.setTabsClosable(True)
        self.tab_widget.tabCloseRequested.connect(self.close_tab)
        self.tab_widget.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tab_widget.customContextMenuRequested.connect(self.show_tab_context_menu)
        self.tab_widget.setStyleSheet("""
            QTabWidget::pane { background: #1e1e1e; border: none; }
            QTabBar::tab { background: #2d2d2d; color: #ccc; padding: 6px 12px; border: none; margin-right: 2px; }
            QTabBar::tab:selected { background: #1e1e1e; }
        """)
        layout.addWidget(self.tab_widget)

        # 状态栏
        self.status_label = QLabel("就绪")
        self.status_label.setStyleSheet("background-color: #007acc; color: white; padding: 4px 12px; font-size: 12px;")
        self.status_label.setFixedHeight(24)
        layout.addWidget(self.status_label)

        # 欢迎页
        self.add_tab("欢迎", self.create_welcome_tab(), closable=False)
        self.resize(1000, 700)

        # 项目状态
        self._current_project_path = None
        self._file_tree = None
        self._text_editor = None

        # 注册 Ctrl+S 快捷键
        save_shortcut = QAction("保存", self)
        save_shortcut.setShortcut(QKeySequence("Ctrl+S"))
        save_shortcut.triggered.connect(self._save_current_file)
        self.addAction(save_shortcut)

    def toggle_maximize(self):
        if self.isMaximized():
            self.showNormal()
        else:
            self.showMaximized()

    def changeEvent(self, event):
        if event.type() == QEvent.WindowStateChange:
            pass
        super().changeEvent(event)

    def create_welcome_tab(self):
        w = QWidget()
        lay = QVBoxLayout(w)
        lay.setAlignment(Qt.AlignCenter)

        title = QLabel("WE - World Editor")
        title.setStyleSheet("font-size: 24px; color: white;")
        lay.addWidget(title, alignment=Qt.AlignCenter)

        btn_new = QPushButton("新建项目")
        btn_open = QPushButton("打开项目")
        for btn in (btn_new, btn_open):
            btn.setFixedWidth(200)
            btn.setStyleSheet("""
                QPushButton { background: #3c3c3c; border: 1px solid #555; color: #ccc; padding: 8px; border-radius: 4px; }
                QPushButton:hover { background: #505050; }
            """)
            lay.addWidget(btn, alignment=Qt.AlignCenter)

        btn_new.clicked.connect(self.create_new_project)
        btn_open.clicked.connect(self.open_existing_project)
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
        """打开项目文件夹，显示文件树和编辑器"""
        try:
            from .project_manager import open_project as pm_open
            pm_open(folder)

            # 扫描项目文件夹中的文件
            files = []
            if os.path.isdir(folder):
                for f in os.listdir(folder):
                    fpath = os.path.join(folder, f)
                    if os.path.isfile(fpath) and not f.startswith('.') and not f.endswith('.wep'):
                        files.append(f)

            # 创建项目视图
            container = QWidget()
            splitter = QSplitter(Qt.Horizontal)
            splitter.setStyleSheet("""
                QSplitter::handle { background: #3c3c3c; width: 3px; }
            """)

            # 文件树
            self._file_tree = FileTreeWidget(folder)
            self._file_tree.set_files(files)
            self._file_tree.file_selected.connect(self._on_file_selected)
            splitter.addWidget(self._file_tree)

            # 文本编辑器
            self._text_editor = TextEditorWidget()
            self._text_editor.content_changed.connect(self._on_editor_changed)
            splitter.addWidget(self._text_editor)

            splitter.setSizes([200, 600])

            main_lay = QVBoxLayout(container)
            main_lay.setContentsMargins(0, 0, 0, 0)
            main_lay.addWidget(splitter)

            self._current_project_path = folder
            self.add_tab(os.path.basename(folder), container)
            self.status_label.setText(f"已打开项目: {os.path.basename(folder)}")

        except Exception as e:
            self.status_label.setText(f"打开项目失败")
            QMessageBox.critical(self, "错误", f"打开项目失败: {e}")

    def _on_file_selected(self, filename):
        """文件树选中文件后加载到编辑器"""
        if not self._current_project_path or not self._text_editor:
            return
        # 如果当前文件已修改，先保存
        if self._text_editor.is_dirty:
            reply = QMessageBox.question(self, "保存", f"是否保存当前文件？",
                                         QMessageBox.Yes | QMessageBox.No | QMessageBox.Cancel)
            if reply == QMessageBox.Cancel:
                return
            if reply == QMessageBox.Yes:
                self._save_current_file()
        filepath = os.path.join(self._current_project_path, filename)
        self._text_editor.load_file(filepath)
        self.status_label.setText(f"已打开: {filename}")

    def _on_editor_changed(self):
        """编辑器内容变更时更新状态"""
        self.status_label.setText("已修改 *")

    def _save_current_file(self):
        """保存当前文件"""
        if self._text_editor and self._text_editor.current_file:
            if self._text_editor.save_file():
                self.status_label.setText("已保存")
            else:
                self.status_label.setText("保存失败")
        else:
            self.status_label.setText("没有打开的文件")

    def add_tab(self, title, widget, closable=True):
        idx = self.tab_widget.addTab(widget, title)
        if not closable:
            self.tab_widget.tabBar().setTabButton(idx, QTabBar.ButtonPosition.RightSide, None)
        self.tab_widget.setCurrentIndex(idx)

    def close_tab(self, index):
        if index == 0:
            return
        # 关闭项目标签时清理状态
        widget = self.tab_widget.widget(index)
        if widget:
            # 查找关联的文件树和编辑器
            for child in widget.findChildren(FileTreeWidget):
                self._file_tree = None
            for child in widget.findChildren(TextEditorWidget):
                self._text_editor = None
            self._current_project_path = None
        self.tab_widget.removeTab(index)

    def show_tab_context_menu(self, pos: QPoint):
        index = self.tab_widget.tabBar().tabAt(pos)
        if index < 0:
            return
        menu = QMenu()
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