/** @odoo-module **/

import { registry } from "@web/core/registry";

// Self-hosted: hide "My Odoo.com account" from the user menu.
const userMenu = registry.category("user_menuitems");
if (userMenu.contains("odoo_account")) {
    userMenu.remove("odoo_account");
}
