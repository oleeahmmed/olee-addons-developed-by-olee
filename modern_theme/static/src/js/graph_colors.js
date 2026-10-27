import { patch } from "@web/core/utils/patch";
import { GraphRenderer } from "@web/views/graph/graph_renderer";

function cssColor(name, fallback = "") {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    if (!raw) {
        return fallback;
    }
    const probe = document.createElement("span");
    probe.style.color = raw;
    document.documentElement.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb && rgb !== "rgba(0, 0, 0, 0)" ? rgb : raw;
}

function cssColorAlpha(name, alpha, fallback = "") {
    const rgb = cssColor(name, fallback);
    const match = rgb.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (match) {
        return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
    }
    return rgb;
}

function themePalette() {
    // An app may set its own chart colours (--mt-app-chart-1 … 6, e.g. Modern Employees);
    // otherwise the theme's primary and status colours are used.
    const custom = [1, 2, 3, 4, 5, 6].map((i) => cssColor(`--mt-app-chart-${i}`)).filter(Boolean);
    if (custom.length) {
        return custom;
    }
    return [
        cssColor("--mt-primary"),
        cssColor("--mt-success", cssColor("--cm-success")),
        cssColor("--mt-warning", cssColor("--cm-warning")),
        cssColor("--mt-info", cssColor("--mt-primary")),
        cssColor("--mt-destructive", cssColor("--cm-danger")),
        cssColor("--mt-muted-foreground"),
    ].filter(Boolean);
}

function paintDatasets(data, { line = false, pie = false } = {}) {
    if (!data?.datasets) {
        return data;
    }
    const palette = themePalette();
    const card = cssColor("--mt-card", cssColor("--cm-card"));
    data.datasets.forEach((dataset, index) => {
        const color = palette[index % palette.length];
        const rgb = String(color).match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        const fill = rgb
            ? `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0.22)`
            : cssColorAlpha(index === 0 ? "--mt-primary" : "--mt-success", 0.22, color);
        if (pie) {
            const n = Array.isArray(dataset.data) ? dataset.data.length : palette.length;
            dataset.backgroundColor = Array.from({ length: n }, (_, i) => palette[i % palette.length]);
            dataset.hoverBackgroundColor = dataset.backgroundColor;
            dataset.borderColor = card;
        } else if (line) {
            dataset.borderColor = color;
            dataset.backgroundColor = fill;
            dataset.hoverBackgroundColor = color;
            dataset.pointBackgroundColor = color;
            dataset.pointHoverBackgroundColor = color;
        } else {
            dataset.backgroundColor = color;
            dataset.borderColor = color;
        }
    });
    return data;
}

patch(GraphRenderer.prototype, {
    getBarChartData() {
        return paintDatasets(super.getBarChartData(...arguments));
    },
    getLineChartData() {
        return paintDatasets(super.getLineChartData(...arguments), { line: true });
    },
    getPieChartData() {
        return paintDatasets(super.getPieChartData(...arguments), { pie: true });
    },
    getElementOptions() {
        const options = super.getElementOptions(...arguments);
        if (options.line) {
            options.line.borderColor = cssColor("--mt-primary");
        }
        return options;
    },
    getLegendOptions() {
        const options = super.getLegendOptions(...arguments);
        const fg = cssColor("--mt-foreground");
        const muted = cssColor("--mt-muted-foreground");
        options.labels = options.labels || {};
        options.labels.color = fg;
        options.labels.fontColor = fg;
        const original = options.labels.generateLabels;
        if (original) {
            options.labels.generateLabels = (chart) => {
                const labels = original(chart);
                const palette = themePalette();
                return labels.map((label, index) => {
                    if (label.fillStyle && /^#|^rgb/i.test(String(label.fillStyle))) {
                        label.fillStyle = palette[index % palette.length];
                    }
                    if (label.strokeStyle && /^#|^rgb/i.test(String(label.strokeStyle))) {
                        label.strokeStyle = palette[index % palette.length];
                    }
                    label.fontColor = muted;
                    return label;
                });
            };
        }
        return options;
    },
});
