from PySide6.QtWidgets import QWidget, QHBoxLayout, QLabel, QPushButton
from PySide6.QtCore import Qt, QPoint, Signal
from PySide6.QtGui import QMouseEvent

class TitleBar(QWidget):
    minimize_clicked = Signal()
    maximize_clicked = Signal()
    close_clicked = Signal()

    def __init__(self, parent, title="WE - World Editor"):
        super().__init__(parent)
        self.parent = parent
        self.setFixedHeight(32)
        self.setStyleSheet("background-color: #252526; color: #cccccc;")

        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 0, 0, 0)
        layout.setSpacing(0)

        # 标题文字
        self.title_label = QLabel(title)
        self.title_label.setStyleSheet("font-size: 13px; border: none;")
        layout.addWidget(self.title_label)
        layout.addStretch()

        # 按钮样式
        btn_style = """
            QPushButton {
                border: none; color: #cccccc; background: transparent;
                font-size: 14px; font-family: "Segoe UI";
            }
            QPushButton:hover { background: rgba(255,255,255,0.1); }
        """
        close_style = btn_style + " QPushButton:hover { background: #e81123; color: white; }"

        # 最小化按钮（使用 Unicode 减号）
        self.btn_min = QPushButton("─")
        self.btn_min.setFixedSize(46, 32)
        self.btn_min.setStyleSheet(btn_style)
        self.btn_min.clicked.connect(self.minimize_clicked.emit)

        # 最大化按钮（使用 Unicode 方框）
        self.btn_max = QPushButton("□")
        self.btn_max.setFixedSize(46, 32)
        self.btn_max.setStyleSheet(btn_style)
        self.btn_max.clicked.connect(self.maximize_clicked.emit)

        # 关闭按钮（使用 Unicode 叉号）
        self.btn_close = QPushButton("✕")
        self.btn_close.setFixedSize(46, 32)
        self.btn_close.setStyleSheet(close_style)
        self.btn_close.clicked.connect(self.close_clicked.emit)

        layout.addWidget(self.btn_min)
        layout.addWidget(self.btn_max)
        layout.addWidget(self.btn_close)

        # 拖动窗口
        self.moving = False
        self.offset = QPoint()

    def mousePressEvent(self, event: QMouseEvent):
        if event.button() == Qt.LeftButton:
            self.moving = True
            self.offset = event.globalPosition().toPoint() - self.parent.pos()

    def mouseMoveEvent(self, event: QMouseEvent):
        if self.moving:
            self.parent.move(event.globalPosition().toPoint() - self.offset)

    def mouseReleaseEvent(self, event: QMouseEvent):
        self.moving = False

    def set_title(self, title):
        self.title_label.setText(title)