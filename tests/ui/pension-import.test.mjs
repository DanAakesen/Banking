import test from 'node:test';
import assert from 'node:assert/strict';
import {pensionPreviewDocument,statementAmount} from '../../src/Banking.Api/wwwroot/wealth-ui.js';

test('pension preview sends only scalar balance facts, masked references and the zero-balance pension marker',()=>{
 const result=pensionPreviewDocument({CPR:'private-cpr',contacts:['private-contact'],pensionproviders:[{pensionprovidername:'PFA',currencycode:'DKK',contacts:['private-provider-contact'],schemes:[
  {savedvalue:0,savedvaluedate:'2026-09-01',referencenumber:'1234567890',benefits:[{Pension:{Forecast:400000,CPR:'private-benefit'}}]},
  {SavedValue:{CPR:'private-nested'},SavedValueDate:{contact:'private-date'},ReferenceNumber:null}
 ]}]});
 assert.deepEqual(result,{PensionProviders:[{PensionProviderName:'PFA',CurrencyCode:'DKK',Schemes:[{SavedValue:0,SavedValueDate:'2026-09-01',ReferenceNumber:'••7890',Benefits:[{Pension:{}}]},{SavedValue:null,SavedValueDate:null,ReferenceNumber:undefined,Benefits:[]}]}]});
 assert.doesNotMatch(JSON.stringify(result),/private-|1234567890|400000/);
 assert.throws(()=>pensionPreviewDocument({}),e=>e.code==='PENSIONSINFO_PROVIDERS_REQUIRED');
 assert.throws(()=>pensionPreviewDocument({PensionProviders:Array(101).fill({})}),e=>e.code==='PENSION_IMPORT_LIMIT');
});

test('manual statement amounts preserve Danish/English separators and reject ambiguous or missing figures',()=>{
 assert.equal(statementAmount('123.456,78','da'),123456.78);
 assert.equal(statementAmount('123,456.78','en'),123456.78);
 assert.equal(statementAmount('123456,78','da'),123456.78);
 assert.equal(statementAmount('0','da'),0);
 for(const value of ['', '  ', '-1','1e6','1,2,3','1.234,567','100000001','NaN'])assert.equal(statementAmount(value,'da'),null,value);
 assert.equal(statementAmount('12.34','da'),null);
 assert.equal(statementAmount('12,34','en'),null);
});
