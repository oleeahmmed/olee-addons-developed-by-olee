import { Component, onWillDestroy } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

/**
 * Right-side form over the list (OmniRouters-style). The list stays put —
 * kanban, search and filters are still behind the frosted backdrop.
 */
export class FormDrawer extends Component {
    static template = "crm_modern.FormDrawer";
    static components = { Dialog };
    static props = {
        title: String,
        subtitle: { type: String, optional: true },
        close: Function,
        slots: { type: Object, optional: true },
    };

    setup() {
        document.body.classList.add("cm-drawer-open", "or-sheet-open");
        onWillDestroy(() => document.body.classList.remove("cm-drawer-open", "or-sheet-open"));
    }
}
