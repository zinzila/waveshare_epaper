import unittest
from pathlib import Path
from tools.deploy import device_path, host_dir_to_device, SRC


class TestDeploy(unittest.TestCase):
    def test_device_path_translation(self):
        sample_main = SRC / "main.py"
        self.assertEqual(device_path(sample_main), "/main.py")

        sample_app_file = SRC / "app" / "canvas.py"
        self.assertEqual(device_path(sample_app_file), "/app/canvas.py")

    def test_host_dir_to_device(self):
        self.assertIsNone(host_dir_to_device(SRC))
        self.assertEqual(host_dir_to_device(SRC / "app"), "/app")
        self.assertEqual(host_dir_to_device(SRC / "app" / "sub"), "/app/sub")

    def test_device_path_refuses_src_root(self):
        with self.assertRaises(ValueError):
            device_path(SRC)


if __name__ == "__main__":
    unittest.main()
