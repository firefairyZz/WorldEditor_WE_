from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel
from PySide6.QtCore import Qt, QTimer, QRectF
from PySide6.QtGui import QPixmap, QFont, QColor, QPainter, QPen, QPainterPath

class ImageCoverWidget(QWidget):
    def __init__(self, pixmap, parent=None):
        super().__init__(parent)
        self._pixmap = pixmap

    def setPixmap(self, pixmap):
        self._pixmap = pixmap
        self.update()

    def paintEvent(self, event):
        if self._pixmap.isNull():
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        # 仅左侧圆角的路径
        path = QPainterPath()
        rect = QRectF(self.rect())
        radius = 12
        path.moveTo(rect.right(), rect.top())
        path.lineTo(rect.left() + radius, rect.top())
        path.arcTo(QRectF(rect.left(), rect.top(), 2*radius, 2*radius), 90, 90)
        path.lineTo(rect.left(), rect.bottom() - radius)
        path.arcTo(QRectF(rect.left(), rect.bottom() - 2*radius, 2*radius, 2*radius), 180, 90)
        path.lineTo(rect.right(), rect.bottom())
        path.lineTo(rect.right(), rect.top())
        painter.setClipPath(path)

        # Cover 缩放绘制
        target_rect = rect
        scaled_pixmap = self._pixmap.scaled(
            target_rect.size().toSize(),
            Qt.KeepAspectRatioByExpanding,
            Qt.SmoothTransformation
        )
        source_rect = QRectF(
            (scaled_pixmap.width() - target_rect.width()) / 2,
            (scaled_pixmap.height() - target_rect.height()) / 2,
            target_rect.width(),
            target_rect.height()
        )
        painter.drawPixmap(target_rect, scaled_pixmap, source_rect)
        painter.end()


class SplashScreen(QWidget):
    def __init__(self, version):
        super().__init__(None)
        self._version = version
        self._status = "正在初始化..."

        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setFixedSize(400, 260)          # 宽度缩小约 1/10

        main_layout = QHBoxLayout(self)
        main_layout.setContentsMargins(5, 5, 5, 5)
        main_layout.setSpacing(0)

        pixmap = QPixmap("resources/Load_image.png")
        self.image_widget = ImageCoverWidget(pixmap)
        self.image_widget.setFixedSize(130, 250)   # 图片宽度等比缩小至 130

        text_widget = QWidget()
        text_layout = QVBoxLayout(text_widget)
        text_layout.setAlignment(Qt.AlignVCenter | Qt.AlignLeft)
        text_layout.setSpacing(10)
        text_layout.setContentsMargins(25, 0, 25, 0)

        self.title_label = QLabel("WE - World Editor")
        self.title_label.setFont(QFont("Segoe UI", 18, QFont.Bold))
        self.title_label.setStyleSheet("color: #ffffff;")
        text_layout.addWidget(self.title_label)

        self.version_label = QLabel(f"版本 {self._version}")
        self.version_label.setFont(QFont("Segoe UI", 11))
        self.version_label.setStyleSheet("color: #aaaaaa;")
        text_layout.addWidget(self.version_label)

        self.status_label = QLabel(self._status)
        self.status_label.setFont(QFont("Segoe UI", 11))
        self.status_label.setStyleSheet("color: #aaaaaa;")
        text_layout.addWidget(self.status_label)

        main_layout.addWidget(self.image_widget)
        main_layout.addWidget(text_widget, 1)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setBrush(QColor("#252526"))
        painter.setPen(QPen(QColor("#3c3c3c"), 1))
        bg_rect = QRectF(self.rect()).adjusted(5, 5, -5, -5)
        painter.drawRoundedRect(bg_rect, 12, 12)
        painter.end()

    def show_status(self, status):
        self._status = status
        self.status_label.setText(status)
        QTimer.singleShot(0, self.repaint)