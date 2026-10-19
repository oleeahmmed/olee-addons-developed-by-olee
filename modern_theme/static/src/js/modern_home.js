/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

/**
 * Registers a client action that shows shortcut cards (shared `modern_theme.Home` template).
 * @param {string} tag e.g. `crm_modern.home`
 * @param {{ title: string, subtitle?: string, cards: Array<{action: string, icon: string, label: string, hint?: string}> }} config
 */
export function registerModernHome(tag, config) {
    class ModernHome extends Component {
        static template = "modern_theme.Home";

        setup() {
            this.action = useService("action");
            this.orm = useService("orm");
            this.state = useState({ cards: config.cards || [] });
            if (typeof config.filterCards === "function") {
                onWillStart(async () => {
                    this.state.cards = await config.filterCards(this.orm, config.cards);
                });
            }
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

        openCard(card) {
            return this.action.doAction(card.action);
        }
    }
    registry.category("actions").add(tag, ModernHome);
}
