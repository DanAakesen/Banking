#!/usr/bin/env python3
"""Prepare/apply only independently fictional pension reports via deployed Demo APIs.

Default is a dry-run. --apply requires the unchanged reviewed --plan file. No SQL,
private upload, original download, reset, provider sync, owner cookie or other writes.
The feature/schema must be deployed before this normal-API setup can be applied.
"""
import argparse
import hashlib
import http.cookiejar
import json
import pathlib
import re
import urllib.error
import urllib.request

ORIGIN = 'https://banking-dan-0ac7d719.azurewebsites.net'
UUID = r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'
SERIES = [('earlier', '2025-12-31', 401000), ('later', '2026-09-30', 431000)]


def require(value, code):
    if not value:
        raise ValueError(code)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('REDIRECT_REJECTED')


class Api:
    def __init__(self):
        self.client = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.call('browser/demo', 'POST', {})  # Fresh memory-only Demo session, never an owner session.

    @staticmethod
    def validate(path, method):
        if method == 'GET':
            require(re.fullmatch(r'(mode|runtime-info|connections|accounts|budget-plans|goals|wealth|pension/uploads\?offset=\d+'
                r'|pension/uploads/' + UUID + r'|pension/snapshots/' + UUID + r')', path), 'READ_NOT_ALLOWED')
        else:
            require(method == 'POST' and (path in ('browser/demo', 'pension/uploads/demo')
                or re.fullmatch(r'pension/uploads/' + UUID + r'/approve', path)), 'WRITE_NOT_ALLOWED')

    def call(self, path, method='GET', body=None):
        self.validate(path, method)
        data = None if body is None else json.dumps(body, separators=(',', ':')).encode()
        req = urllib.request.Request(ORIGIN + '/api/' + path, data=data, method=method,
            headers={'X-Banking-Client': 'web', 'X-Banking-Mode': 'Demo', 'Origin': ORIGIN, 'Content-Type': 'application/json'})
        try:
            with self.client.open(req, timeout=40) as response:
                require(response.headers.get('X-Banking-Mode') == 'Demo' or path == 'browser/demo', 'WRONG_WORKSPACE')
                raw = response.read(4_000_001); require(len(raw) <= 4_000_000, 'RESPONSE_TOO_LARGE')
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            if error.code == 404 and path == 'pension/uploads?offset=0':
                return None
            raise RuntimeError(f'Demo API {method} failed HTTP {error.code}; stop and dry-run again') from None


def read(api):
    mode = api.call('mode'); runtime = api.call('runtime-info'); connections = api.call('connections')
    require(mode.get('mode') == 'Demo' and mode.get('availableModes') == ['Demo'], 'DEMO_SESSION_REQUIRED')
    require(runtime.get('backend') == 'azure' and runtime.get('sharedDemo') is True, 'SHARED_AZURE_REQUIRED')
    require(len(connections) == 1 and connections[0].get('provider') == 'product-demo'
        and connections[0].get('isDemo') is True and connections[0].get('status') == 'Active', 'PRODUCT_DEMO_REQUIRED')
    wealth = api.call('wealth'); pensions = [r for r in wealth if r['kind'] == 'Pension']
    require(len(pensions) <= 1 and all(p['currency'] == 'DKK' for p in pensions), 'EXPLICIT_PENSION_MAPPING_REQUIRED')
    accounts = api.call('accounts'); require(len(accounts) == 5 and all(a.get('isDemo') is True for a in accounts), 'SYNTHETIC_ACCOUNTS_REQUIRED')
    protected = {'accounts': accounts, 'budgets': api.call('budget-plans'), 'goals': api.call('goals'),
        'otherWealth': [r for r in wealth if r['kind'] != 'Pension']}
    receipts = []; offset = 0
    while True:
        page = api.call('pension/uploads?offset=' + str(offset))
        if page is None:
            return {'ready': False, 'reason': 'PENSION_API_NOT_DEPLOYED', 'target': pensions[0] if pensions else None,
                'protected': digest(protected), 'receipts': []}
        require(page['offset'] == offset and page['total'] <= 5000, 'HISTORY_LIMIT_OR_OFFSET')
        receipts.extend(page['items']); offset += len(page['items'])
        if offset == page['total']:
            break
        require(page['items'], 'NON_ADVANCING_HISTORY')
    matches = {}
    for receipt in receipts:
        if not receipt.get('synthetic') or receipt.get('mediaType') != 'application/pdf':
            continue
        detail = api.call('pension/uploads/' + receipt['id']); report = detail.get('report')
        if not report or report.get('parserVersion') != 'pensionsinfo-text-1':
            continue
        if detail.get('snapshotId'):
            report = api.call('pension/snapshots/' + detail['snapshotId'])['accepted']['report']
        for variant, day, capital in SERIES:
            if report.get('reportAsOf') == day and valid_report(report, day, capital, fail=False):
                prior = matches.get(variant)
                if prior is None or detail.get('financialSaved'):
                    matches[variant] = {'id': detail['id'], 'approved': bool(detail.get('financialSaved'))}
    return {'ready': True, 'target': pensions[0] if pensions else None, 'protected': digest(protected),
        'receipts': [{'id': r['id'], 'status': r['status'], 'snapshotId': r.get('snapshotId')} for r in receipts], 'matches': matches}


def valid_report(report, day, capital, fail=True):
    agreements = report.get('agreements', [])
    good = report.get('pages') == 46 and report.get('reportAsOf') == day and report.get('beforeTax') is True and report.get('todaysMoney') is True
    good = good and len(agreements) == 1 and agreements[0].get('provider') == 'Demo Pension' and agreements[0].get('currency') == 'DKK'
    if good:
        a = agreements[0]
        good = a.get('asOf') == day and a['balance']['value'] == capital and len(a['components']) == 3
        good = good and sum(c['balance']['value'] for c in a['components']) == capital
        good = good and a['annualContribution']['value'] == 36000 and a['annualContribution']['source']['unit'] == 'DKK/year'
    scenarios = report.get('scenarios', [])
    good = good and len(scenarios) == 11 and len(report.get('insurance', [])) == 3
    good = good and all(s['payouts'] and all(p['fromAge'] >= s['startAge'] and p['amount']['source']['unit'] == 'DKK/year' for p in s['payouts']) for s in scenarios)
    if fail:
        require(good, 'SYNTHETIC_SOURCE_CONTRACT_CHANGED')
    return bool(good)


def plan(state):
    operations = [{'variant': variant, 'reportAsOf': day, 'capital': capital, 'annualContribution': 36000,
        'reusePendingReceipt': state.get('matches', {}).get(variant, {}).get('id')}
        for variant, day, capital in SERIES if not state.get('matches', {}).get(variant, {}).get('approved')]
    return {'schemaVersion': 1, 'demoOnly': True, 'ready': state['ready'], 'reason': state.get('reason'),
        'baselineHash': digest(state), 'targetProductId': state.get('target', {}).get('id') if state.get('target') else None,
        'operations': operations, 'source': 'Independent server-generated fictional reports; no private report input',
        'currentCapitalAfterSetup': 431000, 'history': 'Two approved dates; current capital is not the sum of history'}


def apply(api, reviewed):
    before = read(api); require(before['ready'], 'MIGRATION_AND_DEPLOYMENT_REQUIRED')
    require(plan(before) == reviewed, 'PLAN_CHANGED_DRY_RUN_AGAIN')
    target = before['target']
    if reviewed['operations'] and target:
        require(target['asOf'] <= SERIES[-1][1], 'CURRENT_PRODUCT_NEWER_THAN_SHOWCASE')
    for operation in reviewed['operations']:
        receipt = api.call('pension/uploads/' + operation['reusePendingReceipt']) if operation['reusePendingReceipt'] else api.call('pension/uploads/demo', 'POST', {'version': operation['variant']})
        require(receipt.get('synthetic') is True and receipt['status'] == 'NeedsReview', 'SYNTHETIC_PREVIEW_REQUIRED')
        report = receipt['report']; valid_report(report, operation['reportAsOf'], operation['capital'])
        product = {'key': report['agreements'][0]['key'], 'id': target['id'] if target else None, 'version': target['version'] if target else None}
        api.call('pension/uploads/' + receipt['id'] + '/approve', 'POST', {'version': receipt['version'],
            'reportAsOf': report['reportAsOf'], 'reviewed': report, 'products': [product], 'confirm': True, 'acknowledgeWarnings': True})
        rows = [r for r in api.call('wealth') if r['kind'] == 'Pension']
        require(len(rows) == 1 and (target is None or rows[0]['id'] == target['id']), 'CURRENT_PRODUCT_ID_OR_COUNT_CHANGED')
        target = rows[0]
    after = read(api); require(after['protected'] == before['protected'], 'UNRELATED_DEMO_CHANGED')
    require(not plan(after)['operations'], 'REPEAT_NOT_NOOP')
    if reviewed['operations']:
        require(after['target']['value'] == 431000 and after['target']['asOf'] == SERIES[-1][1], 'CURRENT_CAPITAL_MISMATCH')
    return {'demoOnly': True, 'applied': len(reviewed['operations']), 'repeatNoop': True, 'unrelatedPreserved': True,
        'currentProductId': after['target']['id'] if after['target'] else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=pathlib.Path, required=True); parser.add_argument('--apply', action='store_true')
    args = parser.parse_args(); api = Api()
    if args.apply:
        result = apply(api, json.loads(args.plan.read_text())); print(json.dumps(result, sort_keys=True))
    else:
        result = plan(read(api)); args.plan.parent.mkdir(parents=True, exist_ok=True)
        args.plan.write_text(json.dumps(result, indent=2) + '\n'); print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
