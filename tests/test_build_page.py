import tempfile
import unittest
from pathlib import Path
from tools.build_page import ROOT, DIST, bundle_single_file


class TestBuildPage(unittest.TestCase):
    def test_bundle_single_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = Path(tmpdir) / "test_sim.html"
            size = bundle_single_file(out_file)
            self.assertTrue(out_file.is_file())
            self.assertGreater(size, 100_000)

            content = out_file.read_text(encoding="utf-8")
            self.assertIn("<style>", content)
            self.assertIn('<script type="module">', content)
            self.assertNotIn('href="./assets/', content)
            self.assertNotIn('src="./assets/', content)


if __name__ == "__main__":
    unittest.main()
