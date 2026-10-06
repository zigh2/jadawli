#!/usr/bin/env python3
"""تحويل database.sqlite من الموقع القديم إلى ملف JSON يستورده تطبيق «جداولي».
الاستخدام:
  python convert_db.py database.sqlite out.json            # كل الجداول
  python convert_db.py database.sqlite out.json 1 5        # جداول محددة بالمعرّف (id)
لا يُصدَّر أي شيء من جدول المستخدمين (أسماء أو كلمات سر)."""
import json, sqlite3, sys

# مجموعات مقترحة بحسب أسماء الأعمدة (تُعرض كعناوين في البطاقات). عدّلها من شاشة تعديل الجدول.
GROUPS = {
    'الصلوات': ['فجر', 'ظهر', 'عصر', 'مغرب', 'عشاء', 'صلاة بأول الوقت', 'سنن 12 ركعة'],
    'الأوراد': ['ورد قرآن', 'ورد ذكر'],
    'الأعمال المنزلية': ['ترتيب', 'مطبخ', 'طبخ', 'أرض', 'ثياب'],
}
G_OF = {c: g for g, cs in GROUPS.items() for c in cs}

def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src, out, ids = sys.argv[1], sys.argv[2], {int(x) for x in sys.argv[3:]}
    db = sqlite3.connect(f'file:{src}?mode=ro', uri=True)
    tables, cells = [], []
    for tid, title, cols, rows, keys, tpl in db.execute(
            'SELECT id,title,columns_def,fixed_rows,key_columns,is_template FROM tables ORDER BY id'):
        if ids and tid not in ids:
            continue
        columns = [{'name': c['name'], 'type': c.get('type', 'text'), 'width': str(c.get('width') or ''),
                    'options': c.get('options') or '', 'group': G_OF.get(c['name'], '')}
                   for c in json.loads(cols)]
        tables.append({'id': tid, 'title': title, 'isTemplate': bool(tpl), 'columns': columns,
                       'rows': json.loads(rows), 'keyCols': [k.strip() for k in (keys or '').split(',') if k.strip()]})
        for r, c, v in db.execute('SELECT row_key,col_key,cell_value FROM table_data WHERE table_id=?', (tid,)):
            if v not in (None, ''):          # القيم الفارغة لا قيمة لها
                cells.append({'t': tid, 'r': r, 'c': c, 'v': str(v)})
    json.dump({'app': 'jadawli', 'v': 1, 'tables': tables, 'cells': cells}, open(out, 'w', encoding='utf8'), ensure_ascii=False)
    print(f'{len(tables)} جدول، {len(cells)} خلية → {out}')

main()
