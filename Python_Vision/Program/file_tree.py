from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QTreeWidget, QTreeWidgetItem,
    QMenu, QInputDialog, QMessageBox, QHeaderView, QPushButton, QHBoxLayout
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QIcon
import os

class FileTree(QWidget):
    file_selected = Signal(str)   # 文件名

    def __init__(self, project_path, files_dict, parent=None):
        super().__init__(parent)
        self.project_path = project_path
        self.files_dict = files_dict  # {filename: content}

        self.setStyleSheet("background: transparent;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # 标题栏
        header = QWidget()
        header.setStyleSheet("background: transparent; padding: 12px 12px 4px;")
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(0, 0, 0, 0)
        title = QPushButton(os.path.basename(project_path))
        title.setStyleSheet("""
            QPushButton {
                background: transparent; border: none;
                color: #cccccc; font-size: 14px; font-weight: 600;
                text-align: left; padding: 0;
            }
            QPushButton:hover { color: #ffffff; }
        """)
        title.clicked.connect(self._rename_project)
        header_layout.addWidget(title)
        header_layout.addStretch()
        layout.addWidget(header)

        # 文件树
        self.tree = QTreeWidget()
        self.tree.setHeaderHidden(True)
        self.tree.setIndentation(16)
        self.tree.setAnimated(True)
        self.tree.setRootIsDecorated(False)
        self.tree.setStyleSheet("""
            QTreeWidget {
                background: transparent; border: none;
                color: #cccccc; font-size: 13px;
                outline: none;
            }
            QTreeWidget::item {
                padding: 4px 12px; border-radius: 4px;
                margin: 1px 8px;
            }
            QTreeWidget::item:hover {
                background: rgba(255,255,255,0.07);
            }
            QTreeWidget::item:selected {
                background: #094771; color: #ffffff;
            }
        """)
        self.tree.itemClicked.connect(self._on_item_clicked)
        self.tree.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tree.customContextMenuRequested.connect(self._show_context_menu)
        layout.addWidget(self.tree)

        # 底部新建按钮
        footer = QWidget()
        footer.setStyleSheet("background: transparent; padding: 4px 8px 8px;")
        footer_layout = QHBoxLayout(footer)
        footer_layout.setContentsMargins(0, 0, 0, 0)
        btn_new = QPushButton("+ 新建文件")
        btn_new.setStyleSheet("""
            QPushButton {
                background: rgba(255,255,255,0.07); border: 1px solid #3c3c3c;
                color: #cccccc; padding: 6px; border-radius: 4px;
                font-size: 13px; width: 100%;
            }
            QPushButton:hover { background: #094771; color: white; }
        """)
        btn_new.clicked.connect(self._add_file)
        footer_layout.addWidget(btn_new)
        layout.addWidget(footer)

        self._populate()

    def _populate(self):
        self.tree.clear()
        for fname in sorted(self.files_dict.keys()):
            item = QTreeWidgetItem([fname])
            item.setData(0, Qt.UserRole, fname)
            self.tree.addTopLevelItem(item)

    def _on_item_clicked(self, item, column):
        fname = item.data(0, Qt.UserRole)
        if fname:
            self.file_selected.emit(fname)

    def _show_context_menu(self, pos):
        item = self.tree.itemAt(pos)
        menu = QMenu()
        menu.setStyleSheet("""
            QMenu {
                background: #252526; border: 1px solid #3c3c3c;
                color: #cccccc; padding: 4px;
            }
            QMenu::item { padding: 6px 24px; border-radius: 4px; }
            QMenu::item:selected { background: #094771; color: white; }
        """)
        if item:
            fname = item.data(0, Qt.UserRole)
            act_rename = menu.addAction("重命名")
            act_rename.triggered.connect(lambda: self._rename_file(fname))
            act_delete = menu.addAction("删除")
            act_delete.triggered.connect(lambda: self._delete_file(fname))
            menu.addSeparator()
        act_new = menu.addAction("新建文件")
        act_new.triggered.connect(self._add_file)
        menu.exec(self.tree.mapToGlobal(pos))

    def _add_file(self):
        name, ok = QInputDialog.getText(self, "新建文件", "文件名:")
        if ok and name.strip():
            if name in self.files_dict:
                QMessageBox.warning(self, "提示", "文件已存在")
                return
            self.files_dict[name.strip()] = ""
            self._populate()

    def _rename_file(self, old_name):
        name, ok = QInputDialog.getText(self, "重命名", "新名称:", text=old_name)
        if ok and name.strip() and name != old_name:
            if name in self.files_dict:
                QMessageBox.warning(self, "提示", "文件已存在")
                return
            self.files_dict[name.strip()] = self.files_dict.pop(old_name)
            self._populate()

    def _delete_file(self, fname):
        reply = QMessageBox.question(self, "确认删除", f"删除 {fname}？",
                                     QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            del self.files_dict[fname]
            self._populate()

    def _rename_project(self):
        from .project_manager import open_projects
        for path, proj in open_projects.items():
            if path == self.project_path:
                name, ok = QInputDialog.getText(self, "重命名项目", "项目名称:",
                                                 text=proj["name"])
                if ok and name.strip():
                    proj["name"] = name.strip()
                break

    def refresh(self, files_dict):
        self.files_dict = files_dict
        self._populate()