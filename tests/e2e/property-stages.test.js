const { createServer } = require('../../server.js');
const { createFixture } = require('../support/crm-fixture.cjs');
const { STAGES } = require('../../src/report/property-stages.cjs');
let server, url, fixture;
beforeEach(async () => {
  fixture = createFixture({propertyStageNames: STAGES.map(name => name === 'Կնքված.' ? 'Կնքված․' : name), propertyItems: [{id:1,categoryId:5,stageId:'DT177_5:6',ufCrmProperty:'71'}]});
  server = createServer(fixture);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
test('eight equal squares sit between statistics and charts, wrap into rows on mobile, stay independent of filters and refresh', async () => {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(url);
  const block = page.locator('.property-stages');
  await block.locator('article').first().waitFor();
  expect(await block.locator('h3').allTextContents()).toEqual(STAGES);
  expect(await block.locator('article p').allTextContents()).toEqual(['0','0','0','0','0','0','1','0']);
  await block.screenshot({path:'test-results/property-stages-wide.png'});
  const cards = await block.locator('article').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  cards.forEach(card=>{expect(Math.abs(card.w-card.h)).toBeLessThan(1);expect(Math.abs(card.w-cards[0].w)).toBeLessThan(1);expect(card.y).toBe(cards[0].y);});
  const top = await page.locator('.report-top-panels').boundingBox(), row = await block.boundingBox(), chart = await page.locator('.deals-histogram').boundingBox();
  expect(row.y).toBeGreaterThan(top.y+top.height);
  expect(chart.y).toBeGreaterThan(row.y+row.height);
  await page.getByRole('form',{name:'Զտիչներ',exact:true}).getByRole('button',{name:'Հիլլս',exact:true}).click();
  expect(await block.locator('article p').nth(6).innerText()).toBe('1');
  for (const width of [375,320]) {
    await page.setViewportSize({width,height:900});
    await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
    expect(await block.locator('.property-stages-row').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await assertLabels();
    expect(await block.locator('article').last().isVisible()).toBe(true);
  }
  fixture.state.propertyItems=[];
  await page.getByRole('button',{name:'Թարմացնել ամբողջ հաշվետվությունը',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.property-stages article p').length===8 && [...document.querySelectorAll('.property-stages article p')].every(el=>el.textContent==='0'));
  fixture.state.failPropertyStages=true;
  await page.getByRole('button',{name:'Թարմացնել ամբողջ հաշվետվությունը',exact:true}).click();
  await block.getByRole('status').waitFor();
  await page.waitForFunction(()=>document.querySelector('.property-stages [role=status]')?.textContent==='Տվյալներն անհասանելի են։');
  expect(await block.locator('article').count()).toBe(0);
});

test('stage read failure is visible without clearing deal statistics and refresh recovers', async () => {
  fixture.state.failPropertyStages = true;
  await page.goto(url);
  await page.locator('.property-stages').getByRole('status').filter({hasText:'Տվյալներն անհասանելի են։'}).waitFor();
  await page.getByTestId('statistics-count').waitFor();
  expect(await page.locator('.property-stages article').count()).toBe(0);
  fixture.state.failPropertyStages = false;
  await page.getByRole('button',{name:'Թարմացնել ամբողջ հաշվետվությունը',exact:true}).click();
  await page.locator('.property-stages article').first().waitFor();
  expect(await page.locator('.property-stages article p').nth(6).innerText()).toBe('1');
});

test('smaller equal squares use aligned 12px labels and uniform 32px gaps at desktop widths', async () => {
  await page.goto(url);
  await page.getByTestId('statistics-count').waitFor();
  await page.locator('.property-stages article').first().waitFor();
  for (const width of [1100,1280,1440,1920]) {
    await page.setViewportSize({width,height:1000});
    await page.waitForFunction(()=>{
      const cards=document.querySelectorAll('.property-stages article');
      const period=document.querySelector('.filter-panel select');
      const total=document.querySelector('.statistics-totals article');
      if (!period || !total || cards.length!==8) return false;
      return Math.abs(cards[0].getBoundingClientRect().left-period.getBoundingClientRect().left)<1
        && Math.abs(cards[4].getBoundingClientRect().left-total.getBoundingClientRect().left)<1;
    });
    await assertLabels();
    const gaps=await page.locator('.property-stages article').evaluateAll(els=>els.slice(1).map((el,i)=>el.getBoundingClientRect().left-els[i].getBoundingClientRect().right));
    gaps.forEach((gap,i)=>expect(Math.abs(gap-32)).toBeLessThan(1));
    const divider=await page.locator('.filter-panel').boundingBox();
    const middle=divider.x+divider.width;
    const fourth=await page.locator('.property-stages article').nth(3).boundingBox();
    const fifth=await page.locator('.property-stages article').nth(4).boundingBox();
    expect(Math.abs(middle-fourth.x-fourth.width-16)).toBeLessThan(1);
    expect(Math.abs(fifth.x-middle-16)).toBeLessThan(1);
    const sizes=await page.locator('.property-stages article').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return [r.width,r.height,r.y];}));
    sizes.forEach(([w,h,y])=>{expect(Math.abs(w-h)).toBeLessThan(1);expect(Math.abs(w-sizes[0][0])).toBeLessThan(1);expect(y).toBe(sizes[0][2]);});
  }
});

async function assertLabels() {
  const labels=await page.locator('.property-stages h3').evaluateAll(els=>els.map(el=>{
    const range=document.createRange();range.selectNodeContents(el);
    const card=el.closest('article');
    return {lines:range.getClientRects().length,fits:el.scrollWidth<=el.clientWidth,font:getComputedStyle(el).fontSize,
      row:card.getBoundingClientRect().top,numberTop:card.querySelector('p').getBoundingClientRect().top,firstLineTop:range.getClientRects()[0].top};
  }));
  expect(labels).toHaveLength(8);
  labels.forEach(label=>{
    const reference=labels.find(other=>Math.abs(other.row-label.row)<1);
    expect(Math.abs(label.numberTop-reference.numberTop)).toBeLessThan(1);
    expect(Math.abs(label.firstLineTop-reference.firstLineTop)).toBeLessThan(1);
    expect(label.lines).toBeGreaterThanOrEqual(1);expect(label.lines).toBeLessThanOrEqual(2);expect(label.fits).toBe(true);expect(label.font).toBe('12px');});
}

test('a cold page combines independent directory reads without losing report or stage data', async () => {
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  server=createServer({...fixture,batchReads:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByTestId('statistics-count').waitFor();
  await page.locator('.property-stages article').first().waitFor();
  expect(await page.locator('.property-stages article p').nth(6).innerText()).toBe('1');
  expect(fixture.state.httpRequests.every(r=>r.method==='batch')).toBe(true);
  const {decodeCommand}=require('../support/crm-fixture.cjs');
  expect(fixture.state.httpRequests.some(r=>{
    const commands=Object.values(r.params.cmd).map(decodeCommand);
    return commands.some(([method])=>method==='crm.type.list')
      && commands.some(([,params])=>params.entityTypeId===2);
  })).toBe(true);
  fixture.state.failPropertyStages=true;
  await page.getByRole('button',{name:'Թարմացնել ամբողջ հաշվետվությունը',exact:true}).click();
  await page.locator('.property-stages').getByRole('status').filter({hasText:'Տվյալներն անհասանելի են։'}).waitFor();
  await page.getByTestId('statistics-count').waitFor();
});
