"""Independent check of public/data/meda/*.json against the raw PDS MEDA files in .cache/meda.

For every record the dashboard can show, it finds the raw CSV row with the same spacecraft
clock (SCLK), recomputes the value from the documented rule and the UTC from the label's
start/stop anchors, and confirms the quality rules. Run: python -I scripts/meda/verify_meda.py
"""
import csv
import glob
import json
import os
import re
import statistics
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, '.cache', 'meda')
OUT = os.path.join(ROOT, 'public', 'data', 'meda')


def label_anchors(xml_path):
    x = open(xml_path, encoding='latin-1').read()

    def tag(t):
        m = re.search(r'<(?:\w+:)?' + t + r'[^>]*>([^<]*)</', x)
        return m.group(1).strip()

    iso = lambda s: datetime.strptime(s.replace('Z', ''), '%Y-%m-%dT%H:%M:%S.%f').replace(tzinfo=timezone.utc).timestamp() * 1000
    return iso(tag('start_date_time')), iso(tag('stop_date_time')), float(tag('spacecraft_clock_start')), float(tag('spacecraft_clock_stop'))


def raw(code, sol):
    csv_path = glob.glob(os.path.join(CACHE, f'WE__{sol:04d}_*_{code}_*.CSV'))
    if not csv_path:
        return None, None
    rows = {float(r['SCLK']): r for r in csv.DictReader(open(csv_path[0], newline='', encoding='latin-1'))}
    return rows, label_anchors(csv_path[0][:-4] + '.xml')


def utc(anchors, sclk):
    u0, u1, s0, s1 = anchors
    return u0 + (sclk - s0) * (u1 - u0) / (s1 - s0)


failures = 0
checked = 0


def expect(cond, msg):
    global failures, checked
    checked += 1
    if not cond:
        failures += 1
        print('  FAIL', msg)


def num(s):
    return None if s is None or s.strip() == '' else float(s)


for path in sorted(glob.glob(os.path.join(OUT, 'sol_*.json'))):
    doc = json.load(open(path))
    sol = doc['sol']
    print(f'sol {sol}:')
    specs = [
        ('airTemperature', 'CAL_ATS', lambda r: statistics.median([num(r[f'ATS_LOCAL_TEMP{i}']) for i in (1, 2, 3) if num(r[f'ATS_LOCAL_TEMP{i}']) is not None])),
        ('groundTemperature', 'CAL_TIRS', lambda r: num(r['GROUND_TEMP'])),
        ('pressure', 'CAL_PS', lambda r: num(r['BAROCAP1_PRESSURE'])),
        ('windSpeed', 'DER_WS', lambda r: num(r['HORIZONTAL_WIND_SPEED'])),
    ]
    for key, code, value_of in specs:
        records = doc[key]
        rows, anchors = raw(code, sol)
        if rows is None:
            expect(len(records) == 0 and doc['products'][{'windSpeed': 'wind'}.get(key, key)] is None, f'{key}: no raw file, yet records were built')
            print(f'  {key}: product not in the archive for this sol (0 records) — confirmed')
            continue
        worst = 0.0
        worst_t = 0.0
        for rec in records:
            utc_ms, sclk, ltst, value = rec[0], rec[1], rec[2], rec[3]
            r = rows.get(float(sclk))
            expect(r is not None, f'{key} sol {sol}: SCLK {sclk} not in the raw file')
            if r is None:
                continue
            expect(r['LTST'] == ltst, f'{key} SCLK {sclk}: LTST {ltst} != raw {r["LTST"]}')
            want = value_of(r)
            expect(want is not None and value is not None and abs(want - value) <= 0.0015, f'{key} SCLK {sclk}: {value} != raw {want}')
            if want is not None and value is not None:
                worst = max(worst, abs(want - value))
            worst_t = max(worst_t, abs(utc(anchors, float(sclk)) - utc_ms))
            if key == 'groundTemperature':
                expect(r['TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW'] != '0' and r['ROVER_LOW_TILT'] != '0' and r['ROVER_STILL'] != '0' and r['WHEEL_OUTSIDE_TIRS_DOWNWARD_LOOKING_FOV'] != '0', f'ground SCLK {sclk}: a rejected record was kept')
            if key == 'windSpeed':
                expect(r['ROVER_STILL'] != '0', f'wind SCLK {sclk}: rover moving')
        print(f'  {key}: {len(records)} records match raw rows · max value difference {worst:.4f} (rounding) · max UTC difference {worst_t:.1f} ms')

print(f'\n{checked} checks, {failures} failures')
sys.exit(1 if failures else 0)
