/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";

/**
 * Registers a client action that shows shortcut cards (shared `modern_theme.Home` template).
 * @param {string} tag e.g. `crm_modern.home`
 * @param {{ title: string, subtitle?: string, cards: Array<{action: string, icon: string, label: string, hint?: string}>,
 *          create?: { resModel: string, label: string, context?: object, action?: string } }} config
 *   ``create`` adds the page's one "+ New" button, top right of the header.
 */
export function registerModernHome(tag, config) {
    class ModernHome extends Component {
        static template = "modern_theme.Home";

        setup() {
            this.action = useService("action");
            this.orm = useService("orm");
            this.state = useState({ cards: config.cards || [], canCreate: false });
            onWillStart(async () => {
                if (typeof config.filterCards === "function") {
                    this.state.cards = await config.filterCards(this.orm, config.cards);
                }
                if (config.create?.resModel) {
                    this.state.canCreate = await user
                        .checkAccessRight(config.create.resModel, "create")
                        .catch(() => false);
                }
            });
        }

        get title() {
            return config.title;
        }
        get subtitle() {
            return config.subtitle || "";
        }
        get cards() {
            return this.state.cards;
        }

        get create() {
            return this.state.canCreate ? config.create : null;
        }

        onCreate() {
            const spec = config.create;
            if (spec.action) {
                return this.action.doAction(spec.action);
            }
            return this.action.doAction({
                type: "ir.actions.act_window",
                name: spec.label,
                res_model: spec.resModel,
                views: [[false, "form"]],
                target: "current",
                context: { ...(spec.context || {}) },
            });
        }

        openCard(card) {
            return this.action.doAction(card.action);
        }
    }
    registry.category("actions").add(tag, ModernHome);
}
