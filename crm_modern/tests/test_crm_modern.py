"""Upgrade guard for Modern CRM.

Run after every Odoo update:
    odoo-bin -c odoo.conf -d <db> -u crm_modern --test-tags /crm_modern --stop-after-init

If an Odoo update renames a view, field or method this addon relies on,
one of these tests fails and points at it, instead of the UI breaking later.
"""
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestCrmModern(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Lead = cls.env['crm.lead']
        cls.team = cls.env['crm.team'].create({'name': 'Modern CRM test team'})
        cls.campaign = cls.env['utm.campaign'].create({'title': 'Modern CRM test campaign'})

    def test_view_ids_all_resolve(self):
        """Every view the pages embed must still exist (catches renamed xml ids)."""
        ids = self.Lead.crm_modern_view_ids()
        missing = sorted(key for key, value in ids.items() if not value)
        self.assertFalse(missing, f"Views no longer found after update: {missing}")

    def test_client_actions_and_menus(self):
        for xmlid in ('dashboard', 'pipeline', 'leads', 'activities', 'campaigns', 'salespeople',
                      'teams', 'stages', 'activity_types', 'activity_plans', 'tags', 'record', 'team'):
            action = self.env.ref(f'crm_modern.action_{xmlid}')
            self.assertEqual(action.tag, f'crm_modern.{xmlid}')
        leads_menu = self.env.ref('crm_modern.menu_leads')
        self.assertIn(self.env.ref('crm.group_use_lead'), leads_menu.group_ids if 'group_ids' in leads_menu._fields else leads_menu.groups_id)

    def test_fields_used_by_the_ui_exist(self):
        lead_fields = self.Lead._fields
        for name in ('won_status', 'prorated_revenue', 'date_closed', 'expected_revenue', 'probability', 'stage_id',
                     'campaign_id', 'tag_ids', 'priority', 'activity_date_deadline', 'activity_type_id',
                     'is_rotting', 'rotting_days', 'company_currency'):
            self.assertIn(name, lead_fields, f"crm.lead.{name} is gone")
        self.assertIn('team_ids', self.env['crm.stage']._fields)
        self.assertIn('rotting_threshold_days', self.env['crm.stage']._fields)
        for name in ('title', 'user_id'):
            self.assertIn(name, self.env['utm.campaign']._fields, f"utm.campaign.{name} is gone")

    def test_features(self):
        features = self.Lead.crm_modern_features()
        self.assertEqual(set(features) >= {'use_leads', 'sale'}, True)
        self.assertEqual(features['use_leads'], self.env.user.has_group('crm.group_use_lead'))

    def test_dashboard_and_stats(self):
        data = self.Lead.crm_modern_dashboard()
        self.assertEqual(len(data['trend']), 6)
        for key in ('pipeline', 'weighted', 'won_month', 'win_rate', 'new_leads'):
            self.assertIn(key, data['kpis'])
        detail = self.Lead.crm_modern_team_detail(self.team.id)
        self.assertEqual(detail['team']['name'], self.team.name)

    def test_import_skips_duplicates_and_respects_leads_setting(self):
        rows = [
            {'name': 'Deal A', 'company': 'Delta', 'email': 'a@example.com', 'expected_revenue': '1,500', 'tags': 'ModernTestTag'},
            {'name': 'Deal B', 'company': 'Urban', 'email': 'a@example.com'},
            {'name': '', 'company': ''},
        ]
        res = self.Lead.crm_modern_import('opportunity', rows, self.campaign.id)
        self.assertEqual((res['created'], res['duplicates'], res['invalid']), (1, 1, 1))
        lead = self.Lead.browse(res['ids'])
        self.assertEqual(lead.type, 'opportunity')
        self.assertEqual(lead.expected_revenue, 1500)
        self.assertEqual(lead.tag_ids.name, 'ModernTestTag')

        # With "Leads" switched off, a lead import lands in the pipeline instead.
        # (When the setting is on, every internal user gets the group, so only check the "off" case.)
        user = self.env['res.users'].create({
            'name': 'Modern CRM tester', 'login': 'modern_crm_tester',
            'group_ids' if 'group_ids' in self.env['res.users']._fields else 'groups_id':
                [(6, 0, [self.env.ref('base.group_user').id, self.env.ref('sales_team.group_sale_salesman').id])],
        })
        expected = 'lead' if user.has_group('crm.group_use_lead') else 'opportunity'
        res = self.Lead.with_user(user).crm_modern_import('lead', [{'name': 'Lead X', 'phone': '+8801700000000'}], self.campaign.id)
        self.assertEqual(self.Lead.browse(res['ids']).type, expected)
        self.assertEqual(self.Lead.with_user(user).crm_modern_features()['use_leads'], expected == 'lead')

    def test_record_page_quick_actions(self):
        """Compact composer / scheduler of the record page and the pipeline card view."""
        lead = self.Lead.create({'name': 'Quick actions deal', 'type': 'opportunity'})
        note_id = lead.crm_modern_post("Called the customer\nThey want a demo", 'note')
        note = self.env['mail.message'].browse(note_id)
        self.assertEqual(note.subtype_id, self.env.ref('mail.mt_note'))
        self.assertIn('<br>', str(note.body))
        message_id = lead.crm_modern_post("Here is our offer", 'message')
        self.assertEqual(self.env['mail.message'].browse(message_id).subtype_id, self.env.ref('mail.mt_comment'))

        call = self.env.ref('mail.mail_activity_data_call')
        [activity_id] = lead.crm_modern_schedule(call.id, '2030-01-15', 'Demo call', self.env.user.id, 'Bring slides')
        activity = self.env['mail.activity'].browse(activity_id)
        self.assertEqual((activity.res_id, activity.activity_type_id, str(activity.date_deadline), activity.automated),
                         (lead.id, call, '2030-01-15', False))
        [auto_id] = lead.crm_modern_schedule(call.id)  # no date: the type's own delay
        self.assertTrue(self.env['mail.activity'].browse(auto_id).date_deadline)

        kanban = self.env.ref('crm_modern.crm_lead_kanban_modern')
        self.assertEqual(self.Lead.crm_modern_view_ids()['opportunity_kanban'], kanban.id)
        self.Lead.get_view(kanban.id, 'kanban')  # the arch still validates against the current fields / widgets

    def test_team_cards(self):
        """Team card figures and buttons, and the card view still validates."""
        self.Lead.create([
            {'name': 'Team deal A', 'type': 'opportunity', 'team_id': self.team.id, 'expected_revenue': 1000},
            {'name': 'Team deal B', 'type': 'opportunity', 'team_id': self.team.id, 'expected_revenue': 500,
             'date_deadline': '2000-01-01'},
        ])
        self.team.invalidate_recordset()
        self.assertEqual(self.team.crm_modern_open_count, 2)
        self.assertEqual(self.team.crm_modern_open_amount, 1500)
        self.assertEqual(self.team.crm_modern_overdue_count, 1)
        self.assertEqual(self.team.crm_modern_open_pipeline()['context'], {'crm_modern_team_id': self.team.id})
        self.assertEqual(self.team.crm_modern_open_team()['tag'], 'crm_modern.team')
        kanban = self.env.ref('crm_modern.crm_team_kanban_modern')
        self.assertEqual(self.Lead.crm_modern_view_ids()['team_kanban'], kanban.id)
        self.env['crm.team'].get_view(kanban.id, 'kanban')

    def test_lives_inside_the_crm_app(self):
        """No app of its own: opening CRM from the home screen opens the Modern CRM dashboard."""
        Menu = self.env['ir.ui.menu']
        self.assertFalse(self.env.ref('crm_modern.menu_root', raise_if_not_found=False))
        crm_root = self.env.ref('crm.crm_menu_root')
        self.assertEqual(self.env.ref('crm_modern.menu_dashboard').parent_id, crm_root)
        menus = Menu.load_web_menus(False)
        self.assertEqual(menus[crm_root.id]['actionID'], self.env.ref('crm_modern.action_dashboard').id)
        # Odoo's own CRM menus are untouched
        for xmlid in ('crm.crm_menu_sales', 'crm.crm_menu_report', 'crm.crm_menu_config'):
            self.assertEqual(self.env.ref(xmlid).parent_id, crm_root)
        # Odoo's CRM reports are reachable from the Modern CRM Reporting group
        for name, action in (('forecast', 'crm.action_opportunity_forecast'),
                             ('report_pipeline', 'crm.crm_opportunity_report_action'),
                             ('report_leads', 'crm.crm_opportunity_report_action_lead'),
                             ('report_activities', 'crm.crm_activity_report_action')):
            self.assertEqual(self.env.ref(f'crm_modern.menu_{name}').action, self.env.ref(action))
        self.assertFalse(self.env['ir.module.module'].search([('name', '=', 'crm_modern')]).application)

    def test_rights_follow_odoo_rules(self):
        """A salesperson limited to "own documents" only sees and edits their own opportunities,
        in Odoo's views and in the Modern CRM figures (nothing runs with sudo)."""
        own = self.env['res.users'].create({
            'name': 'Own docs salesperson', 'login': 'cm_own_docs',
            'group_ids': [(6, 0, [self.env.ref('base.group_user').id,
                                  self.env.ref('sales_team.group_sale_salesman').id])],
        }) if 'group_ids' in self.env['res.users']._fields else self.env['res.users'].create({
            'name': 'Own docs salesperson', 'login': 'cm_own_docs',
            'groups_id': [(6, 0, [self.env.ref('base.group_user').id,
                                  self.env.ref('sales_team.group_sale_salesman').id])],
        })
        boss = self.env['res.users'].create({'name': 'Other salesperson', 'login': 'cm_other_docs'})
        mine = self.Lead.create({'name': 'Mine', 'type': 'opportunity', 'user_id': own.id, 'expected_revenue': 100})
        theirs = self.Lead.create({'name': 'Theirs', 'type': 'opportunity', 'user_id': boss.id, 'expected_revenue': 9999})

        Lead = self.Lead.with_user(own)
        visible = Lead.search([('id', 'in', (mine | theirs).ids)])
        self.assertEqual(visible, mine.with_user(own))
        self.assertTrue(mine.with_user(own).has_access('write'))
        self.assertFalse(theirs.with_user(own).has_access('write'))
        self.assertFalse(theirs.with_user(own).has_access('unlink'))
        # the dashboard aggregates with the user's own rights
        everyone = self.Lead.crm_modern_dashboard()['kpis']['pipeline']
        own_only = Lead.crm_modern_dashboard()['kpis']['pipeline']
        self.assertLessEqual(own_only, everyone - 9999)


@tagged('post_install', '-at_install')
class TestCrmModernOwnerDashboard(TransactionCase):

    def test_owner_dashboard(self):
        Lead = self.env['crm.lead']
        team = self.env['crm.team'].create({'name': 'Owner dashboard CRM team'})
        open_deal = Lead.create({'name': 'Open deal', 'type': 'opportunity', 'team_id': team.id,
                                 'expected_revenue': 1000, 'user_id': self.env.user.id})
        won_deal = Lead.create({'name': 'Won deal', 'type': 'opportunity', 'team_id': team.id,
                                'expected_revenue': 500, 'user_id': self.env.user.id})
        won_deal.action_set_won()
        for period in ('month', 'quarter', 'year'):
            data = Lead.crm_modern_owner_dashboard(period)
            self.assertEqual(len(data['months']), 12)
            self.assertEqual(len(data['forecast']), 3)
            for key in ('pipeline', 'weighted', 'won', 'win_rate', 'avg_deal', 'cycle', 'new', 'overdue_activities'):
                self.assertIn(key, data['kpis'])
        data = Lead.crm_modern_owner_dashboard('month', team.id)
        self.assertEqual(data['kpis']['pipeline'], open_deal.expected_revenue)
        self.assertEqual(data['kpis']['won'], 500)
        self.assertEqual(data['kpis']['win_rate'], 100)
        self.assertTrue(data['funnel'][-1]['won'])
        self.assertEqual([t['id'] for t in data['teams']], [team.id])
        self.assertIn(self.env.user.id, [s['id'] for s in data['salespeople']])


@tagged('post_install', '-at_install')
class TestCrmModernCampaigns(TransactionCase):
    """Campaigns use only Odoo's utm.campaign; their figures come from the leads."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Lead = cls.env['crm.lead']

    def test_round_robin_import_and_campaign_stats(self):
        Users = self.env['res.users']
        sellers = Users.create([{
            'name': f'Round robin seller {i}', 'login': f'crm_modern_rr_{i}',
            'group_ids': [(6, 0, [self.env.ref('sales_team.group_sale_salesman_all_leads').id])],
        } for i in (1, 2)])
        team = self.env['crm.team'].create({'name': 'Round robin team'})
        self.env['crm.team.member'].create([{'crm_team_id': team.id, 'user_id': u.id} for u in sellers])
        campaign = self.env['utm.campaign'].create({'title': 'Round robin campaign'})
        rows = [{'name': f'Deal {i}', 'phone': f'+88017000000{i}'} for i in range(4)]
        res = self.env['crm.lead'].crm_modern_import('opportunity', rows, campaign.id, team.id, 'round_robin')
        self.assertEqual(res['created'], 4)
        leads = self.env['crm.lead'].browse(res['ids'])
        self.assertEqual(set(leads.mapped('team_id').ids), {team.id})
        self.assertEqual(sorted(leads.mapped('user_id').ids), sorted(sellers.ids))
        self.assertEqual(len(leads.filtered(lambda l: l.user_id == sellers[0])), 2)

        leads[0].action_set_won()
        stats = {r['id']: r for r in self.env['crm.lead']._crm_modern_campaign_stats(limit=None)}
        row = stats[campaign.id]
        self.assertEqual(row['opportunity_count'], 4)
        self.assertEqual(row['won_count'], 1)
        self.assertEqual(row['team'][0], team.id)

    def test_campaign_kanban_assign_and_import_default_team(self):
        """Campaign card stores a team, assigns it on open deals, and CSV uses it."""
        team = self.env['crm.team'].create({'name': 'Campaign assign team'})
        other = self.env['crm.team'].create({'name': 'Other campaign team'})
        campaign = self.env['utm.campaign'].create({'title': 'Assign from card'})
        pending = self.env['crm.lead'].create({
            'name': 'Pending from campaign', 'type': 'opportunity',
            'campaign_id': campaign.id, 'team_id': other.id,
        })
        won = self.env['crm.lead'].create({
            'name': 'Won from campaign', 'type': 'opportunity',
            'campaign_id': campaign.id, 'team_id': other.id,
        })
        won.action_set_won()
        campaign.write({'crm_modern_team_id': team.id})
        self.assertEqual(pending.team_id, team)
        self.assertEqual(won.team_id, other)

        empty = self.env['utm.campaign'].create({
            'title': 'Empty campaign remembers team',
            'crm_modern_team_id': team.id,
        })
        self.assertEqual(empty.crm_modern_team_id, team)
        res = self.env['crm.lead'].crm_modern_import(
            'opportunity', [{'name': 'Imported deal', 'phone': '+8801711111111'}], empty.id,
        )
        imported = self.env['crm.lead'].browse(res['ids'])
        self.assertEqual(imported.team_id, team)
        self.assertEqual(campaign.crm_modern_open_pipeline()['context'], {'crm_modern_campaign_id': campaign.id})
        self.assertEqual(campaign.crm_modern_open_leads()['context'], {'crm_modern_campaign_id': campaign.id})

        kanban = self.env.ref('crm_modern.utm_campaign_kanban_modern')
        self.assertEqual(self.env['crm.lead'].crm_modern_view_ids()['campaign_kanban'], kanban.id)
        self.env['utm.campaign'].get_view(kanban.id, 'kanban')
        form = self.env['utm.campaign'].get_view(self.env.ref('utm.utm_campaign_view_form').id, 'form')
        self.assertIn('crm_modern_team_id', form['arch'])
        self.assertIn('crm_modern_campaign_actions', form['arch'])
        self.assertIn('crm_modern_m2o_pick', form['arch'])
        lead_kanban = self.env.ref('crm_modern.crm_lead_kanban_modern')
        lead_arch = self.env['crm.lead'].get_view(lead_kanban.id, 'kanban')['arch']
        self.assertIn('crm_modern_m2o_pick', lead_arch)
        self.assertIn('crm_modern_user_pick', lead_arch)

    def test_optional_sale_never_breaks_crm(self):
        """CRM stays usable when Sales is missing: no quotation data, menus, or RPC errors."""
        from odoo.addons.crm_modern.models.crm_lead_sale import has_sale

        Lead = self.Lead
        features = Lead.crm_modern_features()
        self.assertEqual(
            features['sale'],
            has_sale(self.env) and self.env.user.has_group('sales_team.group_sale_salesman'),
        )
        self.assertFalse(Lead.crm_modern_sale_data(0))
        self.assertFalse(Lead.crm_modern_sale_data(False))

        quote_menu = self.env.ref('crm_modern.menu_quotations')
        order_menu = self.env.ref('crm_modern.menu_sale_orders')
        black = self.env['ir.ui.menu']._load_menus_blacklist()
        if has_sale(self.env):
            self.assertNotIn(quote_menu.id, black)
            self.assertNotIn(order_menu.id, black)
            self.assertTrue(Lead.crm_modern_sale_dashboard())
            return

        self.assertIn(quote_menu.id, black)
        self.assertIn(order_menu.id, black)
        self.assertFalse(Lead.crm_modern_sale_dashboard())
        ids = Lead.crm_modern_view_ids()
        self.assertFalse(any(key.startswith(('quotation_', 'order_')) for key in ids))
        lead = Lead.create({'name': 'CRM without Sales', 'type': 'opportunity'})
        with self.assertRaises(UserError):
            lead.crm_modern_quick_quotation([{'product_id': 1, 'qty': 1}])
