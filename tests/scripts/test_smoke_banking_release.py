"""Release probes stay synthetic and read-only, including denial failures."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

SPEC = importlib.util.spec_from_file_location('release_smoke',
    Path(__file__).parents[2] / 'scripts/smoke-banking-release.py')
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)


class Fixture(smoke.DemoSmoke):
    def __init__(self):
        super().__init__()
        self.calls = []
        self.provider = 'product-demo'
        self.mismatch = False

    def read(self, path, *, session=False):
        self.calls.append((path, session))
        fixed = {'browser/demo': {'role': 'Demo'}, 'browser/status': {'role': 'Demo'},
                 'mode': {'mode': 'Demo', 'availableModes': ['Demo']},
                 'connections': [{'id': 'synthetic', 'isDemo': True, 'provider': self.provider, 'status': 'Active'}],
                 'accounts': [{'id': 'account', 'isDemo': True, 'connectionId': 'synthetic'}]}
        if path in fixed:
            return fixed[path]
        amount = 151 if self.mismatch and path.startswith('cash-flow?') else 150
        return {'income': 1000, 'spending': amount, 'net': 850,
                'categories': [{'categoryId': 'groceries', 'spending': 118},
                               {'categoryId': None, 'spending': 32}]}

    def denial(self, *, mode, status):
        self.calls.append(('denied-' + mode, status))


class SmokeTests(unittest.TestCase):
    def test_one_session_post_and_only_synthetic_reads(self):
        probe = Fixture()
        result = probe.run()
        self.assertEqual(result['financialWrites'], 0)
        self.assertEqual(result['accounts'], 1)
        self.assertEqual([p for p, session in probe.calls if session is True], ['browser/demo'])
        self.assertIn(('denied-Live', 401), probe.calls)
        self.assertIn(('denied-Live', 403), probe.calls)

    def test_real_provider_is_rejected_before_account_reads(self):
        probe = Fixture()
        probe.provider = 'real-bank'
        with self.assertRaisesRegex(RuntimeError, 'synthetic'):
            probe.run()
        self.assertFalse(any(path == 'accounts' for path, _ in probe.calls))

    def test_mismatched_aggregates_fail_the_release_gate(self):
        probe = Fixture()
        probe.mismatch = True
        with self.assertRaisesRegex(RuntimeError, 'aggregates disagree'):
            probe.run()

    def test_unexpected_private_success_is_closed_without_reading_payload(self):
        probe = smoke.DemoSmoke()
        response = MagicMock()
        with patch.object(probe, 'request', return_value=response):
            with self.assertRaisesRegex(RuntimeError, 'unexpectedly accepted'):
                probe.denial(mode='Live', status=401)
        response.read.assert_not_called()
        response.__enter__.return_value.read.assert_not_called()


if __name__ == '__main__':
    unittest.main()
