import { _t } from "@web/core/l10n/translation";

/** Labels for every design option (mirror of models/theme_options.py). */
export const OPTION_GROUPS = [
    {
        key: "colors",
        title: _t("Colors"),
        options: [
            {
                key: "color_mode",
                label: _t("Color mode"),
                choices: [
                    ["light", _t("Light"), "fa-sun-o"],
                    ["dark", _t("Dark"), "fa-moon-o"],
                    ["auto", _t("Auto"), "fa-desktop"],
                ],
            },
        ],
    },
    {
        key: "typography",
        title: _t("Typography"),
        options: [
            {
                key: "font",
                label: _t("Font"),
                kind: "select",
                choices: [
                    ["inter", "Inter"],
                    ["poppins", "Poppins"],
                    ["roboto", "Roboto"],
                    ["nunito", "Nunito"],
                    ["dm_sans", "DM Sans"],
                    ["jakarta", "Plus Jakarta Sans"],
                    ["hind", "Hind Siliguri (বাংলা)"],
                    ["noto_bn", "Noto Sans Bengali (বাংলা)"],
                    ["system", _t("System font")],
                ],
            },
            {
                key: "font_scale",
                label: _t("Text size"),
                choices: [
                    ["sm", _t("Small")],
                    ["md", _t("Normal")],
                    ["lg", _t("Large")],
                ],
            },
        ],
    },
    {
        key: "shape",
        title: _t("Shape & spacing"),
        options: [
            {
                key: "radius",
                label: _t("Corner radius"),
                choices: [
                    ["none", _t("None")],
                    ["sm", _t("Small")],
                    ["md", _t("Medium")],
                    ["lg", _t("Large")],
                    ["pill", _t("Pill")],
                ],
            },
            {
                key: "density",
                label: _t("Density"),
                choices: [
                    ["compact", _t("Compact")],
                    ["comfortable", _t("Comfortable")],
                    ["spacious", _t("Spacious")],
                ],
            },
            {
                key: "border",
                label: _t("Borders"),
                choices: [
                    ["none", _t("None")],
                    ["subtle", _t("Subtle")],
                    ["normal", _t("Normal")],
                    ["strong", _t("Strong")],
                ],
            },
            {
                key: "shadow",
                label: _t("Card shadow"),
                choices: [
                    ["none", _t("None")],
                    ["sm", _t("Soft")],
                    ["md", _t("Medium")],
                    ["lg", _t("Strong")],
                ],
            },
        ],
    },
    {
        key: "navigation",
        title: _t("Navigation"),
        options: [
            {
                key: "sidebar_style",
                label: _t("Sidebar style"),
                kind: "cards",
                choices: [
                    ["classic", _t("Classic"), "classic"],
                    ["tree", _t("Tree"), "tree"],
                    ["rail", _t("Icon rail + panel"), "rail"],
                    ["floating", _t("Floating glass"), "floating"],
                ],
            },
            {
                key: "sidebar_bg",
                label: _t("Sidebar background"),
                choices: [
                    ["solid", _t("Solid")],
                    ["tinted", _t("Tint")],
                    ["gradient", _t("Gradient")],
                    ["glass", _t("Glass")],
                ],
            },
            {
                key: "sidebar_width",
                label: _t("Sidebar width"),
                choices: [
                    ["narrow", _t("Narrow")],
                    ["normal", _t("Normal")],
                    ["wide", _t("Wide")],
                ],
            },
            {
                key: "sidebar_app_menu",
                label: _t("Current app menu"),
                choices: [
                    ["top", _t("Top")],
                    ["bottom", _t("Bottom")],
                    ["hidden", _t("Hidden")],
                ],
            },
            { key: "sidebar_collapsed", label: _t("Start collapsed"), kind: "bool" },
            {
                key: "topbar_style",
                label: _t("Top bar"),
                choices: [
                    ["solid", _t("Solid")],
                    ["blend", _t("Blend")],
                    ["floating", _t("Floating")],
                ],
            },
            {
                key: "topbar_height",
                label: _t("Top bar height"),
                choices: [
                    ["compact", _t("Compact")],
                    ["normal", _t("Normal")],
                    ["tall", _t("Tall")],
                ],
            },
        ],
    },
    {
        key: "content",
        title: _t("Content"),
        options: [
            {
                key: "content_width",
                label: _t("Content width"),
                choices: [
                    ["full", _t("Full")],
                    ["boxed", _t("Boxed")],
                ],
            },
            {
                key: "content_frame",
                label: _t("Content frame"),
                choices: [
                    ["card", _t("Rounded card")],
                    ["flat", _t("Flat")],
                ],
            },
            {
                key: "list_style",
                label: _t("Lists"),
                choices: [
                    ["clean", _t("Clean")],
                    ["striped", _t("Striped")],
                    ["bordered", _t("Bordered")],
                ],
            },
            {
                key: "form_style",
                label: _t("Forms"),
                choices: [
                    ["classic", _t("Classic")],
                    ["cards", _t("Card sections")],
                ],
            },
            { key: "animations", label: _t("Animations"), kind: "bool" },
        ],
    },
];

export const PRESET_LABELS = [
    ["once", _t("Default (shadcn neutral)")],
    ["indigo", _t("Indigo")],
    ["blue", _t("Blue")],
    ["sky", _t("Sky")],
    ["teal", _t("Teal")],
    ["emerald", _t("Emerald")],
    ["green", _t("Green")],
    ["amber", _t("Amber")],
    ["yellow", _t("Yellow")],
    ["orange", _t("Orange")],
    ["red", _t("Red")],
    ["rose", _t("Rose")],
    ["violet", _t("Violet")],
    ["slate", _t("Slate")],
    ["zinc", _t("Zinc")],
    ["stone", _t("Stone")],
    ["gray", _t("Gray")],
    ["neutral", _t("Neutral")],
];

/** Company defaults shipped with the module (models/theme_options.py). */
export const FACTORY_DEFAULTS = {
    color_mode: "light",
    preset: "once",
    font: "dm_sans",
    font_scale: "md",
    radius: "md",
    border: "subtle",
    shadow: "sm",
    density: "comfortable",
    sidebar_style: "classic",
    sidebar_bg: "solid",
    sidebar_width: "normal",
    sidebar_app_menu: "top",
    topbar_style: "solid",
    topbar_height: "normal",
    content_width: "full",
    content_frame: "card",
    list_style: "clean",
    form_style: "classic",
    login_style: "split",
    sidebar_collapsed: false,
    animations: true,
    primary_color: "#4f46e5",
    accent_color: "",
};
