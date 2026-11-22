const {createServer}=require('../../server.js');
const {createFixture,deal}=require('../support/crm-fixture.cjs');
const {fixture:expoFixture}=require('../support/expo-fixture.cjs');
let server, releases=[];
function gate(){let release;const promise=new Promise(resolve=>{release=resolve;});releases.push(release);return {promise,release};}
async function start(options){server=createServer(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;}
afterEach(async()=>{releases.forEach(release=>release());releases=[];server?.closeAllConnections();if(server?.listening)await new Promise(resolve=>server.close(resolve));});
test.each(['apartments','parking'])('%s paints statistics and charts while header stages load, with details only on expansion',async(section)=>{
 const stageGate=gate(),contacts=gate();let stageStarted;
 const stageRead=new Promise(resolve=>{stageStarted=resolve;});
 const fixture=createFixture({items:[deal(1,{contactId:8,ufCrmProperty:section==='parking'?'72':'71'})],contacts:[{id:8,name:'Անի',lastName:'Պետրոսյան'}],contactGate:contacts.promise});
 const base=await start({...fixture,fetchImpl:async(url,options)=>{
  const params=JSON.parse(options.body);
  if(params.cmd&&Object.values(params.cmd).some(command=>command.startsWith('crm.type.list?'))){stageStarted();await stageGate.promise;}
  return fixture.fetchImpl(url,options);
 }});
 await page.goto(`${base}/${section==='parking'?'#parking':''}`);
 await page.getByTestId('statistics-count').waitFor();await stageRead;
 expect(await page.getByTestId('statistics-count').innerText()).toBe('1');
 expect(await page.locator('.filter-panel select').first().isEnabled()).toBe(true);
 await page.getByTestId('histogram-kpi-value').waitFor();
 expect(await page.locator('.property-stage-panels-inline article').count()).toBe(0);
 expect(fixture.state.requests.filter(r=>r.params.entityTypeId===3)).toHaveLength(0);
 stageGate.release();await page.locator('.property-stage-panels-inline .property-stages article').last().waitFor();
 expect(fixture.state.requests.filter(r=>r.params.entityTypeId===3)).toHaveLength(0);
 const request=page.waitForRequest(r=>new URL(r.url()).searchParams.get('view')==='details');
 await page.getByRole('button',{name:'Գործարքների ցանկ',exact:true}).click();await request;
 expect(await page.getByTestId('statistics-count').innerText()).toBe('1');expect(await page.locator('.deals-list table').count()).toBe(0);
 contacts.release();await page.locator('.deals-list tbody tr').first().waitFor();
 expect(await page.locator('.deals-list tbody a').first().innerText()).toContain('Անի');
 const reads=fixture.state.requests.length;
 await page.getByRole('button',{name:'Գործարքների ցանկ',exact:true}).click();await page.getByRole('button',{name:'Գործարքների ցանկ',exact:true}).click();
 expect(fixture.state.requests).toHaveLength(reads);
});
test('Expo paints totals before historical comparison and waits for expansion before contact reads',async()=>{
 const f=expoFixture(3),history=gate(),contacts=gate();let historyStarted;
 const contactReads=()=>f.requests.filter(r=>r.method==='crm.item.list'&&r.params.entityTypeId===3);
 const historyRead=new Promise(resolve=>{historyStarted=resolve;});
 const original=f.options.fetchImpl;
 const {decodeCommand}=require('../support/crm-fixture.cjs');
 const base=await start({...f.options,fetchImpl:async(url,options)=>{
  const params=JSON.parse(options.body);const commands=params.cmd?Object.values(params.cmd).map(decodeCommand):[[url.split('/').at(-1).replace('.json',''),params]];
  if(commands.some(([method,p])=>method==='crm.deal.list'&&p.filter?.['>=DATE_CREATE'])){historyStarted();await history.promise;}
  if(commands.some(([method,p])=>method==='crm.item.list'&&p.entityTypeId===3))await contacts.promise;
  return original(url,options);
 }});
 await page.goto(`${base}/#toon-expo`);await page.getByTestId('expo-leads').waitFor();await historyRead;
 expect(await page.getByTestId('expo-direct-deals').innerText()).toBe('1');
 expect(await page.getByTestId('expo-comparison-value').count()).toBe(0);
 expect(contactReads()).toHaveLength(0);
 history.release();await page.getByTestId('expo-comparison-value').first().waitFor();
 expect(contactReads()).toHaveLength(0);
 const request=page.waitForRequest(r=>new URL(r.url()).searchParams.get('view')==='details');
 await page.locator('.expo-desktop-toggle').click();await request;
 expect(await page.getByTestId('expo-leads').isVisible()).toBe(true);
 contacts.release();await page.getByRole('link',{name:'Անի Պետրոսյան',exact:true}).waitFor();
 await page.locator('.expo-desktop-toggle').click();
 const contactsBefore=contactReads().length;
 const response=page.waitForResponse(r=>new URL(r.url()).searchParams.get('view')==='summary');
 await page.getByRole('button',{name:'Թարմացնել ամբողջ հաշվետվությունը',exact:true}).click();await response;
 await page.waitForFunction(()=>document.querySelector('.report-header .refresh-button')?.disabled===false);
 expect(contactReads()).toHaveLength(contactsBefore);
});
