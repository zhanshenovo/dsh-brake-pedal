"""
给演示视频配音效。

    python tools/video/sfx.py

读 assets/video/timeline.json（渲染器落的同一份时间轴），按拍点合成：
  - 每一脚落下：一记很轻的"嗒"（否则面板上的动画是哑的）
  - 第 3 脚断裂：金属脆响 + 低频闷响（全片唯一的重音）
  - 弹窗浮出：一记气声
  - 定版：一个干净的和弦收尾

输出 assets/video/sfx.wav，然后用 ffmpeg 合进 MP4：
    ffmpeg -i demo-9x16.mp4 -i sfx.wav -c:v copy -c:a aac -b:a 192k out.mp4
"""
import json
import math
import os
import random
import struct
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
VIDEO = os.path.join(ROOT, 'assets', 'video')
RATE = 48000

with open(os.path.join(VIDEO, 'timeline.json'), encoding='utf-8') as fh:
    TL = json.load(fh)

TOTAL = TL['totalMs'] / 1000.0
BEATS = TL['beats']

random.seed(20261008)
buf = [0.0] * int(TOTAL * RATE) + [0.0] * RATE


def mix(at, samples, gain=1.0):
    start = int(at * RATE)
    for i, value in enumerate(samples):
        idx = start + i
        if 0 <= idx < len(buf):
            buf[idx] += value * gain


def tick(dur=0.05, freq=1180.0, decay=90.0):
    n = int(dur * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        out.append(math.sin(2 * math.pi * freq * t) * math.exp(-decay * t) * 0.5)
    return out


def impact(dur=0.55):
    """金属脆响（带通噪声）+ 低频闷响（60Hz 下滑）。"""
    n = int(dur * RATE)
    out = []
    low = 0.0
    for i in range(n):
        t = i / RATE
        noise = random.uniform(-1.0, 1.0)
        # 一阶高通，把噪声里的低频剥掉，留下"脆"
        low = low * 0.72 + noise * 0.28
        bright = (noise - low) * math.exp(-26.0 * t)
        thump = math.sin(2 * math.pi * (66.0 - 22.0 * min(1.0, t / 0.2)) * t) * math.exp(-7.0 * t)
        out.append(bright * 0.55 + thump * 0.85)
    return out


def whoosh(dur=0.45):
    n = int(dur * RATE)
    out = []
    low = 0.0
    for i in range(n):
        t = i / RATE
        noise = random.uniform(-1.0, 1.0)
        low = low * 0.93 + noise * 0.07
        env = math.sin(math.pi * min(1.0, t / dur)) ** 2
        out.append((noise - low) * env * 0.18)
    return out


def chord(dur=1.6, freqs=(392.0, 523.25, 659.25)):
    n = int(dur * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        env = math.exp(-2.4 * t) * (1 - math.exp(-90 * t))
        value = sum(math.sin(2 * math.pi * f * t) for f in freqs) / len(freqs)
        out.append(value * env * 0.22)
    return out


# 拍序号 → 语义（和 timeline.mjs 的 BEATS 顺序一一对应）
IDX_APP_PULSE = 2
IDX_FOOT1 = 5
IDX_FOOT2 = 7
IDX_BREAK = 9
IDX_MODAL_IN = 11
IDX_CLEAN_MODAL = 19
IDX_END = 21


def at(index, offset=0.0):
    return BEATS[index]['start'] / 1000.0 + offset


mix(at(IDX_FOOT1, 0.42), tick(), 0.32)
mix(at(IDX_FOOT2, 0.42), tick(freq=1240.0), 0.32)
mix(at(IDX_BREAK, 0.44), impact(), 0.95)
mix(at(IDX_MODAL_IN, 0.05), whoosh(), 0.75)
mix(at(IDX_CLEAN_MODAL, 0.55), whoosh(dur=0.35), 0.5)
mix(at(IDX_END, 0.1), chord(), 0.9)
# 第 5、6 脚在"未复现"那一段落下
mix(at(IDX_CLEAN_MODAL, -1.35), tick(freq=1300.0), 0.22)

peak = max(1e-9, max(abs(v) for v in buf))
scale = 0.89 / peak
print('peak before normalise: %.3f  → scale %.3f' % (peak, scale))

path = os.path.join(VIDEO, 'sfx.wav')
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(RATE)
    frames = bytearray()
    for value in buf:
        s = int(max(-1.0, min(1.0, value * scale)) * 32767)
        frames += struct.pack('<hh', s, s)
    w.writeframes(bytes(frames))
print('wrote', path, '%.1fs' % TOTAL)
