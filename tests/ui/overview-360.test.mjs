import assert from 'node:assert/strict';
import test from 'node:test';
import {wealth360Model,calendarMetricSeries,wealthPeriodSeries,pensionPeriod} from '../../src/Banking.Api/wwwroot/overview.js';
test('assets combine bank cash and non-cash statements without adding savings twice',()=>{
 const result=wealth360Model(447847,[{kind:'Investment',currency:'DKK',value:125000},{kind:'Pension',currency:'DKK',value:850000}],'DKK');
 assert.equal(result.total,1422847);assert.equal(result.partial,false);assert.equal(result.chartable,true);
});
test('missing data stays unknown; confirmed zero stays zero',()=>{
 assert.equal(wealth360Model(null,[],'DKK').total,null);
 assert.equal(wealth360Model(100,null,'DKK').partial,true);
 assert.deepEqual(wealth360Model(0,[{kind:'Investment',currency:'DKK',value:0},{kind:'Pension',currency:'DKK',value:0}],'DKK').values,[0,0,0]);
});
test('different currencies cannot inflate totals and negative values cannot be pie segments',()=>{
 assert.equal(wealth360Model(100,[{kind:'Pension',currency:'EUR',value:850000}],'DKK').total,100);
 assert.equal(wealth360Model(-100,[],'DKK').chartable,false);
});

test('calendar trends jump on the last weekday, savings step, and spending accumulates',()=>{
 const values=[12706,447847,326400,57300,35294,11516];
 const series=calendarMetricSeries('2026-08-19','2026-09-18',values,9300);
 series.forEach((points,i)=>assert.ok(Math.abs(points.at(-1)-values[i])<.01));
 const payday=12; // August 31, Monday, in this window.
 assert.ok(series[0][payday]>series[0][payday-1]);
 assert.ok(series[0][payday+1]<series[0][payday]);
 assert.equal(series[2][payday]-series[2][payday-1],9300);
 assert.equal(series[2][payday+1],series[2][payday]);
 assert.ok(series[4].every((v,i,a)=>!i||v>=a[i-1]));
 assert.ok(series[5].every((v,i,a)=>!i||v<=a[i-1]));
});

test('investment periods interpolate boundaries and do not extrapolate',()=>{
 const h=[{date:'2026-01-01',value:100},{date:'2026-01-11',value:110},{date:'2026-01-21',value:105}];
 assert.deepEqual(wealthPeriodSeries(h,'2026-01-06','2026-01-16'),[{date:'2026-01-06',value:105},h[1],{date:'2026-01-16',value:107.5}]);
 assert.deepEqual(wealthPeriodSeries(h,'2025-01-01','2027-01-01'),h);
 assert.deepEqual(wealthPeriodSeries(h,'2027-01-01','2027-01-20'),[]);
});
test('pension period shows deposits and growth for the selected dates',()=>{
 const h=[{date:'2026-03-22'},{date:'2026-09-18'}],p={contributions:324000,returns:186000};
 const month=pensionPeriod(p,h,'2026-08-19','2026-09-18');
 const quarter=pensionPeriod(p,h,'2026-06-19','2026-09-18');
 assert.equal(month.contributions,3240);assert.equal(quarter.contributions,9720);
 assert.ok(quarter.returns>month.returns);
 assert.equal(pensionPeriod(p,h,'2027-01-01','2027-02-01'),null);
});
