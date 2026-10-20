"""Behavioral checks for the portable Page skill's byte verifier (standard library only)."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'skills/gpt-pages-obsidian-visualizations/scripts/verify_html_export.py'
SPEC = importlib.util.spec_from_file_location('verify_html_export', SCRIPT)
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class ExportVerifierTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='gpt-pages-skill-test-')
        self.root = Path(self.temp.name)
        self.source = '<!doctype html>\n<html><head></head><body>中文 📚 \\alpha &lt;p&gt;</body></html>\n'.encode('utf-8')

    def tearDown(self):
        # Remove only explicitly enumerated files created by this test.
        for path in self.root.iterdir():
            if path.is_dir():
                for child in path.iterdir():
                    child.unlink()
                path.rmdir()
            else:
                path.unlink()
        self.temp.cleanup()

    def markdown(self, name='download.md', body=None, fence=b'```', ending=b'\n'):
        path = self.root / name
        path.write_bytes(b'\xef\xbb\xbf# Title' + ending + ending + fence + b'html' + ending
                         + (self.source if body is None else body) + fence + ending)
        return path

    def run_cli(self, path, *args):
        return subprocess.run([sys.executable, '-B', str(SCRIPT), str(path), *map(str, args)],
                              capture_output=True, encoding='utf-8', timeout=30)

    def test_preserves_payload_bom_crlf_and_long_fences(self):
        source = b'\xef\xbb\xbf' + self.source.replace(b'\n', b'\r\n')
        path = self.markdown(body=source, fence=b'~~~~', ending=b'\r\n')
        self.assertEqual(VERIFIER.html_blocks(path), [source])

    def test_ignores_html_fence_examples_inside_another_fence(self):
        path = self.markdown()
        example = b'````text\n```html\nnot source\n```\n````\n\n'
        path.write_bytes(example + path.read_bytes().removeprefix(b'\xef\xbb\xbf'))
        self.assertEqual(VERIFIER.html_blocks(path), [self.source])

    def test_fails_on_unclosed_fences_invalid_encoding_and_missing_html(self):
        path = self.root / 'invalid.md'
        for content in [b'```html\nnot closed', b'\xff', b'plain text']:
            path.write_bytes(content)
            with self.assertRaises((ValueError, UnicodeError)):
                VERIFIER.html_blocks(path)

    def test_comparison_detects_newline_changes(self):
        expected = self.markdown('expected.md')
        changed = self.markdown(body=self.source.replace(b'\n', b'\r\n'))
        result = self.run_cli(changed, '--expected', expected)
        self.assertEqual(result.returncode, 1, result.stderr)
        report = json.loads(result.stdout)
        self.assertFalse(report['source_match'])
        self.assertEqual(report['mismatched_indices'], [1])

    def test_trust_copy_matches_ordinary_export_without_changing_payload_bytes(self):
        source = b'\xef\xbb\xbf' + self.source.replace(b'\n', b'\r\n')
        expected = self.markdown('expected.md', body=source, fence=b'~~~~', ending=b'\r\n')
        test_copy = self.root / 'trust-test.md'
        test_copy.write_bytes(expected.read_bytes().replace(b'~~~~html\r\n', b'~~~~html-source\r\n', 1))
        result = self.run_cli(test_copy, '--language', 'html-source', '--expected', expected)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report['fence_language'], 'html-source')
        self.assertTrue(report['source_match'])
        self.assertFalse(report['runtime_tested'])
        self.assertEqual(VERIFIER.html_blocks(test_copy, 'html-source'), [source])
        self.assertEqual(expected.read_bytes().count(b'~~~~html\r\n'), 1)
        self.assertEqual(self.run_cli(test_copy).returncode, 2)
        test_copy.write_bytes(test_copy.read_bytes().replace(b'&lt;p&gt;', b'&lt;changed&gt;'))
        changed = self.run_cli(test_copy, '--language', 'html-source', '--expected', expected)
        self.assertEqual(changed.returncode, 1, changed.stderr)
        self.assertFalse(json.loads(changed.stdout)['source_match'])

    def test_language_selection_does_not_accept_an_executable_copy_as_a_trust_test(self):
        ordinary = self.markdown()
        result = self.run_cli(ordinary, '--language', 'html-source', '--expected', ordinary)
        self.assertEqual(result.returncode, 2)
        self.assertIn('no top-level fenced html-source', result.stderr)

    def test_extracts_original_bytes_and_refuses_existing_output(self):
        path = self.markdown()
        out = self.root / 'extracted'
        result = self.run_cli(path, '--expected', path, '--out', out)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)['source_match'])
        self.assertEqual((out / 'visual-001.html').read_bytes(), self.source)
        repeated = self.run_cli(path, '--out', out)
        self.assertEqual(repeated.returncode, 2)
        self.assertEqual((out / 'visual-001.html').read_bytes(), self.source)

    def test_syntax_check_does_not_execute_classic_or_module_scripts(self):
        scripts = b'<script>throw new Error("never execute");</script><script type="module">export const value = 1;</script><script type="application/json">{"value":1}</script>'
        path = self.markdown(body=self.source.replace(b'</body>', scripts + b'</body>'))
        result = self.run_cli(path, '--node-check')
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertFalse(report['runtime_tested'])
        self.assertEqual(len(report['js_syntax']), 2)
        self.assertTrue(all(item['passed'] for item in report['js_syntax']))

    def test_syntax_check_still_rejects_bad_inline_javascript_with_cdn_dependencies(self):
        scripts = b'<script src="https://example.invalid/chart-1.0.0.js"></script><script>const = ;</script>'
        path = self.markdown(body=self.source.replace(b'</body>', scripts + b'</body>'))
        result = self.run_cli(path, '--node-check')
        self.assertEqual(result.returncode, 1, result.stderr)
        report = json.loads(result.stdout)
        self.assertTrue(any(not item['passed'] for item in report['js_syntax']))
        self.assertEqual(report['external_dependencies'][0]['kind'], 'script')

    def test_cdn_is_reported_without_fetching_or_failing_inline_syntax(self):
        scripts = b'<script src="https://example.invalid/chart-1.0.0.js"></script><script>throw new Error("never execute");</script>'
        path = self.markdown(body=self.source.replace(b'</body>', scripts + b'</body>'))
        result = self.run_cli(path, '--expected', path, '--node-check')
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertTrue(report['source_match'])
        self.assertEqual(len(report['js_syntax']), 1)
        self.assertTrue(report['js_syntax'][0]['passed'])
        self.assertEqual(report['external_dependencies'], [
            {'block': 1, 'kind': 'script', 'url': 'https://example.invalid/chart-1.0.0.js', 'verified': False}])
        self.assertFalse(report['dependencies_fetched'])
        self.assertFalse(report['runtime_tested'])
        self.assertIsNone(report['self_contained_check'])

    def test_dependency_report_includes_css_dynamic_urls_and_relative_modules(self):
        resources = b'''<link rel="stylesheet" href="theme.css">
<style>@import "extra.css"; main { background: url(https://example.invalid/image.png); }</style>
<img src="data:image/png;base64,AA=="><a href="https://example.invalid/docs">docs</a>
<script type="module">import value from './data.js'; import('./dynamic.js');
fetch('./table.json'); const url = 'https://example.invalid/mathbox-2.3.1.js';</script>'''
        path = self.markdown(body=self.source.replace(b'</body>', resources + b'</body>'))
        result = self.run_cli(path)
        self.assertEqual(result.returncode, 0, result.stderr)
        urls = {item['url'] for item in json.loads(result.stdout)['external_dependencies']}
        self.assertEqual(urls, {'theme.css', 'extra.css', 'https://example.invalid/image.png', './data.js',
                                './dynamic.js', './table.json', 'https://example.invalid/mathbox-2.3.1.js'})
        offline = self.run_cli(path, '--require-self-contained')
        self.assertEqual(offline.returncode, 1, offline.stderr)
        self.assertFalse(json.loads(offline.stdout)['self_contained_check']['passed'])

    def test_requested_self_contained_check_accepts_no_detected_dependencies(self):
        path = self.markdown()
        result = self.run_cli(path, '--require-self-contained', '--node-check')
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report['external_dependencies'], [])
        self.assertTrue(report['self_contained_check']['passed'])
        self.assertFalse(report['runtime_tested'])

    def test_external_only_script_does_not_claim_its_syntax_was_checked(self):
        path = self.markdown(body=self.source.replace(b'</body>', b'<script src="library.js"></script></body>'))
        result = self.run_cli(path, '--node-check')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['js_syntax'], [])
        self.assertEqual(self.run_cli(path, '--node-check', '--require-self-contained').returncode, 1)

    def test_library_templates_preserve_bytes_and_report_pinned_dependencies(self):
        for name, expected in [('plotly-function.html', 1), ('mathbox-curve.html', 6)]:
            with self.subTest(name=name):
                source = (ROOT / 'skills/gpt-pages-obsidian-visualizations/assets' / name).read_bytes()
                path = self.markdown(body=source)
                result = self.run_cli(path, '--expected', path, '--node-check')
                self.assertEqual(result.returncode, 0, result.stderr)
                report = json.loads(result.stdout)
                self.assertTrue(report['source_match'])
                self.assertEqual(len(report['external_dependencies']), expected)
                self.assertTrue(all(item['passed'] for item in report['js_syntax']))
                self.assertTrue(all(('cdn.jsdelivr.net/npm/' in item['url'] or 'unpkg.com/' in item['url']) and '@' in item['url']
                                    and '@latest' not in item['url'] for item in report['external_dependencies']))
                self.assertFalse(report['runtime_tested'])
                self.assertEqual(self.run_cli(path, '--require-self-contained').returncode, 1)

    def test_bundled_interactive_example_has_parseable_inline_javascript(self):
        source = (ROOT / 'skills/gpt-pages-obsidian-visualizations/assets/weighted-sum.html').read_bytes()
        path = self.markdown(body=source)
        result = self.run_cli(path, '--expected', path, '--node-check')
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertTrue(report['source_match'])
        self.assertTrue(report['js_syntax'])
        self.assertTrue(all(item['passed'] for item in report['js_syntax']))


if __name__ == '__main__':
    unittest.main()
