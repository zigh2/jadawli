#!/usr/bin/env python3
"""يدمج كود المنبهات الأصلي (مجلد native) في مشروع أندرويد الذي يولّده Capacitor.
يُشغَّل من جذر المشروع بعد `npx cap add android`. يفشل بوضوح إن لم تطابق بنية المانيفست المتوقعة."""
import json, os, re, shutil, sys
import xml.etree.ElementTree as ET

root = os.getcwd()
pkg = json.load(open(os.path.join(root, 'capacitor.config.json'), encoding='utf8'))['appId']
src = os.path.join(root, 'native')
app = os.path.join(root, 'android', 'app', 'src', 'main')
mf = os.path.join(app, 'AndroidManifest.xml')
if not os.path.isfile(mf):
    sys.exit('لم أجد android/app/src/main/AndroidManifest.xml — شغّل cap add android أولاً')

# 1) ملفات Java
jdir = os.path.join(app, 'java', *pkg.split('.'))
os.makedirs(jdir, exist_ok=True)
for f in sorted(os.listdir(os.path.join(src, 'java'))):
    t = open(os.path.join(src, 'java', f), encoding='utf8').read().replace('__PKG__', pkg)
    open(os.path.join(jdir, f), 'w', encoding='utf8').write(t)
    print('java ', f)

# 2) الموارد (أيقونة المنبّه وأيقونة الإشعار)
for d, _, files in os.walk(os.path.join(src, 'res')):
    for f in files:
        rel = os.path.relpath(os.path.join(d, f), os.path.join(src, 'res'))
        dst = os.path.join(app, 'res', rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy(os.path.join(d, f), dst)
        print('res  ', rel)

# 3) المانيفست
x = open(mf, encoding='utf8').read()
if 'LauncherNormal' in x:
    print('المانيفست مُعدَّل مسبقاً'); sys.exit(0)

launcher = re.compile(r'\s*<intent-filter>\s*<action android:name="android.intent.action.MAIN"\s*/>\s*<category android:name="android.intent.category.LAUNCHER"\s*/>\s*</intent-filter>', re.S)
if len(launcher.findall(x)) != 1:
    sys.exit('بنية المانيفست غير متوقعة: لم أجد مرشّح LAUNCHER واحداً')
x = launcher.sub('', x, count=1)

LF = '''<intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>'''
extra = f'''
        <!-- أيقونتان للتطبيق: العادية، و«المنبّه» (تُبدَّل من الإعدادات) -->
        <activity-alias
            android:name=".LauncherNormal"
            android:targetActivity=".MainActivity"
            android:enabled="true"
            android:exported="true"
            android:icon="@mipmap/ic_launcher"
            android:roundIcon="@mipmap/ic_launcher_round"
            android:label="@string/app_name">
            {LF}
        </activity-alias>
        <activity-alias
            android:name=".LauncherAlarm"
            android:targetActivity=".MainActivity"
            android:enabled="false"
            android:exported="true"
            android:icon="@mipmap/ic_alarm"
            android:roundIcon="@mipmap/ic_alarm"
            android:label="المنبّه">
            {LF}
        </activity-alias>

        <receiver android:name=".AlarmReceiver" android:exported="false" />
        <receiver android:name=".BootReceiver" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
'''
if x.count('</application>') != 1:
    sys.exit('بنية المانيفست غير متوقعة: </application>')
x = x.replace('</application>', extra + '    </application>', 1)

perms = ''.join(f'\n    <uses-permission android:name="android.permission.{p}" />' for p in
                ['POST_NOTIFICATIONS', 'USE_FULL_SCREEN_INTENT', 'RECEIVE_BOOT_COMPLETED', 'VIBRATE', 'WAKE_LOCK'])
anchor = '<uses-permission android:name="android.permission.INTERNET" />'
if x.count(anchor) != 1:
    sys.exit('بنية المانيفست غير متوقعة: صلاحية INTERNET')
x = x.replace(anchor, anchor + perms, 1)

ET.fromstring(x)           # يتأكد أن XML سليم
open(mf, 'w', encoding='utf8').write(x)
print('manifest patched:', pkg)
