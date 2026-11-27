/** 7.5 → "7h 30m" */
export function hoursLabel(v) {
    const total = Math.round((v || 0) * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
}
