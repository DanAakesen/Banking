import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateBankingScenario,goalForecast,previousPeriod,compareFinancials} from './financial-tools.mjs';
const context={source:'Banking',mode:'Demo',budgets:{plans:[{id:'b',isActive:true,currency:'DKK',monthly:{income:50000,expenses:30000,savings:5000,available:15000},entries:[{isSavings:true,savingsAccountId:'a',amount:5000,intervalMonths:1}]}]},goalContext:{goals:[{goal:{id:'g',accountId:'a',currency:'DKK',target:200000,monthlyContribution:5000,contributionDay:2},progress:{measuredBalance:100000},journey:{fresh:true,to:'2026-09-13'}}]}};
const args={budgetId:null,goalId:'g',incomeChange:0,expenseChange:-2000,savingsChange:2000};
test('Banking what-if preserves actual records and reconciles monthly allocation and dates',()=>{
 const before=JSON.stringify(context),r=calculateBankingScenario(context,args);
 assert.equal(r.scenario.available,15000);assert.equal(r.scenario.expenses,28000);assert.equal(r.scenario.savings,7000);
 assert.equal(r.goal.baseline.date,'2028-05-02');assert.equal(r.goal.scenario.date,'2027-12-02');assert.equal(r.goal.paymentsEarlier,5);
 assert.equal(JSON.stringify(context),before);assert.equal(r.saved,false);
});
test('Banking what-if rejects unavailable facts and currencies; deficits stay explicit',()=>{
 const stale=structuredClone(context);stale.goalContext.goals[0].journey.fresh=false;
 assert.throws(()=>calculateBankingScenario(stale,args),/recorded/);
 stale.goalContext.goals[0].progress.reason='STALE_BALANCE';
 assert.match(calculateBankingScenario(stale,args).warnings.join(),/stale/);
 const foreign=structuredClone(context);foreign.goalContext.goals[0].goal.currency='EUR';
 assert.throws(()=>calculateBankingScenario(foreign,args),/currencies/);
 assert.throws(()=>calculateBankingScenario(context,{...args,incomeChange:NaN}),/valid/);
 assert.throws(()=>calculateBankingScenario(context,{...args,goalId:'foreign'}),/workspace/);
 assert.equal(calculateBankingScenario(context,{...args,savingsChange:20000}).scenario.available,-3000);
 assert.match(calculateBankingScenario(context,{...args,savingsChange:20000}).warnings.join(),/shortfall/);
});
test('Goal date handles due-day boundary, reached targets and stopped contributions',()=>{
 assert.equal(goalForecast(0,100,100,'2026-09-01',2).date,'2026-09-02');
 assert.equal(goalForecast(0,100,100,'2026-09-02',2).date,'2026-10-02');
 assert.equal(goalForecast(100,100,100,'2026-09-02',2).payments,0);
 assert.equal(goalForecast(0,100,0,'2026-09-02',2).date,null);
});
test('Deviation comparisons use equal inclusive periods, preserve coverage and reconcile category changes',()=>{
 assert.deepEqual(previousPeriod('2026-09-01','2026-09-13'),{from:'2026-08-19',to:'2026-08-31'});
 assert.throws(()=>previousPeriod('2026-09-13','2026-09-01'),/valid/);
 const current={currency:'DKK',from:'2026-09-01',to:'2026-09-13',categories:[{id:'food',name:'Food'}],actuals:{income:1000,spending:600,net:400,coverage:{sufficientHistory:false},categories:[{categoryId:'food',amount:600}]}};
 const previous={...current,actuals:{income:1000,spending:400,net:600,coverage:{sufficientHistory:true},categories:[{categoryId:'food',amount:400}]}};
 const result=compareFinancials(current,previous);assert.equal(result.changes.spending.change,200);assert.equal(result.changes.net.change,-200);assert.equal(result.categories[0].change,200);assert.equal(result.currentPeriod.coverage.sufficientHistory,false);assert.equal(result.changes.disposableAmount,null);
});
