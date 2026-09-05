import unittest
from pathlib import Path
from tools.sim import ROOT, DIST


class TestSim(unittest.TestCase):
    def test_paths(self):
        self.assertTrue((ROOT / "pyproject.toml").is_file())
        self.assertEqual(DIST, ROOT / "dist")


if __name__ == "__main__":
    unittest.main()
