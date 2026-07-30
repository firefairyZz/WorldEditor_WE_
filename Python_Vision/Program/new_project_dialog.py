from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QLineEdit, QTextEdit,
    QCheckBox, QDialogButtonBox
)

class NewProjectDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("新建项目")
        self.setModal(True)
        self.resize(500, 400)
        self.setStyleSheet("background-color: #2d2d2d; color: #ccc;")

        layout = QVBoxLayout(self)

        form = QFormLayout()
        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("项目名称")
        self.name_edit.setStyleSheet("background: #3c3c3c; border: 1px solid #555; padding: 6px;")
        form.addRow("名称 *:", self.name_edit)

        self.desc_edit = QTextEdit()
        self.desc_edit.setPlaceholderText("描述（可选）")
        self.desc_edit.setMaximumHeight(80)
        self.desc_edit.setStyleSheet("background: #3c3c3c; border: 1px solid #555;")
        form.addRow("描述:", self.desc_edit)

        self.readme_check = QCheckBox("添加 README 文件")
        self.readme_check.setChecked(True)
        form.addRow(self.readme_check)

        self.sample_check = QCheckBox("添加示例世界观文件")
        form.addRow(self.sample_check)

        layout.addLayout(form)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

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