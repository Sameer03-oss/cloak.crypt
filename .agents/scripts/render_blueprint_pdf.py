from pathlib import Path

import fitz

source = Path("attached_assets/BLUEPRINT_2_1789844855384.pdf")
output_dir = Path(".agents/outputs/blueprint-2-render")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"pages={document.page_count}")
print(f"metadata={document.metadata}")

for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    destination = output_dir / f"page-{index + 1:02d}.png"
    pixmap.save(destination)
    print(f"rendered={destination} size={pixmap.width}x{pixmap.height}")

    text = page.get_text("text").strip()
    print(f"page={index + 1} text_chars={len(text)}")
    print(text[:1200].replace("\n", " | "))