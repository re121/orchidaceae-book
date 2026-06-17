#!/usr/bin/env python3
"""ORCHIDACEAE EPUB generator.
Concept: Renato Taboas Hidalgo. Code: Claude (Anthropic)."""

import argparse, json
from pathlib import Path
from ebooklib import epub

def generate(images_dir, output, specimens_path=None):
    specimens = json.load(open(specimens_path)) if specimens_path and Path(specimens_path).exists() else []
    images = sorted(Path(images_dir).glob("*.jpg")) + sorted(Path(images_dir).glob("*.png"))
    book = epub.EpubBook()
    book.set_title("ORCHIDACEAE")
    book.add_author("Renato Taboas Hidalgo")
    css = epub.EpubItem(uid="style", file_name="style.css", media_type="text/css",
        content=b"body{font-family:serif;background:#fff;margin:2em} img{max-width:100%;display:block;margin:0 auto} .taxon{font-style:italic;font-size:0.8em} .coords{color:#666;font-size:0.7em}")
    book.add_item(css)
    spine = ["nav"]
    for i, img_path in enumerate(images):
        sp = specimens[i] if i < len(specimens) else {"taxon": img_path.stem}
        img_item = epub.EpubItem(uid=f"img{i}", file_name=f"img{i}{img_path.suffix}",
            media_type="image/jpeg", content=open(img_path,"rb").read())
        book.add_item(img_item)
        taxon = sp.get("taxon","")
        coords = sp.get("coordinates","") + " " + sp.get("origin","")
        ch = epub.EpubHtml(title=taxon, file_name=f"p{i}.xhtml")
        ch.content = f'''<html><body><img src="img{i}{img_path.suffix}" alt="{taxon}"/><p class="taxon">{taxon}</p><p class="coords">{coords}</p></body></html>'''
        ch.add_item(css)
        book.add_item(ch)
        spine.append(ch)
    book.spine = spine
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    epub.write_epub(output, book)
    print("Done:", output)

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--images", default="./images")
    p.add_argument("--output", default="orchidaceae.epub")
    p.add_argument("--specimens", default="examples/specimens.json")
    a = p.parse_args()
    generate(a.images, a.output, a.specimens)
