import { BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { CashFlowMonth } from "../core";
import { formatEur, formatMonth } from "./format";

// Bundled locally (no CDN); only the parts we use, rendered as SVG.
echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

const INCOME_COLOR = "#2e9e6a";

type Option = Parameters<echarts.ECharts["setOption"]>[0];

function useChart(build: (colors: { accent: string; muted: string }) => Option, deps: unknown[]) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#1f5fbf";
    const muted = css.getPropertyValue("--muted").trim() || "#5c6675";
    const chart = echarts.init(element.current!, undefined, { renderer: "svg" });
    chart.setOption(build({ accent, muted }));
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, deps);
  return element;
}

function axes(periods: string[], label: (period: string) => string, muted: string) {
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => formatEur(v) },
    xAxis: {
      type: "category",
      data: periods,
      axisLabel: { color: muted, formatter: label },
      axisLine: { lineStyle: { color: "#c5cbd3" } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: muted, formatter: (v: number) => formatEur(v).replace(/,\d\d €$/, " €") },
      splitLine: { lineStyle: { color: "#e6e9ee" } },
    },
  };
}

/** Einnahmen and Ausgaben per month, side by side. */
export function CashFlowChart({ months }: { months: CashFlowMonth[] }) {
  const element = useChart(
    ({ accent, muted }) => ({
      ...axes(
        months.map((m) => m.month),
        formatMonth,
        muted,
      ),
      legend: { top: 0, textStyle: { color: muted } },
      series: [
        { name: "Einnahmen", type: "bar", data: months.map((m) => m.income), itemStyle: { color: INCOME_COLOR } },
        { name: "Ausgaben", type: "bar", data: months.map((m) => m.expenses), itemStyle: { color: accent } },
      ],
    }),
    [months],
  );
  return (
    <figure className="chart" aria-label="Einnahmen und Ausgaben">
      <div ref={element} style={{ width: "100%", height: 300 }} />
    </figure>
  );
}

/** One Category's amount per month or year, for comparison. */
export function HistoryChart({ label, history }: { label: string; history: { period: string; amount: number }[] }) {
  const element = useChart(
    ({ accent, muted }) => ({
      ...axes(
        history.map((h) => h.period),
        (p: string) => (p.length === 7 ? formatMonth(p) : p),
        muted,
      ),
      series: [{ name: label, type: "bar", data: history.map((h) => h.amount), itemStyle: { color: accent, borderRadius: 4 } }],
    }),
    [label, history],
  );
  return (
    <figure className="chart" aria-label={label}>
      <div ref={element} style={{ width: "100%", height: 260 }} />
    </figure>
  );
}
