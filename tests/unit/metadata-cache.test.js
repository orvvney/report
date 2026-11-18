const { createMetadataCache } = require('../../src/bitrix24/metadata-cache.cjs');
function transport() {
 const call = jest.fn(async (method, params) => ({ result: { method, params } }));
 call.batch = jest.fn(async commands => commands.map(command => ({ result: { method: command.method, params: command.params } })));
 return call;
}
test('shares directories across clients with exact parameters and portal isolation, never records', async () => {
 const cache = createMetadataCache(), raw = transport();
 const a = cache.wrap(raw, 'first'), b = cache.wrap(raw, 'first'), c = cache.wrap(raw, 'second');
 const params = { entityTypeId: 2, useOriginalUfNames: 'N' };
 const value = await a('crm.item.fields', params); value.result.params.entityTypeId = 99;
 expect((await b('crm.item.fields', { useOriginalUfNames: 'N', entityTypeId: 2 })).result.params.entityTypeId).toBe(2);
 expect(raw.batch).toHaveBeenCalledTimes(1);
 await c('crm.item.fields', params); await b('crm.item.fields', { ...params, useOriginalUfNames: 'Y' });
 expect(raw.batch).toHaveBeenCalledTimes(3);
 await a('crm.item.list', params); await b('crm.item.list', params); expect(raw).toHaveBeenCalledTimes(2);
});
test('coalesces overlapping single and batch directory reads and keeps result order', async () => {
 const cache=createMetadataCache(), raw=transport();let release;
 raw.batch.mockImplementationOnce(commands=>new Promise(resolve=>{release=()=>resolve(commands.map(command=>({result:command.method})));}));
 const a=cache.wrap(raw,'portal'), b=cache.wrap(raw,'portal');
 const pending=a.batch([{method:'crm.item.fields',params:{entityTypeId:2}},{method:'crm.type.list',params:{}}]);
 const duplicate=b('crm.item.fields',{entityTypeId:2});
 release();expect((await pending).map(row=>row.result)).toEqual(['crm.item.fields','crm.type.list']);
 expect((await duplicate).result).toBe('crm.item.fields');expect(raw.batch).toHaveBeenCalledTimes(1);
});
test('uses fixed expiry, evicts failures and partial null results, supports invalidation', async () => {
 let ms=0;const raw=transport(), cache=createMetadataCache({now:()=>new Date(ms),ttlMs:100});const call=cache.wrap(raw,'portal');
 await call('crm.type.list',{});ms=99;await call('crm.type.list',{});expect(raw.batch).toHaveBeenCalledTimes(1);
 ms=100;await call('crm.type.list',{});expect(raw.batch).toHaveBeenCalledTimes(2);
 cache.invalidate('portal');raw.batch.mockRejectedValueOnce(new Error('offline'));
 await expect(call('crm.type.list',{})).rejects.toThrow('offline');await call('crm.type.list',{});expect(raw.batch).toHaveBeenCalledTimes(4);
 cache.invalidate('portal');raw.batch.mockResolvedValueOnce([null]);expect(await call.batch([{method:'crm.type.list',params:{}}],{allowPartial:true})).toEqual([null]);
 await call('crm.type.list',{});expect(raw.batch).toHaveBeenCalledTimes(6);
});
