#!/usr/bin/env python3
"""Read-only release smoke against the fixed shared Azure Demo; never signs in as Dan.

The only POST creates a fresh public Demo session in an in-memory cookie jar.
No rules, classifications, transfers, budgets, goals, provider calls or SQL writes.
"""
import argparse
from datetime import datetime
from decimal import Decimal
import http.cookiejar
import json
from pathlib import Path
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

ORIGIN = 'https://banking-dan-0ac7d719.azurewebsites.net'


def require(value, message):
    if not value:
        raise RuntimeError(message)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('Release smoke refused an HTTP redirect')


class DemoSmoke:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.client = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPCookieProcessor(self.jar))

    def request(self, path, *, mode='Demo', session=False):
        request = urllib.request.Request(ORIGIN + '/api/' + path,
            data=b'{}' if session else None, method='POST' if session else 'GET',
            headers={'X-Banking-Client': 'web', 'X-Banking-Mode': mode,
                     'Origin': ORIGIN, 'Content-Type': 'application/json'})
        return self.client.open(request, timeout=45)

    def read(self, path, *, session=False):
        with self.request(path, session=session) as response:
            require(response.status == 200, 'Demo smoke read failed')
            require(response.headers.get('X-Banking-Mode') == 'Demo', 'Demo response mode required')
            body = response.read(2_000_001)
            require(len(body) <= 2_000_000, 'Demo smoke response exceeded limit')
            return json.loads(body)

    def denial(self, *, mode, status):
        try:
            with self.request('accounts', mode=mode):
                # Do not read any response body if a private-data denial unexpectedly succeeds.
                raise RuntimeError('Private account access was unexpectedly accepted')
        except urllib.error.HTTPError as error:
            try:
                require(error.code == status, 'Private account denial returned the wrong status')
            finally:
                error.close()

    def run(self):
        self.denial(mode='Live', status=401)
        session = self.read('browser/demo', session=True)
        require(session.get('role') == 'Demo', 'Fresh public Demo session required')
        status = self.read('browser/status')
        require(status.get('role') == 'Demo', 'Demo role required')
        mode = self.read('mode')
        require(mode.get('mode') == 'Demo' and mode.get('availableModes') == ['Demo'],
                'Demo-only workspace required')
        connections = self.read('connections')
        require(len(connections) == 1 and all(c.get('isDemo') is True and
                c.get('provider') == 'product-demo' and c.get('status') == 'Active' for c in connections),
                'One active synthetic product-demo connection required')
        accounts = self.read('accounts')
        require(accounts and all(a.get('isDemo') is True and
                a.get('connectionId') == connections[0]['id'] for a in accounts),
                'Only synthetic Demo accounts are allowed')
        self.denial(mode='Live', status=403)
        today = datetime.now(ZoneInfo('Europe/Copenhagen')).date()
        start = today.replace(day=1)
        query = f'from={start}&to={today}&currency=DKK'
        summary, insights, flow = [self.read(route + '?' + query)
                                   for route in ('summary', 'account-insights', 'cash-flow')]
        number = lambda value: Decimal(str(value))
        for field in ('income', 'spending', 'net'):
            require(number(summary[field]) == number(insights[field]) == number(flow[field]),
                    'Demo page aggregates disagree')
        require(number(summary['income']) - number(summary['spending']) == number(summary['net']),
                'Demo cash flow does not reconcile')
        categories = [c for c in summary['categories'] if number(c['spending']) > 0]
        require(sum((number(c['spending']) for c in categories), Decimal(0)) == number(summary['spending']),
                'Demo categories do not reconcile to spending')
        # Before the first monthly expenses, zero spending is a valid state.
        if number(summary['spending']) > 0:
            require(any(c.get('categoryId') is not None for c in categories),
                    'Demo spending has no classified categories')
        return {'mode': 'Demo', 'provider': 'product-demo', 'accounts': len(accounts),
                'from': str(start), 'to': str(today), 'spendingCategories': len(categories),
                'aggregateParity': True, 'anonymousLiveStatus': 401, 'demoLiveStatus': 403,
                'financialWrites': 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    smoke = DemoSmoke()
    try:
        report = smoke.run()
    finally:
        smoke.jar.clear()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
