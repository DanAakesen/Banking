import https from 'node:https';
import { createHash } from 'node:crypto';
import { getCACertificates } from 'node:tls';

export function bankingScope(session, mode) {
  if (!session || !['Demo', 'Live'].includes(mode)) throw Object.assign(new Error('Banking workspace is unavailable.'), { status: 401 });
  return createHash('sha256').update('banking-goals-v1\0' + session + '\0' + mode).digest('hex');
}

// Fixed loopback HTTPS endpoint only, validated against Windows' trusted certs.
// Never follow redirects or reuse these credentials elsewhere.
export function readBankingGoals(session, mode) {
  return bankingRequest(session, mode, '/api/advisor-goals');
}
export function readBankingContext(session, mode, range = {}) {
  const query = new URLSearchParams();
  for (const key of ['from','to','currency']) if (range[key]) query.set(key, range[key]);
  return bankingRequest(session, mode, '/api/advisor-context?' + query);
}
export function readBankingTransactions(session, mode, filters) {
  const query = new URLSearchParams({status:'BOOK',limit:'100'});
  for (const key of ['from','to','currency','accountId','categoryId','search','offset']) if (filters[key] !== null && filters[key] !== undefined) query.set(key, String(filters[key]));
  return bankingRequest(session, mode, '/api/transactions?' + query);
}
export function createBankingBudgetEntry(session, mode, budgetId, entry) {
  if (!/^[a-f0-9-]{36}$/i.test(budgetId)) throw Object.assign(new Error('Choose a saved budget.'), {status:400});
  return bankingRequest(session, mode, '/api/advisor-budgets/' + budgetId + '/entries', entry);
}
export function saveBankingBudget(session,mode,plan){return bankingRequest(session,mode,'/api/budget-plans',plan);}
export function readBudgetSuggestions(session,mode,currency){return bankingRequest(session,mode,'/api/budget-plans/suggestions?'+new URLSearchParams({currency,months:'3'}));}
export function readBankingReview(session,mode,kind='All',offset=0){return bankingRequest(session,mode,'/api/review?'+new URLSearchParams({kind,offset:String(offset)}));}
export function applyBankingReview(session,mode,input){return bankingRequest(session,mode,'/api/review/actions',input);}
// Market failures carry sanitized per-operation diagnostics (operation:status:providerCode); never provider messages.
export function diagnosticSummary(details){
  if(!Array.isArray(details?.diagnostics))return [];
  return details.diagnostics.slice(0,3).map(d=>[d?.operation,d?.status??'-',d?.providerCode??'-'].map(x=>String(x).replace(/[^A-Za-z0-9_.-]/g,'').slice(0,40)).join(':'));
}
export function bankingRequest(session, mode, path, body, method) {
  bankingScope(session, mode);
  return new Promise((resolve, reject) => {
    const fail = () => reject(Object.assign(new Error('Banking could not complete the request. Refresh or sign in again. No sample data was substituted and no success is assumed.'), { status: 503 }));
    const target=new URL(process.env.BANKING_PUBLIC_ORIGIN || 'https://localhost:5443');
    if(target.protocol!=='https:' || target.pathname!=='/' || target.username || target.password) return fail();
    const req = https.request({ hostname: target.hostname, port: target.port || 443, path, method: method || (body === undefined ? 'GET' : 'POST'), ...(process.env.BANKING_PUBLIC_ORIGIN?{}:{ca:getCACertificates('system')}),
      headers: { Cookie: '__Host-Banking.Local=' + session, 'X-Banking-Client': 'web', 'X-Banking-Mode': mode, Origin:target.origin, 'Content-Type':'application/json' } }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', part => { data += part; if (data.length > 3000000) { req.destroy(); fail(); } });
      res.on('error', fail);
      res.on('end', () => {
        try { const value = data ? JSON.parse(data) : {status:'completed'};
          if (res.statusCode < 200 || res.statusCode >= 300) { const code=String(value.error||value.code||'REQUEST_FAILED').replace(/[^A-Z_]/g,'').slice(0,80);
            const diagnostics=diagnosticSummary(value.details);
            reject(Object.assign(new Error('Banking rejected the request: '+code+(diagnostics.length?' ('+diagnostics.join('; ')+')':'')+'. No change was confirmed.'),{status:res.statusCode>=500?503:res.statusCode,diagnostics}));return; }
          if (body === undefined && path.startsWith('/api/advisor-') && (value.source !== 'Banking' || value.mode !== mode || !Array.isArray(value.goalContext?.goals))) throw new Error();
          resolve(value); }
        catch { fail(); }
      });
    });
    req.setTimeout(30000, () => req.destroy());
    req.on('error', fail);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
