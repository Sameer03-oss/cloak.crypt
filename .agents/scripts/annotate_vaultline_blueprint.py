from pathlib import Path

import pymupdf


SOURCE = Path("attached_assets/BLUEPRINT_2_1789844855384.pdf")
DESTINATION = Path("blueprints/vaultline-blueprint-easy-language.pdf")

RED = (0.98, 0.25, 0.18)
YELLOW = (1.0, 0.89, 0.42)
INK = (0.12, 0.10, 0.06)
WHITE = (1.0, 1.0, 1.0)


def rect_union(rectangles):
    result = rectangles[0]
    for rectangle in rectangles[1:]:
        result |= rectangle
    return result


def mark_terms(page, terms):
    matches = []
    for term in terms:
        hits = page.search_for(term)
        if hits:
            matches.extend(hits)
            for hit in hits:
                page.draw_rect(hit + (-3, -3, 3, 3), color=RED, width=1.35)
    return rect_union(matches) if matches else None


def callout(page, number, anchor, text, box):
    if anchor is not None:
        target = pymupdf.Point(anchor.x1, (anchor.y0 + anchor.y1) / 2)
        start = pymupdf.Point(box.x0, box.y0 + box.height / 2)
        if box.x0 > anchor.x1:
            start = pymupdf.Point(box.x0, box.y0 + box.height / 2)
        elif box.x1 < anchor.x0:
            start = pymupdf.Point(box.x1, box.y0 + box.height / 2)
        page.draw_line(start, target, color=RED, width=1.5, overlay=True)
        page.draw_circle(target, 4, color=RED, fill=RED, overlay=True)

    page.draw_rect(box, color=RED, fill=YELLOW, width=1.4, overlay=True)
    page.insert_textbox(
        pymupdf.Rect(box.x0 + 10, box.y0 + 8, box.x1 - 10, box.y1 - 8),
        f"{number}. {text}",
        fontsize=9.4,
        lineheight=1.15,
        fontname="hebo",
        color=INK,
        align=0,
        overlay=True,
    )


def add_page_label(page, page_number):
    label = pymupdf.Rect(page.rect.x1 - 170, 14, page.rect.x1 - 14, 34)
    page.draw_rect(label, color=RED, fill=RED, width=0.8, overlay=True)
    page.insert_textbox(
        label,
        f"VAULTLINE REVIEW / {page_number:02d}",
        fontsize=8,
        fontname="hebo",
        color=WHITE,
        align=1,
        overlay=True,
    )


document = pymupdf.open(SOURCE)

# Slide 1 — title and positioning.
page = document[0]
add_page_label(page, 1)
anchor = mark_terms(page, ["Dual-Layer Web Data Security", "Steganography"])
callout(
    page,
    1,
    anchor,
    'Change the title to "Vaultline: Secure Data Platform." Say that Vaultline protects data on the user\'s device and saves it as an encrypted HTML file.',
    pymupdf.Rect(548, 52, 882, 126),
)

# Slide 2 — the dual-layer claim is too strong for the current implementation.
page = document[1]
add_page_label(page, 2)
anchor = mark_terms(page, ["Steganography"])
callout(
    page,
    2,
    anchor,
    'Change "Steganography" to "Encrypted HTML File." Vaultline encrypts the message, but it does not hide the fact that a secret file exists.',
    pymupdf.Rect(548, 355, 882, 454),
)

# Slide 3 — current carrier and data flow.
page = document[2]
add_page_label(page, 3)
anchor = mark_terms(page, ["DOM", "HTML carrier"])
callout(
    page,
    3,
    anchor,
    "Show that Vaultline puts the encrypted information inside a JSON script tag in the HTML file. It does not use comments or hidden page attributes.",
    pymupdf.Rect(520, 495, 875, 590),
)

# Slide 4 — exact KDF parameter.
page = document[3]
add_page_label(page, 4)
anchor = mark_terms(page, ["250,000"])
callout(
    page,
    4,
    anchor,
    "Change 250,000 to 210,000. This is the number used in the Vaultline app.",
    pymupdf.Rect(540, 250, 880, 334),
)

# Slide 5 — container format, not steganography.
page = document[4]
add_page_label(page, 5)
anchor = mark_terms(page, ["Steganography", "HTML comments", "DOM"])
callout(
    page,
    5,
    anchor,
    'Change the heading to "Encrypted HTML File." Replace the comment and data-attribute examples with the JSON script tag used by Vaultline.',
    pymupdf.Rect(520, 430, 880, 555),
)

# Slide 6 — receiver-side extraction and KDF parameter.
page = document[5]
add_page_label(page, 6)
anchor = mark_terms(page, ["250,000", "HTML comments", "data-* attributes"])
callout(
    page,
    6,
    anchor,
    "Use 210,000, and say that the app reads the JSON script tag. It does not read HTML comments or data attributes.",
    pymupdf.Rect(510, 520, 880, 620),
)

# Slide 7 — current stack versus future SDKs.
page = document[6]
add_page_label(page, 7)
anchor = mark_terms(page, ["250,000", "TweetNaCl.js", "libsodium.js", "HTML comments", "data-* attributes"])
callout(
    page,
    7,
    anchor,
    "The app uses React, TypeScript, and the browser's Web Crypto API. Python, Go, Rust, and Java are examples for later, not the app's current code.",
    pymupdf.Rect(520, 500, 880, 620),
)

# Slide 8 — soften use-case claims and correct the iteration count.
page = document[7]
add_page_label(page, 8)
anchor = mark_terms(page, ["Covert Transmission", "plausible deniability", "250,000", "Steganography"])
callout(
    page,
    8,
    anchor,
    'Use "Share an encrypted file" instead of "Covert Transmission" or "plausible deniability." Also change 250,000 to 210,000.',
    pymupdf.Rect(485, 578, 875, 690),
)

document.save(DESTINATION, garbage=4, deflate=True)
document.close()
print(f"saved={DESTINATION}")