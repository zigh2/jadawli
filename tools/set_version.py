#!/usr/bin/env python3
"""يحسب رقم الإصدار ويكتبه: اسم الإصدار v0.1-261014 (من version.json والتاريخ UTC)،
ورمز البناء versionCode = 300000000 + (الدقائق منذ 2026-01-01 UTC)، فهو متزايد مع الزمن دائماً بلا سقف عملي
وفريد لكل دقيقة، فتُقبل كل ترقية فوق النسخة السابقة.
الاستعمال:  python tools/set_version.py web      → يكتب www/js/version.js
            python tools/set_version.py gradle   → يعدّل android/app/build.gradle
            python tools/set_version.py print    → يطبع الاسم والرمز"""
import datetime, json, os, re, sys

root = os.getcwd()
v = json.load(open(os.path.join(root, 'version.json'), encoding='utf8'))
now = datetime.datetime.now(datetime.timezone.utc)
ymd = now.strftime('%y%m%d')
minutes = int((now - datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)).total_seconds() // 60)
name = f"v{v['major']}.{v['minor']}-{ymd}"
code = 300000000 + max(0, minutes)
mode = sys.argv[1] if len(sys.argv) > 1 else 'print'

if mode == 'web':
    open(os.path.join(root, 'www', 'js', 'version.js'), 'w', encoding='utf8').write(
        "window.JADAWLI_VERSION = " + json.dumps({'name': name, 'code': code, 'built': now.strftime('%Y-%m-%d %H:%M UTC')}, ensure_ascii=False) + ";\n")
elif mode == 'gradle':
    p = os.path.join(root, 'android', 'app', 'build.gradle')
    g = open(p, encoding='utf8').read()
    g, n1 = re.subn(r'versionCode\s+\d+', f'versionCode {code}', g, count=1)
    g, n2 = re.subn(r'versionName\s+"[^"]*"', f'versionName "{name}"', g, count=1)
    if n1 != 1 or n2 != 1:
        sys.exit('لم أجد versionCode/versionName في build.gradle')
    open(p, 'w', encoding='utf8').write(g)
print(name, code)
