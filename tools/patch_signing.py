#!/usr/bin/env python3
"""يضيف توقيع النسخة (release) إلى android/app/build.gradle من متغيرات البيئة:
JD_KEYSTORE (مسار الملف)، JD_STORE_PASS، JD_KEY_ALIAS، JD_KEY_PASS.
تُملأ في GitHub Actions من Secrets، فلا يُحفظ أي مفتاح في المستودع.
يُشغَّل من جذر المشروع بعد `npx cap add android`."""
import os, sys

need = ['JD_KEYSTORE', 'JD_STORE_PASS', 'JD_KEY_ALIAS', 'JD_KEY_PASS']
miss = [k for k in need if not os.environ.get(k)]
if miss:
    sys.exit('متغيرات التوقيع ناقصة: ' + ', '.join(miss))
if not os.path.isfile(os.environ['JD_KEYSTORE']):
    sys.exit('ملف المفتاح غير موجود: ' + os.environ['JD_KEYSTORE'])

p = os.path.join(os.getcwd(), 'android', 'app', 'build.gradle')
g = open(p, encoding='utf8').read()
if 'signingConfigs' in g:
    print('التوقيع مضاف مسبقاً'); sys.exit(0)

block = '''    signingConfigs {
        release {
            storeFile file(System.getenv("JD_KEYSTORE"))
            storePassword System.getenv("JD_STORE_PASS")
            keyAlias System.getenv("JD_KEY_ALIAS")
            keyPassword System.getenv("JD_KEY_PASS")
        }
    }
    lint { checkReleaseBuilds = false }   // فحص lint يبطّئ البناء ولا يفيد التثبيت الشخصي
'''
if g.count('    buildTypes {') != 1 or g.count('minifyEnabled false') != 1:
    sys.exit('بنية build.gradle غير متوقعة: لم أجد buildTypes/minifyEnabled مرة واحدة')
g = g.replace('    buildTypes {', block + '    buildTypes {', 1)
g = g.replace('minifyEnabled false', 'minifyEnabled false\n            signingConfig signingConfigs.release', 1)
open(p, 'w', encoding='utf8').write(g)
print('signing patched')
