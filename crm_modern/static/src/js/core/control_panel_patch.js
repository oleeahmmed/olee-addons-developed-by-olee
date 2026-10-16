import { patch } from "@web/core/utils/patch";
import { ControlPanel } from "@web/search/control_panel/control_panel";

/**
 * Views embedded in Modern CRM pages (NativeView) live inside client actions,
 * where the stock switchView() has no act_window controller to switch. When the
 * embedding page registered a handler, let it switch; otherwise (every normal
 * Odoo view) fall straight back to Odoo's own behaviour, whatever its signature.
 */
patch(ControlPanel.prototype, {
    switchView(viewType, ...rest) {
        const handler = this.env.config?.crmModernSwitchView;
        const newWindow = rest[0];
        if (typeof handler === "function" && !newWindow) {
            return handler(viewType);
        }
        return super.switchView(viewType, ...rest);
    },
});
