from PySide6.QtWidgets import QDialog, QVBoxLayout, QFormLayout, QComboBox, QDialogButtonBox

class SettingsDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("设置")
        self.setModal(True)
        self.resize(400, 200)
        self.setStyleSheet("background-color: #2d2d2d; color: #ccc;")

        layout = QVBoxLayout(self)

        form = QFormLayout()
        self.lang_combo = QComboBox()
        self.lang_combo.addItems(["中文 (zh_CN)", "English (en)"])
        form.addRow("语言:", self.lang_combo)

        self.theme_combo = QComboBox()
        self.theme_combo.addItems(["暗色 (唯一)"])
        form.addRow("主题:", self.theme_combo)

        layout.addLayout(form)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)