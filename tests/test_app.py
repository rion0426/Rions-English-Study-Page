import tempfile
import unittest
from pathlib import Path

import app as english_app


class FlaskAppTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.text_root = Path(self.temp_dir.name)
        (self.text_root / "unit1").mkdir()
        (self.text_root / "unit1" / "lesson1.txt").write_text(
            "Hello **world**.\n--korean--\n안녕하세요 세상.",
            encoding="utf-8",
        )
        (self.text_root / "unit1" / "lesson2.txt").write_text(
            "Second lesson.",
            encoding="utf-8",
        )

        self.original_text_root = english_app.TEXTS_BASE_DIR
        english_app.TEXTS_BASE_DIR = self.text_root
        english_app.app.testing = True
        self.client = english_app.app.test_client()

    def tearDown(self):
        english_app.TEXTS_BASE_DIR = self.original_text_root
        self.temp_dir.cleanup()

    def test_shell_route_renders_single_template(self):
        response = self.client.get("/study/unit1/lesson1.txt")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'id="app"', response.data)

    def test_browse_api_lists_folders_and_files(self):
        response = self.client.get("/api/browse/")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json()
        self.assertEqual(payload["items"][0]["type"], "folder")
        self.assertEqual(payload["items"][0]["path"], "unit1")

    def test_text_api_returns_split_content_and_neighbors(self):
        response = self.client.get("/api/text/unit1/lesson1.txt")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json()
        self.assertEqual(payload["title"], "lesson1")
        self.assertEqual(payload["english_content"], "Hello **world**.")
        self.assertEqual(
            payload["line_pairs"],
            [{"english": "Hello **world**.", "korean": "안녕하세요 세상."}],
        )
        self.assertEqual(payload["korean_content"], "안녕하세요 세상.")
        self.assertEqual(payload["next_text_path"], "unit1/lesson2.txt")
        self.assertIsNone(payload["previous_text_path"])

    def test_invalid_path_is_rejected(self):
        response = self.client.get("/api/browse/../../etc")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
