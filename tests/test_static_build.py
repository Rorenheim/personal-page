import importlib.util
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "build_static", Path(__file__).resolve().parents[1] / "scripts/build_static.py"
)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class StaticBuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = self.root / "generated-artifacts/site"
        (self.root / "assets").mkdir()
        (self.root / "js").mkdir()
        (self.root / "assets/poster.png").write_bytes(b"poster")
        (self.root / "Hero loop.mp4").write_bytes(b"video")
        (self.root / "index.html").write_text(
            '<img src="assets/poster.png"><video src="Hero%20loop.mp4"></video>'
        )
        (self.root / "js/hero.js").write_text(
            'new URL("../Hero loop.mp4", import.meta.url);'
        )
        (self.root / "zipFile.zip").write_bytes(b"private archive")
        (self.root / "unused.png").write_bytes(b"unused")

    def test_rewrites_html_and_module_media_references(self):
        mapping = builder.build(self.root, self.output)
        html = (self.output / "index.html").read_text()
        js = (self.output / "js/hero.js").read_text()
        self.assertIn(mapping["assets/poster.png"], html)
        self.assertIn(mapping["Hero%20loop.mp4"], html)
        self.assertIn("../" + mapping["Hero loop.mp4"], js)
        self.assertTrue((self.output / mapping["Hero loop.mp4"]).is_file())
        self.assertFalse((self.output / "zipFile.zip").exists())
        self.assertFalse((self.output / "unused.png").exists())
        self.assertEqual((self.root / "Hero loop.mp4").read_bytes(), b"video")

    def test_hashes_are_stable_and_change_with_content(self):
        first = builder.build(self.root, self.output)
        self.assertEqual(first, builder.build(self.root, self.output))
        (self.root / "assets/poster.png").write_bytes(b"updated")
        updated = builder.build(self.root, self.output)
        self.assertNotEqual(first["assets/poster.png"], updated["assets/poster.png"])
        self.assertFalse((self.output / first["assets/poster.png"]).exists())

    def test_publishes_crawler_files_at_site_root(self):
        (self.root / "robots.txt").write_text("Sitemap: https://kalaba.me/sitemap.xml\n")
        (self.root / "llms.txt").write_text("# Paul Kalaba\n")
        builder.build(self.root, self.output)
        self.assertEqual(
            (self.output / "robots.txt").read_text(),
            "Sitemap: https://kalaba.me/sitemap.xml\n",
        )
        self.assertTrue((self.output / "llms.txt").is_file())
        self.assertFalse((self.output / "sitemap.xml").exists())

    def test_keeps_icon_urls_stable(self):
        (self.root / "icons").mkdir()
        (self.root / "icons/icon-192.png").write_bytes(b"icon")
        (self.root / "favicon.ico").write_bytes(b"ico")
        (self.root / "index.html").write_text(
            '<link rel="icon" href="favicon.ico"><link rel="icon" href="icons/icon-192.png">'
        )
        mapping = builder.build(self.root, self.output)
        self.assertNotIn("favicon.ico", mapping)
        self.assertEqual((self.output / "favicon.ico").read_bytes(), b"ico")
        self.assertEqual((self.output / "icons/icon-192.png").read_bytes(), b"icon")
        self.assertIn('href="favicon.ico"', (self.output / "index.html").read_text())

    def test_refuses_output_outside_build_directory(self):
        with self.assertRaises(ValueError):
            builder.build(self.root, self.root)
        self.assertTrue((self.root / "index.html").is_file())


if __name__ == "__main__":
    unittest.main()
