#!/usr/bin/env python3
"""Verify the actual copy-only ZIP using isolated profile paths and stdio MCP."""
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import subprocess
import sys
import tempfile
import zipfile


def verify(archive: Path) -> None:
    with tempfile.TemporaryDirectory(prefix='gategold-copy-') as temporary:
        work = Path(temporary)
        with zipfile.ZipFile(archive) as package:
            for name in package.namelist():
                path = Path(name)
                assert path.parts[0] == 'gategoldjira' and '..' not in path.parts
                assert path.name not in {'credentials.json', 'settings.json', 'install.mjs'}
                assert 'node_modules' not in path.parts
                contents = package.read(name)
                assert not re.search(rb'gg_(?:oauth|refresh|mcp)_[A-Za-z0-9_-]{43}', contents)
            package.extractall(work / 'Copied plugins with spaces')
        plugin = work / 'Copied plugins with spaces/gategoldjira'
        assert json.loads((plugin / 'connection.json').read_text()) is None
        environment = {**os.environ, 'GATEGOLDJIRA_DATA_DIR': str(work / 'private'),
                       'GATEGOLDJIRA_CONFIG_DIR': str(work / 'config')}
        for stage in range(2):
            if stage:
                destination = work / 'Moved plugins — portable/gategoldjira'
                destination.parent.mkdir()
                shutil.move(plugin, destination)
                plugin = destination
            config = json.loads((plugin / 'mcp_config.json').read_text())['mcpServers']['gategoldjira']
            assert config == {'command': 'node', 'args': ['bridge.mjs'], 'cwd': '.'}
            child = subprocess.Popen([config['command'], *config['args']], cwd=plugin / config['cwd'],
                                     env=environment, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, text=True)
            selector = selectors.DefaultSelector()
            selector.register(child.stdout, selectors.EVENT_READ)
            try:
                def request(identifier, method, params):
                    child.stdin.write(json.dumps({'jsonrpc': '2.0', 'id': identifier,
                                                  'method': method, 'params': params}) + '\n')
                    child.stdin.flush()
                    assert selector.select(15), 'Packaged MCP bridge did not respond'
                    line = child.stdout.readline()
                    assert line, 'Packaged MCP bridge exited before responding'
                    result = json.loads(line)
                    assert result.get('id') == identifier and 'error' not in result
                    return result['result']

                request(1, 'initialize', {'protocolVersion': '2025-11-25', 'capabilities': {},
                                        'clientInfo': {'name': 'Copied ZIP verification', 'version': '1'}})
                child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
                child.stdin.flush()
                tools = request(2, 'tools/list', {})['tools']
                assert len(tools) > 100 and any(tool['name'] == 'create_issue' for tool in tools)
                result = request(3, 'tools/call', {'name': 'get_me', 'arguments': {}})
                assert result['isError'] is True
                assert 'Set the server URL' in result['content'][0]['text']
                preferences = json.loads((work / 'config/config.json').read_text())
                assert preferences == {'sidecars': {'gategoldjira/studio': {'enabled': True}}}
                assert not (plugin / 'credentials.json').exists()
            finally:
                selector.close()
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
                child.stdin.close()
                child.stdout.close()
                child.stderr.close()
        print(f'Copy/move ZIP verification passed: {len(tools)} MCP tools; signed-out calls blocked.')


if __name__ == '__main__':
    verify(Path(sys.argv[1]).resolve())
