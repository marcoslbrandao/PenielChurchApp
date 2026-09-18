# -*- coding: utf-8 -*-
"""
Materiais do QR code de visitantes da Peniel Church.

Duas peças, dois contextos de leitura muito diferentes:

  • PROJETOR (1920x1080) — visto de 10 a 20 metros, numa sala com luz baixa,
    por alguns segundos entre um aviso e outro. Fundo escuro, QR grande sobre
    branco, uma frase só. Tudo o que não for lido em três segundos é ruído.

  • A4 RETRATO (300 dpi) — lido a 40 cm, parado, na recepção. Aqui cabe
    explicar: os passos, o endereço, o app. Fundo claro porque impressora de
    igreja é jato de tinta, e uma página inteira de navy custa um cartucho.

O QR em si é o mesmo nos dois, e é sempre PRETO SOBRE BRANCO com margem
larga. Leitor de QR precisa de contraste alto e da zona de silêncio ao redor;
QR colorido ou invadido por arte é a forma mais comum de um cartaz bonito não
funcionar — e um que não funciona só se descobre no domingo.
"""

import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

URL = "https://marcoslbrandao.github.io/PenielChurchApp/visitante.html"

NAVY       = (26, 23, 64)
NAVY_2     = (45, 40, 112)
ROXO       = (123, 97, 255)
DOURADO    = (245, 200, 66)
DOURADO_E  = (200, 150, 10)
CREME      = (247, 244, 238)
BRANCO     = (255, 255, 255)
TEXTO      = (26, 26, 46)
TEXTO_S    = (107, 114, 128)

LOGO = "/mnt/user-data/uploads/Documents/GitHub/PenielChurchApp/assets/peniel-logo.png"
SAIDA = "/mnt/user-data/outputs"

F_BOLD    = "/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf"
F_REG     = "/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf"
F_ITAL    = "/usr/share/fonts/truetype/crosextra/Carlito-Italic.ttf"


def fonte(caminho, tam):
    return ImageFont.truetype(caminho, tam)


def qr_png(url, modulo_px, borda=4):
    """QR preto no branco. `border=4` é o mínimo da especificação — a zona de
    silêncio faz parte do código, não é margem estética."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=modulo_px,
        border=borda,
    )
    qr.add_data(url)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB")


def logo_em_disco(diametro):
    """O logo tem texto preto e um contorno escuro: sobre navy ele some. O
    disco branco não é enfeite — é o que o torna legível, e por sorte combina
    com o formato circular da marca."""
    disco = Image.new("RGBA", (diametro, diametro), (0, 0, 0, 0))
    d = ImageDraw.Draw(disco)
    d.ellipse([0, 0, diametro - 1, diametro - 1], fill=BRANCO + (255,))
    if os.path.exists(LOGO):
        logo = Image.open(LOGO).convert("RGBA")
        interno = int(diametro * 0.88)
        logo.thumbnail((interno, interno), Image.LANCZOS)
        disco.paste(logo, ((diametro - logo.width) // 2, (diametro - logo.height) // 2), logo)
    return disco


def gradiente(w, h, c1, c2):
    """Diagonal suave. Um fundo chapado num projetor grande fica morto; o
    gradiente dá profundidade sem competir com o QR."""
    base = Image.new("RGB", (w, h), c1)
    d = ImageDraw.Draw(base)
    for i in range(h):
        t = i / max(h - 1, 1)
        d.line([(0, i), (w, i)], fill=tuple(int(c1[k] + (c2[k] - c1[k]) * t) for k in range(3)))
    return base


def texto_centrado(d, y, txt, f, cor, largura):
    caixa = d.textbbox((0, 0), txt, font=f)
    d.text(((largura - (caixa[2] - caixa[0])) / 2 - caixa[0], y), txt, font=f, fill=cor)
    return caixa[3] - caixa[1]


def sombra(base, caixa, raio=26, desfoque=18, opacidade=70):
    """Sombra por camadas concêntricas — sem depender de filtro de blur, que
    numa imagem desta resolução custaria segundos."""
    from PIL import ImageFilter
    x0, y0, x1, y1 = caixa
    camada = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(camada)
    d.rounded_rectangle([x0, y0 + 8, x1, y1 + 14], radius=raio, fill=(0, 0, 0, opacidade))
    camada = camada.filter(ImageFilter.GaussianBlur(desfoque))
    base.alpha_composite(camada) if base.mode == "RGBA" else base.paste(
        Image.alpha_composite(base.convert("RGBA"), camada).convert("RGB"), (0, 0))


# ─────────────────────────────────────────────────────────────────────────────
# 1. PROJETOR — 1920 x 1080
# ─────────────────────────────────────────────────────────────────────────────
def projetor():
    W, H = 1920, 1080
    img = gradiente(W, H, NAVY, NAVY_2).convert("RGBA")
    d = ImageDraw.Draw(img)

    # Anéis decorativos, bem discretos: dão profundidade e não roubam o olho
    # do QR, que é a única coisa que precisa ser vista.
    anel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    da = ImageDraw.Draw(anel)
    for r, op in ((520, 16), (700, 11), (880, 7)):
        da.ellipse([-r + 190, H // 2 - r, r + 190, H // 2 + r], outline=DOURADO + (op,), width=3)
    img.alpha_composite(anel)

    # Faixa dourada no topo — o mesmo detalhe do cabeçalho do app.
    d.rectangle([0, 0, W, 9], fill=DOURADO)

    # ── Coluna esquerda ──────────────────────────────────────────────────
    x = 128
    disco = logo_em_disco(172)
    img.alpha_composite(disco, (x, 104))

    d.text((x, 306), "PENIEL CHURCH", font=fonte(F_BOLD, 32), fill=DOURADO)

    d.text((x, 352), "É a sua", font=fonte(F_BOLD, 96), fill=BRANCO)
    d.text((x, 452), "primeira vez", font=fonte(F_BOLD, 96), fill=BRANCO)
    d.text((x, 552), "aqui?", font=fonte(F_BOLD, 96), fill=DOURADO)

    d.text((x, 690),
           "Aponte a câmera do celular para o código",
           font=fonte(F_REG, 40), fill=(226, 222, 244))
    d.text((x, 742),
           "e deixe seu contato. Leva menos de um minuto.",
           font=fonte(F_REG, 40), fill=(226, 222, 244))

    d.text((x, 838), "Queremos dar as boas-vindas a você.",
           font=fonte(F_ITAL, 34), fill=DOURADO)

    # ── QR à direita, em cartão branco ───────────────────────────────────
    qr = qr_png(URL, 20)
    lado_qr = 560
    qr = qr.resize((lado_qr, lado_qr), Image.NEAREST)  # NEAREST mantém os módulos nítidos

    cart_l = lado_qr + 96
    cx, cy = W - cart_l - 128, (H - cart_l) // 2 + 10
    sombra(img, (cx, cy, cx + cart_l, cy + cart_l), raio=34, desfoque=26, opacidade=95)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([cx, cy, cx + cart_l, cy + cart_l], radius=34, fill=BRANCO)
    img.paste(qr, (cx + 48, cy + 48))

    # Rodapé
    d.text((x, H - 96), "penielchurch.org.uk", font=fonte(F_REG, 28), fill=(150, 144, 190))

    saida = os.path.join(SAIDA, "peniel-visitantes-projetor-1920x1080.png")
    img.convert("RGB").save(saida, "PNG", optimize=True)
    return saida


# ─────────────────────────────────────────────────────────────────────────────
# 2. A4 RETRATO — 300 dpi (2480 x 3508)
# ─────────────────────────────────────────────────────────────────────────────
def a4():
    W, H = 2480, 3508
    img = Image.new("RGBA", (W, H), CREME + (255,))
    d = ImageDraw.Draw(img)

    # Cabeçalho navy com o canto inferior arredondado — o mesmo gesto do topo
    # da página web, para o cartaz e a tela parecerem a mesma coisa.
    topo_h = 840
    cab = gradiente(W, topo_h, NAVY, NAVY_2).convert("RGBA")
    mascara = Image.new("L", (W, topo_h), 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, -120, W, topo_h], radius=110, fill=255)
    img.paste(cab, (0, 0), mascara)
    d.rectangle([0, 0, W, 14], fill=DOURADO)

    disco = logo_em_disco(250)
    img.alpha_composite(disco, ((W - 250) // 2, 150))

    d = ImageDraw.Draw(img)
    texto_centrado(d, 448, "PENIEL CHURCH", fonte(F_BOLD, 52), DOURADO, W)
    texto_centrado(d, 540, "Que bom ter você aqui", fonte(F_BOLD, 104), BRANCO, W)
    texto_centrado(d, 682, "Deixe seu contato para darmos as boas-vindas",
                   fonte(F_REG, 50), (208, 203, 236), W)

    # ── QR grande, centralizado ──────────────────────────────────────────
    qr = qr_png(URL, 24)
    lado_qr = 1100
    qr = qr.resize((lado_qr, lado_qr), Image.NEAREST)

    cart_l = lado_qr + 130
    cx, cy = (W - cart_l) // 2, 1000
    sombra(img, (cx, cy, cx + cart_l, cy + cart_l), raio=46, desfoque=30, opacidade=48)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([cx, cy, cx + cart_l, cy + cart_l], radius=46,
                        fill=BRANCO, outline=(232, 227, 216), width=3)
    img.paste(qr, (cx + 65, cy + 65))

    y = cy + cart_l + 110
    texto_centrado(d, y, "Aponte a câmera do seu celular", fonte(F_BOLD, 62), TEXTO, W)

    # ── Três passos ──────────────────────────────────────────────────────
    passos = [
        ("1", "Abra a câmera", "e aponte para o código acima"),
        ("2", "Toque no aviso", "que aparece na tela"),
        ("3", "Preencha seu nome", "e o WhatsApp — só isso"),
    ]
    py = y + 150
    col_w = (W - 340) // 3
    for i, (num, titulo, desc) in enumerate(passos):
        px = 170 + i * col_w
        centro = px + col_w // 2
        d.ellipse([centro - 46, py, centro + 46, py + 92], fill=NAVY)
        cb = d.textbbox((0, 0), num, font=fonte(F_BOLD, 54))
        d.text((centro - (cb[2] - cb[0]) / 2 - cb[0], py + 16), num,
               font=fonte(F_BOLD, 54), fill=DOURADO)
        for linha, (txt, f, cor) in enumerate([
            (titulo, fonte(F_BOLD, 44), TEXTO),
            (desc, fonte(F_REG, 38), TEXTO_S),
        ]):
            cb = d.textbbox((0, 0), txt, font=f)
            d.text((centro - (cb[2] - cb[0]) / 2 - cb[0], py + 128 + linha * 58),
                   txt, font=f, fill=cor)

    # ── O app, no espaço que sobrava ─────────────────────────────────────
    # Quem está parado na recepção lendo um cartaz é exatamente quem instala
    # um app de igreja. Deixar um quarto da página em branco desperdiça o
    # único momento em que essa pessoa tem tempo.
    ay = py + 300
    d.rounded_rectangle([170, ay, W - 170, ay + 310], radius=36,
                        fill=NAVY, outline=NAVY, width=2)
    texto_centrado(d, ay + 52, "Depois, leve a Peniel com você",
                   fonte(F_BOLD, 56), BRANCO, W)
    texto_centrado(d, ay + 134, "Agenda, devocional, mensagens e a Bíblia —",
                   fonte(F_REG, 40), (208, 203, 236), W)
    texto_centrado(d, ay + 190, "tudo no app Peniel Church, de graça.",
                   fonte(F_REG, 40), (208, 203, 236), W)
    texto_centrado(d, ay + 248, "Procure por \u201cPeniel Church\u201d na App Store ou Google Play",
                   fonte(F_BOLD, 36), DOURADO, W)

    # ── Rodapé ───────────────────────────────────────────────────────────
    ry = H - 300
    d.rounded_rectangle([170, ry, W - 170, ry + 178], radius=30,
                        fill=BRANCO, outline=(232, 227, 216), width=3)
    texto_centrado(d, ry + 36, "Sem celular à mão? Fale com alguém da recepção.",
                   fonte(F_REG, 40), TEXTO_S, W)
    texto_centrado(d, ry + 100, "Peniel Church · Abbey Square, Ashford, Kent",
                   fonte(F_BOLD, 40), NAVY, W)

    texto_centrado(d, H - 88, "penielchurch.org.uk", fonte(F_REG, 34), TEXTO_S, W)

    png = os.path.join(SAIDA, "peniel-visitantes-recepcao-A4.png")
    img.convert("RGB").save(png, "PNG", optimize=True)

    pdf = os.path.join(SAIDA, "peniel-visitantes-recepcao-A4.pdf")
    img.convert("RGB").save(pdf, "PDF", resolution=300.0)
    return png, pdf


if __name__ == "__main__":
    p = projetor()
    print("projetor:", p)
    a, b = a4()
    print("A4 png:", a)
    print("A4 pdf:", b)
    for f in (p, a, b):
        print("  ", os.path.basename(f), os.path.getsize(f) // 1024, "KB")
