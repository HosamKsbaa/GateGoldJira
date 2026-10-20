#!/usr/bin/env python3
"""Hash every handwritten frontend/src TypeScript file in the fixed denominator."""
import importlib.util
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('frontend_provenance', root / 'scripts/frontend-coverage-provenance.py')
provenance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provenance)
print(json.dumps(provenance.current_sources(root), sort_keys=True))
