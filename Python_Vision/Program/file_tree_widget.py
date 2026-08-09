import os
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QListWidget, QListWidgetItem,
    QPushButton, QLabel, QLineEdit, QInputDialog, QMessageBox
)
from PySide6.QtCore import Qt, Signal

class FileTreeWidget(QWidget):
    """项目文件树组件，显示文件列表并支持新建/删除/重命名"""
    
    file_selected = Signal(str)  # 发出文件名

    def __init__(self, project_path, parent=None):
        super().__init__(parent)
        self.project_path = project_path
        self._files = []
        self._current_file = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        # 标题
        title = QLabel("项目文件")
        title.setStyleSheet("font-size: 12px; font-weight: 600; color: #ccc; padding: 8px 8px 4px;")
        layout.addWidget(title)

        # 文件列表
        self.list_widget = QListWidget()
        self.list_widget.setStyleSheet("""
            QListWidget {
                background: #1e1e1e; border: none; outline: none;
                font-size: 13px; color: #ccc;
            }
            QListWidget::item {
                padding: 4px 8px; border-radius: 3px;
            }
            QListWidget::item:hover { background: #3c3c3c; }
            QListWidget::item:selected { background: #094771; color: white; }
        """)
        self.list_widget.itemClicked.connect(self._on_item_clicked)
        layout.addWidget(self.list_widget)

        # 底部按钮
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(4)

        self.add_btn = QPushButton("+ 新建")
        self.del_btn = QPushButton("删除")
        self.rename_btn = QPushButton("重命名")

        btn_style = """
            QPushButton {
                background: #3c3c3c; border: 1px solid #555; color: #ccc;
                padding: 4px 8px; border-radius: 3px; font-size: 12px;
            }
            QPushButton:hover { background: #505050; }
        """
        for btn in (self.add_btn, self.del_btn, self.rename_btn):
            btn.setStyleSheet(btn_style)
            btn_layout.addWidget(btn)

        self.add_btn.clicked.connect(self._add_file)
        self.del_btn.clicked.connect(self._delete_file)
        self.rename_btn.clicked.connect(self._rename_file)

        layout.addLayout(btn_layout)

    def set_files(self, files):
        """更新文件列表"""
        self._files = sorted(files)
        self.list_widget.clear()
        for f in self._files:
            item = QListWidgetItem(f)
            item.setData(Qt.UserRole, f)
            self.list_widget.addItem(item)

    def set_current_file(self, filename):
        """高亮当前文件"""
        self._current_file = filename
        for i in range(self.list_widget.count()):
            item = self.list_widget.item(i)
            if item.text() == filename:
                self.list_widget.setCurrentItem(item)
                return
        self.list_widget.clearSelection()

    def _on_item_clicked(self, item):
        filename = item.text()
        self._current_file = filename
        self.file_selected.emit(filename)

    def _add_file(self):
        name, ok = QInputDialog.getText(self, "新建文件", "文件名（含扩展名，如 note.txt）:")
        if ok and name:
            path = os.path.join(self.project_path, name)
            if os.path.exists(path):
                QMessageBox.warning(self, "提示", "文件已存在")
                return
            try:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write("")
                self._files.append(name)
                self.set_files(self._files)
                self.file_selected.emit(name)
            except Exception as e:
                QMessageBox.critical(self, "错误", f"创建文件失败: {e}")

    def _delete_file(self):
        item = self.list_widget.currentItem()
        if not item:
            return
        name = item.text()
        reply = QMessageBox.question(self, "确认删除", f"确定删除「{name}」？",
                                     QMessageBox.Yes | QMessageBox.No)
        if reply != QMessageBox.Yes:
            return
        path = os.path.join(self.project_path, name)
        try:
            if os.path.exists(path):
                os.remove(path)
            if name in self._files:
                self._files.remove(name)
            self.set_files(self._files)
        except Exception as e:
            QMessageBox.critical(self, "错误", f"删除文件失败: {e}")

    def _rename_file(self):
        item = self.list_widget.currentItem()
        if not item:
            return
        old_name = item.text()
        new_name, ok = QInputDialog.getText(self, "重命名", "新文件名:", text=old_name)
        if ok and new_name and new_name != old_name:
            old_path = os.path.join(self.project_path, old_name)
            new_path = os.path.join(self.project_path, new_name)
            if os.path.exists(new_path):
                QMessageBox.warning(self, "提示", "目标文件已存在")
                return
            try:
                os.rename(old_path, new_path)
                idx = self._files.index(old_name)
                self._files[idx] = new_name
                self.set_files(self._files)
                self.set_current_file(new_name)
                self.file_selected.emit(new_name)
            except Exception as e:
                QMessageBox.critical(self, "错误", f"重命名失败: {e}")