#!/usr/bin/env python3
"""Check fenced portable image payloads and optionally extract bytes; no rendering or pairing claim."""
import argparse
import base64
import hashlib
import json
import re
import sys
from pathlib import Path


def image_assets(path):
    text = Path(path).read_bytes().decode('utf-8-sig')
    active, lines, blocks = None, [], []
    for number, line in enumerate(text.splitlines(), 1):
        fence = re.fullmatch(r' {0,3}(`{3,}|~{3,})(.*)', line)
        if active is None:
            if fence and not (fence[1][0] == '`' and '`' in fence[2]):
                active = (fence[1][0], len(fence[1]), fence[2].strip() == 'gpt-pages-asset', number)
                lines = []
        elif fence and fence[1][0] == active[0] and len(fence[1]) >= active[1] and not fence[2].strip():
            if active[2]:
                blocks.append(json.loads('\n'.join(lines)))
            active = None
        else:
            lines.append(line)
    if active:
        raise ValueError('Unclosed fence')
    if not blocks or len(blocks) > 32:
        raise ValueError('Expected 1 to 32 image source blocks')
    ids, refs, total, results = set(), set(), 0, []
    for p in blocks:
        if (not isinstance(p, dict) or p.get('version') != 1
                or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', str(p.get('id', '')))
                or not re.fullmatch(r'(?:library-file|project-file):[A-Za-z0-9_-]{1,512}', str(p.get('source_ref', '')))
                or not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}', str(p.get('filename', '')))
                or p['id'] in ids or p['source_ref'] in refs
                or type(p.get('byte_size')) is not int or not 1 <= p['byte_size'] <= 1024 * 1024
                or not isinstance(p.get('base64'), str) or len(p['base64']) != 4 * ((p['byte_size'] + 2) // 3)):
            raise ValueError('Invalid or duplicate image metadata')
        b = base64.b64decode(p['base64'], validate=True)
        if base64.b64encode(b).decode() != p['base64']:
            raise ValueError('Noncanonical Base64')
        ext = None
        if len(b) >= 24 and b.startswith(b'\x89PNG\r\n\x1a\n') and b[12:16] == b'IHDR':
            ext = 'png'
        elif len(b) >= 4 and b.startswith(b'\xff\xd8\xff') and b.endswith(b'\xff\xd9'):
            ext = 'jpg'
        elif len(b) >= 13 and b[:6] in (b'GIF87a', b'GIF89a'):
            ext = 'gif'
        elif len(b) >= 16 and b[:4] == b'RIFF' and b[8:12] == b'WEBP':
            ext = 'webp'
        mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp'}.get(ext)
        digest = hashlib.sha256(b).hexdigest()
        total += len(b)
        if not ext or p.get('mime') != mime or len(b) != p['byte_size'] or digest != p.get('sha256') or total > 4 * 1024 * 1024:
            raise ValueError('Image bytes, MIME, size, digest or total budget mismatch')
        ids.add(p['id'])
        refs.add(p['source_ref'])
        results.append((p, b, digest + '.' + ext))
    return results


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('markdown', type=Path)
    cli.add_argument('--expected', type=Path, help='Canonical Markdown or prior Page readback to compare')
    cli.add_argument('--out', type=Path, help='New or empty directory; never overwrite files')
    args = cli.parse_args()
    results = image_assets(args.markdown)
    if args.expected:
        expected = image_assets(args.expected)
        if {p['id']: (p, b) for p, b, _ in results} != {p['id']: (p, b) for p, b, _ in expected}:
            raise ValueError('Export differs from canonical image payloads')
    if args.out:
        if args.out.exists() and (not args.out.is_dir() or any(args.out.iterdir())):
            raise ValueError('Output directory must be new or empty')
        args.out.mkdir(parents=True, exist_ok=True)
        for p, b, name in results:
            target = args.out / name
            if not target.exists():
                with target.open('xb') as file:
                    file.write(b)
    print(json.dumps([{'id': p['id'], 'byte_size': len(b), 'sha256': p['sha256']} for p, b, _ in results], indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
