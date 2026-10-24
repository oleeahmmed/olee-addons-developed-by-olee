""""My Day" is no longer a menu: users who started on it now start on the Dashboard."""


def migrate(cr, version):
    cr.execute("""
        UPDATE res_users u
           SET action_id = dash.res_id
          FROM ir_model_data home, ir_model_data dash
         WHERE home.module = 'crm_modern' AND home.name = 'action_home'
           AND dash.module = 'crm_modern' AND dash.name = 'action_dashboard'
           AND u.action_id = home.res_id
    """)
