const {statistics,interval,timeType,groupCategories,colorRows}=require('../../src/report/statistics.cjs');
const deals=[1,2,3,4].map((id,i)=>({id,complex:i===3?'hills':'tower',rooms:[1,2,2,3][i],date:`2026-0${Math.min(id,3)}-10`,area:String([15,20,30,40][i]),amount:String(i===3?110000000:30000000)}));
test('counts, totals and natural ordering use the filtered records',()=>{const s=statistics(deals,{},'complex');expect(s.count).toBe(4);expect(s.amount).toBe('200000000');expect(s.rows.map(r=>r.percent)).toEqual(['75%','25%']);expect(statistics(deals,{rooms:[2]},'rooms').rows.map(r=>r.count)).toEqual([2]);expect(statistics([...deals,deals[0]],{},'complex').count).toBe(5);});
test('interval boundaries retain decimal precision and large coefficients',()=>{expect(interval('19.999',10)).toEqual([10n,20n]);expect(interval('20',10)).toEqual([20n,30n]);expect(interval('9007199259999999.99',10000000)[1]).toBe(9007199260000000n);expect(interval('9007199260000000',10000000)[0]).toBe(9007199260000000n);const s=statistics(['0.5','9.999','10','19.999','20','30'].map(area=>({...deals[0],area})),{},'area');expect(s.rows.map(r=>r.count)).toEqual([2,2,1,1]);});
test('calendar keys distinguish years and quarters; periods select the agreed type',()=>{expect(['year','quarter','month','quick','custom'].map(timeType)).toEqual(['year','quarter','month','month','month']);const s=statistics([deals[0],{...deals[0],date:'2025-01-10'}],{},'month');expect(s.rows.map(r=>r.key)).toEqual(['2025-01','2026-01']);expect(statistics(deals,{},'year').rows[0].percent).toBe('100%');});
test('empty results, exact sums, percentage rounding and category colors',()=>{expect(statistics([],{},'amount')).toEqual({count:0,amount:'0',rows:[]});expect(statistics(deals,{rooms:[9]},'rooms').rows).toEqual([]);const rows=statistics(deals.slice(0,3),{},'area').rows;expect(rows.map(r=>r.percent)).toEqual(['33,3%','33,3%','33,3%']);expect(statistics([{...deals[0],amount:'1.005'},{...deals[0],amount:'2.005'}],{},'area').amount).toBe('3.01');});
test('turquoise shades follow filtered counts while labels and natural order stay intact',()=>{
 const records=[1,3,2,1].flatMap((count,index)=>Array.from({length:count},()=>({...deals[0],rooms:index+1})));
 const rows=statistics(records,{},'rooms').rows;
 expect(rows.map(r=>r.label)).toEqual(['1 սենյակ','2 սենյակ','3 սենյակ','4 սենյակ']);
 expect(rows.map(r=>r.color)).toEqual(['hsl(170 100% 82%)','#00a387','hsl(170 100% 57%)','hsl(170 100% 82%)']);
 const filtered=statistics(records,{rooms:[1,3]},'rooms').rows;
 expect(filtered.map(r=>r.color)).toEqual(['hsl(170 100% 82%)','#00a387']);
 expect(colorRows([])).toEqual([]);
 expect(colorRows([{count:0}])[0].color).toBe('hsl(170 100% 82%)');
 expect(colorRows([{count:1}])[0].color).toBe('#00a387');
});
test('Other is shaded by its combined share and expanded children are ranked individually',()=>{
 const records=[10,9,8,7,6,5,4].flatMap((count,index)=>Array.from({length:count},()=>({...deals[0],area:String(index*10+1)})));
 const raw=statistics(records,{},'area').rows,original=structuredClone(raw);
 const grouped=groupCategories(raw,'area');
 expect(grouped.at(-1)).toMatchObject({count:15,color:'#00a387'});
 expect(grouped[3].color).toBe('hsl(170 100% 82%)');
 const expanded=colorRows(grouped.flatMap(row=>row.children||row));
 expect(expanded[0].color).toBe('#00a387');
 expect(expanded.at(-1).color).toBe('hsl(170 100% 82%)');
 expect(raw).toEqual(original);
});
test('year statistics ignore date filters but retain missing years and other filters',()=>{
 const history=[2023,2025,2026].map(year=>({...deals[0],date:`${year}-01-10`}));
 const result=statistics(history,{date:{min:'2026-01-01',max:'2026-12-31'}},'year');
 expect(result.rows.map(({key,count,percent})=>({key,count,percent}))).toEqual([
  {key:'2023',count:1,percent:'33,3%'},{key:'2024',count:0,percent:'0%'},
  {key:'2025',count:1,percent:'33,3%'},{key:'2026',count:1,percent:'33,3%'}
 ]);
 expect(result.count).toBe(3);expect(result.amount).toBe('90000000');
 expect(statistics(history,{dateRanges:[]},'year').count).toBe(3);
 expect(statistics(history,{complexes:['hills']},'year').count).toBe(0);
 expect(statistics(history,{rooms:[9]},'year').rows.every(row=>row.share===0&&row.percent==='0%')).toBe(true);
});

test('area and amount keep four largest categories and aggregate all remaining counts',()=>{
 const records=[8,7,6,5,3,1].flatMap((count,index)=>Array.from({length:count},()=>({...deals[0],area:String(index*10+1),amount:String((index+1)*10000000)})));
 for(const type of ['area','amount']){
  const raw=statistics(records,{},type),rows=groupCategories(raw.rows,type),other=rows.at(-1);
  expect(rows).toHaveLength(5);expect(rows.slice(0,4).map(row=>row.count)).toEqual([8,7,6,5]);
  expect(other).toMatchObject({key:'other',label:'Այլ',count:4,percent:'13,3%'});
  expect(other.children.map(row=>row.count)).toEqual([3,1]);
  expect(rows.reduce((sum,row)=>sum+row.count,0)).toBe(raw.count);
  expect(raw.rows).toHaveLength(6);
 }
});
test('four categories need no group; ranking uses counts and deterministic natural tie order',()=>{
 const rows=statistics([3,1,2,4,5].map(rooms=>({...deals[0],rooms})),{},'rooms').rows;
 expect(groupCategories(rows,'rooms')).toBe(rows);
 expect(groupCategories(rows.slice(0,4),'area')).toEqual(rows.slice(0,4));
 expect(groupCategories(rows,'area').at(-1).children.map(row=>row.key)).toEqual(['5']);
 expect(groupCategories([],'area')).toEqual([]);
 const weighted=rows.map((row,index)=>({...row,count:[1,2,8,9,10][index]}));
 expect(groupCategories(weighted,'amount').slice(0,4).map(row=>row.key)).toEqual(['2','3','4','5']);
});
