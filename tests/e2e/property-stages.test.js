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
const group = (name) => page.locator('.property-stage-panels-inline').getByRole('region', { name });
const apartments = () => group('Բնակարաններն ըստ փուլերի');
const parking = () => group('Կայանատեղիներն ըստ փուլերի');
const counts = (block) => block.locator('.property-stage-value').evaluateAll(values => values.map(value => value.firstChild.textContent.trim()));
const stageNames = ['Ազատ', 'Ռեզերվ', 'Վաճառքի ընթացքում', 'Վաճառված'];

test.each([
  ['', apartments, parking, 'building', ['0','1','0','1']],
  ['#parking', parking, apartments, 'parking', ['1','0','0','0']],
])('stage panel shows only the matching inventory group in %s', async (hash, visible, hidden, name, totals) => {
  fixture.state.propertyItems.push(
    {id:2,categoryId:5,stageId:'DT177_5:0',ufCrmProperty:'72'},
    {id:3,categoryId:5,stageId:'DT177_5:1',ufCrmProperty:'71'},
  );
  await page.goto(`${url}/${hash}`);
  const block = visible();
  await block.locator('article').last().waitFor();
  await page.getByTestId('statistics-count').waitFor();
  expect(await hidden().count()).toBe(0);
  expect(await block.locator('h3').allTextContents()).toEqual(stageNames);
  expect(await counts(block)).toEqual(totals);
  const total = block.locator('.property-stages-total');
  expect(await total.innerText()).toBe(hash ? 'Ընդհանուր՝ 1' : 'Ընդհանուր՝ 2');
  const stageColors = ['rgb(229, 183, 38)', 'rgb(118, 131, 149)', 'rgb(54, 119, 192)', 'rgb(0, 127, 105)'];
  expect(await block.locator('article .property-stage-card-stripe').evaluateAll(stripes =>
    stripes.map(stripe => getComputedStyle(stripe).backgroundColor))).toEqual(stageColors);
  expect(await block.locator('article').evaluateAll(cards =>
    cards.map(card => getComputedStyle(card).backgroundColor))).toEqual(Array(4).fill('rgba(0, 0, 0, 0)'));
  expect(await block.locator('h3').evaluateAll(labels => labels.map(label => {
    const dot = getComputedStyle(label, '::before');
    return dot.content === 'none' ? null : dot.backgroundColor;
  }))).toEqual(stageColors);
  expect(await block.locator('.property-stage-track > button').evaluateAll(segments =>
    segments.map(segment => getComputedStyle(segment).backgroundColor))).toEqual(stageColors);
  expect(await block.locator('.property-stage-share').allTextContents()).toEqual(
    hash ? ['100%','0%','0%','0%'] : ['0%','50%','0%','50%']);
  const panelBox = await block.boundingBox();
  const header = await page.locator('.report-header').boundingBox();
  const filters = await page.locator('.report-top-panels').boundingBox();
  expect(panelBox.y).toBeCloseTo(header.y + header.height, 0);
  expect(panelBox.y + panelBox.height).toBeLessThan(filters.y);
  const icon = block.locator('h2 img');
  const asset = await icon.evaluate(async image => {
    await image.decode();
    return {url:image.src,width:image.naturalWidth,height:image.naturalHeight};
  });
  expect(new URL(asset.url).pathname).toMatch(new RegExp(`^/assets/${name}-[\\w-]+\\.avif$`));
  expect([asset.width, asset.height]).toEqual([512, 512]);
  expect((await page.request.get(asset.url)).headers()['content-type']).toBe('image/avif');
  const label = await block.locator('h2 span').boundingBox();
  const totalBox = await total.boundingBox();
  expect(totalBox.y).toBeCloseTo(label.y, 0);
  const iconBox = await icon.boundingBox();
  expect(iconBox).toMatchObject({width:20,height:20});
  expect(iconBox.x + iconBox.width).toBeLessThan(label.x);
  const distribution = block.locator('.property-stage-distribution');
  const distributionBox = await distribution.boundingBox();
  expect(distributionBox.height).toBe(20);
  const firstCard = block.locator('article').first();
  expect(distributionBox.y).toBeGreaterThan(label.y + label.height);
  expect(distributionBox.y + distributionBox.height).toBeLessThan((await firstCard.boundingBox()).y);
  const parts = await distribution.locator('button').evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().width));
  const proportions = hash ? [1,0,0,0] : [0,0.5,0,0.5];
  parts.forEach((width, i) => expect(width / distributionBox.width).toBeCloseTo(proportions[i], 3));
  const cardLabel = await firstCard.locator('h3').boundingBox();
  expect(cardLabel.y + cardLabel.height).toBeLessThanOrEqual((await firstCard.locator('p').boundingBox()).y);
  const help = block.getByRole('button', {name:'Փուլերի մասին'});
  await help.focus();
  const tooltip = block.getByRole('tooltip');
  await tooltip.waitFor();
  expect(await tooltip.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0.15s');
  expect((await tooltip.innerText()).trim()).toBe(hash
    ? 'Այս բաժինը նախատեսված է կայանատեղիների քանակն ու մասնաբաժինը յուրաքանչյուր փուլում դիտելու համար:'
    : 'Այս բաժինը նախատեսված է բնակարանների քանակն ու մասնաբաժինը յուրաքանչյուր փուլում դիտելու համար:');
  await help.press('Escape');
  await block.getByRole('tooltip').waitFor({state:'hidden'});
  const segment = distribution.getByRole('button', {name: hash ? 'Ազատ՝ 1, 100%' : 'Ռեզերվ՝ 1, 50%'});
  const segmentTooltip = distribution.getByRole('tooltip');
  await segment.hover();
  expect(await segmentTooltip.innerText()).toBe(hash ? 'Ազատ՝ 1, 100%' : 'Ռեզերվ՝ 1, 50%');
  expect(await segmentTooltip.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0.15s');
  await block.locator('h2').hover();
  await segmentTooltip.waitFor({state:'hidden'});
  await segment.focus();
  await segmentTooltip.waitFor();
  await segment.press('Escape');
  await segmentTooltip.waitFor({state:'hidden'});

  for (const width of [1440, 1024, 375, 320]) {
    await page.setViewportSize({width,height:900});
    const cards = await block.locator('article').evaluateAll(elements =>
      elements.map(element => {
        const {x, y, width, height} = element.getBoundingClientRect();
        return {x, y, width, height, align:getComputedStyle(element).textAlign};
      }));
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      expect(card.width).toBeCloseTo(cards[0].width, 1);
      expect(card.height).toBe(cards[0].height);
      expect(card.align).toBe('center');
    }
    await page.waitForFunction(() => {
      const stages = document.querySelector('.property-stage-panels-inline .property-stages');
      const form = document.querySelector('.filter-panel');
      const rect = (element, selector) => element.querySelector(selector).getBoundingClientRect();
      const stageTop = rect(stages, 'h2 span').top - stages.getBoundingClientRect().top;
      const filterTop = rect(form, '.filter-heading h2').top - form.getBoundingClientRect().top;
      const stageBottom = stages.getBoundingClientRect().bottom - rect(stages, 'article:last-child').bottom;
      const filterBottom = form.getBoundingClientRect().bottom - rect(form, '#amount-min').bottom;
      const card = stages.querySelector('article');
      const cardBox = card.getBoundingClientRect();
      const labelTop = rect(card, 'h3').top - cardBox.top;
      const valueBottom = cardBox.bottom - rect(card, '.property-stage-value').bottom;
      const stageGap = rect(stages, '.property-stage-distribution').top - rect(stages, 'h2').bottom;
      const filterGap = rect(form, 'legend').top - rect(form, '.filter-heading h2').bottom;
      const cardInsets = innerWidth < 640 ? [labelTop - valueBottom] : [labelTop - stageTop, valueBottom - stageTop];
      return [stageTop - filterTop, stageBottom - filterBottom, stageGap - filterGap,
        ...cardInsets].every(delta => Math.abs(delta) < 1);
    });
    const period = await page.locator('.filter-panel .date-filter select').first().boundingBox();
    const grouping = await page.locator('.statistics-trigger').boundingBox();
    expect(cards[0].x).toBeCloseTo(period.x, 0);
    expect(cards[3].x + cards[3].width).toBeCloseTo(grouping.x + grouping.width, 0);
    const columns = width < 640 ? 2 : 4;
    for (const [i, card] of cards.entries()) {
      const rowStart = Math.floor(i / columns) * columns;
      expect(card.y).toBeCloseTo(cards[rowStart].y, 0);
      expect(card.x).toBeCloseTo(cards[i % columns].x, 0);
      if (i % columns !== 0) expect(card.x - cards[i-1].x - cards[i-1].width).toBeCloseTo(width < 640 ? 6 : 20, 0);
    }
    if (columns === 2) {
      expect(cards[2].y - cards[0].y - cards[0].height).toBeCloseTo(6, 0);
      expect(cards[0].width).toBeGreaterThan(120);
      expect(await block.locator('article h3').evaluateAll(labels =>
        labels.map(label => getComputedStyle(label).fontSize))).toEqual(Array(4).fill('12px'));
      const content = await block.locator('article').evaluateAll(async cards => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return cards.map(card => {
          const frame = card.getBoundingClientRect();
          const heading = card.querySelector('h3');
          const label = heading.getBoundingClientRect();
          const number = card.querySelector('p').getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(heading.querySelector('span'));
          const lines = [...range.getClientRects()];
          const marker = getComputedStyle(heading, '::before');
          const dotRight = label.left + parseFloat(marker.width) + new DOMMatrixReadOnly(marker.transform).m41;
          return {
            offsets: [label.top - frame.top - (frame.bottom - number.bottom),
              label.x + label.width / 2 - (frame.x + frame.width / 2),
              number.x + number.width / 2 - (frame.x + frame.width / 2)],
            gaps: lines.map(line => line.left - dotRight),
            dotAlignment: getComputedStyle(heading).alignItems,
          };
        });
      });
      content.forEach(({offsets, gaps, dotAlignment}, i) => {
        offsets.forEach(offset => expect(Math.abs(offset)).toBeLessThan(1));
        expect(gaps.length).toBeLessThanOrEqual(i === 2 ? 2 : 1);
        expect(Math.min(...gaps)).toBeCloseTo(4, 0);
        expect(dotAlignment).toBe('center');
      });
    }
    const longLabel = await block.locator('article').nth(2).locator('h3 span').boundingBox();
    expect(cards[2].x + cards[2].width - longLabel.x - longLabel.width).toBeGreaterThan(0);
    expect((await total.boundingBox()).x + (await total.boundingBox()).width).toBeCloseTo(cards[3].x + cards[3].width, 0);
    expect(await block.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  }

  await page.getByRole('button',{name:'Հաշվետվությունների տեսակ',exact:true}).click();
  await page.getByRole('menuitem',{name:hash ? 'Կնքված բնակարաններ' : 'Կնքված կայանատեղիներ',exact:true}).click();
  await hidden().locator('article').last().waitFor();
  expect(await block.count()).toBe(0);
});

test.each([
  ['', 'Բնակարաններ', 1440],
  ['#parking', 'Կայանատեղիներ', 1440],
  ['', 'Բնակարաններ', 320],
  ['#parking', 'Կայանատեղիներ', 320],
])('stages pin with the inventory heading in %s at %s (%i px)', async (hash, title, width) => {
  await page.setViewportSize({width, height: 500});
  await page.goto(`${url}/${hash}`);
  const panels = page.locator('.property-stage-panels-inline');
  const floating = page.locator('#floating-property-stages');
  const caption = floating.getByRole('heading', { name: title, exact: true });
  await panels.locator('article').last().waitFor();
  await page.getByTestId('statistics-count').waitFor();
  await page.waitForFunction(() => document.querySelector('.report-page').style.getPropertyValue('--stage-bottom-inset') !== '');
  const originalCounts = await counts(panels);
  expect(await floating.isVisible()).toBe(false);
  const initial = await panels.boundingBox();
  const bottom = Math.ceil(initial.y + initial.height);

  await page.evaluate(y => window.scrollTo(0, y), bottom - 20);
  await page.waitForFunction(y => scrollY === y, bottom - 20);
  expect(await floating.isVisible()).toBe(false);

  await page.evaluate(y => window.scrollTo(0, y), bottom + 20);
  await page.waitForFunction(() => {
    const bar = document.querySelector('#floating-property-stages');
    return bar.getBoundingClientRect().top === 0 && getComputedStyle(bar).opacity === '1';
  });
  expect(await caption.innerText()).toBe(title);
  expect(await caption.locator('img').getAttribute('src')).toBe(await panels.locator('h2 img').getAttribute('src'));
  expect(await floating.getByRole('button', {name:'Փուլերի մասին'}).count()).toBe(0);
  expect(await floating.locator('.property-stage-share').count()).toBe(0);
  expect(await floating.locator('.property-stage-card-stripe').count()).toBe(0);
  const headingBox = await caption.boundingBox();
  const totalBox = await floating.locator('.property-stages-total').boundingBox();
  const center = headingBox.y + headingBox.height / 2;
  expect(totalBox.y + totalBox.height / 2).toBeCloseTo(center, 0);
  let previousRight = headingBox.x + headingBox.width;
  for (const stage of await floating.locator('article').all()) {
    const box = await stage.boundingBox();
    expect(box.x).toBeGreaterThan(previousRight);
    expect(box.y + box.height / 2).toBeCloseTo(center, 0);
    expect(await stage.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
    previousRight = box.x + box.width;
  }
  expect(totalBox.x).toBeGreaterThan(previousRight);
  if (width < 640) {
    expect(await floating.locator('.property-stages').evaluate(el => {
      el.scrollLeft = el.scrollWidth;
      return el.scrollLeft;
    })).toBeGreaterThan(0);
  }
  expect(await counts(floating)).toEqual(originalCounts);
  const scrolledPanel = await panels.boundingBox();
  expect(scrolledPanel.y + await page.evaluate(() => scrollY)).toBeCloseTo(initial.y, 0);
  expect(scrolledPanel.height).toBe(initial.height);

  await page.evaluate(y => window.scrollTo(0, y), bottom - 20);
  await floating.waitFor({state:'hidden'});
});

test('stage read failure leaves deal statistics visible and refreshing recovers', async () => {
  fixture.state.failPropertyStages = true;
  await page.goto(url);
  await apartments().getByRole('status').filter({hasText:'Տվյալներն անհասանելի են։'}).waitFor();
  expect(await apartments().locator('article').count()).toBe(0);
  await page.getByTestId('statistics-count').waitFor();
  fixture.state.failPropertyStages = false;
  await page.getByRole('button',{name:'Թարմացնել ամբողջ հաշվետվությունը',exact:true}).click();
  await apartments().locator('article').last().waitFor();
  expect(await counts(apartments())).toEqual(['0','0','0','1']);
});

test('a cold page combines independent directory reads without losing report or stage data', async () => {
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  server=createServer({...fixture,batchReads:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByTestId('statistics-count').waitFor();
  await apartments().locator('article').last().waitFor();
  expect((await counts(apartments())).at(-1)).toBe('1');
  expect(fixture.state.httpRequests.every(r=>r.method==='batch')).toBe(true);
  const {decodeCommand}=require('../support/crm-fixture.cjs');
  expect(fixture.state.httpRequests.some(r=>{
    const commands=Object.values(r.params.cmd).map(decodeCommand);
    return commands.some(([method])=>method==='crm.type.list')
      && commands.some(([,params])=>params.entityTypeId===2);
  })).toBe(true);
  fixture.state.failPropertyStages=true;
  await page.getByRole('button',{name:'Թարմացնել ամբողջ հաշվետվությունը',exact:true}).click();
  await apartments().getByRole('status').filter({hasText:'Տվյալներն անհասանելի են։'}).waitFor();
  await page.getByTestId('statistics-count').waitFor();
});
