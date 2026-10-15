"""Fictional pension setup protocol tests; no network, owner session or private source."""
import copy
import importlib.util
import pathlib
import unittest
import uuid

spec = importlib.util.spec_from_file_location('pension_setup', pathlib.Path(__file__).resolve().parents[2] / 'scripts/setup-demo-pension.py')
s = importlib.util.module_from_spec(spec); spec.loader.exec_module(s)


def report(day, value):
    return {'parserVersion': 'pensionsinfo-text-1', 'pages': 46, 'reportAsOf': day, 'beforeTax': True, 'todaysMoney': True,
        'agreements': [{'key': 'synthetic-agreement', 'provider': 'Demo Pension', 'currency': 'DKK', 'asOf': day,
            'balance': {'value': value}, 'annualContribution': {'value': 36000, 'source': {'unit': 'DKK/year'}},
            'components': [{'balance': {'value': 100000}}, {'balance': {'value': 100000}}, {'balance': {'value': value-200000}}]}],
        'scenarios': [{'startAge': age, 'payouts': [{'fromAge': age, 'amount': {'value': 1000, 'source': {'unit': 'DKK/year'}}}]} for age in range(65, 76)],
        'insurance': [{'type': 'Death'}, {'type': 'WorkCapacity'}, {'type': 'CriticalIllness'}]}


class Fake:
    def __init__(self):
        self.records = []; self.receipts = {}; self.snapshots = {}; self.writes = []; self.available = True; self.demo = True
        self.budgets = {'plans': [{'name': 'Preserved budget'}]}

    def call(self, path, method='GET', body=None):
        s.Api.validate(path, method)
        if method == 'GET':
            if path == 'mode': return {'mode': 'Demo' if self.demo else 'Live', 'availableModes': ['Demo']}
            if path == 'runtime-info': return {'backend': 'azure', 'sharedDemo': True}
            if path == 'connections': return [{'provider': 'product-demo', 'isDemo': True, 'status': 'Active'}]
            if path == 'accounts': return [{'id': str(i), 'isDemo': True} for i in range(5)]
            if path == 'goals': return [{'name': 'Preserved goal'}]
            if path == 'budget-plans': return copy.deepcopy(self.budgets)
            if path == 'wealth': return copy.deepcopy(self.records)
            if path.startswith('pension/uploads?'):
                return {'total': len(self.receipts), 'offset': 0, 'items': copy.deepcopy(list(self.receipts.values()))} if self.available else None
            if path.startswith('pension/uploads/'): return copy.deepcopy(self.receipts[path.split('/')[2]])
            if path.startswith('pension/snapshots/'): return copy.deepcopy(self.snapshots[path.split('/')[2]])
        self.writes.append((path, copy.deepcopy(body)))
        if path == 'pension/uploads/demo':
            _, day, value = next(row for row in s.SERIES if row[0] == body['version'])
            data = {'id': str(uuid.uuid4()), 'version': 'v1', 'synthetic': True, 'status': 'NeedsReview', 'mediaType': 'application/pdf', 'report': report(day, value), 'snapshotId': None, 'financialSaved': False}
            self.receipts[data['id']] = data; return copy.deepcopy(data)
        if path.endswith('/approve'):
            receipt = self.receipts[path.split('/')[2]]; target = body['products'][0]
            self.records[:] = [{'id': target['id'] or str(uuid.uuid4()), 'version': 'v2', 'kind': 'Pension', 'currency': 'DKK', 'value': body['reviewed']['agreements'][0]['balance']['value'], 'asOf': body['reportAsOf']}]
            snapshot = str(uuid.uuid4()); self.snapshots[snapshot] = {'accepted': {'report': body['reviewed']}}
            receipt.update(snapshotId=snapshot, status='Approved', financialSaved=True); return {'snapshotId': snapshot}
        raise AssertionError(path)


class Tests(unittest.TestCase):
    def test_dry_run_then_apply_uses_normal_review_and_repeat_is_noop(self):
        api = Fake(); planned = s.plan(s.read(api)); self.assertEqual([], api.writes)
        result = s.apply(api, planned); self.assertTrue(result['repeatNoop']); self.assertEqual(2, result['applied'])
        self.assertEqual(431000, api.records[0]['value']); self.assertEqual(2, len(api.snapshots)); self.assertEqual(1, len(api.records))
        writes = len(api.writes); self.assertEqual(0, s.apply(api, s.plan(s.read(api)))['applied']); self.assertEqual(writes, len(api.writes))
        self.assertEqual(4, len(api.writes)); self.assertTrue(all(p == 'pension/uploads/demo' or p.endswith('/approve') for p, _ in api.writes))

    def test_missing_release_owner_or_changed_plan_stop_before_writes(self):
        api = Fake(); api.available = False
        self.assertFalse(s.plan(s.read(api))['ready'])
        with self.assertRaises(ValueError): s.apply(api, s.plan(s.read(api)))
        self.assertEqual([], api.writes)
        api.available = True; planned = s.plan(s.read(api)); api.budgets['plans'][0]['name'] = 'Concurrent edit'
        with self.assertRaises(ValueError): s.apply(api, planned)
        self.assertEqual([], api.writes); api.demo = False
        with self.assertRaises(ValueError): s.read(api)

    def test_existing_product_is_updated_in_place_and_unrelated_values_are_protected(self):
        api = Fake(); product = str(uuid.uuid4()); api.records = [{'id': product, 'version': 'v1', 'kind': 'Pension', 'currency': 'DKK', 'asOf': '2025-01-01', 'value': 200000}]
        self.assertEqual(product, s.apply(api, s.plan(s.read(api)))['currentProductId'])

    def test_unreconciled_or_payout_before_start_is_not_showcase_data(self):
        data = report('2026-09-30', 431000); data['agreements'][0]['components'][0]['balance']['value'] += 1000
        self.assertFalse(s.valid_report(data, '2026-09-30', 431000, fail=False))
        data = report('2026-09-30', 431000); data['scenarios'][0]['payouts'][0]['fromAge'] = 64
        self.assertFalse(s.valid_report(data, '2026-09-30', 431000, fail=False))

    def test_path_guard_excludes_private_uploads_originals_financial_other_writes_and_arbitrary_hosts(self):
        for path, method in [('pension/uploads', 'POST'), ('wealth', 'POST'), ('mode?mode=Live', 'GET'), ('../api/wealth', 'GET'), ('https://elsewhere', 'GET'), ('demo/reset', 'POST'), ('connections/sync', 'POST'), ('pension/uploads/'+str(uuid.uuid4())+'/original', 'GET')]:
            with self.assertRaises(ValueError): s.Api.validate(path, method)


if __name__ == '__main__': unittest.main()
