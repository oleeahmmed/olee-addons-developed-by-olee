import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";

import { Component } from "@odoo/owl";

export class ThemeToggle extends Component {
    static template = "modern_theme.ThemeToggle";
    static props = {};

    setup() {
        this.orm = useService("orm");
        this.isDark = Boolean(session.modern_theme?.dark_mode);
    }

    async onClick() {
        await this.orm.write("res.users", [user.userId], {
            modern_theme_dark_mode: !this.isDark,
        });
        window.location.reload();
    }
}

export const systrayItem = {
    Component: ThemeToggle,
};

registry.category("systray").add("modern_theme.ThemeToggle", systrayItem, { sequence: 1 });
