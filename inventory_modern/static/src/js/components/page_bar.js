import { Component } from "@odoo/owl";

/**
 * Header of the list pages: icon + title + one-line purpose on the left, the page's
 * primary "+ New …" action on the right (Alt+C, like Odoo's own New button).
 * Odoo's control panel below keeps search, filters, pager and the view switcher.
 */
export class PageBar extends Component {
    static template = "inventory_modern.PageBar";
    // strings may be lazy translations (_t), so no strict type checks here
    static props = ["title", "subtitle?", "icon?", "newLabel?", "onCreate?", "slots?"];
}
