import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePopover } from "@web/core/popover/popover_hook";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { RecordPicker } from "./record_picker";

/** Search popover: pick a record or clear the field. */
class M2oPickPopover extends Component {
    static template = "crm_modern.M2oPickPopover";
    static components = { RecordPicker };
    static props = ["value", "placeholder", "resModel", "domain", "onPick", "close"];

    pick(value) {
        this.props.onPick(value);
        this.props.close();
    }
}

/**
 * Many2one shown as "icon/avatar + name ▾": one click opens a search popover.
 * Saves through the record (Odoo's write, access rights and tracking apply);
 * stays read-only when the user may not write the model.
 */
export class M2oPickField extends Component {
    static template = "crm_modern.M2oPickField";
    static props = {
        ...standardFieldProps,
        placeholder: { type: String, optional: true },
        resModel: { type: String, optional: true },
        domain: { type: Array, optional: true },
        icon: { type: String, optional: true },
        avatar: { type: Boolean, optional: true },
        searchPlaceholder: { type: String, optional: true },
    };

    setup() {
        this.popover = usePopover(M2oPickPopover, { position: "bottom-start" });
        this.state = useState({ canWrite: false });
        onWillStart(async () => {
            this.state.canWrite = await user.checkAccessRight(this.props.record.resModel, "write").catch(() => false);
        });
    }

    get relation() {
        return this.props.resModel || this.props.record.fields[this.props.name]?.relation;
    }
    get value() {
        return this.props.record.data[this.props.name];
    }
    get editable() {
        return !this.props.readonly && this.state.canWrite;
    }
    get placeholder() {
        return this.props.placeholder || _t("Assign");
    }
    get showAvatar() {
        return this.props.avatar !== false && this.relation === "res.users";
    }
    get icon() {
        return this.props.icon || (this.relation === "crm.team" ? "fa-users" : "fa-search");
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
            placeholder: this.props.searchPlaceholder || this.placeholder,
            resModel: this.relation,
            domain: this.props.domain || [],
            onPick: (picked) => this.save(picked),
        });
    }
    async save(picked) {
        const value = picked ? { id: picked[0], display_name: picked[1] } : false;
        await this.props.record.update({ [this.props.name]: value }, { save: true });
    }
}

function extractPickProps({ attrs, options }, dynamicInfo, extra = {}) {
    return {
        readonly: dynamicInfo.readonly,
        placeholder: options.placeholder || attrs.placeholder,
        domain: Array.isArray(options.domain) ? options.domain : extra.domain,
        icon: options.icon || extra.icon,
        avatar: extra.avatar,
        resModel: extra.resModel,
        searchPlaceholder: options.searchPlaceholder,
    };
}

registry.category("fields").add("crm_modern_user_pick", {
    component: M2oPickField,
    displayName: _t("Modern CRM: salesperson picker"),
    supportedTypes: ["many2one"],
    extractProps: (info, dynamicInfo) =>
        extractPickProps(info, dynamicInfo, {
            resModel: "res.users",
            domain: [["share", "=", false]],
            icon: "fa-user-plus",
            avatar: true,
        }),
});

registry.category("fields").add("crm_modern_m2o_pick", {
    component: M2oPickField,
    displayName: _t("Modern CRM: assign picker"),
    supportedTypes: ["many2one"],
    extractProps: (info, dynamicInfo) => extractPickProps(info, dynamicInfo, { avatar: false }),
});
