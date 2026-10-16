import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePopover } from "@web/core/popover/popover_hook";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { RecordPicker } from "./record_picker";

/** Popover content: search a user, or clear the field. */
class UserPickPopover extends Component {
    static template = "crm_modern.UserPickPopover";
    static components = { RecordPicker };
    static props = ["value", "placeholder", "onPick", "close"];

    pick(value) {
        this.props.onPick(value);
        this.props.close();
    }
}

/**
 * Many2one to res.users shown as "avatar + name ▾" on kanban cards: one click opens
 * a search popover to change it (Odoo's own avatar widget only lets you assign when
 * empty). Saves through the record (Odoo's write, access rights and tracking apply);
 * read-only for users who may not write the model.
 */
export class UserPickField extends Component {
    static template = "crm_modern.UserPickField";
    static props = { ...standardFieldProps, placeholder: { type: String, optional: true } };

    setup() {
        this.popover = usePopover(UserPickPopover, { position: "bottom-start" });
        this.state = useState({ canWrite: false });
        onWillStart(async () => {
            this.state.canWrite = await user.checkAccessRight(this.props.record.resModel, "write").catch(() => false);
        });
    }

    get value() {
        return this.props.record.data[this.props.name];
    }
    get editable() {
        return !this.props.readonly && this.state.canWrite;
    }
    get placeholder() {
        return this.props.placeholder || _t("Pick someone");
    }
    toggle(ev) {
        if (!this.editable) {
            return;
        }
        if (this.popover.isOpen) {
            this.popover.close();
            return;
        }
        this.popover.open(ev.currentTarget, {
            value: this.value ? [this.value.id, this.value.display_name] : false,
            placeholder: this.placeholder,
            onPick: (picked) => this.save(picked),
        });
    }
    async save(picked) {
        const value = picked ? { id: picked[0], display_name: picked[1] } : false;
        await this.props.record.update({ [this.props.name]: value }, { save: true });
    }
}

registry.category("fields").add("crm_modern_user_pick", {
    component: UserPickField,
    displayName: _t("Modern CRM: user picker"),
    supportedTypes: ["many2one"],
    extractProps: ({ attrs, options }, dynamicInfo) => ({
        readonly: dynamicInfo.readonly,
        placeholder: options.placeholder || attrs.placeholder,
    }),
});
