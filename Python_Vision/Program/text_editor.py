from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QPlainTextEdit, QLabel, QHBoxLayout, QPushButton
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont

class TextEditor(QWidget):
    content_changed = Signal(str, str)  # 文件名, 新内容

    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_file = None
        self._modified = False
        self.setStyleSheet("background: #1e1e1e;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # 文件信息栏（JS 版风格）
        self.info_bar = QWidget()
        self.info_bar.setStyleSheet("background: #252526; border-bottom: 1px solid #3c3c3c;")
        info_layout = QHBoxLayout(self.info_bar)
        info_layout.setContentsMargins(12, 6, 12, 6)
        info_layout.setSpacing(8)

        self.file_label = QLabel("未选择文件")
        self.file_label.setStyleSheet("color: #999999; font-size: 13px; border: none;")
        info_layout.addWidget(self.file_label)
        info_layout.addStretch()

        self.save_btn = QPushButton("保存")
        self.save_btn.setStyleSheet("""
            QPushButton {
                background: #0078d4; border: none;
                color: white; padding: 4px 14px; border-radius: 4px;
                font-size: 12px;
            }
            QPushButton:hover { background: #1a8ad4; }
        """)
        self.save_btn.clicked.connect(self._save)
        self.save_btn.hide()
        info_layout.addWidget(self.save_btn)
        layout.addWidget(self.info_bar)

        # 编辑器（JS 版风格：bg-main, #cccccc）
        self.edit = QPlainTextEdit()
        self.edit.setFont(QFont("Microsoft YaHei", 14))
        self.edit.setStyleSheet("""
            QPlainTextEdit {
                background: #1e1e1e; color: #cccccc;
                border: none; padding: 12px 16px;
                font-size: 14px; selection-background-color: #094771;
            }
        """)
        self.edit.textChanged.connect(self._on_text_changed)
        layout.addWidget(self.edit)

        # 空状态提示
        self.empty_label = QLabel("选择一个文件开始编辑")
        self.empty_label.setAlignment(Qt.AlignCenter)
        self.empty_label.setStyleSheet("color: #666666; font-size: 16px; background: transparent; border: none;")
        layout.addWidget(self.empty_label)
        self.edit.hide()
        self.info_bar.hide()

    def open_file(self, fname, content):
        self.current_file = fname
        self.file_label.setText(fname)
        self.edit.setPlainText(content)
        self._modified = False
        self.save_btn.hide()
        self.empty_label.hide()
        self.edit.show()
        self.info_bar.show()

    def _on_text_changed(self):
        if self.current_file:
            self._modified = True
            self.save_btn.show()
            self.content_changed.emit(self.current_file, self.edit.toPlainText())

    def _save(self):
        if self.current_file:
            self.content_changed.emit(self.current_file, self.edit.toPlainText())
            self._modified = False
            self.save_btn.hide()

    def is_modified(self):
        return self._modified

    def clear(self):
        self.current_file = None
        self.file_label.setText("未选择文件")
        self.edit.clear()
        self._modified = False
        self.save_btn.hide()
        self.edit.hide()
        self.info_bar.hide()
        self.empty_label.show()