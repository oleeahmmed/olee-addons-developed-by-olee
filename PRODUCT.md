# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Staff of a garment/apparel company working in the Odoo 19 backend: accounts clerks and
managers (invoices, bills, payments), HR/admin officers (employees, attendance, leaves)
and store/production users that reach the same backend from a desktop browser and
occasionally a phone or tablet.

## Product Purpose

Modern Theme reshapes the stock Odoo 19 backend into one clean admin workspace: a single
sidebar for every app, list/kanban/form views for the records staff touch daily, and a
modern look on top of Odoo's own models, rights, menus and behavior. Success means staff
can run their daily records without the stock Odoo chrome getting in the way, and nothing
of Odoo's built-in functionality is lost.

## Positioning

A presentation-only layer (SCSS + small JS) over unmodified Odoo 19 — no core file edits,
no new record screens, upgrade-safe. Every screen is Odoo's own view; the theme only
changes tokens, layout chrome and component styling.

## Operating Context

Runs inside the Odoo 19 web client (desktop first, mobile web supported). Accounts/HR data
is entered daily; attendance kiosks and print/PDF reports use the same install. Users are
mostly on Chromium browsers; Bengali and English strings both appear.

## Capabilities and Constraints

- One shared theme addon (`modern_theme`) styles every app; per-app addons ship no
  stylesheet, so removing an app addon never breaks another app's screens.
- Presentation only: inherit Odoo views, keep menus/groups/settings and all built-in
  features (chatter, activities, import/export, filters, keyboard).
- No third-party CSS framework may be added at runtime; shadcn/ui's look is reproduced
  with design tokens and plain CSS over Odoo's DOM.
- Single fixed design: no palette/font/radius/density/sidebar-style/appearance options.
  Light is the default; dark follows Odoo's own color-scheme preference.
- Assumption (from brief + repo): the audience is the company's internal staff, not
  public visitors; the interface language stays English like stock Odoo.

## Brand Commitments

- The visual reference is pinned by the user: shadcn/ui defaults as shown on
  https://shadcnuikit.com/dashboard/apps/pos-system — page ground, bordered white cards,
  neutral grays, black primary actions, muted accent hovers. Replicate, do not invent.
- Product name in the UI remains the app names (Invoicing, Attendances, …); the theme
  itself is not advertised inside the backend.

## Evidence on Hand

- Working local instance: Odoo 19, DB `rahim_hrm`, company "Rahim Apparels Ltd.",
  21 employees; addons at `E:\odoo19\extra-addons` (git repo, GitHub origin).
- Reference page screenshots and measurements are captured during this task under
  `E:\odoo19\tmp\` and `.impeccable/`.

## Product Principles

1. Odoo behavior first — the theme never removes a built-in feature or changes data.
2. One look, everywhere — every app and every view follows the same shadcn system.
3. Quiet surfaces — neutral ground, hairline borders, cards carry the content.
4. Upgrade-safe — everything lives in this addon as tokens and scoped styles.
