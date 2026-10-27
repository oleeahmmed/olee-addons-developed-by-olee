import { useService } from "@web/core/utils/hooks";

/**
 * Pages opened by URL or from another app's link (dashboard, Ctrl+K…) set the Project app
 * as the current app, so the sidebar and the top bar show Project's own menus.
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
