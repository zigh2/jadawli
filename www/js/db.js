/* التخزين المحلي (IndexedDB) — يعمل بدون إنترنت */
const DB = (() => {
  let db;
  const rp = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const done = t => new Promise((ok, no) => { t.oncomplete = () => ok(); t.onerror = t.onabort = () => no(t.error); });
  const os = (n, m) => db.transaction(n, m || 'readonly').objectStore(n);
  const ck = (t, r, c) => t + '\u0001' + r + '\u0001' + c;
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return {
    open() {
      return new Promise((ok, no) => {
        const q = indexedDB.open('jadawli', 2);
        q.onupgradeneeded = e => {
          const d = q.result;
          if (e.oldVersion < 1) {
            d.createObjectStore('tables', { keyPath: 'id', autoIncrement: true });
            d.createObjectStore('cells', { keyPath: 'k' }).createIndex('t', 't');
            d.createObjectStore('meta', { keyPath: 'key' });
          }
          if (e.oldVersion < 2) d.createObjectStore('notes', { keyPath: 'k' }).createIndex('t', 't');
        };
        q.onsuccess = () => { db = q.result; ok(); };
        q.onerror = () => no(q.error);
      });
    },
    tables: () => rp(os('tables').getAll()),
    uid,
    putTable: t => { t.uid = t.uid || uid(); return rp(os('tables', 'readwrite').put(t)); },
    async delTable(id) {
      const keys = await rp(os('cells').index('t').getAllKeys(id)), nkeys = await rp(os('notes').index('t').getAllKeys(id));
      const tx = db.transaction(['tables', 'cells', 'notes'], 'readwrite');
      tx.objectStore('tables').delete(id);
      keys.forEach(k => tx.objectStore('cells').delete(k));
      nkeys.forEach(k => tx.objectStore('notes').delete(k));
      await done(tx);
    },
    async cells(tid) {
      const m = {};
      (await rp(os('cells').index('t').getAll(tid))).forEach(x => { (m[x.r] = m[x.r] || {})[x.c] = x.v; });
      return m;
    },
    setCell: (t, r, c, v) => rp(os('cells', 'readwrite').put({ k: ck(t, r, c), t, r, c, v, u: Date.now() })),
    /* عند إعادة تسمية سطر أو عمود تنتقل بياناته معه (rm / cm: Map قديم→جديد) */
    async renameCells(tid, rm, cm) {
      const all = await rp(os('cells').index('t').getAll(tid)), notes = await rp(os('notes').index('t').getAll(tid));
      const tx = db.transaction(['cells', 'notes'], 'readwrite'), st = tx.objectStore('cells'), ns = tx.objectStore('notes'), moved = [];
      notes.forEach(n => {
        if (n.kind !== 'row' || !rm.has(n.r)) return;
        const r = rm.get(n.r); ns.delete(n.k); ns.put({ ...n, r, k: `r|${tid}|${r}` });
      });
      all.forEach(x => {
        const r = rm.has(x.r) ? rm.get(x.r) : x.r, c = cm.has(x.c) ? cm.get(x.c) : x.c;
        if (r !== x.r || c !== x.c) { st.delete(x.k); moved.push({ k: ck(tid, r, c), t: tid, r, c, v: x.v }); }
      });
      moved.forEach(x => st.put(x));
      await done(tx);
    },
    async putCells(list) {
      const tx = db.transaction('cells', 'readwrite');
      list.forEach(x => tx.objectStore('cells').put({ k: ck(x.t, x.r, x.c), t: x.t, r: x.r, c: x.c, v: x.v, u: x.u || Date.now() }));
      await done(tx);
    },
    notes: t => rp(os('notes').index('t').getAll(t)),
    putNote: n => rp(os('notes', 'readwrite').put(n)),
    delNote: k => rp(os('notes', 'readwrite').delete(k)),
    async putNotes(list) {
      const tx = db.transaction('notes', 'readwrite');
      list.forEach(n => tx.objectStore('notes').put(n));
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
        cells: (await rp(os('cells').getAll())).map(({ t, r, c, v, u }) => ({ t, r, c, v, u })),
        notes: await rp(os('notes').getAll())
      };
    },
    async replaceAll(tables, cells, notes = []) {
      const tx = db.transaction(['tables', 'cells', 'notes'], 'readwrite');
      ['tables', 'cells', 'notes'].forEach(n => tx.objectStore(n).clear());
      tables.forEach(t => tx.objectStore('tables').put({ ...t, uid: t.uid || uid() }));
      cells.forEach(x => tx.objectStore('cells').put({ k: ck(x.t, x.r, x.c), t: x.t, r: x.r, c: x.c, v: x.v, u: x.u || Date.now() }));
      notes.forEach(n => tx.objectStore('notes').put(n));
      await done(tx);
    }
  };
})();
if (typeof module !== 'undefined') module.exports = DB;
