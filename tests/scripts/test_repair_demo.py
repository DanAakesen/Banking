"""Isolated repair protocol tests. No network, production sessions or SQL."""
import copy
import importlib.util
import pathlib
import unittest
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('repair', ROOT / 'scripts/repair-demo.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def uid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'banking-test/' + name))


def fixture():
    cats = [{'id': uid(n), 'name': n} for n in r.DEFINITIONS]
    accounts = [{'id': uid(role), 'providerName': r.translated(name), 'connectionId': uid('connection'),
        'isDemo': True, 'currency': 'DKK', 'version': 'v1'} for role, name in r.ACCOUNT_NAMES.items()]
    def row(key, description, amount, role='everyday', day='2026-10-02', **extra):
        return dict(id=uid(key), description=r.translated(description), amount=amount, accountId=uid(role),
            bookingDate=day, status='BOOK', currency='DKK', isDemo=True, version='v1',
            categoryId=None, classification='Unclassified', isInternalTransfer=False) | extra
    rows = [row('salary', 'Salary', 1000), row('shop', 'Groceries', -100),
        row('manual', 'Groceries', -40, classification='Manual', categoryId=uid('Dining')),
        row('pending', 'Card reservation', -175, status='PDNG'), row('unknown', 'User-authored description', -12),
        row('coffee1', 'Coffee', -32, day='2026-08-01'), row('coffee2', 'Coffee', -32, day='2026-09-01'),
        row('coffee3', 'Coffee', -32, day='2026-10-01'),
        row('bill-out', 'Bills transfer', -10500), row('bill-in', 'Bills transfer', 10500, 'bills'),
        row('save-out', 'Savings transfer', -1800), row('save-in', 'Savings transfer', 1800, 'savings')]
    review = [{'key': 'transfer:test', 'signature': 'a' * 64, 'transaction': rows[-2], 'counterpart': rows[-1]}]
    return dict(connections=[{'id': uid('connection'), 'provider': 'product-demo', 'isDemo': True, 'status': 'Active'}],
        accounts=sorted(accounts, key=lambda x: x['id']), rows=sorted(rows, key=lambda x: x['id']), categories=cats,
        rules=[dict(id=uid('rule'), contains='salary', categoryId=uid('Income'), priority=100, active=True)],
        budgets={'plans': [{'id': uid('budget'), 'name': 'User-edited', 'version': 'b1'}], 'legacyCount': 0}, legacyBudgets=[],
        goals=[{'id': uid('goal'), 'version': 'g1'}], balances={}, history=[], review=review)


class FakeApi:
    def __init__(self, state):
        self.state = copy.deepcopy(state)
        self.writes = []
        self.mode = {'mode': 'Demo', 'availableModes': ['Demo']}

    def call(self, path, method='GET', body=None):
        r.Api.validate(path, method)
        if path == 'mode':
            return self.mode
        if path == 'connections':
            return self.state['connections']
        if path == 'runtime-info':
            return {'backend': 'azure', 'sharedDemo': True, 'apiContractVersion': 1}
        if path in ('accounts', 'categories', 'goals', 'budget-plans', 'budgets'):
            return copy.deepcopy(self.state[{'budget-plans': 'budgets', 'budgets': 'legacyBudgets'}.get(path, path)])
        if path.startswith('accounts/'):
            return []
        if path.startswith('review?'):
            return {'offset': 0, 'total': len(self.state['review']), 'items': copy.deepcopy(self.state['review'])}
        if path == 'rules' and method == 'GET':
            return self.state['rules']
        if path == 'review/history?offset=0':
            return {'items': self.state['history'], 'total': len(self.state['history'])}
        if path.startswith('transactions?'):
            day = path.split('from=')[1].split('&')[0] if 'from=' in path else None
            rows = [x for x in self.state['rows'] if day is None or x['bookingDate'] == day]
            return {'offset': 0, 'total': len(rows), 'items': rows}
        self.writes.append((path, method, copy.deepcopy(body)))
        if path == 'rules':
            self.state['rules'].append(dict(body, id=uid('new-' + body['contains'])))
            return {'id': self.state['rules'][-1]['id']}
        if path.endswith('/category'):
            row = next(x for x in self.state['rows'] if x['id'] == path.split('/')[1])
            if row['version'] != body['version']:
                raise RuntimeError('409 conflict')
            row.update(categoryId=body['categoryId'], classification='Manual' if body['manual'] else 'Rule', version='v2')
            return copy.deepcopy(row)
        if path == 'review/actions':
            review = self.state['review'].pop()
            ids = {review['transaction']['id'], review['counterpart']['id']}
            self.state['history'].append({'id': uid('action'), 'kind': 'ConfirmTransfer'})
        elif path == 'transfer-matches':
            ids = set(body.values())
        else:
            raise AssertionError(path)
        for row in self.state['rows']:
            if row['id'] in ids:
                row['isInternalTransfer'] = True
        return {'id': uid(path)}


class RepairTests(unittest.TestCase):
    def test_uppercase_transfer_query_is_allowed_but_unsafe_paths_and_writes_are_blocked(self):
        r.Api.validate('review?kind=Transfer&offset=0', 'GET')
        for path, method in [('rules/apply', 'POST'), ('connections/a/sync', 'POST'),
                ('accounts', 'PUT'), ('https://evil.example', 'GET'), ('../accounts', 'GET'),
                ('transactions%2f..%2faccounts', 'GET'), ('browser/sign-in', 'POST')]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                r.Api.validate(path, method)

    def test_cannot_follow_redirect_with_demo_cookie(self):
        with self.assertRaisesRegex(ValueError, 'REDIRECT'):
            r.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.example')

    def test_guard_rejects_owner_mode_or_real_provider(self):
        for change in ['owner', 'provider', 'isDemo', 'status']:
            api = FakeApi(fixture())
            if change == 'owner': api.mode['availableModes'] = ['Demo', 'Live']
            else: api.state['connections'][0][change] = {'provider': 'enable-banking', 'isDemo': False, 'status': 'Expired'}[change]
            with self.subTest(change=change), self.assertRaises(ValueError): r.guard(api)
            self.assertEqual(api.writes, [])

    def test_manual_pending_unknown_rows_and_existing_rules_are_preserved(self):
        state = fixture(); before = copy.deepcopy(state); plan = r.build_plan(state)
        edited = {o.get('id') for o in plan['operations'] if o['kind'] == 'category'}
        self.assertNotIn(uid('manual'), edited); self.assertNotIn(uid('pending'), edited); self.assertNotIn(uid('unknown'), edited)
        self.assertEqual(state, before)
        self.assertEqual(len(plan['retainedReviewIds']), 2)
        self.assertTrue(all(o['body']['priority'] < 100 for o in plan['operations'] if o['kind'] == 'rule'))

    def test_snapshot_respects_budget_envelope_and_rejects_non_demo_or_duplicate_rows(self):
        api = FakeApi(fixture())
        state = r.snapshot(api)
        self.assertEqual(state['budgets'], api.state['budgets'])
        self.assertEqual(api.writes, [])
        for change in ('isDemo', 'duplicate', 'account'):
            bad = FakeApi(fixture())
            if change == 'isDemo': bad.state['rows'][0]['isDemo'] = False
            elif change == 'duplicate': bad.state['rows'].append(copy.deepcopy(bad.state['rows'][0]))
            else: bad.state['rows'][0]['accountId'] = uid('not-this-demo')
            with self.subTest(change=change), self.assertRaises(ValueError): r.snapshot(bad)

    def test_review_pair_and_exact_manual_pair_apply_then_repeat_is_noop(self):
        before = fixture(); plan = r.build_plan(before); api = FakeApi(before)
        self.assertEqual(sum(o['kind'] == 'transfer-manual' for o in plan['operations']), 1)
        self.assertEqual(sum(o['kind'] == 'transfer-review' for o in plan['operations']), 1)
        r.apply_plan(api, plan, copy.deepcopy(before))
        r.verify_after(before, api.state, plan)
        self.assertEqual(r.build_plan(api.state)['operations'], [])
        writes = len(api.writes)
        r.apply_plan(api, r.build_plan(api.state), copy.deepcopy(api.state))
        self.assertEqual(len(api.writes), writes)

    def test_dismissed_or_manually_classified_transfer_is_deferred(self):
        for field in ['history', 'classification']:
            state = fixture()
            if field == 'history':
                state['history'] = [{'id': uid('history'), 'kind': 'Dismiss', 'description': 'Bills transfer', 'undoneAt': None}]
            else:
                next(x for x in state['rows'] if x['id'] == uid('bill-out'))['classification'] = 'Manual'
            plan = r.build_plan(state)
            self.assertTrue(plan['deferred'])
            self.assertFalse(any(o['kind'] == 'transfer-manual' for o in plan['operations']))

    def test_conflicting_rule_is_not_overwritten(self):
        state = fixture(); state['rules'].append(dict(id=uid('conflict'), contains='Dagligvarer', categoryId=uid('Dining'), active=True, priority=999))
        with self.assertRaisesRegex(ValueError, 'EXISTING_RULE_DIFFERS'): r.build_plan(state)

    def test_disabled_english_rule_cannot_be_bypassed_by_new_danish_alias(self):
        state = fixture(); state['rules'][0]['active'] = False
        with self.assertRaisesRegex(ValueError, 'EXISTING_RULE_DIFFERS'): r.build_plan(state)

    def test_ambiguous_amount_pair_stops_before_writes(self):
        state = fixture(); row = copy.deepcopy(next(x for x in state['rows'] if x['id'] == uid('bill-in')))
        row['id'] = uid('duplicate'); state['rows'].append(row)
        with self.assertRaisesRegex(ValueError, 'AMBIGUOUS'): r.build_plan(state)

    def test_tampered_or_changed_plan_stops_before_writes(self):
        state = fixture(); plan = r.build_plan(state)
        plan['operations'][0]['body']['categoryId'] = uid('wrong')
        api = FakeApi(state)
        with self.assertRaisesRegex(ValueError, 'PLAN_CHANGED'): r.apply_plan(api, plan, state)
        self.assertEqual(api.writes, [])

    def test_concurrent_version_conflict_is_not_retried(self):
        state = fixture(); plan = r.build_plan(state); api = FakeApi(state)
        next(x for x in api.state['rows'] if x['id'] == uid('shop'))['version'] = 'someone-else'
        with self.assertRaisesRegex(RuntimeError, '409'): r.apply_plan(api, plan, state)
        self.assertEqual(sum(path == f'transactions/{uid("shop")}/category' for path, _, _ in api.writes), 1)

    def test_protected_values_or_amount_changes_fail_verification(self):
        state = fixture(); plan = r.build_plan(state); api = FakeApi(state)
        r.apply_plan(api, plan, copy.deepcopy(state))
        r.verify_after(state, api.state, plan)
        for field in ['budget', 'amount', 'manual']:
            after = copy.deepcopy(api.state)
            if field == 'budget': after['budgets']['plans'][0]['name'] = 'changed'
            elif field == 'amount': after['rows'][0]['amount'] += 1
            else: next(x for x in after['rows'] if x['id'] == uid('manual'))['categoryId'] = uid('Groceries')
            with self.subTest(field=field), self.assertRaises(ValueError): r.verify_after(state, after, plan)


if __name__ == '__main__': unittest.main()
