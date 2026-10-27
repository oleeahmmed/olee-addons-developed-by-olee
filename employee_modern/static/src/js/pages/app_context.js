import { useService } from "@web/core/utils/hooks";

/**
 * Keep the app of a page as Odoo's "current app", so the sidebar and the top bar show
 * that app's own menus (Employees, Time Off or Attendances) — never those of the app
 * used before (e.g. CRM after a reload or a link from elsewhere).
 */
export function usePinApp(appXmlid) {
    const menu = useService("menu");
    if (!appXmlid) {
        return;
    }
    const app = menu.getApps().find((a) => a.xmlid === appXmlid);
    if (app && menu.getCurrentApp()?.id !== app.id) {
        menu.setCurrentMenu(app);
    }
}
