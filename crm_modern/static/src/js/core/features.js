/**
 * What is switched on in this database, for the current user:
 *   use_leads — CRM ▸ Settings ▸ "Leads" (group crm.group_use_lead)
 *   sale      — Sales is installed (crm_modern_sale bridge) and the user may sell
 * Fetched once per page load; the server method can be extended by other addons.
 */
let featuresPromise = null;

export function loadFeatures(orm) {
    featuresPromise ||= orm.call("crm.lead", "crm_modern_features", []).catch((error) => {
        featuresPromise = null;
        throw error;
    });
    return featuresPromise;
}
