from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QLabel, QPushButton,
    QToolBar, QSizePolicy, QTabWidget, QTabBar, QMenu, QFileDialog
)
from PySide6.QtGui import QAction
from PySide6.QtCore import Qt, QPoint, QEvent
from .title_bar import TitleBar
import os

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        # 无边框窗口，但保留任务栏交互
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.Window)
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

    def toggle_maximize(self):
        if self.isMaximized():
            self.showNormal()
        else:
            self.showMaximized()

    def changeEvent(self, event):
        if event.type() == QEvent.WindowStateChange:
            # 可在此处理最大化图标切换，目前简单处理
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
        try:
            from .project_manager import open_project as pm_open
            pm_open(folder)
            self.add_tab(os.path.basename(folder), QLabel(f"项目内容占位：{folder}"))
        except Exception as e:
            print(f"打开项目失败: {e}")

    def add_tab(self, title, widget, closable=True):
        idx = self.tab_widget.addTab(widget, title)
        if not closable:
            self.tab_widget.tabBar().setTabButton(idx, QTabBar.ButtonPosition.RightSide, None)

    def close_tab(self, index):
        if index == 0:
            return
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
        child_win.setWindowFlags(Qt.FramelessWindowHint | Qt.Window)
        child_win.setWindowTitle(title)
        child_win.resize(600, 400)
        # 子窗口简单添加标题栏
        tb = TitleBar(child_win, title)
        tb.minimize_clicked.connect(child_win.showMinimized)
        tb.maximize_clicked.connect(lambda: child_win.showNormal() if child_win.isMaximized() else child_win.showMaximized())
        tb.close_clicked.connect(child_win.close)
        container = QVBoxLayout()
        container.setContentsMargins(0,0,0,0)
        container.addWidget(tb)
        container.addWidget(widget)
        central = QWidget()
        central.setLayout(container)
        child_win.setCentralWidget(central)
        child_win.show()

    def open_settings(self):
        from .settings_dialog import SettingsDialog
        dialog = SettingsDialog(self)
        dialog.exec()