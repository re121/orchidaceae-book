#!/usr/bin/env python3
"""ORCHIDACEAE PDF generator.
Concept: Renato Taboas Hidalgo. Code: Claude (Anthropic)."""

import argparse, json
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image

def generate(images_dir, output, specimens_path=None):
    specimens = json.load(open(specimens_path)) if specimens_path and Path(specimens_path).exists() else []
    images = sorted(Path(images_dir).glob("*.jpg")) + sorted(Path(images_dir).glob("*.png"))
    w, h = A4
    c = canvas.Canvas(output, pagesize=A4)
    c.setTitle("ORCHIDACEAE")
    c.setFont("Times-Roman", 11)
    tw = c.stringWidth("ORCHIDACEAE", "Times-Roman", 11)
    c.drawString((w - tw) / 2, h * 0.52, "ORCHIDACEAE")
    c.showPage()
    for i, img_path in enumerate(images):
        sp = specimens[i] if i < len(specimens) else {"taxon": img_path.stem}
        margin = 2.5 * cm
        with Image.open(img_path) as img:
            iw, ih = img.size
            r = min((w - 2*margin)/iw, (h - 2*margin - 1.8*cm)/ih)
            dw, dh = iw*r, ih*r
            c.drawImage(ImageReader(str(img_path)), (w-dw)/2, margin+1.8*cm+(h-2*margin-1.8*cm-dh)/2, dw, dh)
        c.setFont("Times-Italic", 8)
        c.drawString(margin, margin+1.2*cm, sp.get("taxon",""))
        c.showPage()
    c.save()
    print("Done:", output)

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--images", default="./images")
    p.add_argument("--output", default="orchidaceae.pdf")
    p.add_argument("--specimens", default="examples/specimens.json")
    a = p.parse_args()
    generate(a.images, a.output, a.specimens)
