from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QLineEdit, QTextEdit,
    QCheckBox, QDialogButtonBox, QHBoxLayout, QPushButton, QLabel, QWidget
)
from PySide6.QtCore import Qt

class NewProjectDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("新建项目")
        self.setModal(True)
        self.resize(500, 420)
        # 对话框整体背景 JS: #252526
        self.setStyleSheet("""
            QDialog {
                background-color: #252526;
                color: #cccccc;
            }
            QLabel {
                color: #cccccc;
                font-size: 14px;
                font-weight: 500;
            }
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # 滚动内容区
        scroll_widget = QWidget()
        scroll_widget.setStyleSheet("background: transparent;")
        scroll_layout = QVBoxLayout(scroll_widget)
        scroll_layout.setContentsMargins(40, 30, 40, 20)
        scroll_layout.setSpacing(0)

        # 标题
        title = QLabel("新建项目")
        title.setStyleSheet("font-size: 20px; font-weight: 500; color: #cccccc; margin-bottom: 25px; border: none;")
        scroll_layout.addWidget(title)

        form = QFormLayout()
        form.setSpacing(18)
        form.setLabelAlignment(Qt.AlignLeft)

        # 名称字段
        name_label = QLabel("名称 *")
        name_label.setStyleSheet("font-size: 14px; font-weight: 500; color: #cccccc; border: none;")
        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("项目名称")
        self.name_edit.setStyleSheet("""
            QLineEdit {
                background: #1e1e1e; border: 1px solid #3c3c3c;
                color: #cccccc; padding: 8px 12px; border-radius: 4px;
                font-size: 14px;
            }
            QLineEdit:focus {
                border-color: #0078d4;
            }
        """)
        form.addRow(name_label, self.name_edit)

        # 描述字段
        desc_label = QLabel("描述")
        desc_label.setStyleSheet("font-size: 14px; font-weight: 500; color: #cccccc; border: none;")
        self.desc_edit = QTextEdit()
        self.desc_edit.setPlaceholderText("描述（可选）")
        self.desc_edit.setMaximumHeight(80)
        self.desc_edit.setStyleSheet("""
            QTextEdit {
                background: #1e1e1e; border: 1px solid #3c3c3c;
                color: #cccccc; padding: 8px 12px; border-radius: 4px;
                font-size: 14px;
            }
            QTextEdit:focus {
                border-color: #0078d4;
            }
        """)
        form.addRow(desc_label, self.desc_edit)

        # 复选框
        self.readme_check = QCheckBox("添加 README 文件")
        self.readme_check.setChecked(True)
        self.readme_check.setStyleSheet("""
            QCheckBox {
                color: #cccccc; font-size: 14px; spacing: 8px;
            }
            QCheckBox::indicator {
                width: 16px; height: 16px;
                border: 1px solid #3c3c3c; border-radius: 3px;
                background: #1e1e1e;
            }
            QCheckBox::indicator:checked {
                background: #0078d4; border-color: #0078d4;
            }
        """)
        scroll_layout.addSpacing(8)
        scroll_layout.addWidget(self.readme_check)

        self.sample_check = QCheckBox("添加示例世界观文件")
        self.sample_check.setStyleSheet("""
            QCheckBox {
                color: #cccccc; font-size: 14px; spacing: 8px;
                margin-top: 8px;
            }
            QCheckBox::indicator {
                width: 16px; height: 16px;
                border: 1px solid #3c3c3c; border-radius: 3px;
                background: #1e1e1e;
            }
            QCheckBox::indicator:checked {
                background: #0078d4; border-color: #0078d4;
            }
        """)
        scroll_layout.addWidget(self.sample_check)

        scroll_layout.addStretch()
        layout.addWidget(scroll_widget, 1)

        # 底部按钮区（JS: border-top, bg-main）
        btn_bar = QWidget()
        btn_bar.setStyleSheet("background: #1e1e1e; border-top: 1px solid #3c3c3c;")
        btn_layout = QHBoxLayout(btn_bar)
        btn_layout.setContentsMargins(40, 12, 40, 12)
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

        btn_ok = QPushButton("创建")
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

    @property
    def project_name(self):
        return self.name_edit.text().strip()

    @property
    def description(self):
        return self.desc_edit.toPlainText().strip()

    @property
    def init_readme(self):
        return self.readme_check.isChecked()

    @property
    def init_sample(self):
        return self.sample_check.isChecked()