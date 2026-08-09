import os
from PySide6.QtWidgets import QWidget, QVBoxLayout, QPlainTextEdit, QLabel, QHBoxLayout
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont

class TextEditorWidget(QWidget):
    """简单的文本编辑器组件"""
    
    content_changed = Signal()  # 内容变更信号

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # 顶部信息栏
        header = QHBoxLayout()
        self.file_label = QLabel("未打开文件")
        self.file_label.setStyleSheet("color: #999; font-size: 12px; padding: 4px 8px;")
        header.addWidget(self.file_label)
        header.addStretch()

        self.encoding_label = QLabel("UTF-8")
        self.encoding_label.setStyleSheet("color: #999; font-size: 12px; padding: 4px 8px;")
        header.addWidget(self.encoding_label)

        header_widget = QWidget()
        header_widget.setLayout(header)
        header_widget.setStyleSheet("background: #252526; border-bottom: 1px solid #3c3c3c;")
        layout.addWidget(header_widget)

        # 编辑器
        self.editor = QPlainTextEdit()
        self.editor.setStyleSheet("""
            QPlainTextEdit {
                background: #1e1e1e; color: #d4d4d4; border: none;
                font-size: 14px; padding: 8px; selection-background-color: #264f78;
            }
        """)
        self.editor.setFont(QFont("Consolas, 'Microsoft YaHei', monospace", 14))
        self.editor.setTabStopDistance(20)
        self.editor.setLineWrapMode(QPlainTextEdit.WidgetWidth)
        self.editor.textChanged.connect(self._on_text_changed)
        layout.addWidget(self.editor)

        self._current_file = None
        self._dirty = False

    def load_file(self, filepath):
        """加载文件内容"""
        self._current_file = filepath
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            try:
                with open(filepath, 'r', encoding='gbk') as f:
                    content = f.read()
                self.encoding_label.setText("GBK")
            except Exception:
                content = f"[无法读取文件: {filepath}]"
                self.encoding_label.setText("?")
        else:
            self.encoding_label.setText("UTF-8")

        self.editor.blockSignals(True)
        self.editor.setPlainText(content)
        self.editor.blockSignals(False)
        self._dirty = False
        basename = os.path.basename(filepath) if filepath else "未打开文件"
        self.file_label.setText(basename)

    def save_file(self, filepath=None):
        """保存文件，返回是否成功"""
        path = filepath or self._current_file
        if not path:
            return False
        try:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(self.editor.toPlainText())
            self._dirty = False
            self.file_label.setText(os.path.basename(path))
            return True
        except Exception as e:
            return False

    @property
    def current_file(self):
        return self._current_file

    @property
    def is_dirty(self):
        return self._dirty

    def clear(self):
        """清空编辑器"""
        self._current_file = None
        self.editor.blockSignals(True)
        self.editor.clear()
        self.editor.blockSignals(False)
        self._dirty = False
        self.file_label.setText("未打开文件")
        self.encoding_label.setText("UTF-8")

    def _on_text_changed(self):
        if not self._dirty:
            self._dirty = True
            self.content_changed.emit()