import { Field } from "@web/views/fields/field";
import { patch } from "@web/core/utils/patch";

/**
 * Odoo only flags empty fields in readonly mode (`o_field_empty`). Floating labels
 * need to know it while editing too, so every field widget gets `mt_empty`.
 */
patch(Field.prototype, {
    get classNames() {
        const classNames = super.classNames;
        const { record, name } = this.props;
        if (record && name in record.data) {
            const value = record.data[name];
            let empty;
            if (this.field.isEmpty) {
                empty = this.field.isEmpty(record, name);
            } else if (value && typeof value === "object" && "records" in value) {
                empty = !value.records.length;
            } else {
                empty = value === false || value === null || value === undefined || value === "";
            }
            classNames.mt_empty = Boolean(empty);
        }
        return classNames;
    },
});
