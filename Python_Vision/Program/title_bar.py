from PySide6.QtWidgets import QWidget, QHBoxLayout, QLabel, QPushButton
from PySide6.QtCore import Qt, QPoint, Signal
from PySide6.QtGui import QMouseEvent

class TitleBar(QWidget):
    minimize_clicked = Signal()
    maximize_clicked = Signal()
    close_clicked = Signal()
    settings_clicked = Signal()

    def __init__(self, parent, title="WE - World Editor"):
        super().__init__(parent)
        self.parent = parent
        self.setFixedHeight(36)
        self.setStyleSheet("background-color: #252526; color: #cccccc; border-bottom: 1px solid #3c3c3c;")

        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 0, 0, 0)
        layout.setSpacing(0)

        # 标题文字（JS 版：13px, #cccccc）
        self.title_label = QLabel(title)
        self.title_label.setStyleSheet("font-size: 13px; border: none; color: #cccccc;")
        layout.addWidget(self.title_label)

        # 拖拽区域（JS 版：.title-drag, flex:1）
        self.drag_widget = QWidget()
        self.drag_widget.setStyleSheet("background: transparent;")
        layout.addWidget(self.drag_widget, 1)

        # ===== 窗口控制按钮（JS 版风格） =====
        btn_common = """
            QPushButton {
                border: none; color: #cccccc; background: transparent;
                font-size: 14px; font-family: "Segoe UI", "Segoe MDL2 Assets", sans-serif;
                min-width: 46px; max-width: 46px; min-height: 36px; max-height: 36px;
            }
            QPushButton:hover { background: rgba(255,255,255,0.07); }
        """
        close_style = """
            QPushButton {
                border: none; color: #cccccc; background: transparent;
                font-size: 14px; font-family: "Segoe UI", "Segoe MDL2 Assets", sans-serif;
                min-width: 46px; max-width: 46px; min-height: 36px; max-height: 36px;
            }
            QPushButton:hover { background: #e81123; color: white; }
        """

        # 设置按钮（Lucide gear 图标风格）
        self.btn_settings = QPushButton("⚙")
        self.btn_settings.setStyleSheet(btn_common)
        self.btn_settings.clicked.connect(self.settings_clicked.emit)
        layout.addWidget(self.btn_settings)

        # 最小化按钮
        self.btn_min = QPushButton("─")
        self.btn_min.setStyleSheet(btn_common)
        self.btn_min.clicked.connect(self.minimize_clicked.emit)
        layout.addWidget(self.btn_min)

        # 最大化按钮
        self.btn_max = QPushButton("□")
        self.btn_max.setStyleSheet(btn_common)
        self.btn_max.clicked.connect(self.maximize_clicked.emit)
        layout.addWidget(self.btn_max)

        # 关闭按钮
        self.btn_close = QPushButton("✕")
        self.btn_close.setStyleSheet(close_style)
        self.btn_close.clicked.connect(self.close_clicked.emit)
        layout.addWidget(self.btn_close)

        # 窗口拖动状态
        self.moving = False
        self.offset = QPoint()

    def mousePressEvent(self, event: QMouseEvent):
        if event.button() == Qt.LeftButton:
            # 最大化时禁止拖动
            if self.parent and self.parent.isMaximized():
                return
            self.moving = True
            self.offset = event.globalPosition().toPoint() - self.parent.pos()

    def mouseMoveEvent(self, event: QMouseEvent):
        if self.moving and self.parent and not self.parent.isMaximized():
            self.parent.move(event.globalPosition().toPoint() - self.offset)

    def mouseReleaseEvent(self, event: QMouseEvent):
        self.moving = False

    def mouseDoubleClickEvent(self, event: QMouseEvent):
        # 双击标题栏最大化/还原（JS 版行为）
        if event.button() == Qt.LeftButton:
            self.maximize_clicked.emit()

    def set_title(self, title):
        self.title_label.setText(title)