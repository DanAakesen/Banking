"""Fictional pension setup protocol tests; no network, owner session or private source."""
import copy
import importlib.util
import pathlib
import unittest
import uuid

spec = importlib.util.spec_from_file_location('pension_setup', pathlib.Path(__file__).resolve().parents[2] / 'scripts/setup-demo-pension.py')
s = importlib.util.module_from_spec(spec); spec.loader.exec_module(s)


def report(day, value):
    source = {'unit': 'DKK/year'}
    scenarios = []
    for age in range(65, 76):
        rows = [{'provider': provider, 'type': kind, 'fromAge': max(age, 70), 'toAge': None,
            'amount': {'value': amount, 'source': {'unit': 'DKK/year', 'page': 20 + 2 * (age - 65)}}}
            for provider, kind, amount in [('Demo Pension', 'Lifetime', 24000), ('ATP', 'ATP', 12000), ('PublicPension', 'PublicPension', 90000), ('Total', 'Total', 126000)]]
        scenarios.append({'startAge': age, 'payouts': rows})
    return {'parserVersion': s.PARSER, 'pages': 46, 'reportAsOf': day, 'beforeTax': True, 'todaysMoney': True,
        'agreements': [{'key': s.AGREEMENT_KEY, 'provider': 'Demo Pension', 'currency': 'DKK', 'asOf': day,
            'balance': {'value': value, 'source': {'page': 4}}, 'annualContribution': {'value': 36000, 'source': source},
            'components': [{'type': kind, 'balance': {'value': amount}} for kind, amount in [('Ratepension', 100000), ('Ratepension', 100000), ('Lifetime', value - 200000)]]}],
        'scenarios': scenarios,
        'insurance': [{'type': kind, 'amount': {'value': amount, 'source': {'unit': unit}}} for kind, amount, unit in [('Death', 48000, 'DKK'), ('Death', 420000, 'DKK'), ('Death', 132000, 'DKK'), ('WorkCapacity', 120000, 'DKK/year'), ('CriticalIllness', 100000, 'DKK')]],
        'warnings': [{'code': 'NO_HOLDINGS_OR_RETURN_HISTORY'}]}


class Fake:
    def __init__(self):
        self.records = []; self.receipts = {}; self.snapshots = {}; self.writes = []; self.available = True; self.demo = True; self.build = 'git-' + 'a' * 40
        self.budgets = {'plans': [{'name': 'Preserved budget'}]}

    def call(self, path, method='GET', body=None):
        s.Api.validate(path, method)
        if method == 'GET':
            if path == 'mode': return {'mode': 'Demo' if self.demo else 'Live', 'availableModes': ['Demo']}
            if path == 'runtime-info': return {'backend': 'azure', 'sharedDemo': True, 'build': self.build}
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
            self.records[:] = [r for r in self.records if r['kind'] != 'Pension'] + [{'id': target['id'] or str(uuid.uuid4()), 'version': 'v2', 'kind': 'Pension', 'currency': 'DKK', 'provider': 'Demo Pension', 'value': body['reviewed']['agreements'][0]['balance']['value'], 'asOf': body['reportAsOf']}]
            snapshot = str(uuid.uuid4()); self.snapshots[snapshot] = {'accepted': {'report': body['reviewed'], 'products': [{'key': s.AGREEMENT_KEY, 'id': next(r['id'] for r in self.records if r['kind'] == 'Pension')}]}}
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
        api = Fake(); product = str(uuid.uuid4()); api.records = [{'id': product, 'version': 'v1', 'kind': 'Pension', 'currency': 'DKK', 'asOf': '2025-12-31', 'value': 401000, 'provider': 'Demo Pension'}]
        pending = api.call('pension/uploads/demo', 'POST', {'version': 'earlier'}); api.call('pension/uploads/'+pending['id']+'/approve', 'POST', {'products': [{'key': s.AGREEMENT_KEY, 'id': product}], 'reviewed': pending['report'], 'reportAsOf': '2025-12-31'})
        self.assertEqual(product, s.apply(api, s.plan(s.read(api)))['currentProductId'])

    def test_unreconciled_or_payout_before_start_is_not_showcase_data(self):
        data = report('2026-09-30', 431000); data['agreements'][0]['components'][0]['balance']['value'] += 1000
        self.assertFalse(s.valid_report(data, '2026-09-30', 431000, fail=False))
        data = report('2026-09-30', 431000); data['scenarios'][0]['payouts'][0]['fromAge'] = 64
        self.assertFalse(s.valid_report(data, '2026-09-30', 431000, fail=False))

    def test_unknown_pension_mapping_or_user_edited_capital_requires_review(self):
        api = Fake(); api.records = [{'kind': 'Pension', 'currency': 'DKK', 'provider': 'Unrelated provider'}]
        with self.assertRaisesRegex(ValueError, 'EXPLICIT_PENSION_MAPPING_REQUIRED'): s.read(api)
        api.records = [{'id': str(uuid.uuid4()), 'version': 'v1', 'kind': 'Pension', 'currency': 'DKK', 'asOf': '2026-09-30', 'value': 123, 'provider': 'Demo Pension'}]
        with self.assertRaisesRegex(ValueError, 'EXPLICIT_PENSION_MAPPING_REQUIRED'): s.apply(api, s.plan(s.read(api)))
        self.assertEqual([], api.writes)

    def test_valid_public_age_band_before_private_start_is_supported_but_totals_must_reconcile(self):
        data = report('2026-09-30', 431000)
        data['scenarios'][-1]['payouts'] += [{'provider': provider, 'type': kind, 'fromAge': 67, 'toAge': 69,
            'amount': {'value': 90000, 'source': {'unit': 'DKK/year', 'page': 40}}} for provider, kind in [('PublicPension', 'PublicPension'), ('Total', 'Total')]]
        self.assertTrue(s.valid_report(data, '2026-09-30', 431000))
        data['scenarios'][-1]['payouts'][-1]['amount']['value'] += 1
        self.assertFalse(s.valid_report(data, '2026-09-30', 431000, fail=False))

    def test_build_change_unresolved_receipt_or_deleted_product_stops_without_recreating_data(self):
        api = Fake(); planned = s.plan(s.read(api)); api.build = 'git-' + 'b' * 40
        with self.assertRaisesRegex(ValueError, 'PLAN_CHANGED'): s.apply(api, planned)
        self.assertEqual([], api.writes)
        receipt = api.call('pension/uploads/demo', 'POST', {'version': 'earlier'})
        api.receipts[receipt['id']]['status'] = 'Unsupported'
        with self.assertRaisesRegex(ValueError, 'UNRESOLVED_PENSION_RECEIPT'): s.read(api)
        api.receipts[receipt['id']]['status'] = 'NeedsReview'
        api.call('pension/uploads/'+receipt['id']+'/approve', 'POST', {'products': [{'key': s.AGREEMENT_KEY, 'id': None}], 'reviewed': receipt['report'], 'reportAsOf': '2025-12-31'})
        api.records = []
        with self.assertRaisesRegex(ValueError, 'MISSING_CURRENT_PENSION_REVIEW_REQUIRED'): s.read(api)

    def test_pending_receipt_is_reused_and_existing_user_change_is_not_overwritten(self):
        api = Fake(); receipt = api.call('pension/uploads/demo', 'POST', {'version': 'earlier'})
        planned = s.plan(s.read(api)); self.assertEqual(receipt['id'], planned['operations'][0]['reusePendingReceipt'])
        s.apply(api, planned); self.assertEqual(2, len(api.receipts))
        # An existing approved mapping proves ownership without exposing the model's private source key.
        self.assertNotIn('pensionSourceKey', api.records[0])
        api.receipts.pop(next(key for key, value in api.receipts.items() if value['report']['reportAsOf'] == '2026-09-30'))
        api.records[0]['value'] = 123
        with self.assertRaisesRegex(ValueError, 'CURRENT_PRODUCT_REVIEW_REQUIRED'): s.apply(api, s.plan(s.read(api)))

    def test_setup_preserves_existing_other_wealth_bank_budget_and_goal_data(self):
        api = Fake(); unrelated = {'id': str(uuid.uuid4()), 'kind': 'Investment', 'currency': 'DKK', 'value': 89000}
        api.records.append(copy.deepcopy(unrelated)); before = s.read(api)['protected']
        s.apply(api, s.plan(s.read(api)))
        self.assertIn(unrelated, api.records); self.assertEqual(before, s.read(api)['protected'])
        self.assertEqual(1, len([r for r in api.records if r['kind'] == 'Pension']))

    def test_path_guard_excludes_private_uploads_originals_financial_other_writes_and_arbitrary_hosts(self):
        for path, method in [('pension/uploads', 'POST'), ('wealth', 'POST'), ('mode?mode=Live', 'GET'), ('../api/wealth', 'GET'), ('https://elsewhere', 'GET'), ('demo/reset', 'POST'), ('connections/sync', 'POST'), ('pension/uploads/'+str(uuid.uuid4())+'/original', 'GET')]:
            with self.assertRaises(ValueError): s.Api.validate(path, method)


if __name__ == '__main__': unittest.main()
