/** @odoo-module **/

import { registry } from "@web/core/registry";
// Load after stock items so "odoo_account" exists before we remove it.
import "@web/webclient/user_menu/user_menu_items";

// Self-hosted: hide "My Odoo.com account" from the user menu.
registry.category("user_menuitems").remove("odoo_account");
