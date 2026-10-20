#!/usr/bin/env python3
"""Validate exact counters for all handwritten frontend/src TypeScript, including bootstrap."""
import importlib.util
import hashlib
import json
from pathlib import Path

KIND = 'validated_full_frontend_typescript_denominator'


def digest(value):
    return hashlib.sha256(value).hexdigest()


def current_sources(root):
    frontend = root / 'frontend'
    sources = {}
    for file in (frontend / 'src').rglob('*.ts'):
        name = file.relative_to(frontend).as_posix()
        if name.endswith('.spec.ts') or name.startswith(('src/app/api/generated/', 'src/app/api/fixture-generated/')):
            continue
        sources[name] = digest(file.read_bytes())
    if not sources:
        raise ValueError('The current frontend source denominator is empty.')
    return sources


def validate(measurement, root, unit_summary=None, combined_summary=None):
    if not measurement or not (unit_summary or combined_summary):
        raise ValueError('A producer measurement and exact frontend summary are required.')
    producer = json.loads(measurement.read_text())
    proof = producer.get('frontendDenominator')
    if (not isinstance(proof, dict) or proof.get('version') != 1 or proof.get('kind') != KIND
            or producer.get('completeSourceMapping') is not True or producer.get('conversionErrors') != []):
        raise ValueError('Validated full frontend denominator provenance is required.')
    if proof.get('sources') != current_sources(root):
        raise ValueError('Frontend coverage sources differ from the complete current application.')
    record = proof.get('unitRun')
    if not isinstance(record, dict):
        raise ValueError('A passed full frontend unit-run proof is required.')
    relative = Path(record.get('path', ''))
    if relative.is_absolute() or '..' in relative.parts or relative.name != 'unit-run-provenance.json':
        raise ValueError('Frontend unit-run provenance must stay inside its producer output.')
    bound = measurement.parent / relative
    if (not bound.is_file() or bound.is_symlink() or not bound.resolve().is_relative_to(measurement.parent.resolve())
            or digest(bound.read_bytes()) != record.get('sha256')):
        raise ValueError('Frontend unit-run proof bytes differ from the validated producer output.')
    spec = importlib.util.spec_from_file_location('frontend_unit_run', Path(__file__).with_name('frontend-unit-run-provenance.py'))
    unit_run = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(unit_run)
    passed = unit_run.validate(root, bound.parent)
    if passed['runId'] != record.get('runId'):
        raise ValueError('Frontend unit-run producer identity differs from the bound proof.')
    for kind, supplied in [('unit', unit_summary), ('combined', combined_summary)]:
        if supplied is None:
            continue
        record = proof['summaries'][kind]
        relative = Path(record['path'])
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Frontend summary provenance must stay inside its producer output.')
        bound = measurement.parent / relative
        if (not bound.is_file() or bound.is_symlink() or digest(bound.read_bytes()) != record['sha256']
                or digest(supplied.read_bytes()) != record['sha256']):
            raise ValueError('Frontend coverage summary bytes differ from the validated producer output.')
    return True
