#!/usr/bin/env python3
"""Read-only reconciliation of shared Demo ledger, page aggregates, budgets and goals.

python3 scripts/verify-demo-repair.py --output artifacts/demo-repair/verified.json
Uses a fresh Demo-only session. Never reads private Dan data or writes finances.
"""
import argparse
import calendar
import collections
from datetime import datetime, timedelta
from decimal import Decimal
import importlib.util
import json
from pathlib import Path
from zoneinfo import ZoneInfo

spec = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('repair-demo.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
D = lambda n: Decimal(str(n))


def same(actual, expected):
    r.require(abs(D(actual) - expected) < Decimal('.0001'), 'AGGREGATE_MISMATCH')


def metrics(rows):
    booked = [x for x in rows if x['status'] == 'BOOK' and not x['isInternalTransfer']]
    income = sum((D(x['amount']) for x in booked if x['amount'] > 0), Decimal(0))
    spending = -sum((D(x['amount']) for x in booked if x['amount'] < 0), Decimal(0))
    cats = collections.defaultdict(Decimal)
    for x in booked:
        if x['amount'] < 0: cats[x['categoryId']] -= D(x['amount'])
    return dict(income=income, spending=spending, net=income-spending, categories=dict(cats))


def verify(api, state):
    today = datetime.now(ZoneInfo('Europe/Copenhagen')).date()
    rows = state['rows']
    report = {'asOf': str(today), 'mode': 'Demo', 'provider': 'product-demo', 'rowCount': len(rows),
        'uniqueIds': len({x['id'] for x in rows}), 'periods': {}, 'accounts': [], 'budgets': [], 'goals': []}
    dates = sorted({x['bookingDate'][:7] for x in rows if x['bookingDate']})
    periods = {month: (month+'-01', f'{month}-{calendar.monthrange(int(month[:4]), int(month[5:]))[1]}') for month in dates}
    for days in (7, 30, 90, 180, 365): periods[f'last-{days}-days'] = (str(today-timedelta(days=days-1)), str(today))
    periods['all-history'] = (dates[0]+'-01', str(today))
    for label, (start, end) in periods.items():
        chosen = [x for x in rows if x['bookingDate'] and start <= x['bookingDate'] <= end]
        expected = metrics(chosen)
        query = f'from={start}&to={end}&currency=DKK'
        summary = api.call('summary?'+query)
        for key in ('income', 'spending', 'net'): same(summary[key], expected[key])
        cats = {x['categoryId']: D(x['spending']) for x in summary['categories'] if x['spending']}
        r.require(cats == expected['categories'], 'CATEGORY_TOTALS_MISMATCH')
        # Each page's reads agree, including actual selected UI periods and every month.
        insights = api.call('account-insights?'+query)
        flow = api.call('cash-flow?'+query)
        for key in ('income', 'spending', 'net'):
            same(insights[key], expected[key]); same(flow[key], expected[key])
        same(sum(D(p['spending']) for p in flow['points']), expected['spending'])
        r.require({x['categoryId']: D(x['amount']) for x in insights['categories']} == expected['categories'], 'PAGE_CATEGORY_MISMATCH')
        savings_ids = {x['id'] for x in state['accounts'] if x['isSavings']}
        savings = sum((D(x['amount']) for x in chosen if x['status'] == 'BOOK' and x['accountId'] in savings_ids), Decimal(0))
        same(insights['savings'], savings); same(insights['disposableAmount'], expected['net']-savings)
        report['periods'][label] = {k: v for k, v in expected.items() if k != 'categories'} | {
            'uncategorizedSpending': expected['categories'].get(None, Decimal(0)),
            'spendingCategories': len([c for c in expected['categories'] if c is not None]), 'netSavings': savings}
    for account in state['accounts']:
        chosen = [x for x in rows if x['accountId'] == account['id']]
        opening = {'Everyday account': 12000, 'Bills account': 6000, 'Savings account': 22000,
            'Car savings account': 0, 'Summer house savings account': 0}[account['providerName']]
        booked = D(opening) + sum((D(x['amount']) for x in chosen if x['status'] == 'BOOK'), Decimal(0))
        pending = sum((D(x['amount']) for x in chosen if x['status'] == 'PDNG'), Decimal(0))
        balances = state['balances'][account['id']]
        latest = lambda kind: next(x['amount'] for x in balances if x['type'] == kind)
        same(latest('ITBD'), booked); same(latest('ITAV'), booked+pending)
        for month in dates[-2:]:
            start, end = periods[month]; expected = metrics([x for x in chosen if x['bookingDate'] and start <= x['bookingDate'] <= end])
            for route in ('account-insights', 'cash-flow'):
                data = api.call(f'{route}?from={start}&to={end}&currency=DKK&accountId={account["id"]}')
                for key in ('income', 'spending', 'net'): same(data[key], expected[key])
        report['accounts'].append({'name': account['providerName'], 'booked': booked, 'pending': pending, 'available': booked+pending})
    # The saved active family plan is immutable; only actuals derived from classifications change.
    for plan in state['budgets']['plans']:
        for month in dates[-2:]:
            progress = api.call(f'budget-plans/{plan["id"]}/progress?month={month}-01')
            chosen = [x for x in rows if (x['bookingDate'] or '').startswith(month)]
            expected = metrics(chosen)
            same(progress['actualIncome'], expected['income'])
            same(progress['actualExpenses'], expected['spending'])
            linked = {e['savingsAccountId'] for e in plan['entries'] if e['isSavings'] and e['savingsAccountId']}
            if all(e['savingsAccountId'] for e in plan['entries'] if e['isSavings']):
                net = sum((D(x['amount']) for x in chosen if x['status']=='BOOK' and x['isInternalTransfer'] and x['accountId'] in linked), Decimal(0))
                same(progress['actualSavings'], net)
            report['budgets'].append({'name': plan['name'], 'month': month,
                'actualIncome': progress['actualIncome'], 'actualExpenses': progress['actualExpenses'],
                'actualSavings': progress['actualSavings'], 'actualAvailable': progress['actualAvailable']})
    for goal in state['goals']:
        journey = api.call(f'goals/{goal["id"]}/journey')
        if goal.get('accountId'):
            balances = state['balances'][goal['accountId']]
            same(journey['closingBalance'], D(next(x['amount'] for x in balances if x['type']=='ITBD')))
            chosen=[x for x in rows if x['accountId']==goal['accountId'] and x['status']=='BOOK' and x['bookingDate'] and journey['from']<=x['bookingDate']<=journey['to']]
            same(journey['deposits'], sum((D(x['amount']) for x in chosen if x['amount']>0),Decimal(0)))
            same(journey['withdrawals'], -sum((D(x['amount']) for x in chosen if x['amount']<0),Decimal(0)))
        report['goals'].append({'name': goal['name'], 'closingBalance': journey['closingBalance'], 'fresh': journey['fresh']})
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args=parser.parse_args()
    api=r.Api(); state=r.snapshot(api)
    report=verify(api,state)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False,default=float)+'\n')
    print(json.dumps({'rows': report['rowCount'], 'periods': len(report['periods']), 'accounts':len(report['accounts']),
        'budgetMonths':len(report['budgets']), 'goals':len(report['goals']), 'verified':True}))


if __name__=='__main__': main()
