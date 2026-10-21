"""Let the corrected security rules reach databases installed with 2.x."""


def migrate(cr, version):
    # Rules used to be noupdate: lift the flag so the XML (and the removal of
    # crm_rule_team_salesteam) applies during this upgrade.
    cr.execute("""
        UPDATE ir_model_data
           SET noupdate = false
         WHERE module = 'crm_modern'
           AND model = 'ir.rule'
           AND name IN ('crm_rule_team_lead', 'crm_activity_report_rule_team_activities', 'crm_rule_team_salesteam')
    """)
