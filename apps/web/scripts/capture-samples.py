"""Captures genuine API responses used as miniatures on the landing page.

Run with the API on :3000 (SSRF_ALLOW_PRIVATE_NETWORKS=true SSRF_ALLOWED_PORTS='*')
and the test page of scripts/fixture served on :4100:

    node apps/web/scripts/fixture-server.mjs &
    python3 apps/web/scripts/capture-samples.py

It writes src/content/samples.ts and public/samples/*.webp. The page captured
is a local test page, shown on the site as "example.com": only the host name
is rewritten, every other value is what the API returned.
"""
import io, json, urllib.parse, urllib.request, datetime
from PIL import Image

API = 'http://localhost:3000/api/v1'
PAGE = 'http://127.0.0.1:4100/'
SHOWN = 'https://example.com/blog/launch'

def get(path, **params):
    url = f'{API}/{path}?' + urllib.parse.urlencode({'url': PAGE, **params})
    with urllib.request.urlopen(url) as response:
        return response.read(), dict(response.headers)

def clean(value):
    text = json.dumps(value)
    return json.loads(text.replace('http://127.0.0.1:4100/cover.svg', 'https://example.com/img/launch.png').replace('"http://127.0.0.1:4100/"', json.dumps(SHOWN)).replace('http://127.0.0.1:4100', 'https://example.com').replace('127.0.0.1:4100', 'example.com').replace('127.0.0.1', 'example.com'))

meta = clean(json.loads(get('meta', force='true')[0]))
content = clean(json.loads(get('content', force='true')[0]))
rules = {'title': {'selector': 'h1'}, 'price': {'selector': '.price', 'type': 'number'}, 'links': {'selector': 'nav a', 'attr': 'href', 'type': 'url', 'all': True}}
extract = clean(json.loads(get('extract', fields=json.dumps(rules), force='true')[0]))
pdf, pdf_headers = get('pdf', force='true')
shots = {}
for device in ('desktop', 'mobile'):
    raw, _ = get('screenshot', device=device, force='true')
    image = Image.open(io.BytesIO(raw)).convert('RGB')
    width = 560 if device == 'desktop' else 240
    image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    image = image.crop((0, 0, width, min(image.height, 350 if device == 'desktop' else 420)))
    image.save(f'apps/web/public/samples/screenshot-{device}.webp', 'WEBP', quality=72, method=6)
    image.save(f'apps/web/public/samples/screenshot-{device}.avif', 'AVIF', quality=55)
    shots[device] = {'width': image.width, 'height': image.height}

request = urllib.request.Request(f'{API}/meta/batch', data=json.dumps({'urls': [PAGE, 'http://127.0.0.1:1/']}).encode(), headers={'content-type': 'application/json'})
batch = clean(json.loads(urllib.request.urlopen(request).read()))

import re, subprocess

def api(path, **params):
    with urllib.request.urlopen(f'{API}/{path}?' + urllib.parse.urlencode(params)) as response:
        return response.read(), dict(response.headers)

def js(path, **params):
    return clean(json.loads(api(path, **params)[0]))['data']

IMAGE = PAGE + 'cover.png'
tech = js('tech', url=PAGE, render='never', force='true')
insights = js('insights', url=PAGE, force='true')
palette = js('palette', url=IMAGE, force='true')
image = js('image', url=IMAGE, force='true')
sitemap = js('sitemap', url=PAGE, force='true')
check = js('check', url=PAGE + 'go')  # /go -> 301 /launch -> 302 /
tables = js('tables', url=PAGE, force='true')
links = js('links', url=PAGE, force='true')
oembed = js('oembed', url=PAGE, force='true')
favicon = js('favicon', url=PAGE, force='true')
article = js('extract', url=PAGE, preset='article', force='true')
csv_text = api('tables', url=PAGE, format='csv', force='true')[0].decode()
html_bytes = len(api('html', url=PAGE, force='true')[0])

qr = api('qr', url='https://omnillink.kayzen-lyon.com', format='svg', margin='1')[0].decode()
with open('apps/web/public/samples/qr.svg', 'w') as out:
    out.write(qr)
og_raw = api('og', title='Launching the new editor', description='What changed in the editor, and how to migrate your documents.', site='Example Blog', force='true')[0]
og = Image.open(io.BytesIO(og_raw)).convert('RGB')
og_size = og.size
og.resize((480, round(og.height * 480 / og.width)), Image.LANCZOS).save('apps/web/public/samples/og.webp', 'WEBP', quality=78, method=6)
og.resize((480, round(og.height * 480 / og.width)), Image.LANCZOS).save('apps/web/public/samples/og.avif', 'AVIF', quality=60)
anim_raw = api('animation', url=PAGE, width='480', height='300', frames='4', delay='600', force='true')[0]
anim = Image.open(io.BytesIO(anim_raw))
frames = getattr(anim, 'n_frames', 1)
# The animation is kept as a small animated WebP: same frames, a fraction of the weight.
sequence = []
for index in range(frames):
    anim.seek(index)
    sequence.append(anim.convert('RGB').resize((320, 200), Image.LANCZOS))
sequence[0].save('apps/web/public/samples/animation.webp', 'WEBP', save_all=True, append_images=sequence[1:], duration=700, loop=0, quality=60, method=6)

def cli(*args):
    try:
        done = subprocess.run(['node', 'packages/cli/dist/bin.js', *args, '--base-url', 'http://localhost:3000', '--no-color'], capture_output=True, text=True, timeout=60)
        text = (done.stdout or done.stderr).strip()
    except Exception as error:  # the CLI is not built: no terminal sample
        return None
    text = re.sub(r'\x1b\[[0-9;]*m', '', text)
    return json.loads(json.dumps(text).replace('http://127.0.0.1:4100/cover.png', 'https://example.com/img/launch.png').replace('http://127.0.0.1:4100/', SHOWN).replace('http://127.0.0.1:4100', 'https://example.com').replace('127.0.0.1:4100', 'example.com'))

by_type = {name: value for name, value in insights['network']['byType'].items() if value['requests'] > 0}
data = meta['data']
extra = {
    'tech': [{k: t.get(k) for k in ('name', 'category', 'confidence', 'version', 'evidence')} for t in tech['technologies'][:3]],
    'insights': {'timings': insights['timings'], 'vitals': {k: insights['vitals'][k] for k in ('fcpMs', 'lcpMs', 'cls')}, 'requests': insights['network']['requests'], 'transferBytes': insights['network']['transferBytes'], 'byType': by_type, 'domElements': insights['dom']['elements'], 'device': insights['device']},
    'palette': [{'hex': c['hex'], 'population': c['population']} for c in palette['colors']],
    'image': {k: image[k] for k in ('format', 'width', 'height', 'bytes')},
    'sitemap': {'robotsFound': sitemap['robotsFound'], 'sitemaps': len(sitemap['sitemaps']), 'urlCount': sitemap['urlCount'], 'urls': [u['url'] for u in sitemap['urls'][:3]]},
    'check': {'status': check['status'], 'ok': check['ok'], 'chain': [hop['status'] for hop in check['redirects']], 'durationMs': check['durationMs'], 'contentType': check['contentType'], },
    'tables': {'caption': tables['tables'][0]['caption'], 'headers': tables['tables'][0]['headers'], 'rows': tables['tables'][0]['rows'], 'csv': csv_text.strip()},
    'links': {'total': links['total'], 'internal': links['internal'], 'external': links['external'], 'first': [{'url': l['url'], 'text': l['text'], 'internal': l['internal']} for l in links['links'][:3]]},
    'oembed': {k: oembed.get(k) for k in ('type', 'title', 'providerName', 'authorName', 'width', 'height')},
    'favicon': {k: favicon['icon'].get(k) for k in ('format', 'width', 'height', 'bytes', 'rel')},
    'article': {k: v for k, v in article['fields'].items() if v is not None},
    'html': {'bytes': html_bytes},
    'qr': {'bytes': len(qr)},
    'og': {'width': og_size[0], 'height': og_size[1], 'bytes': len(og_raw)},
    'animation': {'frames': frames, 'bytes': len(anim_raw)},
    'cli': {'meta': cli('meta', PAGE)},
}
data = meta['data']
samples = {
    'capturedOn': datetime.date.today().isoformat(),
    'meta': {k: data.get(k) for k in ('url', 'title', 'description', 'author', 'publisher', 'lang', 'date')} | {'source': meta['meta']['source']},
    'content': {'markdown': content['data']['markdown'][:420], 'wordCount': content['data']['wordCount'], 'readingTimeMinutes': content['data']['readingTimeMinutes']},
    'extract': {'rules': rules, 'fields': extract['data']['fields']},
    'pdf': {'bytes': len(pdf), 'contentType': pdf_headers.get('content-type', '')},
    'screenshot': shots,
    **extra,
    'batch': [{'url': item.get('url'), 'status': item.get('status'), 'title': (item.get('data') or {}).get('title'), 'code': item.get('code') or (item.get('error') or {}).get('code')} for item in batch['data']],
}
with open('apps/web/src/content/samples.ts', 'w') as out:
    out.write('// Generated by scripts/capture-samples.py from real API responses. Do not edit by hand.\n')
    out.write('export const SAMPLES = ' + json.dumps(samples, indent=2, ensure_ascii=False) + ' as const;\n')
# The OpenAPI document of the instance that produced the samples: the reference page lists
# every endpoint from it, so the documentation cannot drift from the API.
with urllib.request.urlopen(f'{API}/openapi.json') as response:
    spec = json.loads(response.read())
with open('apps/web/src/docs/openapi.snapshot.json', 'w') as out:
    json.dump({'info': spec['info'], 'paths': spec['paths']}, out, ensure_ascii=False, separators=(',', ':'))
print(json.dumps({k: samples[k] for k in ('tech', 'insights', 'check', 'cli', 'animation', 'og')}, indent=1, ensure_ascii=False)[:2600])
