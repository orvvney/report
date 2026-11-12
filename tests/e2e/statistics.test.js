const {createServer}=require('../../server.js');
const {createFixture,deal}=require('../support/crm-fixture.cjs');
let server,url,fixture;
beforeEach(async()=>{await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));fixture=createFixture({items:[1,2,3,4].map((id,i)=>deal(id,{ufCrmRooms:[1,2,2,3][i],ufCrmArea:String([15,20,30,40][i]),ufCrmDate:`2026-0${Math.min(id,3)}-10`,opportunity:String(i===3?110000000:30000000),ufCrmComplex:i===3?'82':'81'}))});server=createServer(fixture);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}`;});
afterEach(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
test('statistics selection, counts, filtering, reset and responsive layout',async()=>{await page.setViewportSize({width:1920,height:1200});let requests=0;page.on('request',r=>{if(r.url().includes('/api/report'))requests++;});await page.goto(url);await page.getByTestId('statistics-count').waitFor();const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});await expectValue('4');
const filter=page.getByRole('form',{name:'Զտիչներ',exact:true});
const boxes=await Promise.all([filter.boundingBox(),panel.boundingBox(),page.getByTestId('kpi-container').boundingBox()]);
expect(Math.abs((await page.locator('.report-top-panels').boundingBox()).x-boxes[2].x)).toBeLessThan(1);
const frame=await page.locator('.report-top-panels').boundingBox();expect(Math.abs(frame.x+frame.width-boxes[2].x-boxes[2].width)).toBeLessThan(1);
expect(Math.abs(boxes[0].width-boxes[1].width)).toBeLessThan(1);
expect(boxes[0].height).toBe(258);expect(boxes[1].height).toBe(258);
await page.screenshot({path:'test-results/statistics-wide.png',fullPage:true});
expect(await panel.getByRole('button',{name:'Ըստ սենյակի',exact:true}).isVisible()).toBe(true);await panel.getByRole('button',{name:'Ըստ սենյակի',exact:true}).hover();const popup=page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'});await popup.getByRole('button',{name:'Համալիր',exact:true}).click();expect(await panel.locator('.statistics-legend').innerText()).toContain('75%');expect(await popup.isVisible()).toBe(false);await page.getByRole('form',{name:'Զտիչներ',exact:true}).getByRole('button',{name:'Հիլլս',exact:true}).click();await expectValue('3');expect(await panel.locator('.statistics-legend').innerText()).toContain('100%');expect(requests).toBe(1);for(const width of [1920,1024,375]){await page.setViewportSize({width,height:1200});await page.waitForTimeout(100);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}await page.getByRole('button',{name:'Վերականգնել',exact:true}).click();await expectValue('4');expect(await panel.getByRole('button',{name:'Ըստ սենյակի',exact:true}).isVisible()).toBe(true);await page.screenshot({path:'test-results/statistics-narrow.png',fullPage:true});async function expectValue(v){await page.waitForFunction(value=>document.querySelector('[data-testid=statistics-count]')?.textContent===value,v);}});

test('all grouping options, calendar mapping and keyboard tooltip work locally',async()=>{
 await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});
 const button=()=>panel.locator('.statistics-trigger');
 const popup=page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'});
 for(const [label,expected] of [['Համալիր','75%'],['Սենյակ','50%'],['Մակերես','20–30'],['Բն. Արժեք','30 մլն–40 մլն']]){
  await button().focus();await page.keyboard.press('Enter');await popup.waitFor();
  expect(await popup.getByRole('button').count()).toBe(5);
  await popup.getByRole('button',{name:label,exact:true}).click();
  expect(await panel.locator('.statistics-legend').innerText()).toContain(expected);
  await expectGroupingSize(panel);
  await panel.locator('svg g').first().focus();expect(await panel.getByRole('tooltip').innerText()).toContain('%');
 }
 const period=page.getByRole('combobox',{name:'Կնքման ժամանակահատված',exact:true});
 for(const [value,title] of [['month','Կնքման ամիս'],['quarter','Կնքման եռամսյակ'],['year','Կնքման տարի'],['custom','Կնքման ամիս'],['quick','Կնքման ամիս']]){
  await period.selectOption(value);await button().click();await popup.waitFor();
  expect(await popup.getByRole('button').first().innerText()).toBe(title);
  await popup.getByRole('button').first().click();await expectGroupingSize(panel);
  await button().click();await popup.waitFor();
  await page.keyboard.press('Escape');expect(await button().evaluate(e=>document.activeElement===e)).toBe(true);
 }
});
test('loading, failure, recovery, empty result and refresh preserve selected grouping',async()=>{
 let release;fixture.state.gate=new Promise(resolve=>{release=resolve;});
 await page.goto(url);const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});
 expect(await panel.locator('.statistics-trigger').isDisabled()).toBe(true);
 expect(await panel.getByTestId('statistics-count').count()).toBe(0);release();fixture.state.gate=null;
 await page.getByTestId('statistics-count').waitFor();await panel.locator('.statistics-trigger').click();
 await page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'}).getByRole('button',{name:'Մակերես',exact:true}).click();
 fixture.state.failPage=0;await page.getByRole('button',{name:'Թարմացնել հաշվետվությունը',exact:true}).click();
 await panel.getByText('Տվյալներն անհասանելի են։',{exact:true}).waitFor();
 expect(await panel.locator('svg').count()).toBe(0);expect(await panel.locator('.statistics-trigger').isDisabled()).toBe(true);
 fixture.state.failPage=undefined;fixture.state.items=[];
 await page.getByRole('button',{name:'Թարմացնել հաշվետվությունը',exact:true}).click();
 await panel.getByText('Տվյալներ չկան',{exact:true}).waitFor();
 expect(await panel.getByTestId('statistics-count').innerText()).toBe('0');
 expect(await panel.getByTestId('statistics-amount').innerText()).toBe('~0 ֏');
 expect(await panel.locator('.statistics-trigger').innerText()).toBe('Ըստ մակերեսի');
 expect(await panel.locator('.statistics-trigger').isEnabled()).toBe(true);
});

test('joined frame, spacing, centered 12px labels and ranked turquoise room colors',async()=>{
 await page.setViewportSize({width:1920,height:1200});await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const geometry=await page.evaluate(()=>{const form=document.querySelector('.filter-panel'),stats=document.querySelector('.statistics-panel');const a=form.querySelector('h2').getBoundingClientRect(),b=form.querySelector('legend').getBoundingClientRect(),c=stats.querySelector('h2').getBoundingClientRect(),d=stats.querySelector('article').getBoundingClientRect();return {left:b.top-a.bottom,right:d.top-c.bottom,divider:getComputedStyle(document.querySelector('.report-top-panels'),'::after').width,font:getComputedStyle(stats.querySelector('h3')).fontSize,align:getComputedStyle(stats.querySelector('article')).textAlign};});
 expect(Math.abs(geometry.left-geometry.right)).toBeLessThan(1);expect(geometry.divider).toBe('1px');expect(geometry.font).toBe('12px');expect(geometry.align).toBe('center');
 const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});await panel.locator('.statistics-trigger').click();await page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'}).getByRole('button',{name:'Սենյակ',exact:true}).click();
 const legend=await panel.locator('.statistics-legend').innerText();for(const n of [1,2,3])expect(legend).toContain(`${n} սենյակ`);
 const colors=await panel.locator('svg path').evaluateAll(elements=>elements.map(e=>e.getAttribute('fill')));expect(colors).toEqual(['hsl(170 100% 82%)','#00a387','hsl(170 100% 82%)']);
 await page.screenshot({path:'test-results/statistics-joined-wide.png',fullPage:true});
});
test('adaptive equal input widths, equal cards, matching pie extent and shared legend tracks',async()=>{
 await page.setViewportSize({width:1920,height:1200});await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});
 const a=await panel.locator('article').first().boundingBox(),b=await panel.locator('article').last().boundingBox(),pie=await panel.locator('.statistics-pie').boundingBox();
 expect(a.width).toBe(b.width);expect(Math.abs(a.height-b.height)).toBeLessThan(1);
 expect(Math.abs(pie.y-a.y)).toBeLessThan(1);expect(Math.abs(pie.y+pie.height-b.y-b.height)).toBeLessThan(1);
 const end=await page.locator('#amount-max').boundingBox();expect(Math.abs(end.y+end.height-b.y-b.height)).toBeLessThan(1);
 const inputWidth=(await page.locator('#area-min').boundingBox()).width;
 for(const id of ['area-min','area-max','amount-min','amount-max'])expect((await page.locator(`#${id}`).boundingBox()).width).toBe(inputWidth);
 expect(await panel.locator('article').last().locator('h3 br').count()).toBe(0);
 await panel.locator('.statistics-trigger').click();await page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'}).getByRole('button',{name:'Բն. Արժեք',exact:true}).click();
 expect(await panel.locator('.statistics-trigger').innerText()).toBe('Ըստ բն. արժեքի');expect(await panel.locator('.statistics-legend').innerText()).toContain('30 մլն–40 մլն');
 const positions=await panel.locator('.statistics-legend [role=row]:not(.statistics-legend-header)').evaluateAll(rows=>rows.map(row=>[...row.children].map(el=>el.getBoundingClientRect().right)));
 for(let i=1;i<positions.length;i++)for(const col of [1,2])expect(Math.abs(positions[i][col]-positions[0][col])).toBeLessThan(1);
 await page.screenshot({path:'test-results/statistics-fixed-fields.png',fullPage:true});
});
test.each([1440,1920])('desktop keeps equal halves with statistics on the right at %i',async width=>{
 await page.setViewportSize({width,height:1200});await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const filter=await page.locator('.filter-panel').boundingBox(),stats=await page.locator('.statistics-panel').boundingBox();
 expect(Math.abs(filter.width-stats.width)).toBeLessThan(1);expect(Math.abs(filter.y-stats.y)).toBeLessThan(1);expect(Math.abs(stats.x-filter.x-filter.width)).toBeLessThan(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/statistics-right-${width}.png`,fullPage:true});
});
test('legend headings, compact cards and shared hover and keyboard highlighting',async()=>{
 await page.setViewportSize({width:1440,height:1200});await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});
 const table=panel.getByRole('table');
 expect(await table.getByRole('columnheader').allTextContents()).toEqual(['Սենյակ','Քանակ','Տոկոս']);
 const borders=await table.getByRole('row').evaluateAll(rows=>rows.map(row=>getComputedStyle(row).borderBottomWidth));
 expect(borders.slice(0,-1).every(width=>width==='1px')).toBe(true);expect(borders.at(-1)).toBe('0px');
 const arrow=await panel.locator('.statistics-trigger').evaluate(button=>{const style=getComputedStyle(button,'::after');return {content:style.content,right:style.right,width:style.width};});
 expect(arrow).toEqual({content:'""',right:'10px',width:'6px'});
 const cards=panel.locator('article');
 for(const card of await cards.all()){
  expect((await card.boundingBox()).width).toBeLessThan(150);
  const lines=await card.locator('h3').evaluate(e=>e.getBoundingClientRect().height/parseFloat(getComputedStyle(e).lineHeight));
  expect(lines).toBeCloseTo(1,0);
 }
 await expectPieInset(panel);
 const slice=panel.locator('svg g').first();const key=await slice.getAttribute('data-key');
 const row=table.locator(`[data-key="${key}"]`);
 await slice.hover();
 expect(await slice.getAttribute('class')).toContain('is-active');expect(await row.getAttribute('class')).toContain('is-active');
 expect(await slice.evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('none');
 await panel.getByRole('heading',{level:2}).hover();expect(await row.getAttribute('class')).not.toContain('is-active');
 await row.hover();expect(await slice.getAttribute('class')).toContain('is-active');
 await row.focus();expect(await slice.getAttribute('class')).toContain('is-active');
 await page.screenshot({path:'test-results/statistics-hover-1440.png',fullPage:true});
});
test('year statistics include actual data for all loaded years regardless of the selected year',async()=>{
 fixture.state.items=[2023,2024,2025,2026].map((year,i)=>deal(i+1,{ufCrmDate:`${year}-01-10`}));
 await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});
 await panel.locator('.statistics-trigger').click();
 await page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'}).getByRole('button',{name:'Կնքման տարի',exact:true}).click();
 expect(await panel.locator('.statistics-trigger').innerText()).toBe('Ըստ տարվա');
 expect(await panel.getByRole('columnheader').allTextContents()).toEqual(['Տարի','Քանակ','Տոկոս']);
 expect(await panel.getByRole('cell').allTextContents()).toEqual(['2023','1','25%','2024','1','25%','2025','1','25%','2026','1','25%']);
 expect(await panel.getByTestId('statistics-count').innerText()).toBe('4');
 expect(await panel.locator('svg g').count()).toBe(4);
});
test('short card labels, approximate total and horizontal full amount tooltip',async()=>{
 fixture.state.items=[deal(1,{opportunity:'4180000000',ufCrmDate:'2026-01-10'})];
 for(const width of [1440,375]){
  await page.setViewportSize({width,height:1200});await page.goto(url);await page.getByTestId('statistics-count').waitFor();
  const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});
  await expectGroupingSize(panel);
  expect(await panel.getByRole('heading',{name:'բնակարան',exact:true}).isVisible()).toBe(true);
  expect(await panel.getByRole('heading',{name:'ընդհանուր արժեք',exact:true}).isVisible()).toBe(true);
  for(const id of ['statistics-count','statistics-amount']){
   const value=await panel.getByTestId(id).boundingBox();
   const label=await panel.locator('article').filter({has:page.getByTestId(id)}).locator('h3').boundingBox();
   expect(value.y+value.height).toBeLessThanOrEqual(label.y);
  }
  const sizing=await panel.locator('.statistics-totals').evaluate(element=>{
   const values=[...element.querySelectorAll('[data-testid]')];
   const context=document.createElement('canvas').getContext('2d'),family=getComputedStyle(element).fontFamily;
   context.font=`600 12px ${family}`;const label=context.measureText('Ընդհանուր արժեք').width;
   context.font=`700 14px ${family}`;
   const originalWidth=Math.ceil(Math.max(label,...values.map(e=>context.measureText(e.textContent).width)))+18;
   return {width:element.getBoundingClientRect().width,originalWidth,sizes:values.map(e=>parseFloat(getComputedStyle(e).fontSize)),fits:values.every(e=>{
    const range=document.createRange();range.selectNodeContents(e);const text=range.getBoundingClientRect(),card=e.closest('article').getBoundingClientRect();
    return text.left>=card.left+8&&text.right<=card.right-8;
   })};
  });
  expect(sizing.width).toBe(sizing.originalWidth);expect(sizing.sizes[0]).toBe(sizing.sizes[1]);expect(sizing.sizes[0]).toBeGreaterThan(14);expect(sizing.fits).toBe(true);
  for(const heading of await panel.locator('article h3').all()){
   expect(await heading.evaluate(e=>e.getBoundingClientRect().height/parseFloat(getComputedStyle(e).lineHeight))).toBeCloseTo(1,0);
  }
  await expectPieInset(panel);
  const amount=panel.getByTestId('statistics-amount');expect(await amount.innerText()).toBe('~4,18 մլրդ ֏');
  await amount.hover();const tip=panel.getByRole('tooltip');await tip.waitFor();
  expect((await tip.innerText()).replace(/\s/g,' ')).toBe('4 180 000 000,00 ֏');
  const geometry=await tip.evaluate(e=>({height:e.getBoundingClientRect().height,line:parseFloat(getComputedStyle(e).lineHeight),whiteSpace:getComputedStyle(e).whiteSpace}));
  expect(geometry.whiteSpace).toBe('nowrap');expect(geometry.height).toBeCloseTo(geometry.line+12,0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/statistics-money-${width}.png`,fullPage:true});
 }
});
test('each legend marker uses its sector color, including during highlighting',async()=>{
 await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});
 for(const row of await panel.getByRole('table').locator('[data-key]').all()){
  const key=await row.getAttribute('data-key');const sector=panel.locator(`svg g[data-key="${key}"]`);
  await row.hover();
  expect(await sector.locator('path,circle').evaluate(e=>getComputedStyle(e).fill)).toBe(await row.locator('i').evaluate(e=>getComputedStyle(e).backgroundColor));
  expect(await sector.evaluate(e=>getComputedStyle(e).filter)).toBe('none');
 }
});

async function expectPieInset(panel){
 const gaps=await panel.locator('svg').evaluate(svg=>{
  const box=svg.getBoundingClientRect();
  const shapes=[...svg.querySelectorAll('path,circle')].map(e=>e.getBoundingClientRect());
  return [Math.min(...shapes.map(r=>r.left))-box.left,box.right-Math.max(...shapes.map(r=>r.right)),Math.min(...shapes.map(r=>r.top))-box.top,box.bottom-Math.max(...shapes.map(r=>r.bottom))];
 });
 for(const gap of gaps)expect(gap).toBeGreaterThan(4);
}

async function expectGroupingSize(panel){
 const button=panel.locator('.statistics-trigger');
 const box=await button.boundingBox();
 const reset=await page.getByRole('form',{name:'Զտիչներ',exact:true}).getByRole('button',{name:'Վերականգնել',exact:true}).boundingBox();
 expect(Math.abs(box.width-136.05)).toBeLessThan(.02);expect(box.height).toBe(reset.height);
 expect(box.height).toBe(32);
 const textFits=await button.evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);const text=range.getBoundingClientRect(),box=e.getBoundingClientRect();return text.left>=box.left&&text.right<=box.right-22;});
 expect(textFits).toBe(true);
}
test.each([1440,1920])('four largest intervals, expandable Other and equal legend spacing at %i',async width=>{
 fixture.state.items=[10,9,8,7,2,1].flatMap((count,index)=>Array.from({length:count},(_,i)=>deal(index*20+i+1,{ufCrmArea:String(index*10+1),opportunity:String((index+1)*10000000),ufCrmDate:'2026-01-10'})));
 await page.setViewportSize({width,height:1200});let requests=0;page.on('request',r=>{if(r.url().includes('/api/report'))requests++;});
 await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});
 const table=panel.getByRole('table');
 await expectLegendSpacing(panel,false);
 for(const label of ['Մակերես','Բն. Արժեք']){
  await panel.locator('.statistics-trigger').click();
  await page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'}).getByRole('button',{name:label,exact:true}).click();
  const other=table.getByRole('button',{name:'Այլ',exact:true});
  expect(await other.getAttribute('aria-expanded')).toBe('false');
  expect(await table.getByRole('row').count()).toBe(6);
  expect(await table.locator('[data-key=other]').getByRole('cell').allTextContents()).toEqual(['Այլ▾','3','8,1%']);
  expect(await panel.locator('svg g').count()).toBe(5);
  await expectTurquoiseOrder(panel);
  const amount=await panel.getByTestId('statistics-amount').innerText();
  await expectLegendSpacing(panel,true);
  await other.click();
  expect(await other.getAttribute('aria-expanded')).toBe('true');
  expect(await table.getByRole('row').count()).toBe(8);expect(await panel.locator('svg g').count()).toBe(6);
  await expectTurquoiseOrder(panel);
  expect(await table.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
  await expectLegendSpacing(panel,true);
  const child=table.locator('.statistics-other-child').first();const key=await child.getAttribute('data-key');
  await child.hover();expect(await panel.locator(`svg g[data-key="${key}"]`).getAttribute('class')).toContain('is-active');
  expect(await panel.getByTestId('statistics-count').innerText()).toBe('37');expect(await panel.getByTestId('statistics-amount').innerText()).toBe(amount);
  await other.focus();await page.keyboard.press('Space');
  expect(await other.getAttribute('aria-expanded')).toBe('false');expect(await panel.locator('svg g').count()).toBe(5);
  await page.keyboard.press('Enter');expect(await other.getAttribute('aria-expanded')).toBe('true');
  await page.screenshot({path:`test-results/statistics-other-${label==='Մակերես'?'area':'amount'}-${width}.png`,fullPage:true});
 }
 expect(requests).toBe(1);
 await page.setViewportSize({width:375,height:1200});
 await page.waitForFunction(()=>!document.querySelector('.report-top-panels').classList.contains('top-wide'));
 await page.screenshot({path:`test-results/statistics-other-narrow-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/statistics-other-narrow-${width}.png`,fullPage:true});
 await page.locator('#area-max').fill('25');
 expect(await table.getByRole('button',{name:'Այլ',exact:true}).count()).toBe(0);
 expect(await panel.getByTestId('statistics-count').innerText()).toBe('27');
 await page.locator('#area-max').fill('');
 expect(await table.getByRole('button',{name:'Այլ',exact:true}).getAttribute('aria-expanded')).toBe('false');
 expect(requests).toBe(1);
});
async function expectLegendSpacing(panel,withScrollbarGap){
 const geometry=await panel.evaluate(panel=>{
  const svg=panel.querySelector('.statistics-pie svg'),legend=panel.querySelector('.statistics-legend'),head=legend.querySelector('[role=row]');
  const pieRight=Math.max(...[...svg.querySelectorAll('path,circle')].map(e=>e.getBoundingClientRect().right));
  const cells=[...head.children].map(e=>e.getBoundingClientRect());
  const gap=head.getBoundingClientRect().left-pieRight;
  return {gap,firstColumns:cells[1].left-cells[0].right,columns:cells[2].left-cells[1].right,right:legend.getBoundingClientRect().right-(legend.offsetWidth-legend.clientWidth)-cells[2].right};
 });
 expect(Math.abs(geometry.firstColumns-10)).toBeLessThan(1);
 expect(Math.abs(geometry.columns-geometry.gap)).toBeLessThan(1);
 if(withScrollbarGap)expect(Math.abs(geometry.right-geometry.gap)).toBeLessThan(1);
}

async function expectTurquoiseOrder(panel){
 const slices=await panel.locator('svg g').evaluateAll(groups=>groups.map(g=>({count:Number(g.getAttribute('aria-label').match(/՝ (\d+),/)[1]),color:g.querySelector('path,circle').getAttribute('fill')})));
 const sorted=slices.sort((a,b)=>b.count-a.count);
 for(const slice of sorted)expect(slice.color).toMatch(/^(?:#00a387|hsl\(170 100% [\d.]+%\))$/);
 const lightness=slice=>slice.color==='#00a387'?32:Number(slice.color.match(/ ([\d.]+)%\)$/)[1]);
 expect(lightness(sorted[0])).toBe(32);expect(lightness(sorted.at(-1))).toBe(82);
 for(let i=1;i<sorted.length;i++)expect(lightness(sorted[i])).toBeGreaterThanOrEqual(lightness(sorted[i-1]));
 for(const slice of await panel.locator('svg g').all()){
  const key=await slice.getAttribute('data-key');
  expect(await slice.locator('path,circle').evaluate(e=>getComputedStyle(e).fill)).toBe(await panel.locator(`.statistics-legend [data-key="${key}"] i`).evaluate(e=>getComputedStyle(e).backgroundColor));
 }
}
