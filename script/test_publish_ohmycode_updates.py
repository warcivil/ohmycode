"""Publishing must reject mixed versions and altered installer payloads before SSH."""
import base64
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import yaml


class PublicationContract(unittest.TestCase):
    def test_valid_pair_and_rejected_manifests(self):
        for mutation in ['none', 'version', 'checksum', 'size', 'url']:
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                for platform, manifest, suffix in [('ubuntu', 'latest-linux.yml', '-linux-amd64.deb'), ('windows', 'latest.yml', '-win-x64.exe')]:
                    folder = root / platform
                    folder.mkdir()
                    version = '2.0.24-ohmycode.4' if mutation == 'version' and platform == 'windows' else '2.0.24-ohmycode.5'
                    name = f'ohmycode-dev-{version}{suffix}'
                    payload = b'test installer payload'
                    (folder / name).write_bytes(payload)
                    entry = {'url': name, 'size': len(payload), 'sha512': base64.b64encode(hashlib.sha512(payload).digest()).decode()}
                    if platform == 'windows':
                        if mutation == 'checksum': entry['sha512'] = 'tampered'
                        if mutation == 'size': entry['size'] += 1
                        if mutation == 'url': entry['url'] = '../installer.exe'
                    (folder / manifest).write_text(yaml.safe_dump({'version': version, 'files': [entry]}))
                result = subprocess.run([sys.executable, str(Path(__file__).with_name('publish-ohmycode-updates.py')), '--ubuntu', str(root / 'ubuntu'), '--windows', str(root / 'windows'), '--notes', 'Test release', '--check-only'], capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, mutation == 'none', result.stderr)
                if mutation == 'none': self.assertIn('Verified Windows and Ubuntu', result.stdout)


if __name__ == '__main__':
    unittest.main()
