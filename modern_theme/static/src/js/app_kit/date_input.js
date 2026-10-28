import { Component, xml } from "@odoo/owl";
import { DateTimeInput } from "@web/core/datetime/datetime_input";
import { localization } from "@web/core/l10n/localization";

const { DateTime } = luxon;

/** Plain string formats the app pages keep in their state (same as native inputs). */
export const DATE_VALUE = "yyyy-MM-dd";
export const DATETIME_VALUE = "yyyy-MM-dd'T'HH:mm";

/**
 * MtDateInput: Odoo's own date / datetime picker (the shadcn-styled popover of every
 * date field) for the hand-made forms of the modern apps (drawers, quick dialogs,
 * inline record panels). It reads and writes the same plain strings a native
 * <input type="date"> / "datetime-local" would ("2026-10-28" / "2026-10-28T09:30",
 * in the user's time zone), so the page's save code does not change.
 *
 *   <MtDateInput value="state.date" onChange="(v) => state.date = v"/>
 *   <MtDateInput type="'datetime'" value="state.check_in" onChange="(v) => state.check_in = v"/>
 */
export class MtDateInput extends Component {
    static template = xml`
        <DateTimeInput value="luxonValue" type="props.type" id="props.id"
                       class="inputClass" placeholder="props.placeholder"
                       minDate="minDate" maxDate="maxDate" showWeekNumbers="false" rounding="1" format="displayFormat"
                       onApply.bind="onPicked" onChange.bind="onPicked"/>`;
    static components = { DateTimeInput };
    static props = {
        value: { optional: true }, // "" | false | "yyyy-MM-dd" | "yyyy-MM-ddTHH:mm"
        type: { type: String, optional: true }, // "date" (default) | "datetime"
        onChange: Function,
        id: { type: String, optional: true },
        class: { type: String, optional: true },
        placeholder: { type: String, optional: true },
        min: { type: String, optional: true },
        max: { type: String, optional: true },
    };
    static defaultProps = { type: "date", class: "or-input", placeholder: "" };

    get format() {
        return this.props.type === "datetime" ? DATETIME_VALUE : DATE_VALUE;
    }
    parse(value) {
        if (!value) {
            return false;
        }
        let dt = DateTime.fromFormat(value, this.format);
        if (!dt.isValid) {
            dt = DateTime.fromISO(value);
        }
        return dt.isValid ? dt : false;
    }
    get luxonValue() {
        return this.parse(this.props.value);
    }
    get minDate() {
        return this.parse(this.props.min) || undefined;
    }
    get maxDate() {
        return this.parse(this.props.max) || undefined;
    }
    /** shown in the input: the user's date format, times without seconds */
    get displayFormat() {
        if (this.props.type !== "datetime") {
            return undefined;
        }
        const time = (localization.timeFormat || "HH:mm:ss").replace(/:ss/, "");
        return `${localization.dateFormat} ${time}`;
    }
    get inputClass() {
        return `mt-date-input ${this.props.class || ""}`.trim();
    }
    onPicked(value) {
        const next = value && value.isValid ? value.toFormat(this.format) : "";
        if (next !== (this.props.value || "")) {
            this.props.onChange(next);
        }
    }
}
