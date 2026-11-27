"""Fixed design attributes of the Modern Theme.

The backend has exactly one look: shadcn/ui defaults (neutral palette, Inter,
10px controls, 14px cards, #fafafa sidebar). The values below are rendered as
``data-mt-*`` attributes on <html> by the server, so the first paint already
has the right look. Only light/dark is a choice (``color_scheme`` cookie).
"""

# html attribute suffix -> fixed value (the stylesheets key on these)
MT_ATTRIBUTES = {
    "theme": "once",
    "font": "inter",
    "font-scale": "md",
    "radius": "md",
    "border": "normal",
    "shadow": "sm",
    "density": "comfortable",
    "sidebar-style": "classic",
    "sidebar-bg": "solid",
    "sidebar-width": "normal",
    "sidebar-app-menu": "top",
    "topbar-style": "solid",
    "topbar-height": "normal",
    "content-width": "full",
    "content-frame": "card",
    "list-style": "clean",
    "form-style": "classic",
}
