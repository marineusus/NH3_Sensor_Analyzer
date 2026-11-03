import unittest
from pathlib import Path
from unittest.mock import patch
from app import desktop_gui, log_directory


class DesktopPlatform(unittest.TestCase):
    def test_windows_keeps_existing_renderer_and_log_location(self):
        with patch('sys.platform', 'win32'), patch.dict('os.environ', {'LOCALAPPDATA': 'C:/Temp/local'}):
            self.assertEqual(desktop_gui(), 'edgechromium')
            self.assertEqual(log_directory(), Path('C:/Temp/local/NH3SensorAnalyzer'))

    def test_mac_uses_native_webkit_and_writable_user_log_directory(self):
        with patch('sys.platform', 'darwin'), patch('pathlib.Path.home', return_value=Path('/Users/tester')):
            self.assertEqual(desktop_gui(), 'cocoa')
            self.assertEqual(log_directory(), Path('/Users/tester/Library/Logs/NH3SensorAnalyzer'))
