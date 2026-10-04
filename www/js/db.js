/* التخزين المحلي (IndexedDB) — يعمل بدون إنترنت */
const DB = (() => {
  let db;
  const rp = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const done = t => new Promise((ok, no) => { t.oncomplete = () => ok(); t.onerror = t.onabort = () => no(t.error); });
  const os = (n, m) => db.transaction(n, m || 'readonly').objectStore(n);
  const ck = (t, r, c) => t + '\u0001' + r + '\u0001' + c;
  return {
    open() {
      return new Promise((ok, no) => {
        const q = indexedDB.open('jadawli', 1);
        q.onupgradeneeded = () => {
          const d = q.result;
          d.createObjectStore('tables', { keyPath: 'id', autoIncrement: true });
          d.createObjectStore('cells', { keyPath: 'k' }).createIndex('t', 't');
          d.createObjectStore('meta', { keyPath: 'key' });
        };
        q.onsuccess = () => { db = q.result; ok(); };
        q.onerror = () => no(q.error);
      });
    },
    tables: () => rp(os('tables').getAll()),
    putTable: t => rp(os('tables', 'readwrite').put(t)),
    async delTable(id) {
      const keys = await rp(os('cells').index('t').getAllKeys(id));
      const tx = db.transaction(['tables', 'cells'], 'readwrite');
      tx.objectStore('tables').delete(id);
      keys.forEach(k => tx.objectStore('cells').delete(k));
      await done(tx);
    },
    async cells(tid) {
      const m = {};
      (await rp(os('cells').index('t').getAll(tid))).forEach(x => { (m[x.r] = m[x.r] || {})[x.c] = x.v; });
      return m;
    },
    setCell: (t, r, c, v) => rp(os('cells', 'readwrite').put({ k: ck(t, r, c), t, r, c, v })),
    /* عند إعادة تسمية سطر أو عمود تنتقل بياناته معه (rm / cm: Map قديم→جديد) */
    async renameCells(tid, rm, cm) {
      const all = await rp(os('cells').index('t').getAll(tid));
      const tx = db.transaction('cells', 'readwrite'), st = tx.objectStore('cells'), moved = [];
      all.forEach(x => {
        const r = rm.has(x.r) ? rm.get(x.r) : x.r, c = cm.has(x.c) ? cm.get(x.c) : x.c;
        if (r !== x.r || c !== x.c) { st.delete(x.k); moved.push({ k: ck(tid, r, c), t: tid, r, c, v: x.v }); }
      });
      moved.forEach(x => st.put(x));
      await done(tx);
    },
    async meta() {
      const o = {};
      (await rp(os('meta').getAll())).forEach(x => { o[x.key] = x.value; });
      return o;
    },
    setMeta: (key, value) => rp(os('meta', 'readwrite').put({ key, value })),
    async exportAll() {
      return {
        tables: await rp(os('tables').getAll()),
        cells: (await rp(os('cells').getAll())).map(({ t, r, c, v }) => ({ t, r, c, v }))
      };
    },
    async replaceAll(tables, cells) {
      const tx = db.transaction(['tables', 'cells'], 'readwrite');
      tx.objectStore('tables').clear();
      tx.objectStore('cells').clear();
      tables.forEach(t => tx.objectStore('tables').put(t));
      cells.forEach(x => tx.objectStore('cells').put({ k: ck(x.t, x.r, x.c), t: x.t, r: x.r, c: x.c, v: x.v }));
      await done(tx);
    }
  };
})();
if (typeof module !== 'undefined') module.exports = DB;
