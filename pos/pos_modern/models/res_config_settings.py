from odoo import models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    def action_pos_config_create_new(self):
        """Settings ▸ "+ New Shop": the modern drawer (name + restaurant switch) instead of
        Odoo's bare dialog. The settings page reloads when the drawer closes."""
        action = super().action_pos_config_create_new()
        return {
            'type': 'ir.actions.client',
            'tag': 'modern_theme.drawer',
            'params': {
                'model': 'pos.config',
                'res_id': False,
                'context': action.get('context') or {},
                'reload': True,
            },
        }
