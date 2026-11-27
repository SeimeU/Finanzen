import { LineChart } from "echarts/charts";
import { GridComponent, MarkPointComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { MonthNotes, NetWorthMonth } from "../core";
import { formatEur, formatMonth } from "./format";

// Bundled locally (no CDN); only the parts we use, rendered as SVG.
echarts.use([LineChart, GridComponent, MarkPointComponent, TooltipComponent, SVGRenderer]);

/** Event markers' colour (e2e/notes.spec.ts finds markers by it). */
const EVENT_COLOR = "#c2410c";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Net worth over time as a single line, with a marker on every month that has Events.
 * Hover shows month, value and that month's Events; clicking a month calls onSelectMonth.
 */
export function NetWorthChart({
  series,
  notes = [],
  onSelectMonth,
}: {
  series: NetWorthMonth[];
  notes?: MonthNotes[];
  onSelectMonth?: (month: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const select = useRef(onSelectMonth);
  select.current = onSelectMonth;

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#1f5fbf";
    const muted = css.getPropertyValue("--muted").trim() || "#5c6675";
    const eventsByMonth = new Map(notes.filter((m) => m.events.length > 0).map((m) => [m.month, m.events]));
    const chart = echarts.init(element.current!, undefined, { renderer: "svg" });
    chart.setOption({
      animation: false,
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        formatter: (params: { axisValue: string; value: number }[]) => {
          const [point] = params;
          if (!point) return "";
          const lines = [
            `<strong>${formatMonth(point.axisValue)}</strong>`,
            `Vermögen: ${formatEur(point.value)}`,
            ...(eventsByMonth.get(point.axisValue) ?? []).map(
              (e) => `<span style="color:${EVENT_COLOR}">●</span> ${escapeHtml(e.label)}: ${formatEur(e.amount)}`,
            ),
          ];
          return lines.join("<br>");
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: series.map((m) => m.month),
        axisLabel: { color: muted, formatter: (m: string) => formatMonth(m) },
        axisLine: { lineStyle: { color: "#c5cbd3" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: muted, formatter: (v: number) => formatEur(v).replace(/,\d\d €$/, " €") },
        splitLine: { lineStyle: { color: "#e6e9ee" } },
      },
      series: [
        {
          name: "Vermögen",
          type: "line",
          data: series.map((m) => m.netWorth),
          lineStyle: { width: 2, color: accent },
          itemStyle: { color: accent },
          symbolSize: 8,
          showSymbol: series.length < 24,
          markPoint: {
            symbol: "pin",
            symbolSize: 34,
            silent: true,
            label: { show: false },
            itemStyle: { color: EVENT_COLOR },
            data: series
              .filter((m) => eventsByMonth.has(m.month))
              .map((m) => ({ coord: [m.month, m.netWorth] })),
          },
        },
      ],
    });
    chart.getZr().on("click", (event: { offsetX: number; offsetY: number }) => {
      const pixel = [event.offsetX, event.offsetY];
      if (!chart.containPixel("grid", pixel)) return;
      const [index] = chart.convertFromPixel({ seriesIndex: 0 }, pixel) as number[];
      const month = series[Math.round(index ?? -1)]?.month;
      if (month) select.current?.(month);
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [series, notes]);

  return (
    <figure className="chart" aria-label="Vermögen im Zeitverlauf">
      <div ref={element} style={{ width: "100%", height: 320 }} />
    </figure>
  );
}
