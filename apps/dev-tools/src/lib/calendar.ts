import { TemporalityConfig } from "../hooks/useGenerationHistory";

export interface AshtrailDate {
    year: number;
    era: string;
    month: number;
    day: number;
}

export function formatAshtrailDate(date: AshtrailDate, config?: TemporalityConfig | null): string {
    if (!config) {
        return `Month ${date.month}, Year ${date.year} ${date.era}`;
    }
    const monthName = config.months[date.month - 1]?.name || `Month ${date.month}`;
    return `${date.day} ${monthName}, ${date.year} ${date.era}`;
}

export function getDaysInMonth(month: number, config?: TemporalityConfig | null): number {
    if (!config) return 30;
    return config.months[month - 1]?.days || 30;
}
