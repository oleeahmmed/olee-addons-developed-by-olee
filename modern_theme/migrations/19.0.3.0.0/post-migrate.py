"""Carry the 2.x settings over to the 3.x design system."""

from odoo import SUPERUSER_ID, api

VALID = {
    "indigo", "blue", "sky", "teal", "emerald", "green", "amber", "yellow", "orange",
    "red", "rose", "violet", "slate", "zinc", "stone", "gray", "neutral",
}


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    # 1. Company-wide accent colour used to live in ir.config_parameter.
    preset = env["ir.config_parameter"].get_param("modern_theme.preset")
    if preset in VALID:
        env["res.company"].search([]).write({"mt_preset": preset})
    # 2. The per-user dark mode boolean became the "Color mode" override.
    cr.execute("""
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'res_users' AND column_name = 'modern_theme_dark_mode'
    """)
    if cr.fetchone():
        cr.execute("""
            UPDATE res_users SET mt_color_mode = 'dark'
             WHERE modern_theme_dark_mode IS TRUE AND mt_color_mode IS NULL
        """)
