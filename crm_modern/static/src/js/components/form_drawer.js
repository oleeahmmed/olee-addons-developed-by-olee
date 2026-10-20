import { Component, onWillDestroy } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";

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
        onNew: { type: Function, optional: true },
        newLabel: { type: String, optional: true },
        slots: { type: Object, optional: true },
    };

    setup() {
        document.body.classList.add("cm-drawer-open", "or-sheet-open");
        onWillDestroy(() => document.body.classList.remove("cm-drawer-open", "or-sheet-open"));
    }

    get newLabel() {
        return this.props.newLabel || _t("New record");
    }

    onNew(ev) {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        if (this.props.onNew) {
            this.props.onNew();
            return;
        }
        this.props.close();
    }

    close(ev) {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        this.props.close();
    }
}
