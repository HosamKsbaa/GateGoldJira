#!/usr/bin/env python3
"""Print public counts only; raw accounts, request bodies and traces stay private."""
import json
import os
from pathlib import Path
import sys
report=json.loads(Path(sys.argv[1]).read_text())
complete=sum(case['status']=='passed' and set(case['surfaces'])<=set(case.get('verifiedSurfaces',[])) for case in report['cases'])
lines=['GateGoldJira use-case evidence',f"Suite: {report['suiteStatus']}",f"Passing cases: {report['verified']} / {report['eligible']} currently eligible; total catalog {report['total']}",f"Verified on every declared surface: {complete} / {report['total']}",f"Invalid evidence: {report.get('invalidEvidence',False)}",'100% is the target, not an inferred result.']
print('\n'.join(lines))
summary=os.environ.get('GITHUB_STEP_SUMMARY')
if summary:
    with open(summary,'a') as output:output.write('\n### GateGoldJira coverage\n\n'+'\n\n'.join(lines[1:])+'\n')
