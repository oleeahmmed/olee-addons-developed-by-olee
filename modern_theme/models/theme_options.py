"""Single source of truth for every Modern Theme design option.

Each option is stored twice:
  * on ``res.company`` (``mt_<key>``): the company default, set in Settings;
  * on ``res.users``   (``mt_<key>``): an optional personal override
    (empty = follow the company).

The effective value is rendered server-side as ``data-mt-<key>`` attributes on
<html>, so the first paint already has the right look (no flash), and the
client-side theme service updates the very same attributes live.
"""

# (key, selection, default, user_can_override)
COLOR_MODES = [("light", "Light"), ("dark", "Dark"), ("auto", "Auto")]

THEME_PRESETS = [
    ("once", "Once (neutral + emerald)"),
    ("indigo", "Indigo"),
    ("blue", "Blue"),
    ("sky", "Sky"),
    ("teal", "Teal"),
    ("emerald", "Emerald"),
    ("green", "Green"),
    ("amber", "Amber"),
    ("yellow", "Yellow"),
    ("orange", "Orange"),
    ("red", "Red"),
    ("rose", "Rose"),
    ("violet", "Violet"),
    ("slate", "Slate"),
    ("zinc", "Zinc"),
    ("stone", "Stone"),
    ("gray", "Gray"),
    ("neutral", "Neutral"),
    ("custom", "Custom color"),
]
DEFAULT_PRESET = "once"

# Swatches for pickers (the light-mode primary of each preset, see tokens.scss).
PRESET_SWATCHES = {
    "once": "#0a8466", "indigo": "#4f46e5", "blue": "#2563eb", "sky": "#0369a1", "teal": "#0f766e",
    "emerald": "#047857", "green": "#15803d", "amber": "#b45309", "yellow": "#facc15",
    "orange": "#c2410c", "red": "#dc2626", "rose": "#e11d48", "violet": "#7c3aed",
    "slate": "#1e293b", "zinc": "#18181b", "stone": "#1c1917", "gray": "#111827",
    "neutral": "#171717",
}

FONTS = [
    ("inter", "Inter"),
    ("poppins", "Poppins"),
    ("roboto", "Roboto"),
    ("nunito", "Nunito"),
    ("dm_sans", "DM Sans"),
    ("jakarta", "Plus Jakarta Sans"),
    ("hind", "Hind Siliguri (বাংলা)"),
    ("noto_bn", "Noto Sans Bengali (বাংলা)"),
    ("system", "System font"),
]
FONT_SCALES = [("sm", "Small"), ("md", "Normal"), ("lg", "Large")]
RADII = [("none", "None"), ("sm", "Small"), ("md", "Medium"), ("lg", "Large"), ("pill", "Pill")]
BORDERS = [("none", "None"), ("subtle", "Subtle"), ("normal", "Normal"), ("strong", "Strong")]
SHADOWS = [("none", "None"), ("sm", "Soft"), ("md", "Medium"), ("lg", "Strong")]
DENSITIES = [("compact", "Compact"), ("comfortable", "Comfortable"), ("spacious", "Spacious")]
SIDEBAR_STYLES = [
    ("classic", "Classic tree"),
    ("rail", "Icon rail + panel"),
    ("floating", "Floating glass"),
]
SIDEBAR_BGS = [("solid", "Solid"), ("tinted", "Brand tint"), ("gradient", "Gradient"), ("glass", "Glass")]
SIDEBAR_WIDTHS = [("narrow", "Narrow"), ("normal", "Normal"), ("wide", "Wide")]
TOPBAR_STYLES = [("solid", "Solid bar"), ("blend", "Blend with canvas"), ("floating", "Floating card")]
TOPBAR_HEIGHTS = [("compact", "Compact"), ("normal", "Normal"), ("tall", "Tall")]
CONTENT_WIDTHS = [("full", "Full width"), ("boxed", "Boxed")]
CONTENT_FRAMES = [("card", "Rounded card"), ("flat", "Flat")]
LIST_STYLES = [("clean", "Clean"), ("striped", "Striped"), ("bordered", "Bordered")]
FORM_STYLES = [("classic", "Classic"), ("cards", "Card sections")]
LOGIN_STYLES = [("split", "Split screen"), ("centered", "Centered card"), ("minimal", "Minimal")]

# key -> (selection, company default, per-user overridable)
OPTIONS = {
    "color_mode": (COLOR_MODES, "light", True),
    "preset": (THEME_PRESETS, DEFAULT_PRESET, True),
    "font": (FONTS, "inter", True),
    "font_scale": (FONT_SCALES, "md", True),
    "radius": (RADII, "md", True),
    "border": (BORDERS, "subtle", True),
    "shadow": (SHADOWS, "sm", True),
    "density": (DENSITIES, "comfortable", True),
    "sidebar_style": (SIDEBAR_STYLES, "classic", True),
    "sidebar_bg": (SIDEBAR_BGS, "solid", True),
    "sidebar_width": (SIDEBAR_WIDTHS, "normal", True),
    "topbar_style": (TOPBAR_STYLES, "solid", True),
    "topbar_height": (TOPBAR_HEIGHTS, "normal", True),
    "content_width": (CONTENT_WIDTHS, "full", True),
    "content_frame": (CONTENT_FRAMES, "card", True),
    "list_style": (LIST_STYLES, "clean", True),
    "form_style": (FORM_STYLES, "classic", True),
    "login_style": (LOGIN_STYLES, "split", False),
}
# Boolean options: key -> (company default, per-user overridable)
BOOL_OPTIONS = {
    "sidebar_collapsed": (False, True),
    "animations": (True, True),
}
# Free colour options (hex): key -> company default
COLOR_OPTIONS = {
    "primary_color": "#4f46e5",
    "accent_color": "",
}

HEX_RE = r"^#[0-9a-fA-F]{6}$"


def selection_keys(key):
    return {k for k, _label in OPTIONS[key][0]}


def contrast_foreground(hex_color):
    """Return '#ffffff' or '#0b0f17', whichever reads better on ``hex_color`` (WCAG)."""
    try:
        h = hex_color.lstrip("#")
        rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    except (ValueError, AttributeError, IndexError):
        return "#ffffff"

    def channel(v):
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    lum = 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
    on_white = 1.05 / (lum + 0.05)
    on_dark = (lum + 0.05) / (0.0058 + 0.05)  # luminance of #0b0f17 ~ 0.0058
    return "#ffffff" if on_white >= on_dark else "#0b0f17"
