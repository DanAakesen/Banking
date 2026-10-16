#!/usr/bin/env python3
"""Dry-run/apply independently fictional employee shares through fixed Demo APIs only.

No owner cookie, raw workbook upload/download, SQL, reset, sync or trading. Apply
requires the unchanged reviewed plan AND the exact independently verified build.
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
PREFIX = 'employee-stocks/demo/'
PARSER = 'employee-stock-xlsx-2'
SOURCE = 'Fiktivt Demo-eksempel · ikke en observeret markedskurs'
SERIES = [('earlier', '2026-03-15', 28.75, 405, 7.05, 90, 0),
          ('middle', '2026-07-15', 36.25, 415, 6.95, 100, 12),
          ('later', '2026-10-01', 42.5, 425, 6.8, 110, 18)]
KEYS = [hashlib.sha256(('employee-stock-v1\0' + '00008888\0' + ref).encode()).hexdigest() for ref in ('00009001', '00009002')]


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
        self.call('browser/demo', 'POST', {})

    @staticmethod
    def validate(path, method):
        if method == 'GET':
            require(re.fullmatch(r'(mode|runtime-info|connections|accounts|budget-plans|goals|wealth|employee-stocks/demo/uploads\?offset=\d+'
                r'|employee-stocks/demo/uploads/' + UUID + r')', path), 'READ_NOT_ALLOWED')
        else:
            require(method == 'POST' and (path in ('browser/demo', PREFIX + 'uploads')
                or re.fullmatch(PREFIX + r'uploads/' + UUID + r'/approve', path)), 'WRITE_NOT_ALLOWED')

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
            if error.code in (403, 404) and path == PREFIX + 'uploads?offset=0':
                return None
            raise RuntimeError(f'Demo API {method} failed HTTP {error.code}; stop and dry-run again') from None


def review(variant, target=None):
    _, day, held, price, rate, _, _ = next(row for row in SERIES if row[0] == variant)
    return {'reportAsOf': day, 'confirmProfile': True, 'currentHeldShares': held, 'holdingAsOf': day,
        'confirmHoldings': True, 'archived': False, 'employmentEndedOn': None,
        'priceUsd': price, 'priceAsOf': day, 'priceSource': SOURCE,
        'dkkPerUsd': rate, 'fxAsOf': day, 'fxSource': SOURCE,
        'includeInWealth': True, 'wealthCurrency': 'DKK', 'wealthRecordId': target['id'] if target else None,
        'wealthVersion': target['version'] if target else None, 'confirmNoDuplicateMapping': True}


def valid_report(report, variant):
    try:
        _, day, _, _, _, hire, annual = next(row for row in SERIES if row[0] == variant)
        grants = report['grants']; schedules = report['schedules']; tx = report['transactions']
        require(report['parserVersion'] == PARSER and all(report[k] is None for k in ('reportAsOf', 'reportedCurrency', 'currentHeldShares', 'currentPrice', 'dkkPerUsd')), 'SOURCE_CHANGED')
        require([(g['key'], g['type'], g['awarded'], g['vested'], g['unvested'], g['grantPrice']) for g in grants]
            == [(KEYS[0], 'OnHire', 160, hire, 160-hire, 0), (KEYS[1], 'Annual', 120, annual, 120-annual, 0)], 'GRANTS_CHANGED')
        require(len(schedules) == 36 and len(tx) == hire//10 + annual//6, 'SOURCE_ROWS_CHANGED')
        require(all(g['vested'] == g['totalTransacted'] == sum(t['quantity'] for t in tx if t['grantKey'] == g['key'])
            and g['awarded'] == sum(s['shares'] for s in schedules if s['grantKey'] == g['key']) for g in grants), 'RECONCILIATION_CHANGED')
        require(all(t['type'] == 'StockAwardVest' and t['date'] <= day and t['quantity'] == t['netShares'] + t['sharesForTaxes'] for t in tx), 'DELIVERY_CHANGED')
        require(all(s['shares'] > 0 and s['matchedPastVesting'] in (0, s['shares']) for s in schedules), 'SCHEDULE_CHANGED')
        require({w['code'] for w in report['warnings']} == {'CURRENT_HOLDINGS_NOT_REPORTED', 'PROFILE_CURRENCY_AND_ISSUER_NOT_REPORTED', 'REPORT_DATE_NOT_REPORTED', 'TAX_OBSERVATIONS_NOT_TAX_SETTLEMENT'}, 'WARNING_CHANGED')
        return True
    except (KeyError, TypeError, ValueError, StopIteration):
        return False


def read(api):
    mode = api.call('mode'); runtime = api.call('runtime-info'); connections = api.call('connections')
    require(mode.get('mode') == 'Demo' and mode.get('availableModes') == ['Demo'], 'DEMO_SESSION_REQUIRED')
    require(runtime.get('backend') == 'azure' and runtime.get('sharedDemo') is True and re.fullmatch(r'git-[0-9a-f]{40}', runtime.get('build', '')), 'VERIFIED_SHARED_AZURE_REQUIRED')
    require(len(connections) == 1 and connections[0].get('provider') == 'product-demo' and connections[0].get('isDemo') is True and connections[0].get('status') == 'Active', 'PRODUCT_DEMO_REQUIRED')
    accounts = api.call('accounts'); require(len(accounts) == 5 and all(a.get('isDemo') is True for a in accounts), 'SYNTHETIC_ACCOUNTS_REQUIRED')
    wealth = api.call('wealth'); candidates = [r for r in wealth if r.get('managedBy') == 'EmployeeStockImport' or any(x in r.get('name', '').upper() for x in ('MICROSOFT', 'MSFT'))]
    require(len(candidates) <= 1 and all(r.get('kind') == 'Investment' and r.get('managedBy') == 'EmployeeStockImport' and r.get('currency') == 'DKK' and r.get('provider') == 'Fidelity' and r.get('name') == 'Microsoft-medarbejderaktier (fiktive)' for r in candidates), 'EXPLICIT_MAPPING_REQUIRED')
    target = candidates[0] if candidates else None
    protected = digest({'accounts': accounts, 'budgets': api.call('budget-plans'), 'goals': api.call('goals'), 'otherWealth': [r for r in wealth if not target or r['id'] != target['id']]})
    receipts = []; offset = 0; development = []
    while True:
        page = api.call(PREFIX + 'uploads?offset=' + str(offset))
        if page is None:
            return {'ready': False, 'reason': 'STOCK_DEMO_NOT_DEPLOYED', 'build': runtime['build'], 'protected': protected, 'target': target, 'receipts': []}
        require(page['offset'] == offset and page['total'] <= 5000, 'HISTORY_LIMIT_OR_OFFSET')
        if offset == 0: development = page['development']
        receipts.extend(page['items']); offset += len(page['items'])
        if offset == page['total']: break
        require(page['items'], 'NON_ADVANCING_HISTORY')
    matches = {}; accepted = []
    for item in receipts:
        require(item.get('synthetic') is True and item['status'] in ('NeedsReview', 'Approved'), 'UNRESOLVED_SYNTHETIC_REVIEW_REQUIRED')
        detail = api.call(PREFIX + 'uploads/' + item['id'])
        variants = [row[0] for row in SERIES if valid_report(detail.get('report'), row[0])]
        require(len(variants) == 1 and detail.get('synthetic') is True, 'SYNTHETIC_SOURCE_CONTRACT_CHANGED')
        variant = variants[0]; approved = detail.get('financialSaved') is True
        if approved:
            expected = review(variant); actual = detail['accepted']['review']
            require(all(actual.get(k) == v for k, v in expected.items() if k not in ('wealthRecordId', 'wealthVersion')), 'ACCEPTED_REVIEW_CHANGED')
            require(target and detail.get('suggestedProductId') == target['id'], 'MISSING_OR_CHANGED_MAPPING')
            accepted.append(actual)
        if variant not in matches or approved: matches[variant] = {'id': item['id'], 'approved': approved}
    if target:
        require(accepted, 'EXPLICIT_MAPPING_REQUIRED')
        latest = max(accepted, key=lambda r: r['reportAsOf'])
        require(target['asOf'] == latest['holdingAsOf'] and abs(target['value'] - latest['currentHeldShares']*latest['priceUsd']*latest['dkkPerUsd']) < .005, 'CURRENT_PRODUCT_REVIEW_REQUIRED')
    return {'ready': True, 'build': runtime['build'], 'target': target, 'protected': protected, 'matches': matches, 'development': development,
        'receipts': [{'id': r['id'], 'status': r['status'], 'snapshotId': r.get('snapshotId')} for r in receipts]}


def plan(state):
    return {'schemaVersion': 1, 'demoOnly': True, 'ready': state['ready'], 'reason': state.get('reason'), 'build': state['build'],
        'baselineHash': digest(state), 'targetProductId': state.get('target', {}).get('id') if state.get('target') else None,
        'operations': [{'variant': v, 'reportAsOf': day, 'heldShares': held, 'illustrativePriceUsd': price, 'dkkPerUsd': rate,
            'reusePendingReceipt': state.get('matches', {}).get(v, {}).get('id')} for v, day, held, price, rate, _, _ in SERIES if not state.get('matches', {}).get(v, {}).get('approved')],
        'source': 'Independent fictional three-sheet originals; reviewed Demo declarations, not provider observations',
        'currentHeldAfterSetup': 42.5, 'currentWealthDkkAfterSetup': 122825, 'sourceUnvestedAfterSetup': 152}


def apply(api, reviewed):
    before = read(api); require(before['ready'], 'DEPLOYMENT_REQUIRED'); require(plan(before) == reviewed, 'PLAN_CHANGED_DRY_RUN_AGAIN')
    target = before['target']
    for op in reviewed['operations']:
        receipt = api.call(PREFIX+'uploads/'+op['reusePendingReceipt']) if op['reusePendingReceipt'] else api.call(PREFIX+'uploads', 'POST', {'version': op['variant']})
        require(receipt.get('synthetic') is True and receipt['status'] == 'NeedsReview' and valid_report(receipt['report'], op['variant']), 'SYNTHETIC_PREVIEW_REQUIRED')
        api.call(PREFIX+'uploads/'+receipt['id']+'/approve', 'POST', {'version': receipt['version'], 'review': review(op['variant'], target), 'confirm': True, 'acknowledgeWarnings': True})
        mapped = [r for r in api.call('wealth') if r.get('managedBy') == 'EmployeeStockImport']
        require(len(mapped) == 1 and (target is None or mapped[0]['id'] == target['id']), 'CURRENT_PRODUCT_ID_OR_COUNT_CHANGED'); target = mapped[0]
    after = read(api); require(after['protected'] == before['protected'], 'UNRELATED_DEMO_CHANGED'); require(not plan(after)['operations'], 'REPEAT_NOT_NOOP')
    require(sorted(d['asOf'] for d in after['development']) == [r[1] for r in SERIES], 'CANONICAL_HISTORY_CHANGED')
    require(after['target']['value'] == 122825 and after['target']['asOf'] == SERIES[-1][1], 'CURRENT_VALUE_MISMATCH')
    return {'demoOnly': True, 'applied': len(reviewed['operations']), 'repeatNoop': True, 'unrelatedPreserved': True,
        'approvedDates': 3, 'currentProducts': 1, 'currentHeldShares': 42.5, 'sourceUnvested': 152, 'currentWealthDkk': 122825}


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--plan', type=pathlib.Path, required=True)
    parser.add_argument('--expected-build', required=True); parser.add_argument('--apply', action='store_true'); args = parser.parse_args()
    require(re.fullmatch(r'git-[0-9a-f]{40}', args.expected_build), 'EXACT_BUILD_REQUIRED'); api = Api(); state = read(api)
    require(state['build'] == args.expected_build, 'HOSTED_BUILD_MISMATCH')
    if args.apply:
        reviewed = json.loads(args.plan.read_text()); require(reviewed['build'] == args.expected_build, 'PLAN_BUILD_MISMATCH'); result = apply(api, reviewed)
    else:
        result = plan(state); args.plan.parent.mkdir(parents=True, exist_ok=True); args.plan.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__': main()
