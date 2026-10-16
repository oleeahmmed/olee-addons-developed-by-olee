from . import models


def post_init_hook(env):
    """Use the "Modern" document layout for companies still on Odoo's default (Light) one."""
    modern = env.ref('sales_modern.external_layout_modern', raise_if_not_found=False)
    light = env.ref('web.external_layout_standard', raise_if_not_found=False)
    if not modern:
        return
    for company in env['res.company'].search([]):
        if not company.external_report_layout_id or company.external_report_layout_id == light:
            company.external_report_layout_id = modern


def uninstall_hook(env):
    """Give companies back Odoo's Light layout."""
    modern = env.ref('sales_modern.external_layout_modern', raise_if_not_found=False)
    light = env.ref('web.external_layout_standard', raise_if_not_found=False)
    if modern and light:
        env['res.company'].search([('external_report_layout_id', '=', modern.id)]).external_report_layout_id = light
