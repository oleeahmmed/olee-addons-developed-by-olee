import { Component } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";

export class ThemeToggle extends Component {
    static template = "modern_theme.ThemeToggle";
    static components = { Dropdown, DropdownItem };
    static props = {};

    setup() {
        this.orm = useService("orm");
        this.isDark = Boolean(session.modern_theme?.dark_mode);
    }

    async setDark(dark) {
        if (Boolean(dark) === this.isDark) {
            return;
        }
        await this.orm.write("res.users", [user.userId], {
            modern_theme_dark_mode: Boolean(dark),
        });
        window.location.reload();
    }
}

export const systrayItem = {
    Component: ThemeToggle,
};

registry.category("systray").add("modern_theme.ThemeToggle", systrayItem, { sequence: 1 });
