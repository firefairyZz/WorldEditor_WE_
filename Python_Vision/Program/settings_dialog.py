from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QComboBox,
    QLabel, QHBoxLayout, QPushButton, QWidget
)
from PySide6.QtCore import Qt

class SettingsDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("设置")
        self.setModal(True)
        self.resize(450, 280)
        # 对话框整体背景 JS: #252526
        self.setStyleSheet("""
            QDialog { background-color: #252526; color: #cccccc; }
        """)

        layout = QVBoxLayout(self)
        layout.setSpacing(0)
        layout.setContentsMargins(0, 0, 0, 0)

        # 滚动内容区
        scroll_widget = QWidget()
        scroll_widget.setStyleSheet("background: transparent;")
        scroll_layout = QVBoxLayout(scroll_widget)
        scroll_layout.setContentsMargins(30, 24, 30, 16)
        scroll_layout.setSpacing(0)

        # 标题
        title = QLabel("设置")
        title.setStyleSheet("font-size: 20px; font-weight: 500; color: #cccccc; margin-bottom: 24px; border: none;")
        scroll_layout.addWidget(title)

        form = QFormLayout()
        form.setSpacing(16)
        form.setLabelAlignment(Qt.AlignLeft)

        # 语言选择
        lang_label = QLabel("语言")
        lang_label.setStyleSheet("font-size: 14px; font-weight: 500; color: #cccccc; border: none;")
        self.lang_combo = QComboBox()
        self.lang_combo.addItems(["中文 (zh_CN)", "English (en)"])
        self.lang_combo.setStyleSheet("""
            QComboBox {
                background: #1e1e1e; border: 1px solid #3c3c3c;
                color: #cccccc; padding: 6px 8px; border-radius: 4px;
                font-size: 14px; min-width: 180px;
            }
            QComboBox:hover { border-color: #0078d4; }
            QComboBox::drop-down {
                border: none; width: 24px;
            }
            QComboBox::down-arrow {
                image: none; border: none;
            }
            QComboBox QAbstractItemView {
                background: #252526; border: 1px solid #3c3c3c;
                color: #cccccc; selection-background-color: #094771;
                selection-color: #ffffff; outline: none;
            }
        """)
        form.addRow(lang_label, self.lang_combo)

        # 主题选择
        theme_label = QLabel("主题")
        theme_label.setStyleSheet("font-size: 14px; font-weight: 500; color: #cccccc; border: none;")
        self.theme_combo = QComboBox()
        self.theme_combo.addItems(["暗色 (唯一)"])
        self.theme_combo.setStyleSheet("""
            QComboBox {
                background: #1e1e1e; border: 1px solid #3c3c3c;
                color: #cccccc; padding: 6px 8px; border-radius: 4px;
                font-size: 14px; min-width: 180px;
            }
            QComboBox:hover { border-color: #0078d4; }
            QComboBox::drop-down {
                border: none; width: 24px;
            }
            QComboBox::down-arrow {
                image: none; border: none;
            }
            QComboBox QAbstractItemView {
                background: #252526; border: 1px solid #3c3c3c;
                color: #cccccc; selection-background-color: #094771;
                selection-color: #ffffff; outline: none;
            }
        """)
        form.addRow(theme_label, self.theme_combo)

        scroll_layout.addLayout(form)
        scroll_layout.addStretch()
        layout.addWidget(scroll_widget, 1)

        # 底部按钮区（JS: border-top, bg-main）
        btn_bar = QWidget()
        btn_bar.setStyleSheet("background: #1e1e1e; border-top: 1px solid #3c3c3c;")
        btn_layout = QHBoxLayout(btn_bar)
        btn_layout.setContentsMargins(30, 12, 30, 12)
        btn_layout.setSpacing(12)

        btn_cancel = QPushButton("取消")
        btn_cancel.setStyleSheet("""
            QPushButton {
                background: rgba(255,255,255,0.07); border: 1px solid #3c3c3c;
                color: #cccccc; padding: 8px 20px; border-radius: 4px;
                font-size: 14px;
            }
            QPushButton:hover { background: #3c3c3c; }
        """)
        btn_cancel.clicked.connect(self.reject)

        btn_ok = QPushButton("确定")
        btn_ok.setStyleSheet("""
            QPushButton {
                background: #0078d4; border: none;
                color: white; padding: 8px 20px; border-radius: 4px;
                font-size: 14px;
            }
            QPushButton:hover { background: #1a8ad4; }
        """)
        btn_ok.clicked.connect(self.accept)

        btn_layout.addStretch()
        btn_layout.addWidget(btn_cancel)
        btn_layout.addWidget(btn_ok)
        layout.addWidget(btn_bar)