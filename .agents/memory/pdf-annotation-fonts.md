---
name: PDF annotation font compatibility
description: Plain-text annotations added with PyMuPDF built-in fonts need ASCII punctuation for reliable rendering.
---

Use straight quotes and ASCII apostrophes in PyMuPDF `insert_textbox` annotations unless an embedded Unicode font is explicitly configured. Built-in PDF fonts may render curly punctuation as question marks.

**Why:** A marked-up blueprint export rendered curly quotation marks as question marks in the final PDF.

**How to apply:** Normalize annotation copy to ASCII before exporting PDFs with PyMuPDF's standard Helvetica-style fonts.