# Pinchtab API Reference

Base URL: `http://localhost:9867`. All endpoints have CLI equivalents — use `pinchtab help`.

## Navigate

```bash
# CLI: pinchtab nav https://example.com [--new-tab] [--block-images]
pinchtab nav https://example.com
```

## Snapshot

```bash
# CLI: pinchtab snap [-i] [-c] [-d] [-s main] [--max-tokens 2000]
pinchtab snap              # Full tree
pinchtab snap -i           # Interactive only (buttons, links, inputs)
pinchtab snap -i -c        # Interactive + compact format
pinchtab snap -s main      # Scope to main content
```

## Act on elements

```bash
pinchtab click e5
pinchtab type e12 "hello world"
pinchtab press Enter
pinchtab hover e8
pinchtab select e10 "option2"
```

## Extract text

```bash
# CLI: pinchtab text [--raw]
pinchtab text              # Readability mode (~800 tokens)
pinchtab text --raw        # Raw innerText
```

## Other

```bash
pinchtab ss -o page.jpg    # Screenshot
pinchtab eval "document.title"
pinchtab tabs              # List tabs
```
