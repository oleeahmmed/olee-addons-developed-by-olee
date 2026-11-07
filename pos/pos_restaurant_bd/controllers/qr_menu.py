from urllib.parse import urlencode

from odoo import http
from odoo.http import request


class PosQrMenu(http.Controller):
    """Public QR menu of a restaurant shop (read-only), and the printable QR cards of its tables."""

    def _config(self, config_id):
        config = request.env['pos.config'].sudo().browse(int(config_id)).exists()
        if not config or not config.rb_qr_menu or not config.rb_restaurant:
            raise request.not_found()
        return config

    @http.route('/pos/menu/<int:config_id>', type='http', auth='public', website=False, sitemap=False)
    def menu(self, config_id, table=None, **kw):
        config = self._config(config_id)
        rows = config._pos_modern_products()
        categories = config._pos_modern_categories()
        sections = []
        used = set()
        for cat in categories:
            items = [r for r in rows if cat['id'] in r['categ_ids']]
            if items:
                sections.append({'id': cat['id'], 'name': cat['name'], 'items': items})
                used.update(r['id'] for r in items)
        others = [r for r in rows if r['id'] not in used]
        if others:
            sections.append({'id': 0, 'name': 'More', 'items': others})
        return request.render('pos_restaurant_bd.qr_menu_page', {
            'config': config,
            'company': config.company_id,
            'table': table,
            'sections': sections,
            'tax_included': config.iface_tax_included == 'total',
            'currency': config.currency_id,
        })

    @http.route('/pos/menu/<int:config_id>/qr', type='http', auth='user', website=False)
    def qr_cards(self, config_id, **kw):
        config = self._config(config_id)
        base = request.httprequest.host_url.rstrip('/')
        tables = config.floor_ids.table_ids.filtered('active').sorted(lambda t: (t.floor_id.sequence, t.table_number))
        cards = [{'label': '%s · %s' % (t.floor_id.name, t.table_number),
                  'url': '%s/pos/menu/%s?table=%s' % (base, config.id, t.table_number)} for t in tables]
        if not cards:
            cards = [{'label': config.name, 'url': '%s/pos/menu/%s' % (base, config.id)}]
        for card in cards:
            card['qr'] = '/report/barcode/?' + urlencode({'barcode_type': 'QR', 'value': card['url'],
                                                         'width': 400, 'height': 400})
        return request.render('pos_restaurant_bd.qr_cards_page', {'config': config, 'cards': cards})
