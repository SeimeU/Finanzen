import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { NetWorthMonth } from "../core";
import { formatEur, formatMonth } from "./format";

// Bundled locally (no CDN); only the parts we use, rendered as SVG.
echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

/** Net worth over time as a single line; hover shows month and value. */
export function NetWorthChart({ series }: { series: NetWorthMonth[] }) {
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#1f5fbf";
    const muted = css.getPropertyValue("--muted").trim() || "#5c6675";
    const chart = echarts.init(element.current!, undefined, { renderer: "svg" });
    chart.setOption({
      animation: false,
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        valueFormatter: (v: number) => formatEur(v),
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
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [series]);

  return (
    <figure className="chart" aria-label="Vermögen im Zeitverlauf">
      <div ref={element} style={{ width: "100%", height: 320 }} />
    </figure>
  );
}
