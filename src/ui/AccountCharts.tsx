import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { AccountMonth, ContributionMonth } from "../core";
import { formatEur, formatMonth } from "./format";

// Bundled locally (no CDN); only the parts we use, rendered as SVG.
echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

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

function axes(months: string[], muted: string, boundaryGap: boolean) {
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => formatEur(v) },
    xAxis: {
      type: "category",
      boundaryGap,
      data: months,
      axisLabel: { color: muted, formatter: (m: string) => formatMonth(m) },
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

/** One Account's value over time as a line. */
export function AccountValueChart({ series }: { series: AccountMonth[] }) {
  const element = useChart(
    ({ accent, muted }) => ({
      ...axes(
        series.map((m) => m.month),
        muted,
        false,
      ),
      series: [
        {
          name: "Wert",
          type: "line",
          data: series.map((m) => m.value),
          lineStyle: { width: 2, color: accent },
          itemStyle: { color: accent },
          symbolSize: 8,
          showSymbol: series.length < 24,
        },
      ],
    }),
    [series],
  );
  return (
    <figure className="chart" aria-label="Wert im Zeitverlauf">
      <div ref={element} style={{ width: "100%", height: 280 }} />
    </figure>
  );
}

/** Per month: Einzahlung, market change and other change as stacked bars, the Net worth change as a line. */
export function ContributionChart({ months }: { months: ContributionMonth[] }) {
  const element = useChart(
    ({ accent, muted }) => ({
      ...axes(
        months.map((m) => m.month),
        muted,
        true,
      ),
      legend: { top: 0, textStyle: { color: muted } },
      series: [
        { name: "Einzahlung", type: "bar", stack: "split", data: months.map((m) => m.contribution), itemStyle: { color: accent } },
        { name: "Marktveränderung", type: "bar", stack: "split", data: months.map((m) => m.marketChange), itemStyle: { color: "#2e9e6a" } },
        { name: "Sonstige Veränderung", type: "bar", stack: "split", data: months.map((m) => m.otherChange), itemStyle: { color: "#b8bfca" } },
        {
          name: "Veränderung Vermögen",
          type: "line",
          data: months.map((m) => m.netWorthChange),
          lineStyle: { width: 2, color: "#1d2430" },
          itemStyle: { color: "#1d2430" },
          showSymbol: months.length < 24,
        },
      ],
    }),
    [months],
  );
  return (
    <figure className="chart" aria-label="Einzahlung und Marktveränderung">
      <div ref={element} style={{ width: "100%", height: 320 }} />
    </figure>
  );
}
