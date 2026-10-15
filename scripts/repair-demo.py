#!/usr/bin/env python3
"""Reviewed, repeatable shared synthetic Demo repair through the deployed API only.

Dry run: python3 scripts/repair-demo.py --plan artifacts/demo-repair/plan.json
Apply that reviewed plan: same command plus --apply. No reset, provider refresh,
global rules/apply, owner credentials, SQL, account amounts or budget rewrites.
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


def translated(text):
    return TRANSLATIONS.get(text.casefold(), text)


def aliases(text):
    return {text.casefold(), translated(text).casefold()}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def require(value, message):
    if not value:
        raise ValueError(message)


class Api:
    def __init__(self):
        # Cookies exist only in memory. This script cannot reuse an owner session.
        self.client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.call('browser/demo', 'POST', {})

    def call(self, path, method='GET', body=None):
        require(re.fullmatch(r'[a-z0-9/?=&._%-]+', path) and '..' not in path, 'INVALID_API_PATH')
        if method != 'GET':
            require((method == 'POST' and path in ('browser/demo', 'rules', 'review/actions'))
                    or (method == 'PUT' and re.fullmatch(r'transactions/[a-f0-9-]+/category', path)), 'WRITE_NOT_ALLOWLISTED')
        request = urllib.request.Request(ORIGIN + '/api/' + path, method=method,
            headers={'X-Banking-Client': 'web', 'X-Banking-Mode': 'Demo', 'Origin': ORIGIN,
                     'Content-Type': 'application/json'},
            data=json.dumps(body).encode() if body is not None else None)
        try:
            with self.client.open(request, timeout=45) as response:
                require(response.url == ORIGIN + '/api/' + path, 'REDIRECT_REJECTED')
                data = response.read()
                return json.loads(data) if data else None
        except urllib.error.HTTPError as error:
            # Do not echo response bodies, cookies or synthetic identifiers into logs.
            raise RuntimeError(f'API {method} failed HTTP {error.code}; stop and dry-run again') from None


def guard(api):
    mode = api.call('mode')
    require(mode.get('mode') == 'Demo' and mode.get('availableModes') == ['Demo'], 'DEMO_SESSION_REQUIRED')
    connections = api.call('connections')
    require(len(connections) == 1 and all(c.get('isDemo') is True and c.get('provider') == 'product-demo'
            and c.get('status') == 'Active' for c in connections), 'ACTIVE_PRODUCT_DEMO_REQUIRED')
    return connections


def snapshot(api):
    connections = guard(api)
    accounts = api.call('accounts')
    require(len(accounts) == 5 and all(a.get('isDemo') is True and a['connectionId'] == connections[0]['id']
            and a['currency'] == 'DKK' for a in accounts), 'SYNTHETIC_ACCOUNTS_REQUIRED')
    rows = []
    while True:
        page = api.call(f'transactions?limit=200&offset={len(rows)}')
        require(page['offset'] == len(rows) and page['total'] <= 100000, 'INVALID_PAGE')
        rows.extend(page['items'])
        if len(rows) >= page['total']:
            break
        require(page['items'], 'NON_ADVANCING_PAGE')
    require(len({r['id'] for r in rows}) == len(rows) and all(r.get('isDemo') is True
            and r['accountId'] in {a['id'] for a in accounts} for r in rows), 'SYNTHETIC_ROWS_REQUIRED')
    review = []
    while True:
        page = api.call(f'review?kind=Transfer&offset={len(review)}')
        review.extend(page['items'])
        if len(review) >= page['total']:
            break
        require(page['items'], 'NON_ADVANCING_REVIEW')
    return dict(connections=connections, accounts=accounts, rows=rows, review=review,
                categories=api.call('categories'), rules=api.call('rules'), budgets=api.call('budget-plans'),
                goals=api.call('goals'))


def build_plan(state):
    categories = state['categories']
    def category(name):
        found = [c for c in categories if c['name'].casefold() in aliases(name)]
        require(len(found) == 1, 'MISSING_OR_AMBIGUOUS_CATEGORY: ' + name)
        return found[0]['id']
    roles = {}
    for role, name in ACCOUNT_NAMES.items():
        found = [a for a in state['accounts'] if a['providerName'].casefold() in aliases(name)]
        require(len(found) == 1, 'MISSING_OR_AMBIGUOUS_ACCOUNT_ROLE')
        roles[role] = found[0]['id']
    rules = state['rules']
    operations, deferred = [], []
    desired = {}
    for name, descriptions in DEFINITIONS.items():
        cat = category(name)
        for description in descriptions:
            for alias in aliases(description):
                desired[alias] = (cat, name in ('Income', 'Other income'))
            contains = translated(description)
            matches = [r for r in rules if r['contains'].casefold() == contains.casefold()]
            if matches:
                # Existing edits, disabled rules or different categories require review, never overwrite.
                require(all(r['categoryId'] == cat and r['active'] for r in matches), 'EXISTING_RULE_DIFFERS')
            else:
                operations.append({'kind': 'rule', 'body': {'contains': contains, 'categoryId': cat,
                    'priority': 100, 'active': True}})
    projected_rules = rules + [dict(op['body'], id='~') for op in operations]
    projected_rules.sort(key=lambda r: (-r['priority'], r['id']))
    rows = state['rows']
    coffees = sorted([r for r in rows if r['description'].casefold() in aliases('Coffee')
        and r['status'] == 'BOOK' and r['amount'] == -32 and r['classification'] != 'Manual'],
        key=lambda r: (r['bookingDate'] or '', r['id']), reverse=True)
    retained = {r['id'] for r in coffees[:2]}
    for row in sorted(rows, key=lambda r: r['id']):
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
            match = next((x for x in state['review'] if x['transaction']['id'] == outgoing['id']
                          and x['counterpart']['id'] == pair['id']), None)
            if not match:
                # A dismissal or conflicting bank evidence is a user-owned decision. Do not bypass Review.
                deferred.append({'kind': 'transfer-review', 'date': outgoing['bookingDate'],
                                 'description': description, 'amount': amount})
                continue
            operations.append({'kind': 'transfer', 'body': {'kind': 'ConfirmTransfer',
                'items': [{'key': match['key'], 'signature': match['signature']}]},
                'before': [outgoing, pair]})
    protected = {'budgets': state['budgets'], 'goals': state['goals'], 'rules': rules,
                 'manual': [r for r in rows if r['classification'] == 'Manual']}
    plan = {'format': 1, 'origin': ORIGIN, 'mode': 'Demo', 'provider': 'product-demo',
            'protectedDigest': digest(protected), 'operations': operations, 'deferred': deferred}
    plan['sha256'] = digest(plan)
    return plan


def summary(plan):
    return {'mode': plan['mode'], 'provider': plan['provider'], 'sha256': plan['sha256'],
            'operations': dict(collections.Counter(op['kind'] for op in plan['operations'])),
            'total': len(plan['operations']), 'deferred': plan['deferred']}


def apply_plan(api, reviewed, state):
    current = build_plan(state)
    require(current == reviewed, 'PLAN_CHANGED: dry-run and review again')
    for op in reviewed['operations']:
        guard(api)
        if op['kind'] == 'rule':
            require(not any(r['contains'].casefold() == op['body']['contains'].casefold()
                            for r in api.call('rules')), 'RULE_CHANGED')
            api.call('rules', 'POST', op['body'])
        elif op['kind'] == 'category':
            # PUT uses the reviewed row version atomically; never retry a conflict as an overwrite.
            result = api.call(f"transactions/{op['id']}/category", 'PUT', op['body'])
            require(result['categoryId'] == op['body']['categoryId'], 'UNEXPECTED_CATEGORY_RESULT')
        else:
            # Review revalidates the exact pair signature within a serializable transaction.
            api.call('review/actions', 'POST', op['body'])


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
        after = build_plan(snapshot(api))
        require(not after['operations'], 'REPAIR_INCOMPLETE: inspect and dry-run again')
        print(json.dumps({'applied': summary(reviewed), 'repeatRun': summary(after)}, ensure_ascii=False))
    else:
        plan = build_plan(state)
        args.plan.parent.mkdir(parents=True, exist_ok=True)
        args.plan.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + '\n')
        print(json.dumps(summary(plan), ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
