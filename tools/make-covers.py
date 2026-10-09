"""
生成宣传用封面图（横版 16:9 / 竖版 9:16）。

    python tools/make-covers.py

输出到 assets/ 下。字体走系统里的微软雅黑 + Consolas，缺字体就直接报错，
不静默降级成方框 —— 封面图上的方框没人能救。
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets')
FONTS = r'C:\Windows\Fonts'

BG_TOP = (13, 16, 21)
BG_BOTTOM = (26, 31, 40)
CARD = (255, 255, 255)
LINE = (229, 230, 235)
FG = (31, 35, 41)
DIM = (78, 89, 105)
FAINT = (134, 144, 156)
GOOD = (26, 127, 55)
BAD = (207, 34, 46)
WHITE = (240, 243, 247)
MUTED = (154, 164, 178)
PILL_BG = (28, 33, 41)
PILL_LINE = (58, 66, 78)
PILL_FG = (203, 211, 221)


def font(name, size):
    path = os.path.join(FONTS, name)
    if not os.path.exists(path):
        raise SystemExit('缺少字体: ' + path)
    return ImageFont.truetype(path, size)


def gradient(size):
    w, h = size
    img = Image.new('RGB', size, BG_TOP)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(
            int(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    return img


def draw_wheel(d, cx, cy, r, colour, width):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=colour, width=width)
    d.ellipse([cx - r * 0.24, cy - r * 0.24, cx + r * 0.24, cy + r * 0.24], fill=colour)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        d.line([cx + math.cos(a) * r * 0.3, cy + math.sin(a) * r * 0.3,
                cx + math.cos(a) * r * 0.9, cy + math.sin(a) * r * 0.9],
               fill=colour, width=max(1, width - 1))


def panel_card(w, h, scale):
    """画一张和插件面板同构的卡片。"""
    card = Image.new('RGB', (w, h), CARD)
    d = ImageDraw.Draw(card)

    f_head = font('msyh.ttc', int(30 * scale))
    f_head_b = font('msyhbd.ttc', int(30 * scale))
    f_num = font('consolab.ttf', int(32 * scale))
    f_cjk = font('msyh.ttc', int(32 * scale))
    f_note = font('msyh.ttc', int(24 * scale))

    pad = int(36 * scale)
    y = int(30 * scale)

    r = max(3, int(7 * scale))
    d.ellipse([pad, y + int(12 * scale), pad + 2 * r, y + int(12 * scale) + 2 * r], fill=BAD)
    d.text((pad + 2 * r + int(14 * scale), y), '自检中止 · 第 3 脚断裂', font=f_head_b, fill=FG)
    right = '会话已运行 15m27s'
    d.text((w - pad - d.textlength(right, font=f_head), y + int(3 * scale)), right, font=f_head, fill=DIM)

    y += int(64 * scale)
    d.line([(0, y), (w, y)], fill=LINE, width=max(1, int(scale)))
    y += int(20 * scale)

    rows = [
        ('第 1 脚', '1,641 N', True, None, '运行 15m27s'),
        ('第 2 脚', '1,687 N', True, None, '日志 628 KB'),
        ('第 3 脚', '1,733 N', False, '砰 —— 支架断裂', '22:33 起'),
    ]
    x_no = pad
    x_force = pad + int(200 * scale)
    x_state = pad + int(452 * scale)
    for label, force, ok, broken, note in rows:
        colour = GOOD if ok else BAD
        d.text((x_no, y), label, font=f_cjk, fill=FAINT)
        d.text((x_force, y), force, font=f_num, fill=FG)
        mark = ('√ ' if ok else '× ') + ('踏板支架 完好' if ok else broken)
        d.text((x_state, y), mark, font=f_cjk, fill=colour)
        note_w = d.textlength(note, font=f_note)
        d.text((w - pad - note_w, y + int(6 * scale)), note, font=f_note, fill=FAINT)
        y += int(58 * scale)

    return card


def draw_pill(d, x, y, scale, f):
    label = '制动自检'
    tw = d.textlength(label, font=f)
    pad = int(17 * scale)
    w = int(pad * 2 + tw + 34 * scale)
    h = int(48 * scale)
    d.rounded_rectangle([x, y, x + w, y + h], radius=h // 2,
                        fill=PILL_BG, outline=PILL_LINE, width=max(1, int(scale * 1.5)))
    draw_wheel(d, x + pad + int(11 * scale), y + h // 2, int(11 * scale), PILL_FG, max(1, int(2 * scale)))
    d.text((x + pad + int(30 * scale), y + int(12 * scale)), label, font=f, fill=PILL_FG)
    return w, h


def draw_cover(size, s):
    w, h = size
    img = gradient(size)
    d = ImageDraw.Draw(img)

    title = font('msyhbd.ttc', s['title_px'])
    sub = font('msyh.ttc', s['sub_px'])
    big = font('msyhbd.ttc', s['big_px'])
    small = font('msyh.ttc', s['small_px'])
    pill_f = font('msyh.ttc', s['pill_px'])

    x = s['x']
    d.rectangle([x, s['title_y'] + int(s['title_px'] * 0.12), x + int(8 * s['k']),
                 s['title_y'] + int(s['title_px'] * 1.02)], fill=BAD)
    tx = x + int(30 * s['k'])
    d.text((tx, s['title_y']), '制动踏板自检', font=title, fill=WHITE)
    y2 = s['title_y'] + int(s['title_px'] * 1.3)
    d.text((tx, y2), '6 脚全力制动测试 · 断在第几脚是摇出来的', font=sub, fill=MUTED)
    d.text((tx, y2 + int(s['sub_px'] * 1.85)), '纯表演 —— 它一根手指都没碰过真正的停止键', font=sub, fill=MUTED)

    card = panel_card(s['card_w'], s['card_h'], s['scale'])
    img.paste(card, (s['card_x'], s['card_y']))

    # 大数字
    d.text((s['big_x'], s['big_y']), '1,733 N', font=big, fill=BAD)
    d.text((s['big_x'], s['big_y'] + int(s['big_px'] * 1.18)), '断裂瞬间的踏板力', font=small, fill=MUTED)

    # 入口提示：右下角那颗胶囊
    pw, ph = draw_pill(d, s['pill_x'], s['pill_y'], s['pill_scale'], pill_f)
    d.text((s['pill_x'] + pw + int(22 * s['pill_scale']), s['pill_y'] + int(13 * s['pill_scale'])),
           s['pill_caption'], font=small, fill=MUTED)

    for i, line in enumerate(s['foot']):
        d.text((x, s['foot_y'] + i * int(s['small_px'] * 1.75)), line, font=small, fill=FAINT)

    img.save(s['out'])
    print('wrote', s['out'], img.size)


def main():
    os.makedirs(OUT, exist_ok=True)

    draw_cover((1920, 1080), {
        'out': os.path.join(OUT, 'cover-16x9.png'),
        'x': 110, 'k': 1.0,
        'title_px': 92, 'sub_px': 34, 'big_px': 74, 'small_px': 27, 'pill_px': 26,
        'title_y': 88,
        'card_x': 110, 'card_y': 320, 'card_w': 1700, 'card_h': 312, 'scale': 1.0,
        'big_x': 1420, 'big_y': 700,
        'pill_x': 110, 'pill_y': 742, 'pill_scale': 1.0,
        'pill_caption': '右下角这颗就是入口，点开就是 6 脚测试',
        'foot_y': 928,
        'foot': [
            'DeepSeek Harness 客户端插件 · 彩蛋',
            '虚构段子：不指向任何真实企业、产品或事件，也不构成任何安全评价。',
        ],
    })

    draw_cover((1080, 1920), {
        'out': os.path.join(OUT, 'cover-9x16.png'),
        'x': 70, 'k': 1.0,
        'title_px': 86, 'sub_px': 33, 'big_px': 80, 'small_px': 27, 'pill_px': 26,
        'title_y': 240,
        'card_x': 70, 'card_y': 600, 'card_w': 940, 'card_h': 272, 'scale': 0.87,
        'big_x': 70, 'big_y': 990,
        'pill_x': 70, 'pill_y': 1220, 'pill_scale': 1.0,
        'pill_caption': '右下角这颗就是入口',
        'foot_y': 1560,
        'foot': [
            'DeepSeek Harness 客户端插件 · 彩蛋',
            '虚构段子：不指向任何真实企业、',
            '产品或事件，也不构成任何安全评价。',
        ],
    })


if __name__ == '__main__':
    main()
