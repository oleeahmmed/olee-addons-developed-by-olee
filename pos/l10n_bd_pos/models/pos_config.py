from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    l10n_bd_mushak = fields.Boolean(string="Mushak-6.3 on receipts", default=True,
                                    help="Title the receipt 'Mushak-6.3', print the BIN and number every sale.")
    l10n_bd_receipt_lang = fields.Selection([('en', 'English'), ('bn', 'Bangla'), ('both', 'English + Bangla')],
                                            string="Product names on the receipt", default='en')
    l10n_bd_digits = fields.Boolean(string="Bangla digits on the receipt")

    def _pos_modern_features(self):
        features = super()._pos_modern_features()
        features.update({
            'l10n_bd': True,
            'mushak': self.l10n_bd_mushak,
            'bin': self.company_id.l10n_bd_bin or '',
        })
        return features

    def _pos_modern_extend_rows(self, products, rows):
        rows = super()._pos_modern_extend_rows(products, rows)
        for product, row in zip(products, rows):
            name_bn = product.product_tmpl_id.l10n_bd_name_bn
            if name_bn:
                row['name_bn'] = name_bn
                row['search_extra'] = ' '.join(filter(None, [row.get('search_extra', ''), name_bn]))
        return rows

    def _pos_modern_search_domain(self, domain, query):
        domain = super()._pos_modern_search_domain(domain, query)
        return ['|', ('product_tmpl_id.l10n_bd_name_bn', 'ilike', query)] + domain

    def _pos_modern_customer_row(self, partner):
        row = super()._pos_modern_customer_row(partner)
        row['bin'] = partner.l10n_bd_bin or ''
        return row

    def _pos_modern_company_info(self):
        info = super()._pos_modern_company_info()
        info['bin'] = self.company_id.l10n_bd_bin or ''
        return info

    def _pos_modern_after_order(self, order, payload):
        res = super()._pos_modern_after_order(order, payload)
        if self.l10n_bd_mushak:
            order._l10n_bd_assign_mushak()
        return res
