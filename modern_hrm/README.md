# Modern HRM (modern_hrm)

A modern, shadcn-style workspace for Odoo 19's **Employees**, **Time Off** and
**Attendances** apps, built on `modern_theme`'s app kit. One addon for all three apps:
the design itself lives in `modern_theme`, this addon only adds the custom pages
(list pages) and the sidebar entries.

## What you get

| App | Sidebar | Top bar |
|---|---|---|
| **Employees** | Employees, Departments | More → Records (New Hires, Contracts Ending, Former Employees, Job Positions, Employee History), Reporting, Configuration |
| **Time Off** | Requests, Allocations, Team Calendar | My Time, Reporting, Configuration |
| **Attendances** | At Work, Attendances, Extra Hours | Kiosk Mode, Reporting, Configuration |

Every list, kanban, calendar, activity, pivot and graph is Odoo's own view in the modern
page; forms are Odoo's own with the chatter. Each app has its accent colour (Employees blue,
Time Off violet, Attendances teal) on pages and graphs.

## Safe by design
- No new model, table or field: only methods on `hr.employee` that read with the user's rights.
- Page tags of older versions redirect to the new pages, so a database that is not
  upgraded yet never fails with "Cannot find key … in the actions registry".
- Pages show Odoo's own kanban / list / activity / graph / pivot / search views and open
  Odoo's own forms with the chatter, so Odoo updates and other HR modules keep working.
- Views are referenced by xml id with a fallback to the default view; each page
  block is isolated, so a missing field or app skips that block instead of failing.

## Install
Update the Apps list, then install **Modern HRM**. It depends on Odoo's Employees,
Time Off and Attendances apps, so those are installed with it.
