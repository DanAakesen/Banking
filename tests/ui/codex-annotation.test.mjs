import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
const backend=await readFile(new URL('../../src/Banking.Api/Security/LocalSecurity.cs',import.meta.url),'utf8');
const frontend=await readFile(new URL('../../tools/frontend-host/Program.cs',import.meta.url),'utf8');
export const policy=backend.match(/Headers\["Content-Security-Policy"\] = "([^"]+)"/)[1];
test('main frontend transport and production annotation policies remain identical and narrow',()=>{
 assert.equal(policy,frontend.match(/MainContentSecurityPolicy = "([^"]+)"/)[1]);
 const expected=["default-src 'self'","script-src 'self'","style-src 'self' 'sha256-UjmwW5hqkbmZat2z0a4MIudqMdHHunQ57o+t2nldQPQ=' 'sha256-WO55anZ1V8A0G22bY2t72RV4dI79SLI4VnYLgsEeWUc=' 'sha256-OUoShR0c3lqWNHEaHdorwfYnp/0EJHI/7QhTEUtan9w=' 'sha256-6ddE/BE/E7OfXOyznfBSKxo7Dfm3OMuxy0O5a2y6TqI='","img-src 'self' data:","connect-src 'self'","object-src 'none'","base-uri 'none'","frame-ancestors 'none'","form-action 'self'","frame-src 'self' https://www.tradingview-widget.com"];
 assert.deepEqual(policy.split('; '),expected);
});
