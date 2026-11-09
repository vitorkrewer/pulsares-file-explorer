"""Gera os ícones oficiais do Pulsares (Explorer, DB Studio e Studio Editor)
baseado no emblema da Titlebar própria (gradiente azul/índigo #2563eb -> #4f46e5).
Gera tanto arquivos PNG de alta resolução quanto pacotes ICO multi-resolução para Windows.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter


def render_base_squircle(w: int) -> Image.Image:
    """Renderiza a base com gradiente azul/índigo, squircle arredondado e iluminação."""
    img = Image.new("RGBA", (w, w), (0, 0, 0, 0))

    # 1. Gradiente diagonal #2563eb (37, 99, 235) -> #4f46e5 (79, 70, 229)
    grad = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    grad_px = grad.load()
    c1 = (37, 99, 235)
    c2 = (79, 70, 229)
    for y in range(w):
        for x in range(w):
            t = (x + y) / (2.0 * (w - 1))
            r = int(c1[0] + (c2[0] - c1[0]) * t)
            g = int(c1[1] + (c2[1] - c1[1]) * t)
            b = int(c1[2] + (c2[2] - c1[2]) * t)
            grad_px[x, y] = (r, g, b, 255)

    # 2. Máscara de squircle / retângulo arredondado (igual ao brandIconWrap da Titlebar)
    pad = int(w * 0.055)
    radius = int(w * 0.235)
    mask = Image.new("L", (w, w), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([pad, pad, w - pad, w - pad], radius=radius, fill=255)

    # Sombra suave externa para destaque na barra de tarefas do Windows
    shadow = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(shadow)
    sh_offset = int(w * 0.022)
    sh_draw.rounded_rectangle(
        [pad, pad + sh_offset, w - pad, w - pad + sh_offset],
        radius=radius,
        fill=(15, 23, 42, 95),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=int(w * 0.028)))
    img = Image.alpha_composite(img, shadow)

    # Aplica o gradiente no formato arredondado
    base_box = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    base_box.paste(grad, (0, 0), mask)

    # Brilho sutil na borda superior interna
    border_layer = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(border_layer)
    b_draw.rounded_rectangle(
        [pad + 2, pad + 2, w - pad - 2, w - pad - 2],
        radius=radius - 2,
        outline=(255, 255, 255, 55),
        width=max(2, int(w * 0.008)),
    )
    base_box = Image.alpha_composite(base_box, border_layer)
    img = Image.alpha_composite(img, base_box)
    return img


def render_pulsares_icon(size: int = 512) -> Image.Image:
    """Ícone do Pulsares Explorer: Pasta branca moderna."""
    ss = 2
    w = size * ss
    img = render_base_squircle(w)

    icon_layer = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(icon_layer)

    stroke = int(w * 0.058)
    left = int(w * 0.235)
    right = int(w * 0.765)
    top_tab = int(w * 0.295)
    top_body = int(w * 0.375)
    bottom = int(w * 0.705)
    tab_right = int(w * 0.455)
    tab_slope = int(w * 0.515)
    corner_r = int(w * 0.055)

    poly_fill = [
        (left + corner_r // 2, top_tab),
        (tab_right, top_tab),
        (tab_slope, top_body),
        (right - corner_r // 2, top_body),
        (right, top_body + corner_r // 2),
        (right, bottom - corner_r // 2),
        (right - corner_r // 2, bottom),
        (left + corner_r // 2, bottom),
        (left, bottom - corner_r // 2),
        (left, top_tab + corner_r // 2),
    ]
    d.polygon(poly_fill, fill=(255, 255, 255, 34))

    pts = [
        (left, top_body),
        (left, top_tab + corner_r // 3),
        (left + corner_r // 3, top_tab),
        (tab_right, top_tab),
        (tab_slope, top_body),
        (right - corner_r // 3, top_body),
        (right, top_body + corner_r // 3),
        (right, bottom - corner_r // 3),
        (right - corner_r // 3, bottom),
        (left + corner_r // 3, bottom),
        (left, bottom - corner_r // 3),
        (left, top_body),
    ]
    d.line(pts, fill=(255, 255, 255, 255), width=stroke, joint="curve")
    for px, py in pts:
        r_cap = stroke // 2
        d.ellipse([px - r_cap, py - r_cap, px + r_cap, py + r_cap], fill=(255, 255, 255, 255))

    d.line(
        [(left + stroke // 2, top_body + int(w * 0.075)), (right - stroke // 2, top_body + int(w * 0.075))],
        fill=(255, 255, 255, 160),
        width=max(2, int(stroke * 0.55)),
    )

    img = Image.alpha_composite(img, icon_layer)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def render_dbstudio_icon(size: int = 512) -> Image.Image:
    """Ícone do Pulsares DB Studio: Cilindro de Banco de Dados / SQLite."""
    ss = 2
    w = size * ss
    img = render_base_squircle(w)

    icon_layer = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(icon_layer)

    stroke = int(w * 0.054)
    cx = w // 2
    rx = int(w * 0.235)
    ry = int(w * 0.092)

    y_top = int(w * 0.32)
    y_mid = int(w * 0.49)
    y_bot = int(w * 0.66)

    # Preenchimento suave do disco do topo
    d.ellipse([cx - rx, y_top - ry, cx + rx, y_top + ry], fill=(255, 255, 255, 36))

    # Elipse do topo
    d.ellipse([cx - rx, y_top - ry, cx + rx, y_top + ry], outline=(255, 255, 255, 255), width=stroke)

    # Paredes laterais
    d.line([(cx - rx, y_top), (cx - rx, y_bot)], fill=(255, 255, 255, 255), width=stroke)
    d.line([(cx + rx, y_top), (cx + rx, y_bot)], fill=(255, 255, 255, 255), width=stroke)

    # Disco do meio (arco inferior 0 a 180 graus)
    d.arc([cx - rx, y_mid - ry, cx + rx, y_mid + ry], start=0, end=180, fill=(255, 255, 255, 255), width=stroke)

    # Disco da base (arco inferior 0 a 180 graus)
    d.arc([cx - rx, y_bot - ry, cx + rx, y_bot + ry], start=0, end=180, fill=(255, 255, 255, 255), width=stroke)

    # Caps nas junções laterais para suavizar encontros
    r_cap = stroke // 2
    for px in (cx - rx, cx + rx):
        for py in (y_top, y_mid, y_bot):
            d.ellipse([px - r_cap, py - r_cap, px + r_cap, py + r_cap], fill=(255, 255, 255, 255))

    img = Image.alpha_composite(img, icon_layer)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def render_studio_icon(size: int = 512) -> Image.Image:
    """Ícone do Pulsares Studio Editor: Código < / > moderno."""
    ss = 2
    w = size * ss
    img = render_base_squircle(w)

    icon_layer = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(icon_layer)

    stroke = int(w * 0.054)
    cx = w // 2
    cy = w // 2

    # Bracket esquerdo <
    left_tip = (cx - int(w * 0.25), cy)
    left_top = (cx - int(w * 0.11), cy - int(w * 0.15))
    left_bot = (cx - int(w * 0.11), cy + int(w * 0.15))
    d.line([left_top, left_tip, left_bot], fill=(255, 255, 255, 255), width=stroke, joint="curve")

    # Bracket direito >
    right_tip = (cx + int(w * 0.25), cy)
    right_top = (cx + int(w * 0.11), cy - int(w * 0.15))
    right_bot = (cx + int(w * 0.11), cy + int(w * 0.15))
    d.line([right_top, right_tip, right_bot], fill=(255, 255, 255, 255), width=stroke, joint="curve")

    # Barra inclinada central /
    slash_top = (cx + int(w * 0.055), cy - int(w * 0.20))
    slash_bot = (cx - int(w * 0.055), cy + int(w * 0.20))
    d.line([slash_bot, slash_top], fill=(255, 255, 255, 255), width=stroke)

    # Caps arredondadas
    r_cap = stroke // 2
    for px, py in (left_top, left_tip, left_bot, right_top, right_tip, right_bot, slash_top, slash_bot):
        d.ellipse([px - r_cap, py - r_cap, px + r_cap, py + r_cap], fill=(255, 255, 255, 255))

    img = Image.alpha_composite(img, icon_layer)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    build_win = root / "build" / "windows"
    build_dir = root / "build"
    platform_icons = root / "internal" / "platform" / "icons"

    for d in (build_win, build_dir, platform_icons):
        d.mkdir(parents=True, exist_ok=True)

    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]

    targets = [
        ("Explorer", render_pulsares_icon, "icon.ico", "appicon.png", "icon-explorer.ico"),
        ("DB Studio", render_dbstudio_icon, "icon-dbstudio.ico", "appicon-dbstudio.png", "icon-dbstudio.ico"),
        ("Studio Editor", render_studio_icon, "icon-studio.ico", "appicon-studio.png", "icon-studio.ico"),
    ]

    for name, render_func, ico_name, png_name, platform_ico_name in targets:
        img = render_func(512)
        # Salva PNG de alta resolução
        img.save(build_dir / png_name, format="PNG")
        # Salva ICO multi-resolução no build/windows
        ico_file = build_win / ico_name
        img.save(ico_file, format="ICO", sizes=ico_sizes)
        # Salva ICO em internal/platform/icons para embed no binário Go
        internal_ico = platform_icons / platform_ico_name
        img.save(internal_ico, format="ICO", sizes=ico_sizes)
        print(f"[icon] {name} gerado com sucesso:\n  - {ico_file}\n  - {internal_ico}")


if __name__ == "__main__":
    main()


