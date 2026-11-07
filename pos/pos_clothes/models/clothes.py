import re
from collections import defaultdict
from datetime import timedelta

from odoo import _, api, fields, models

SIZE_WORDS = re.compile(r'size|সাইজ|মাপ', re.I)


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    cl_care = fields.Text(string="Care text", help="Printed on the hand tag: wash care, fabric, made in…")
    cl_fabric = fields.Char(string="Fabric", help="Cotton, Georgette, Denim…")
    cl_season = fields.Char(string="Season / campaign", help="Eid 2026, Puja, Winter…")


class PosConfig(models.Model):
    _inherit = 'pos.config'

    cl_clothes = fields.Boolean(string="Clothing counter",
                                help="One card per style with a size × colour matrix, hand tags with care text.")
    cl_care_default = fields.Char(string="Default care text", default="Wash cold · Do not bleach · Iron medium")

    def _pos_modern_features(self):
        features = super()._pos_modern_features()
        features['clothes'] = self.cl_clothes
        return features

    def _pos_modern_extend_rows(self, products, rows):
        rows = super()._pos_modern_extend_rows(products, rows)
        if not self.cl_clothes:
            return rows
        for product, row in zip(products, rows):
            tmpl = product.product_tmpl_id
            row['tmpl_name'] = tmpl.name
            care = tmpl.cl_care or (self.cl_care_default if row.get('attrs') else '')
            row['label_extra'] = ' · '.join(filter(None, [tmpl.cl_fabric, care]))
            if tmpl.cl_fabric:
                row['search_extra'] = ' '.join(filter(None, [row.get('search_extra', ''), tmpl.cl_fabric]))
        return rows

    def pos_cl_size_report(self, days=30):
        """Per style: sold in the last `days` and stock now, per size / colour."""
        self.ensure_one()
        days = int(days or 30)
        since = fields.Datetime.now() - timedelta(days=days)
        lines = self.env['pos.order.line'].search([
            ('order_id.config_id', '=', self.id), ('order_id.state', 'in', ('paid', 'done', 'invoiced')),
            ('order_id.date_order', '>=', since)]).filtered(
            lambda l: l.product_id.product_tmpl_id.product_variant_count > 1)
        sold = defaultdict(float)
        for line in lines:
            sold[line.product_id.id] += line.qty
        templates = lines.product_id.product_tmpl_id
        location = self.picking_type_id.default_location_src_id
        rows = []
        for tmpl in templates:
            variants = tmpl.product_variant_ids.with_context(location=location.id) if location else tmpl.product_variant_ids
            cells = []
            for variant in variants:
                stock = variant.qty_available
                qty = sold.get(variant.id, 0.0)
                rate = qty / days
                cover = (stock / rate) if rate else None
                cells.append({
                    'id': variant.id,
                    'name': ' / '.join(variant.product_template_attribute_value_ids.mapped('name')) or variant.display_name,
                    'sold': qty,
                    'stock': stock,
                    'days_left': round(cover) if cover is not None else None,
                    'flag': 'out' if stock <= 0 and qty else ('fast' if cover is not None and cover <= 7 else
                                                               ('slow' if not qty and stock > 0 else '')),
                })
            cells.sort(key=lambda c: -c['sold'])
            rows.append({'id': tmpl.id, 'name': tmpl.name, 'sold': sum(c['sold'] for c in cells),
                         'stock': sum(c['stock'] for c in cells), 'cells': cells})
        rows.sort(key=lambda r: -r['sold'])
        return {'days': days, 'shop': self.name, 'rows': rows}
