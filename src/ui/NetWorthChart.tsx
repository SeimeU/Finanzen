import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkPointComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import { ASSET_CLASSES, type AssetClass, type MonthNotes, type NetWorthMonth } from "../core";
import { formatEur, formatMonth } from "./format";
import { ASSET_CLASS_LABELS } from "./labels";

// Bundled locally (no CDN); only the parts we use, rendered as SVG.
echarts.use([LineChart, GridComponent, LegendComponent, MarkPointComponent, TooltipComponent, SVGRenderer]);

/** Event markers' colour (e2e/notes.spec.ts finds markers by it). */
const EVENT_COLOR = "#c2410c";

/**
 * Fixed colour per Asset class, so a class keeps its colour whatever else is shown.
 * Categorical slots validated for colour-vision deficiencies; orange is left out so it
 * never looks like an Event marker.
 */
const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  cash: "#257de0",
  etf: "#00b894",
  stock: "#f2a600",
  bond: "#ee7fac",
  crypto: "#008a17",
  commodity: "#6a4ce2",
  other: "#ec4647",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Net worth over time as a stacked area by Asset class, with the total as a line on top and
 * a marker on every month that has Events. Hover shows month, total, each Asset class and
 * that month's Events; clicking a month calls onSelectMonth.
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
    const muted = css.getPropertyValue("--muted").trim() || "#5c6675";
    const eventsByMonth = new Map(notes.filter((m) => m.events.length > 0).map((m) => [m.month, m.events]));
    const text = css.getPropertyValue("--text").trim() || "#1c2430";
    const classes = ASSET_CLASSES.filter((c) => series.some((m) => m.byAssetClass[c] !== undefined));
    const chart = echarts.init(element.current!, undefined, { renderer: "svg" });
    chart.setOption({
      animation: false,
      grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
      legend: {
        top: 0,
        left: 0,
        textStyle: { color: text },
        data: ["Vermögen", ...classes.map((c) => ({ name: ASSET_CLASS_LABELS[c], icon: "roundRect" }))],
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        formatter: (params: { axisValue: string; dataIndex: number }[]) => {
          const [point] = params;
          if (!point) return "";
          const month = series[point.dataIndex];
          if (!month) return "";
          const lines = [
            `<strong>${formatMonth(point.axisValue)}</strong>`,
            `Vermögen: ${formatEur(month.netWorth)}`,
            ...classes.map(
              (c) =>
                `<span style="color:${ASSET_CLASS_COLORS[c]}">■</span> ${ASSET_CLASS_LABELS[c]}: ${formatEur(month.byAssetClass[c] ?? 0)}`,
            ),
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
        // Stacked by sign ("samesign"), so a debt (negative Cash) stacks below zero.
        ...classes.map((c) => ({
          name: ASSET_CLASS_LABELS[c],
          type: "line",
          stack: "assetClass",
          data: series.map((m) => m.byAssetClass[c] ?? 0),
          areaStyle: { color: ASSET_CLASS_COLORS[c], opacity: 0.85 },
          lineStyle: { width: 1, color: "#ffffff" },
          itemStyle: { color: ASSET_CLASS_COLORS[c] },
          showSymbol: false,
        })),
        {
          name: "Vermögen",
          type: "line",
          z: 3,
          data: series.map((m) => m.netWorth),
          lineStyle: { width: 2, color: text },
          itemStyle: { color: text },
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
