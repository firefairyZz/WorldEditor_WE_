import sys
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QTimer
from Program.splash_screen import SplashScreen
from Program.config import APP_VERSION

main_window = None   # 全局引用，防止被回收

def main():
    app = QApplication(sys.argv)
    app.setApplicationName("WE")

    splash = SplashScreen(APP_VERSION)
    splash.show()

    def step1():
        splash.show_status("正在检查项目文件...")
        QTimer.singleShot(800, step2)

    def step2():
        splash.show_status("正在加载配置...")
        QTimer.singleShot(800, step3)

    def step3():
        splash.show_status("正在启动...")
        QTimer.singleShot(800, show_main)

    def show_main():
        splash.hide()                     # 隐藏而不是关闭
        QTimer.singleShot(300, create_main)

    def create_main():
        global main_window
        from Program.main_window import MainWindow
        main_window = MainWindow()
        main_window.show()
        # 延迟删除启动画面，确保不影响主窗口
        QTimer.singleShot(1000, splash.deleteLater)

    QTimer.singleShot(0, step1)
    sys.exit(app.exec())

if __name__ == "__main__":
    main()