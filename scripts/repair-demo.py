#!/usr/bin/env python3
"""Repair only the shared synthetic product-demo through normal deployed APIs.

Dry-run: python3 scripts/repair-demo.py --plan artifacts/demo-repair/plan.json
Review that plan, then use the same command with --apply. Each apply requires an
unchanged plan, stops on conflicts, verifies protected data, and checks a repeat
run is a no-op. No SQL, reset, sync, global rules/apply, or owner session is used.
"""
import argparse
import collections
import hashlib
import http.cookiejar
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

ORIGIN = 'https://banking-dan-0ac7d719.azurewebsites.net'
ROOT = pathlib.Path(__file__).resolve().parents[1]
TRANSLATIONS = dict(re.findall(r'\["([^"\n]+)"\] = "([^"\n]+)"',
    (ROOT / 'src/Banking.Api/Providers/DemoLanguage.cs').read_text()))
TRANSLATIONS = {k.casefold(): v for k, v in TRANSLATIONS.items()}
DEFINITIONS = {
    'Income': ['Salary', 'Partner salary'], 'Other income': ['Purchase refund'],
    'Housing': ['Housing'], 'Groceries': ['Groceries', 'Supermarket family shop', 'Bakery and fresh food'],
    'Transport': ['Transport pass', 'Fuel station', 'Parking and bridge tolls', 'Family car lease', 'Annual car service'],
    'Children': ['School lunches', 'After school childcare', 'Back to school supplies'],
    'Dining': ['Restaurant', 'Family takeaway', 'Family restaurant', 'Workplace lunches'],
    'Utilities': ['Utilities', 'District heating', 'Family mobile plans', 'Water and waste', 'Internet'],
    'Subscriptions': ['Streaming subscription', 'Music family subscription'],
    'Insurance': ['Insurance', 'Family accident insurance'], 'Shopping': ['Household shopping', 'Home and garden'],
    'Clothing': ['Children clothing and shoes'], 'Health': ['Pharmacy', 'Family dental care'],
    'Leisure': ['Children sports clubs', 'Swimming lessons', 'Family cinema and outings'],
    'Gifts': ['Birthday gifts', 'Christmas gifts'], 'Holidays': ['Winter school holiday', 'Summer family holiday'],
    'Memberships': ['Union and unemployment fund'],
}
# Exact existing fictional template semantics, not inferred from arbitrary bank text.
TRANSFERS = {
    'Bills transfer': ('everyday', 'bills', 10500),
    'Family bills transfer': ('everyday', 'bills', 11000),
    'Savings transfer': ('everyday', 'savings', 1800),
    'Car savings transfer': ('everyday', 'car', 2500),
    'Summer house savings transfer': ('everyday', 'summerhouse', 5000),
    'Car savings contribution returned': ('car', 'everyday', 2500),
}
ACCOUNT_NAMES = {'everyday': 'Everyday account', 'bills': 'Bills account', 'savings': 'Savings account',
                 'car': 'Car savings account', 'summerhouse': 'Summer house savings account'}
UUID = r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'


def translated(text):
    return TRANSLATIONS.get(text.casefold(), text)


def aliases(text):
    return {text.casefold(), translated(text).casefold()}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def require(value, message):
    if not value:
        raise ValueError(message)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('REDIRECT_REJECTED')


class Api:
    def __init__(self):
        # Never reuse an owner cookie; credentials exist only in this new in-memory Demo jar.
        self.client = urllib.request.build_opener(NoRedirect(),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.call('browser/demo', 'POST', {})

    @staticmethod
    def validate(path, method):
        # No encoded paths, arbitrary target, auth/provider routes, global apply or destructive verbs.
        require(re.fullmatch(r'[A-Za-z0-9/?=&._-]+', path) and '..' not in path, 'INVALID_API_PATH')
        if method == 'GET':
            require(re.fullmatch(r'(runtime-info|mode|connections|accounts|categories|rules|budget-plans|budgets|goals'
                r'|transactions(?:\?[A-Za-z0-9=&-]+)?|review\?kind=Transfer&offset=\d+'
                r'|review/history\?offset=\d+|accounts/' + UUID + r'/balances\?limit=200'
                r'|(?:summary|account-insights|cash-flow)\?[A-Za-z0-9=&-]+'
                r'|budget-plans/' + UUID + r'/progress\?month=\d{4}-\d{2}-01'
                r'|goals/' + UUID + r'/journey)', path), 'READ_NOT_ALLOWLISTED')
        else:
            require((method == 'POST' and path in ('browser/demo', 'rules', 'review/actions', 'transfer-matches'))
                or (method == 'PUT' and re.fullmatch(r'transactions/' + UUID + r'/category', path)), 'WRITE_NOT_ALLOWLISTED')

    def call(self, path, method='GET', body=None):
        self.validate(path, method)
        request = urllib.request.Request(ORIGIN + '/api/' + path, method=method,
            headers={'X-Banking-Client': 'web', 'X-Banking-Mode': 'Demo', 'Origin': ORIGIN,
                     'Content-Type': 'application/json'},
            data=json.dumps(body).encode() if body is not None else None)
        try:
            with self.client.open(request, timeout=45) as response:
                require(response.url == ORIGIN + '/api/' + path, 'REDIRECT_REJECTED')
                require(response.headers.get('X-Banking-Mode') == 'Demo', 'DEMO_RESPONSE_REQUIRED')
                data = response.read(8_000_001)
                require(len(data) <= 8_000_000, 'RESPONSE_TOO_LARGE')
                return json.loads(data) if data else None
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'API {method} failed HTTP {error.code}; stop and dry-run again') from None


def guard(api):
    mode = api.call('mode')
    require(mode.get('mode') == 'Demo' and mode.get('availableModes') == ['Demo'], 'DEMO_SESSION_REQUIRED')
    connections = api.call('connections')
    require(len(connections) == 1 and all(c.get('isDemo') is True and c.get('provider') == 'product-demo'
            and c.get('status') == 'Active' for c in connections), 'ACTIVE_PRODUCT_DEMO_REQUIRED')
    return connections


def pages(api, route, maximum):
    rows = []
    while True:
        page = api.call(route.format(offset=len(rows)))
        require(page['offset'] == len(rows) and len(rows) <= page['total'] <= maximum, 'INVALID_PAGE')
        rows.extend(page['items'])
        require(len(rows) <= page['total'], 'INVALID_PAGE_TOTAL')
        if len(rows) == page['total']:
            return rows
        require(page['items'], 'NON_ADVANCING_PAGE')


def snapshot(api):
    runtime = api.call('runtime-info')
    require(runtime.get('backend') == 'azure' and runtime.get('sharedDemo') is True
        and runtime.get('apiContractVersion') == 1, 'SHARED_AZURE_CONTRACT_REQUIRED')
    connections = guard(api)
    accounts = api.call('accounts')
    require(len(accounts) == 5 and all(a.get('isDemo') is True and a['connectionId'] == connections[0]['id']
            and a['currency'] == 'DKK' for a in accounts), 'SYNTHETIC_ACCOUNTS_REQUIRED')
    rows = pages(api, 'transactions?limit=200&offset={offset}', 100000)
    require(len({r['id'] for r in rows}) == len(rows) and all(r.get('isDemo') is True
            and r['accountId'] in {a['id'] for a in accounts} for r in rows), 'SYNTHETIC_ROWS_REQUIRED')
    # History has no offset field; use its actual ten-row page contract.
    history = []
    while True:
        page = api.call(f'review/history?offset={len(history)}')
        require(len(history) <= page['total'] <= 100000, 'INVALID_HISTORY_PAGE')
        history.extend(page['items'])
        if len(history) == page['total']:
            break
        require(page['items'] and len(history) < page['total'], 'NON_ADVANCING_HISTORY')
    state = dict(connections=connections, accounts=accounts, rows=rows, history=history,
        review=pages(api, 'review?kind=Transfer&offset={offset}', 50000),
        categories=api.call('categories'), rules=api.call('rules'), budgets=api.call('budget-plans'),
        legacyBudgets=api.call('budgets'), goals=api.call('goals'),
        balances={a['id']: api.call(f"accounts/{a['id']}/balances?limit=200") for a in accounts})
    for key in ('connections', 'accounts', 'rows', 'categories', 'rules', 'budgets', 'legacyBudgets', 'goals', 'history'):
        if isinstance(state[key], list):
            state[key].sort(key=lambda x: x['id'])
    return state


def protected(state):
    return {k: state[k] for k in ('accounts', 'categories', 'budgets', 'legacyBudgets', 'goals', 'balances')} | {
        'rules': state['rules'], 'manual': [r for r in state['rows'] if r['classification'] == 'Manual']}


def build_plan(state):
    def category(name):
        found = [c for c in state['categories'] if c['name'].casefold() in aliases(name)]
        require(len(found) == 1, 'MISSING_OR_AMBIGUOUS_CATEGORY: ' + name)
        return found[0]['id']
    roles = {}
    for role, name in ACCOUNT_NAMES.items():
        found = [a for a in state['accounts'] if a['providerName'].casefold() in aliases(name)]
        require(len(found) == 1, 'MISSING_OR_AMBIGUOUS_ACCOUNT_ROLE')
        roles[role] = found[0]['id']
    rules = state['rules']
    operations, deferred, desired = [], [], {}
    # New aliases cannot outrank existing rules, including user-edited English rules.
    priority = min((r['priority'] for r in rules), default=0) - 1
    for name, descriptions in DEFINITIONS.items():
        cat = category(name)
        for description in descriptions:
            for alias in aliases(description):
                desired[alias] = (cat, name in ('Income', 'Other income'))
            contains = translated(description)
            equivalents = [r for r in rules if r['contains'].casefold() in aliases(description)]
            require(all(r['categoryId'] == cat and r['active'] for r in equivalents), 'EXISTING_RULE_DIFFERS')
            matches = [r for r in rules if r['contains'].casefold() == contains.casefold()]
            if matches:
                require(all(r['categoryId'] == cat and r['active'] for r in matches), 'EXISTING_RULE_DIFFERS')
            else:
                operations.append({'kind': 'rule', 'body': {'contains': contains, 'categoryId': cat,
                    'priority': priority, 'active': True}})
    projected_rules = rules + [dict(op['body'], id='~') for op in operations]
    projected_rules.sort(key=lambda r: (-r['priority'], r['id']))
    rows = state['rows']
    coffees = sorted([r for r in rows if r['description'].casefold() in aliases('Coffee')
        and r['status'] == 'BOOK' and r['amount'] == -32 and r['classification'] != 'Manual'
        and not r['categoryId'] and not r['isInternalTransfer']],
        key=lambda r: (r['bookingDate'] or '', r['id']), reverse=True)
    retained = {r['id'] for r in coffees[:2]}
    for row in rows:
        if row['status'] != 'BOOK' or row['currency'] != 'DKK' or row['isInternalTransfer'] or row['categoryId'] or row['classification'] == 'Manual':
            continue
        target = desired.get(row['description'].casefold())
        manual = False
        if not target and row['description'].casefold() in aliases('Coffee') and row['id'] not in retained and row['amount'] == -32:
            target, manual = (category('Dining'), False), True
        if target:
            cat, income = target
            require((row['amount'] > 0) == income and row['amount'] != 0, 'UNEXPECTED_TRANSACTION_SIGN')
            require(row['bookingDate'] and row['version'], 'DATED_VERSIONED_ROW_REQUIRED')
            if not manual:
                first = next((r for r in projected_rules if r['active'] and r['contains'].casefold() in row['description'].casefold()), None)
                require(first and first['categoryId'] == cat, 'RULE_PRECEDENCE_CONFLICT')
            operations.append({'kind': 'category', 'id': row['id'], 'body': {'categoryId': cat,
                'version': row['version'], 'manual': manual}, 'before': row})
    for description, (out_role, in_role, amount) in TRANSFERS.items():
        candidates = [r for r in rows if r['status'] == 'BOOK' and r['currency'] == 'DKK'
            and r['description'].casefold() in aliases(description) and not r['isInternalTransfer']]
        for outgoing in candidates:
            if outgoing['amount'] >= 0:
                continue
            incoming = [r for r in candidates if r['amount'] == amount and r['bookingDate'] == outgoing['bookingDate']
                        and r['accountId'] == roles[in_role]]
            require(outgoing['accountId'] == roles[out_role] and outgoing['amount'] == -amount
                    and len(incoming) == 1, 'AMBIGUOUS_SYNTHETIC_TRANSFER')
            pair = incoming[0]
            decisions = [h for h in state['history'] if h.get('undoneAt') is None
                and h.get('kind') in ('Dismiss', 'Skip') and (h.get('description') or '').casefold() in aliases(description)]
            if decisions or any(r['classification'] == 'Manual' for r in (outgoing, pair)):
                deferred.append({'date': outgoing['bookingDate'], 'description': description,
                    'amount': amount, 'reason': 'Existing manual decision'})
                continue
            match = next((x for x in state['review'] if x['transaction']['id'] == outgoing['id']
                          and x['counterpart']['id'] == pair['id']), None)
            if match:
                op = {'kind': 'transfer-review', 'body': {'kind': 'ConfirmTransfer',
                    'items': [{'key': match['key'], 'signature': match['signature']}]}}
            else:
                if state['history']:
                    deferred.append({'date': outgoing['bookingDate'], 'description': description,
                        'amount': amount, 'reason': 'Manual match requires empty Review history'})
                    continue
                # Normal manual matching: exact template role/date/amount/text, no historical dismissal.
                # The existing synthetic bill metadata can incorrectly point to savings; do not rewrite it.
                op = {'kind': 'transfer-manual', 'body': {'outgoingId': outgoing['id'], 'incomingId': pair['id']}}
            operations.append(op | {'before': [outgoing, pair]})
    plan = {'format': 2, 'origin': ORIGIN, 'mode': 'Demo', 'provider': 'product-demo',
        'protectedDigest': digest(protected(state)), 'historyDigest': digest(state['history']),
        'operations': operations, 'deferred': deferred, 'retainedReviewIds': sorted(retained)}
    plan['sha256'] = digest(plan)
    return plan


def summary(plan):
    return {'mode': plan['mode'], 'provider': plan['provider'], 'sha256': plan['sha256'],
        'operations': dict(collections.Counter(op['kind'] for op in plan['operations'])),
        'total': len(plan['operations']), 'deferred': plan['deferred'], 'retainedReviewExamples': len(plan['retainedReviewIds'])}


def verify_after(before, after, reviewed):
    for key in ('accounts', 'categories', 'budgets', 'legacyBudgets', 'goals', 'balances'):
        require(before[key] == after[key], 'PROTECTED_DATA_CHANGED: ' + key)
    for key in ('rules', 'history'):
        actual = {r['id']: r for r in after[key]}
        require(all(actual.get(r['id']) == r for r in before[key]), 'EXISTING_DATA_CHANGED: ' + key)
    actual = {r['id']: r for r in after['rows']}
    require(set(actual) == {r['id'] for r in before['rows']}, 'LEDGER_IDS_CHANGED')
    edits = {op['id']: op for op in reviewed['operations'] if op['kind'] == 'category'}
    matched = {r['id'] for op in reviewed['operations'] if op['kind'].startswith('transfer-') for r in op['before']}
    for row in before['rows']:
        new = actual[row['id']]
        if row['id'] in edits:
            op = edits[row['id']]
            require(new['categoryId'] == op['body']['categoryId'] and new['classification'] == ('Manual' if op['body']['manual'] else 'Rule'), 'CLASSIFICATION_NOT_APPLIED')
            fields = set(row) - {'categoryId', 'classification', 'version'}
        elif row['id'] in matched:
            require(new['isInternalTransfer'], 'TRANSFER_NOT_APPLIED')
            fields = set(row) - {'isInternalTransfer'}
        else:
            fields = set(row)
        require(all(row[k] == new[k] for k in fields), 'UNREVIEWED_LEDGER_CHANGE')


def apply_plan(api, reviewed, state):
    require(build_plan(state) == reviewed, 'PLAN_CHANGED: dry-run and review again')
    for index, op in enumerate(reviewed['operations']):
        guard(api)
        if op['kind'] == 'rule':
            require(not any(r['contains'].casefold() == op['body']['contains'].casefold()
                for r in api.call('rules')), 'RULE_CHANGED')
            api.call('rules', 'POST', op['body'])
        elif op['kind'] == 'category':
            result = api.call(f"transactions/{op['id']}/category", 'PUT', op['body'])
            require(result['categoryId'] == op['body']['categoryId'], 'UNEXPECTED_CATEGORY_RESULT')
        elif op['kind'] == 'transfer-review':
            api.call('review/actions', 'POST', op['body'])
        elif op['kind'] == 'transfer-manual':
            day = op['before'][0]['bookingDate']
            current = pages(api, f'transactions?from={day}&to={day}&currency=DKK&limit=200&offset={{offset}}', 100000)
            require(all(next((r for r in current if r['id'] == old['id']), None) == old for old in op['before']), 'TRANSFER_CHANGED')
            # Recheck decisions just before the unversioned manual-match API; never override a new dismissal.
            require(api.call('review/history?offset=0')['items'] == [], 'MANUAL_MATCH_REQUIRES_EMPTY_HISTORY')
            api.call('transfer-matches', 'POST', op['body'])
        else:
            raise ValueError('UNKNOWN_OPERATION')
        if (index + 1) % 20 == 0:
            print(json.dumps({'completed': index + 1, 'total': len(reviewed['operations'])}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True, type=pathlib.Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    api = Api()
    state = snapshot(api)
    if args.apply:
        reviewed = json.loads(args.plan.read_text())
        apply_plan(api, reviewed, state)
        after_state = snapshot(api)
        verify_after(state, after_state, reviewed)
        after = build_plan(after_state)
        require(not after['operations'], 'REPAIR_INCOMPLETE: inspect and dry-run again')
        args.plan.with_suffix('.after.json').write_text(json.dumps(after_state, indent=2, ensure_ascii=False) + '\n')
        print(json.dumps({'applied': summary(reviewed), 'repeatRun': summary(after), 'protectedData': 'unchanged'}, ensure_ascii=False))
    else:
        plan = build_plan(state)
        args.plan.parent.mkdir(parents=True, exist_ok=True)
        args.plan.with_suffix('.before.json').write_text(json.dumps(state, indent=2, ensure_ascii=False) + '\n')
        args.plan.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + '\n')
        print(json.dumps(summary(plan), ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
