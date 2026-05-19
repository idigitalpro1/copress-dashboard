#!/usr/bin/env python3
"""
gen-kit.py — stamp a ShopLocal campaign kit from a lead manifest.

Usage:
    python3 gen-kit.py <lead-manifest.json> [output-slug]

Reads a lead manifest (the standard copress-dashboard manifest.json schema),
maps it onto the template's #kit-config block, and writes:

    copress-dashboard/<slug>-campaign-kit/
        index.html        (template, config injected)
        manifest.json      (the lead manifest, copied)
        carousel/          (registercall.com carousel, ported)

No third-party deps. Safe to run in bulk (this is the part Hermes drives).
"""
import json, os, re, sys, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.dirname(HERE)  # copress-dashboard/
TEMPLATE = os.path.join(HERE, "index.html")
CAROUSEL = os.path.join(HERE, "carousel")

DEFAULTS = json.loads(re.search(
    r'<script id="kit-config"[^>]*>(.*?)</script>',
    open(TEMPLATE, encoding="utf-8").read(), re.S).group(1))


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s or "kit"


def pick_colors(colors):
    """Map an arbitrary manifest color palette onto the 6 template roles."""
    if not colors:
        return DEFAULTS["colors"]
    want = {
        "bg":   ["bg", "ink", "pine", "asphalt", "background", "surface"],
        "panel":["panel", "bg2", "card", "warm", "steel", "charcoal"],
        "accent":["accent", "gold", "copper", "signal", "red", "primary"],
        "accent2":["accent2", "moss", "amber", "green", "secondary", "highlight"],
        "text": ["text", "paper", "cream", "snow", "ivory", "foreground"],
        "mute": ["mute", "muted", "stone", "sky", "steel"],
    }
    vals = list(colors.values())
    out = {}
    for role, names in want.items():
        hit = next((colors[n] for n in names if n in colors), None)
        out[role] = hit or (vals.pop(0) if vals else DEFAULTS["colors"][role])
    return out


def google_query(fonts):
    if fonts and fonts.get("google"):
        return fonts["google"]
    disp = (fonts or {}).get("display", "Fraunces").strip('"').split(",")[0]
    body = (fonts or {}).get("body", "Work Sans").strip('"').split(",")[0]
    fam = lambda f: f.replace(" ", "+")
    return (f"family={fam(disp)}:wght@600;800&family={fam(body)}:wght@400;600;700;800"
            f"&family=JetBrains+Mono:wght@500;700")


def css_font(name, fallback):
    if not name:
        return fallback
    if '"' in name or "," in name:
        return name
    return f'"{name}",{fallback}'


def build_config(m):
    deliv = m.get("deliverables", {}) or {}
    pub = deliv.get("publicLinks", {}) or {}
    links = {
        "campaignKit": pub.get("campaignKit") or m.get("links", {}).get("campaignKitLanding", "#kit"),
        "customer": (pub.get("customerHomeBuyingKit") or pub.get("customerLink")
                     or m.get("links", {}).get("customerLink", "#customer")),
    }
    assets = m.get("assets", {}) or {}
    hero = assets.get("hero") or assets.get("ogImage") or ""
    gallery = [v for k, v in assets.items()
               if k not in ("hero", "ogImage", "agent") and isinstance(v, str) and v.startswith("http")]

    facts = []
    of = m.get("officialFacts", {})
    if isinstance(of, dict):
        for k in ("subjectProperty", "propertyType", "market", "recommendedList", "phone", "address", "hours"):
            if of.get(k):
                facts.append([k.replace("_", " ").title(), str(of[k])])
    if not facts:
        facts = [[ "Audience", a ] for a in (m.get("audience") or [])[:4]]
    if not facts:
        facts = DEFAULTS["facts"]

    fonts = m.get("fonts", {}) or {}
    cfg = dict(DEFAULTS)
    cfg.update({
        "title": m.get("campaign", DEFAULTS["title"]),
        "description": m.get("positioning", DEFAULTS["description"]),
        "brand": m.get("brand", DEFAULTS["brand"]),
        "ecosystem": m.get("ecosystem", "ShopLocal Campaign Kit"),
        "tagline": m.get("tagline") or m.get("campaign", DEFAULTS["tagline"]),
        "positioning": m.get("positioning", DEFAULTS["positioning"]),
        "customerKitName": m.get("customerKitName", "Customer home-buying kit"),
        "customerBlurb": m.get("customerBlurb", m.get("positioning", DEFAULTS["customerBlurb"])),
        "freeDays": m.get("freeDays", 7),
        "colors": pick_colors(m.get("colors")),
        "fonts": {
            "google": google_query(fonts),
            "display": css_font(fonts.get("display"), "serif"),
            "body": css_font(fonts.get("body") or fonts.get("ui"), "system-ui,sans-serif"),
        },
        "heroImage": hero,
        "gallery": gallery,
        "links": links,
        "facts": facts,
        "pricing": m.get("pricing", DEFAULTS["pricing"]),
        "kanban": m.get("kanban", DEFAULTS["kanban"]),
        "sections": m.get("sections", DEFAULTS["sections"]),
    })
    return cfg


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    mp = sys.argv[1]
    m = json.load(open(mp, encoding="utf-8"))
    cfg = build_config(m)
    slug = sys.argv[2] if len(sys.argv) > 2 else slugify(
        m.get("campaign") or m.get("brand"))
    if not slug.endswith("-campaign-kit"):
        slug += "-campaign-kit"
    out = os.path.join(DASH, slug)
    os.makedirs(out, exist_ok=True)

    tpl = open(TEMPLATE, encoding="utf-8").read()
    block = '<script id="kit-config" type="application/json">\n' + \
            json.dumps(cfg, indent=2) + "\n</script>"
    tpl = re.sub(r'<script id="kit-config"[^>]*>.*?</script>', lambda _: block,
                 tpl, count=1, flags=re.S)
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(tpl)
    json.dump(m, open(os.path.join(out, "manifest.json"), "w", encoding="utf-8"), indent=2)
    if os.path.isdir(CAROUSEL):
        dst = os.path.join(out, "carousel")
        shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(CAROUSEL, dst)

    print(f"OK  {slug}/")
    print(f"    index.html   ({len(tpl)} bytes, config injected)")
    print(f"    manifest.json + carousel/")
    print(f"    preview: /{slug}/")


if __name__ == "__main__":
    main()
