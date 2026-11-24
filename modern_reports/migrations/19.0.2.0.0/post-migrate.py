"""1.x pointed the core print actions at its own templates; 2.x inherits the core loops instead.
Point the actions back at the core report templates so they keep working."""

CORE_REPORTS = {
    'account.account_invoices': 'account.report_invoice_with_payments',
    'account.account_invoices_without_payment': 'account.report_invoice',
    'sale.action_report_saleorder': 'sale.report_saleorder',
    'sale.action_report_pro_forma_invoice': 'sale.report_saleorder_pro_forma',
    'purchase.action_report_purchase_order': 'purchase.report_purchaseorder',
}


def migrate(cr, version):
    for xmlid, report_name in CORE_REPORTS.items():
        module, name = xmlid.split('.')
        cr.execute(
            """
            UPDATE ir_act_report_xml r
               SET report_name = %s, report_file = %s
              FROM ir_model_data d
             WHERE d.module = %s AND d.name = %s AND d.model = 'ir.actions.report'
               AND d.res_id = r.id AND r.report_name LIKE 'modern_reports.%%'
            """,
            (report_name, report_name, module, name),
        )
