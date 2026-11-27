import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

/** Top bar of the order screen. Every button runs a built-in POS action. */
export class PuxBar extends Component {
    static template = "pos_ui_pro.PuxBar";
    static props = {};

    setup() {
        this.pos = usePos();
    }
    get order() {
        return this.pos.getOrder();
    }
    get isEmpty() {
        return !this.order || this.order.isEmpty();
    }
    get hasTables() {
        return Boolean(this.pos.config.module_pos_restaurant);
    }
    get canCashMove() {
        return this.pos.showCashMoveButton && this.pos.cashier?._role !== "minimal";
    }
    get ui() {
        return this.pos.puxUi || {};
    }
    newOrder() {
        const order = this.pos.addNewOrder();
        this.pos.navigateToOrderScreen(order);
    }
    saveDraft() {
        if (!this.isEmpty) {
            this.pos.clickSaveOrder();
        }
    }
    openOrders() {
        this.pos.navigate("TicketScreen");
    }
    refund() {
        const partner = this.order?.getPartner();
        this.pos.navigate("TicketScreen", {
            stateOverride: {
                filter: "SYNCED",
                search: partner ? { fieldName: "PARTNER", searchTerm: partner.name } : {},
                destinationOrder: this.order,
            },
        });
    }
    tables() {
        this.pos.navigate("FloorScreen");
    }
    cashMove() {
        this.pos.cashMove();
    }
    closeSession() {
        this.pos.closeSession();
    }
}
