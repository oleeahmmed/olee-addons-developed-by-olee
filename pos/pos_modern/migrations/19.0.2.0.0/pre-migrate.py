"""19.0.2.0.0: the Menu (selling screen) takes the path "modern-pos" from the Dashboard.

Records are written in batches during an update, so the Dashboard keeps "modern-pos"
until after the Menu action is created; free the path first to avoid a duplicate.
"""


def migrate(cr, version):
    cr.execute("""
        UPDATE ir_act_client a
           SET path = 'modern-pos-dashboard'
          FROM ir_model_data d
         WHERE d.model = 'ir.actions.client' AND d.res_id = a.id
           AND d.module = 'pos_modern' AND d.name = 'action_dashboard'
           AND a.path = 'modern-pos'
    """)
