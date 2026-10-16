"""No-network Demo protocol tests. Financial fixtures are independently fictional."""
import calendar
import copy
import datetime
import importlib.util
import pathlib
import unittest
import uuid

spec = importlib.util.spec_from_file_location('stock_setup', pathlib.Path(__file__).resolve().parents[2] / 'scripts/setup-demo-employee-stocks.py')
s = importlib.util.module_from_spec(spec); spec.loader.exec_module(s)


def report(variant):
    _, day, _, _, _, hire, annual = next(r for r in s.SERIES if r[0] == variant)
    grants = [{'key': key, 'type': kind, 'awarded': total, 'vested': vested, 'unvested': total-vested, 'grantPrice': 0, 'totalTransacted': vested}
        for key, kind, total, vested in [(s.KEYS[0], 'OnHire', 160, hire), (s.KEYS[1], 'Annual', 120, annual)]]
    schedules = []; transactions = []
    for key, first, count, qty in [(s.KEYS[0], datetime.date(2024, 2, 29), 16, 10), (s.KEYS[1], datetime.date(2026, 3, 31), 20, 6)]:
        for i in range(count):
            m = first.year*12 + first.month-1 + i*3; y, month = divmod(m, 12); month += 1
            date = datetime.date(y, month, calendar.monthrange(y, month)[1]); actual = date + datetime.timedelta(days={5: 2, 6: 1}.get(date.weekday(), 0))
            delivered = actual.isoformat() <= day
            schedules.append({'grantKey': key, 'date': date.isoformat(), 'shares': qty, 'matchedPastVesting': qty if delivered else 0})
            if delivered: transactions.append({'grantKey': key, 'date': actual.isoformat(), 'type': 'StockAwardVest', 'quantity': qty, 'sharesForTaxes': qty/4, 'netShares': qty*3/4})
    return {'parserVersion': s.PARSER, 'reportAsOf': None, 'reportedCurrency': None, 'currentHeldShares': None, 'currentPrice': None, 'dkkPerUsd': None,
        'grants': grants, 'schedules': schedules, 'transactions': transactions, 'warnings': [{'code': c} for c in ('CURRENT_HOLDINGS_NOT_REPORTED', 'PROFILE_CURRENCY_AND_ISSUER_NOT_REPORTED', 'REPORT_DATE_NOT_REPORTED', 'TAX_OBSERVATIONS_NOT_TAX_SETTLEMENT')]}


class Fake:
    def __init__(self):
        self.records = [{'id': str(uuid.uuid4()), 'kind': 'Pension', 'value': 431000, 'currency': 'DKK'}]
        self.receipts = {}; self.writes = []; self.available = True; self.mode = 'Demo'; self.build = 'git-'+'b'*40; self.budgets = [{'name': 'Preserved'}]

    def call(self, path, method='GET', body=None):
        s.Api.validate(path, method)
        target = next((r for r in self.records if r.get('managedBy') == 'EmployeeStockImport'), None)
        if method == 'GET':
            if path == 'mode': return {'mode': self.mode, 'availableModes': ['Demo']}
            if path == 'runtime-info': return {'backend': 'azure', 'sharedDemo': True, 'build': self.build}
            if path == 'connections': return [{'provider': 'product-demo', 'isDemo': True, 'status': 'Active'}]
            if path == 'accounts': return [{'isDemo': True, 'id': i} for i in range(5)]
            if path == 'goals': return [{'name': 'Preserved goal'}]
            if path == 'budget-plans': return copy.deepcopy(self.budgets)
            if path == 'wealth': return copy.deepcopy(self.records)
            if path.startswith(s.PREFIX+'uploads?'):
                if not self.available: return None
                approved = {r['accepted']['review']['reportAsOf']: {'asOf': r['accepted']['review']['reportAsOf']} for r in self.receipts.values() if r.get('financialSaved')}
                return {'total': len(self.receipts), 'offset': 0, 'items': copy.deepcopy(list(self.receipts.values())), 'development': list(approved.values())}
            if path.startswith(s.PREFIX+'uploads/'):
                data = copy.deepcopy(self.receipts[path.split('/')[3]]); data['suggestedProductId'] = target['id'] if target else None; return data
        self.writes.append((path, copy.deepcopy(body)))
        if path == s.PREFIX+'uploads':
            data = {'id': str(uuid.uuid4()), 'version': 'v1', 'synthetic': True, 'status': 'NeedsReview', 'report': report(body['version']), 'snapshotId': None, 'financialSaved': False}
            self.receipts[data['id']] = data; return copy.deepcopy(data)
        if path.endswith('/approve'):
            receipt = self.receipts[path.split('/')[3]]; review = body['review']; target_id = target['id'] if target else str(uuid.uuid4())
            if target: assert review['wealthRecordId'] == target_id and review['wealthVersion'] == target['version']
            self.records[:] = [r for r in self.records if not target or r['id'] != target_id] + [{'id': target_id, 'version': str(uuid.uuid4()), 'kind': 'Investment', 'name': 'Microsoft-medarbejderaktier (fiktive)', 'provider': 'Fidelity', 'managedBy': 'EmployeeStockImport', 'currency': 'DKK', 'asOf': review['holdingAsOf'], 'value': review['currentHeldShares']*review['priceUsd']*review['dkkPerUsd']}]
            receipt.update(status='Approved', financialSaved=True, snapshotId=str(uuid.uuid4()), accepted={'report': receipt['report'], 'review': review}); return {'snapshotId': receipt['snapshotId']}
        raise AssertionError(path)


class Tests(unittest.TestCase):
    def test_plan_apply_and_repeat_use_one_product_three_real_dates_no_extra_receipts(self):
        api = Fake(); baseline = s.read(api)['protected']; planned = s.plan(s.read(api)); self.assertEqual(3, len(planned['operations'])); self.assertEqual([], api.writes)
        result = s.apply(api, planned); self.assertEqual(3, result['applied']); self.assertTrue(result['repeatNoop']); self.assertEqual(baseline, s.read(api)['protected'])
        self.assertEqual(3, len(api.receipts)); self.assertEqual(1, len([r for r in api.records if r['kind'] == 'Investment'])); self.assertEqual(122825, api.records[-1]['value'])
        before = copy.deepcopy(api.writes); self.assertEqual(0, s.apply(api, s.plan(s.read(api)))['applied']); self.assertEqual(before, api.writes)

    def test_pending_receipt_is_reused_without_another_original(self):
        api = Fake(); receipt = api.call(s.PREFIX+'uploads', 'POST', {'version': 'earlier'}); planned = s.plan(s.read(api)); self.assertEqual(receipt['id'], planned['operations'][0]['reusePendingReceipt'])
        s.apply(api, planned); self.assertEqual(3, len(api.receipts)); self.assertEqual(6, len(api.writes))

    def test_wrong_workspace_missing_feature_and_changed_build_or_baseline_never_write(self):
        for kind in ('build', 'budget'):
            api = Fake(); planned = s.plan(s.read(api))
            if kind == 'build': api.build = 'git-'+'c'*40
            else: api.budgets.append({'changed': True})
            with self.assertRaisesRegex(ValueError, 'PLAN_CHANGED'): s.apply(api, planned)
            self.assertEqual([], api.writes)
        api = Fake(); api.mode = 'Live'
        with self.assertRaisesRegex(ValueError, 'DEMO_SESSION'): s.read(api)
        api.mode = 'Demo'; api.available = False; self.assertFalse(s.plan(s.read(api))['ready'])
        with self.assertRaisesRegex(ValueError, 'DEPLOYMENT_REQUIRED'): s.apply(api, s.plan(s.read(api)))
        self.assertEqual([], api.writes)

    def test_manual_mapping_or_edited_current_value_is_never_overwritten(self):
        api = Fake(); api.records.append({'name': 'Manual Microsoft shares', 'kind': 'Investment'})
        with self.assertRaisesRegex(ValueError, 'EXPLICIT_MAPPING'): s.read(api)
        api = Fake(); s.apply(api, s.plan(s.read(api))); writes = len(api.writes); api.records[-1]['value'] += 1
        with self.assertRaisesRegex(ValueError, 'CURRENT_PRODUCT_REVIEW'): s.read(api)
        self.assertEqual(writes, len(api.writes))

    def test_source_or_approved_review_changes_require_review_and_missing_mapping_is_not_recreated(self):
        api = Fake(); receipt = api.call(s.PREFIX+'uploads', 'POST', {'version': 'earlier'}); api.receipts[receipt['id']]['report']['grants'][0]['unvested'] += 1
        with self.assertRaisesRegex(ValueError, 'SYNTHETIC_SOURCE'): s.read(api)
        api = Fake(); s.apply(api, s.plan(s.read(api))); api.records = api.records[:1]
        with self.assertRaisesRegex(ValueError, 'MISSING_OR_CHANGED_MAPPING'): s.read(api)
        api = Fake(); s.apply(api, s.plan(s.read(api))); next(iter(api.receipts.values()))['accepted']['review']['priceUsd'] += 1
        with self.assertRaisesRegex(ValueError, 'ACCEPTED_REVIEW_CHANGED'): s.read(api)

    def test_guard_excludes_private_originals_arbitrary_paths_and_nonsetup_financial_writes(self):
        for path, method in [('employee-stocks/uploads', 'POST'), ('employee-stocks/uploads', 'GET'), ('wealth', 'POST'), ('mode?mode=Live', 'GET'), ('../wealth', 'GET'), ('https://elsewhere', 'GET'), ('demo/reset', 'POST'), ('connections/sync', 'POST'), (s.PREFIX+'uploads/'+str(uuid.uuid4())+'/original', 'GET'), (s.PREFIX+'uploads/'+str(uuid.uuid4())+'/link', 'POST')]:
            with self.assertRaises(ValueError): s.Api.validate(path, method)
        self.assertFalse(s.valid_report(None, 'later'))
        for variant, *_ in s.SERIES: self.assertTrue(s.valid_report(report(variant), variant))


if __name__ == '__main__': unittest.main()
