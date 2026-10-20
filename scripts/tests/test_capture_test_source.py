import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "capture_test_source", Path(__file__).resolve().parents[1] / "capture-test-source.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CapturedSourceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "repository"
        self.destination = Path(self.temporary.name) / "captured"
        for name in module.REQUIRED:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("original source")
        self.private = self.root / ".local/identity/token"
        self.private.parent.mkdir(parents=True)
        self.private.write_text("private fixture value")

    def test_regeneration_cannot_remove_or_replace_captured_imports(self):
        module.capture(self.root, self.destination)
        generated = Path("frontend/src/app/api/generated/zod.gen.ts")
        (self.root / generated).unlink()
        self.assertEqual((self.destination / generated).read_text(), "original source")
        self.assertFalse((self.destination / ".local").exists())
        self.assertTrue((self.destination / "source-manifest.json").is_file())

    def test_existing_destination_is_preserved(self):
        self.destination.mkdir()
        marker = self.destination / "keep"
        marker.write_text("preserve")
        with self.assertRaises(ValueError):
            module.capture(self.root, self.destination)
        self.assertEqual(marker.read_text(), "preserve")

    def test_backend_design_catalogs_and_grants_are_captured_with_their_consumers(self):
        dependencies = {
            ".github/workflows/ci.yml": "name: captured acceptance workflow",
            "specs/002-scalable-core/contracts/operations.json": '{"operations": []}',
            "infra/sql/runtime-grants.sql": "SELECT 'fixture grant';",
            "infra/compute/install-web.py": "owner deployment archive validator",
            "docs/use-cases/catalog.json": '{"cases": []}',
            "frontend/tooling/use-case-reporter.spec.ts": "reporter regression",
            "integrations/antigravity/build.mjs": "captured plugin builder",
            "integrations/antigravity/plugin/plugin.json": "{\"id\":\"fixture-plugin\"}",
            "integrations/antigravity/README.md": "captured plugin instructions",
        }
        for name, data in dependencies.items():
            source = self.root / name
            source.parent.mkdir(parents=True,exist_ok=True)
            source.write_text(data)
        module.capture(self.root, self.destination)
        for name, data in dependencies.items():
            self.assertEqual((self.destination / name).read_text(), data)


if __name__ == "__main__":
    unittest.main()
