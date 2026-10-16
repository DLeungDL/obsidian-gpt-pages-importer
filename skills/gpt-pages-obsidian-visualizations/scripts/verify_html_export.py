#!/usr/bin/env python3
"""Compare/extract fenced HTML bytes and optionally check JS syntax; never execute JS."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path


def html_blocks(path):
    text = Path(path).read_bytes().decode('utf-8-sig', errors='strict')
    blocks, active, payload = [], None, []
    for number, line in enumerate(text.splitlines(keepends=True), 1):
        bare = line.rstrip('\r\n')
        fence = re.fullmatch(r'( {0,3})(`{3,}|~{3,})(.*)', bare)
        if active is None:
            if not fence:
                continue
            indent, marker, info = fence.groups()
            if marker[0] == '`' and '`' in info:
                continue
            is_html = bool(info.strip()) and info.strip().split()[0].lower() == 'html'
            if is_html and indent:
                raise ValueError(f'{path}:{number}: HTML fences must start in column 1')
            active = (marker[0], len(marker), is_html, number)
            payload = []
        elif (fence and fence[2][0] == active[0]
              and len(fence[2]) >= active[1] and not fence[3].strip()):
            if active[2]:
                blocks.append(''.join(payload).encode('utf-8'))
            active = None
        elif active[2]:
            payload.append(line)
    if active:
        raise ValueError(f'{path}:{active[3]}: unclosed fence')
    if not blocks:
        raise ValueError(f'{path}: no top-level fenced HTML found')
    return blocks


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.inline, self.external, self.current = [], [], None

    def handle_starttag(self, tag, attrs):
        if tag != 'script':
            return
        attrs = dict(attrs)
        if 'src' in attrs:
            self.external.append(attrs['src'])
        kind = (attrs.get('type') or '').strip().lower()
        js_types = ('', 'text/javascript', 'application/javascript',
                    'text/ecmascript', 'application/ecmascript', 'module')
        self.current = [kind, []] if kind in js_types and 'src' not in attrs else None

    def handle_data(self, data):
        if self.current is not None:
            self.current[1].append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.current is not None:
            kind, chunks = self.current
            self.inline.append((kind, ''.join(chunks)))
            self.current = None

    def finish(self, source):
        self.feed(source)
        self.close()
        if self.current is not None:
            raise ValueError('unclosed inline script')


def node_check(blocks, node):
    checks = []
    with tempfile.TemporaryDirectory(prefix='html-syntax-') as temp:
        for index, block in enumerate(blocks, 1):
            parser = Scripts()
            parser.finish(block.decode('utf-8'))
            for src in parser.external:
                checks.append({'block': index, 'external_script': src, 'passed': False})
            for script_index, (kind, source) in enumerate(parser.inline, 1):
                suffix = '.mjs' if kind == 'module' else '.js'
                path = Path(temp) / f'block-{index}-script-{script_index}{suffix}'
                path.write_bytes(source.encode('utf-8'))
                result = subprocess.run([node, '--check', str(path)], capture_output=True,
                                        encoding='utf-8', errors='replace', timeout=30)
                checks.append({'block': index, 'script': script_index, 'type': kind or 'classic',
                               'passed': result.returncode == 0,
                               'diagnostic': result.stderr.strip()})
    return checks


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('markdown', type=Path)
    cli.add_argument('--expected', type=Path, help='Canonical Markdown with the same ordered HTML blocks')
    cli.add_argument('--out', type=Path, help='New or empty extraction directory; never overwrite')
    cli.add_argument('--node-check', action='store_true', help='Syntax only, not execution')
    cli.add_argument('--node', default='node', help='Node executable for --node-check')
    args = cli.parse_args()
    try:
        blocks = html_blocks(args.markdown)
        report = {'markdown_bytes': args.markdown.stat().st_size,
                  'html_blocks': [{'index': i, 'bytes': len(block),
                                   'sha256': hashlib.sha256(block).hexdigest()}
                                  for i, block in enumerate(blocks, 1)],
                  'source_match': None, 'js_syntax': None,
                  'runtime_tested': False}
        if args.expected:
            expected = html_blocks(args.expected)
            report['expected_blocks'] = len(expected)
            report['source_match'] = blocks == expected
            report['mismatched_indices'] = [i + 1 for i in range(max(len(blocks), len(expected)))
                                            if i >= len(blocks) or i >= len(expected)
                                            or blocks[i] != expected[i]]
        if args.node_check:
            report['js_syntax'] = node_check(blocks, args.node)
        if args.out:
            if args.out.exists() and (not args.out.is_dir() or any(args.out.iterdir())):
                raise ValueError('--out must be a new or empty directory')
            args.out.mkdir(parents=True, exist_ok=True)
            for index, block in enumerate(blocks, 1):
                with (args.out / f'visual-{index:03d}.html').open('xb') as output:
                    output.write(block)
        print(json.dumps(report, ensure_ascii=True, indent=2))
        failed = report['source_match'] is False or any(
            not item['passed'] for item in report['js_syntax'] or [])
        return 1 if failed else 0
    except (OSError, UnicodeError, ValueError, subprocess.SubprocessError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=True), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
