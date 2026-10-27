from odoo import models


class ProjectProject(models.Model):
    _inherit = 'project.project'

    def project_modern_open_settings(self):
        """Odoo's own project form (settings, smart buttons, chatter), from a project card."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': self.display_name,
            'res_model': 'project.project',
            'res_id': self.id,
            'views': [[self.env.ref('project.edit_project').id, 'form']],
            'target': 'current',
        }
